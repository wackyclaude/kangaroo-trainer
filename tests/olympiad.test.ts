import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { openDb } from "../src/server/db/client.js";
import { attempt, contestPaper, question } from "../src/server/db/schema.js";
import { importOlympiad, betterThan } from "../src/server/content/olympiad.js";
import { olympiadContestFor, olympiadReadiness } from "../src/server/readiness/olympiad.js";
import { addStudent, CONTENT, cookieFrom, makeApp, setupParent } from "./helpers.js";
import { eq } from "drizzle-orm";

async function world({ olympiad = true } = {}) {
  const ctx = await makeApp();
  const parent = await setupParent(ctx.app);
  const miraId: number = (await addStudent(ctx.app, parent, "Mira", "1234")).json().id;
  if (olympiad) await ctx.app.inject({ method: "PUT", url: `/api/profiles/${miraId}/olympiad`, headers: { cookie: parent }, payload: { contests: ["kangaroo", "olympiad"] } });
  const mira = cookieFrom(await ctx.app.inject({ method: "POST", url: "/api/auth/login", payload: { profileId: miraId, pin: "1234" } }));
  const start = (payload: Record<string, unknown>) => ctx.app.inject({ method: "POST", url: "/api/sessions", headers: { cookie: mira }, payload: { contest: "olympiad", ...payload } });
  const answer = (id: number, position: number, choice: string | null) =>
    ctx.app.inject({ method: "POST", url: `/api/sessions/${id}/answers`, headers: { cookie: mira }, payload: { position, choice, timeMs: 60_000 } });
  return { ...ctx, parent, mira, miraId, start, answer };
}

describe("Olympiad bank import", () => {
  it("imports the questions and the paper facts, once", () => {
    const { db } = openDb(":memory:");
    expect(importOlympiad(db, CONTENT)).toEqual({ status: "imported", count: 12 });
    expect(importOlympiad(db, CONTENT)).toEqual({ status: "unchanged", count: 12 });
    const b1 = db.select().from(question).where(eq(question.id, "dmo-2026-B1")).get()!;
    expect(b1).toMatchObject({ contest: "olympiad", part: "B", points: 5, number: 9, imagePath: "olympiad/img/2026-B1.png", officialPath: "olympiad/sol/2026-B1.png", tier: "core" });
    expect(db.select().from(question).where(eq(question.id, "dmo-2026-B2")).get()!.officialPath).toBeNull();
    expect(db.select().from(contestPaper).get()).toMatchObject({ contest: "olympiad", year: 2026, maxScore: 36, cutoff: { klas1_3: 21 } });
  });

  it("refuses a bank whose answer checker disagrees with its own answers", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "kt-oly-"));
    fs.cpSync(path.join(CONTENT, "olympiad"), path.join(dir, "olympiad"), { recursive: true });
    const file = path.join(dir, "olympiad", "questions.json");
    const bank = JSON.parse(fs.readFileSync(file, "utf8"));
    bank.questions[8].answer_spec = { kind: "number", value: "4.5.1" };
    fs.writeFileSync(file, JSON.stringify(bank));
    const { db } = openDb(":memory:");
    expect(() => importOlympiad(db, dir)).toThrow(/does not accept/);
  });

  it("works out 'better than' from the klas 1–3 score table", () => {
    const t = new Map([
      [10, 50],
      [20, 30],
      [30, 20],
    ]);
    expect(betterThan(t, 5)).toBe(0);
    expect(betterThan(t, 20)).toBe(50);
    expect(betterThan(t, 31)).toBe(100);
  });
});

describe("contest switch", () => {
  it("is off until the parent turns the Olympiad on", async () => {
    const { app, start, parent, miraId } = await world({ olympiad: false });
    const res = await start({ mode: "paper", paperYear: 2026, help: "test" });
    expect(res.statusCode).toBe(403);
    const on = await app.inject({ method: "PUT", url: `/api/profiles/${miraId}/olympiad`, headers: { cookie: parent }, payload: { contests: ["olympiad"], minLevel: 1, maxLevel: 3 } });
    expect(on.json().contests).toEqual(["olympiad"]);
    expect(on.json().olympiad).toMatchObject({ minLevel: 1, maxLevel: 3, stretch: false });
    expect((await start({ mode: "paper", paperYear: 2026, help: "test" })).statusCode).toBe(201);
    const bad = await app.inject({ method: "PUT", url: `/api/profiles/${miraId}/olympiad`, headers: { cookie: parent }, payload: { minLevel: 4, maxLevel: 2 } });
    expect(bad.statusCode).toBe(400);
    const badDay = await app.inject({ method: "PUT", url: `/api/profiles/${miraId}/olympiad`, headers: { cookie: parent }, payload: { date: "2027-03-01" } });
    expect(badDay.statusCode).toBe(400);
  });

  it("only lets the parent change the settings", async () => {
    const { app, mira, miraId } = await world();
    const res = await app.inject({ method: "PUT", url: `/api/profiles/${miraId}/olympiad`, headers: { cookie: mira }, payload: { maxLevel: 5 } });
    expect(res.statusCode).toBe(403);
  });
});

describe("full Olympiad paper", () => {
  it("marks A 2 / B 5 / wrong or blank 0 out of 36 and compares with the cutoff", async () => {
    const { app, mira, start, answer } = await world();
    const id = (await start({ mode: "paper", paperYear: 2026, help: "test" })).json().id;
    const state = (await app.inject({ url: `/api/sessions/${id}`, headers: { cookie: mira } })).json();
    expect(state.contest).toBe("olympiad");
    expect(state.endsAt - state.startedAt).toBe(120 * 60_000);
    expect(state.questions.map((q: { label: string }) => q.label)).toEqual(["A1", "A2", "A3", "A4", "A5", "A6", "A7", "A8", "B1", "B2", "B3", "B4"]);
    expect(state.questions[9]).toMatchObject({ part: "B", points: 5, unit: "°" });
    expect(JSON.stringify(state)).not.toMatch(/"answer"|klas1|officialUrl/);

    // A1–A4 right (8), A5 wrong, rest of A blank; B1 4½ (=9/2), B2 "100 degrees", B3 one of two, B4 right.
    for (const [p, c] of [[1, "B"], [2, "C"], [3, "D"], [4, "A"], [5, "A"]] as const) await answer(id, p, c);
    expect((await answer(id, 9, "4½")).json()).toEqual({ saved: true });
    await answer(id, 10, "100 degrees");
    await answer(id, 11, "48");
    await answer(id, 12, "denise");
    const unreadable = await answer(id, 9, "four and a half");
    expect(unreadable.statusCode).toBe(400);
    expect(unreadable.json().error).toBe("unreadable");
    expect((await answer(id, 1, "Z")).statusCode).toBe(400);

    const r = (await app.inject({ method: "POST", url: `/api/sessions/${id}/finish`, headers: { cookie: mira } })).json();
    expect(r.maxScore).toBe(36);
    expect(r.score).toBe(8 + 5 + 5 + 5);
    expect(r.cutoff).toMatchObject({ year: 2026, cutoff: 21, diff: 2, target: 21 });
    expect(r.cutoff.betterThan).toBeGreaterThan(80);
    expect(r.pace).toBeNull();
    const b3 = r.rows.find((x: { label: string }) => x.label === "B3");
    expect(b3).toMatchObject({ choice: "48", correct: false, earned: 0, points: 5, note: "You found 1 of the 2 answers.", stats: { klas1: 8 }, level: 5 });
    expect(r.rows.find((x: { label: string }) => x.label === "B1")).toMatchObject({ correct: true, earned: 5, officialUrl: "/content/olympiad/sol/2026-B1.png" });
    expect(r.rows.find((x: { label: string }) => x.label === "A6")).toMatchObject({ choice: null, earned: 0 });

    const results = (await app.inject({ url: `/api/sessions/${id}/results`, headers: { cookie: mira } })).json();
    expect(results.rewards.newBadges.map((b: { id: string }) => b.id)).toEqual(expect.arrayContaining(["oly-first-paper", "oly-first-b", "oly-cutoff"]));
    expect(results.rewards.newBadges.map((b: { id: string }) => b.id)).not.toContain("first-paper");

    const papers = (await app.inject({ url: "/api/papers?contest=olympiad", headers: { cookie: mira } })).json();
    expect(papers[0]).toMatchObject({ year: 2026, questions: 12, cutoff: 21, best: { best: 23, max: 36 } });
    const kangarooPapers = (await app.inject({ url: "/api/papers", headers: { cookie: mira } })).json();
    expect(kangarooPapers[0].best).toBeNull();
  });

  it("serves the official solution picture only when signed in", async () => {
    const { app, mira } = await world();
    expect((await app.inject("/content/olympiad/sol/2026-B1.png")).statusCode).toBe(401);
    expect((await app.inject({ url: "/content/olympiad/sol/2026-B1.png", headers: { cookie: mira } })).statusCode).toBe(200);
    expect((await app.inject({ url: "/content/olympiad/img/..%2Fquestions.json", headers: { cookie: mira } })).statusCode).toBe(404);
  });
});

describe("Olympiad short quizzes", () => {
  it("shows the stats, the official solution and a simplify note once graded", async () => {
    const { start, answer, app, mira, parent, miraId } = await world();
    await app.inject({ method: "PUT", url: `/api/profiles/${miraId}/olympiad`, headers: { cookie: parent }, payload: { maxLevel: 5 } });
    const id = (await start({ mode: "focus", help: "practice", parts: ["B"], count: 10 })).json().id;
    const s = (await app.inject({ url: `/api/sessions/${id}`, headers: { cookie: mira } })).json();
    expect(s.questions.every((q: { part: string }) => q.part === "B")).toBe(true);
    const b1 = s.questions.find((q: { label: string }) => q.label === "B1");
    const fb = (await answer(id, b1.position, "18/4")).json();
    expect(fb).toMatchObject({ saved: true, correct: true, answer: "9/2", reveal: { level: 3, officialUrl: "/content/olympiad/sol/2026-B1.png", stats: { klas1: 22 } } });
    expect(fb.reveal.note).toMatch(/simply/);
  });

  it("keeps to the parent's level range, and the student can only narrow it", async () => {
    const { start, app, mira, parent, miraId } = await world();
    await app.inject({ method: "PUT", url: `/api/profiles/${miraId}/olympiad`, headers: { cookie: parent }, payload: { minLevel: 1, maxLevel: 2 } });
    const levelsOf = async (id: number) => {
      const st = (await app.inject({ url: `/api/sessions/${id}`, headers: { cookie: mira } })).json();
      return st.questions.map((q: { label: string }) => q.label).sort();
    };
    const all = (await start({ mode: "focus", help: "practice", count: 20 })).json().id;
    expect(await levelsOf(all)).toEqual(["A1", "A2", "A3", "A4"]); // levels 1–2 only
    const narrowed = (await start({ mode: "focus", help: "practice", count: 20, levels: [1] })).json().id;
    expect(await levelsOf(narrowed)).toEqual(["A1", "A2"]);
    const widened = (await start({ mode: "focus", help: "practice", count: 20, levels: [5] })).json().id;
    expect(await levelsOf(widened)).toEqual(["A1", "A2", "A3", "A4"]); // level 5 isn't allowed: back to the range
  });

  it("adds one stretch question from the level above when the parent allows it", async () => {
    const { start, app, mira, parent, miraId } = await world();
    await app.inject({ method: "PUT", url: `/api/profiles/${miraId}/olympiad`, headers: { cookie: parent }, payload: { minLevel: 1, maxLevel: 2, stretch: true } });
    const id = (await start({ mode: "smart", help: "practice", count: 5 })).json().id;
    const st = (await app.inject({ url: `/api/sessions/${id}`, headers: { cookie: mira } })).json();
    expect(st.questions).toHaveLength(5);
    expect(st.questions.filter((q: { label: string }) => ["A5", "A6", "B1"].includes(q.label))).toHaveLength(1); // the level-3 questions
  });

  it("gives the klas-1 average, cutoff pace and relative score from 6 questions", async () => {
    const { start, answer, app, mira, parent, miraId } = await world();
    await app.inject({ method: "PUT", url: `/api/profiles/${miraId}/olympiad`, headers: { cookie: parent }, payload: { maxLevel: 5 } });
    const id = (await start({ mode: "focus", help: "test", parts: ["A"], count: 8 })).json().id;
    const st = (await app.inject({ url: `/api/sessions/${id}`, headers: { cookie: mira } })).json();
    const key: Record<string, string> = { A1: "B", A2: "C", A3: "D", A4: "A" };
    for (const q of st.questions) if (key[q.label]) await answer(id, q.position, key[q.label]!);
    const r = (await app.inject({ method: "POST", url: `/api/sessions/${id}/finish`, headers: { cookie: mira } })).json();
    expect(r.score).toBe(8);
    expect(r.cutoff).toBeNull();
    // klas-1 average on these 8: 2 × (0.60+0.52+0.45+0.40+0.30+0.25+0.15+0.12) = 5.58
    expect(r.pace.klas1).toBeCloseTo(5.6, 1);
    expect(r.pace.pace).toBeGreaterThan(r.pace.klas1);
    expect(r.pace.relative).toBeCloseTo(8 / r.pace.pace, 1);
    expect(r.pace.rough).toBe(true);
    expect(r.pace.fullPaper).toBe(Math.round(Math.min(36, r.pace.relative * 21)));
  });

  it("suggests widening the range after 70% right at the top level over 20 questions", async () => {
    const { app, db, mira, parent, miraId } = await world();
    await app.inject({ method: "PUT", url: `/api/profiles/${miraId}/olympiad`, headers: { cookie: parent }, payload: { minLevel: 1, maxLevel: 2 } });
    const now = Date.now();
    for (let k = 0; k < 20; k++) {
      db.insert(attempt).values({ profileId: miraId, questionId: k % 2 ? "dmo-2026-A3" : "dmo-2026-A4", choice: "A", correct: k < 15, timeMs: 60_000, answeredAt: now - 1000 * (20 - k) }).run();
    }
    const ins = (await app.inject({ url: "/api/insights?contest=olympiad", headers: { cookie: mira } })).json();
    expect(ins.contest).toBe("olympiad");
    expect(ins.olympiad.suggestWiden).toEqual({ to: 3, right: 15, of: 20 });
    expect(ins.olympiad.pace.questions).toBe(20);
    const kangaroo = (await app.inject({ url: "/api/insights", headers: { cookie: mira } })).json();
    expect(kangaroo.totals.answers).toBe(0); // the contests are kept apart
  });
});

describe("Olympiad countdown and readiness", () => {
  it("counts down to round 1 in January, with round 2 underneath", () => {
    expect(olympiadContestFor("2026-11-04", null)).toMatchObject({ date: "2027-01-18", windowEnd: "2027-01-29", phase: "countdown", daysLeft: 75, nextRound: "2027-03-19", chosen: false });
    expect(olympiadContestFor("2026-11-04", "2027-01-21")).toMatchObject({ date: "2027-01-21", chosen: true });
    expect(olympiadContestFor("2027-01-20", null).phase).toBe("open");
    expect(olympiadContestFor("2027-02-01", null).date).toBe("2028-01-17"); // third Monday of January 2028
  });

  it("scores each paper against its own cutoff, shifted by the parent's target", () => {
    const areas = ["NUM", "ALG", "GEO", "SPA", "LOG", "CMB"].map((f) => ({ focus: f as "NUM", right: 6, answers: 8, available: 20 }));
    const base = olympiadReadiness({ areas, papers: [{ score: 21, cutoff: 21 }], distinctQuestions: 60, shift: 0 });
    expect(base.parts.score.percent).toBe(100);
    expect(base.parts.skill.percent).toBe(100);
    expect(base.parts.practice.percent).toBe(Math.round((0.5 / 6 + 0.5 * 0.5) * 100));
    const higher = olympiadReadiness({ areas, papers: [{ score: 21, cutoff: 21 }], distinctQuestions: 60, shift: 4 });
    expect(higher.parts.score.percent).toBe(Math.round((21 / 25) * 100));
    expect(higher.parts.score.detail).toMatch(/4 below target/);
  });

  it("is served per contest", async () => {
    const { app, mira } = await world();
    const r = (await app.inject({ url: "/api/readiness?contest=olympiad", headers: { cookie: mira } })).json();
    expect(r.kind).toBe("olympiad");
    expect(r.contest.windowStart).toMatch(/-01-/);
    const me = (await app.inject({ url: "/api/me", headers: { cookie: mira } })).json();
    expect(me.contests).toEqual(["kangaroo", "olympiad"]);
    expect(me.olympiad).toMatchObject({ minLevel: 1, maxLevel: 4 });
  });
});
