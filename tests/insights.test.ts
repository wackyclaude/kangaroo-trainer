import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { attempt, question } from "../src/server/db/schema.js";
import { FOCUS_AREAS, TIERS, type FocusArea } from "../src/shared/types.js";
import { addStudent, cookieFrom, makeApp, setupParent } from "./helpers.js";
import { csvCell } from "../src/server/csv.js";

const AREAS = Object.keys(FOCUS_AREAS) as FocusArea[];

/** A bigger bank: 2015 and 2020, 24 questions each, 4 per focus area, answer always "C". */
function seedBank(db: Awaited<ReturnType<typeof makeApp>>["db"]) {
  const now = Date.now();
  for (const year of [2015, 2020]) {
    for (let n = 1; n <= 24; n++) {
      const focus = AREAS[(n - 1) % 6]!;
      db.insert(question)
        .values({
          id: `wizSMART-${year}-${String(n).padStart(2, "0")}`,
          level: "wizSMART",
          year,
          number: n,
          questionsInPaper: 24,
          tier: TIERS[Math.floor((n - 1) / 8)]!,
          focusPrimary: focus,
          focusSecondary: null,
          answer: "C",
          imagePath: "img/2026-01.png",
          text: `Question ${n}`,
          hintEn: "Think.",
          solutionEn: null,
          solutionSteps: ["Step one.", "Answer C."],
          voidNote: null,
          updatedAt: now,
        })
        .run();
    }
  }
}

async function world() {
  const ctx = await makeApp();
  seedBank(ctx.db);
  const parent = await setupParent(ctx.app);
  const ids: number[] = [];
  for (const [name, pin] of [["Mira", "1234"], ["Tom", "5678"], ["Ada", "1111"]] as const) ids.push((await addStudent(ctx.app, parent, name, pin)).json().id);
  const login = async (id: number, pin: string) => cookieFrom(await ctx.app.inject({ method: "POST", url: "/api/auth/login", payload: { profileId: id, pin } }));
  return { ...ctx, parent, ids, mira: await login(ids[0]!, "1234"), tom: await login(ids[1]!, "5678"), ada: await login(ids[2]!, "1111") };
}

type W = Awaited<ReturnType<typeof world>>;

/** Does a full paper in practice mode: right on every area except the ones listed (wrong there). */
async function doPaper(w: W, cookie: string, year: number, wrongIn: FocusArea[], timeMs = 60_000) {
  const { app } = w;
  const id = (await app.inject({ method: "POST", url: "/api/sessions", headers: { cookie }, payload: { mode: "paper", paperYear: year, help: "practice", timed: false } })).json().id;
  const state = (await app.inject({ url: `/api/sessions/${id}`, headers: { cookie } })).json();
  for (const q of state.questions) {
    const choice = wrongIn.includes(q.focusPrimary) ? "A" : "C";
    await app.inject({ method: "POST", url: `/api/sessions/${id}/answers`, headers: { cookie }, payload: { position: q.position, choice, timeMs } });
  }
  const res = await app.inject({ method: "POST", url: `/api/sessions/${id}/finish`, headers: { cookie } });
  expect(res.statusCode).toBe(200);
  return id as number;
}

describe("insights", () => {
  it("shows the weak areas that the attempt log says, with levels and a trend", async () => {
    const w = await world();
    await doPaper(w, w.mira, 2015, ["SPA", "LOG"]);
    await doPaper(w, w.mira, 2020, ["SPA", "LOG"]);
    const ins = (await w.app.inject({ url: "/api/insights", headers: { cookie: w.mira } })).json();

    // Cross-check with the raw attempt log: the two areas with the lowest share right.
    const log = w.db.select({ a: attempt, q: question }).from(attempt).innerJoin(question, eq(question.id, attempt.questionId)).where(eq(attempt.profileId, w.ids[0]!)).all();
    const share = (f: FocusArea) => {
      const xs = log.filter((r) => r.q.focusPrimary === f);
      return xs.filter((r) => r.a.correct).length / xs.length;
    };
    const lowest = [...AREAS].sort((a, b) => share(a) - share(b)).slice(0, 2);
    expect(ins.weakAreas.map((x: { focus: string }) => x.focus).sort()).toEqual([...lowest].sort());
    expect(lowest.sort()).toEqual(["LOG", "SPA"]);

    const spa = ins.areas.find((a: { focus: string }) => a.focus === "SPA");
    expect(spa).toMatchObject({ level: "starter", attempts: 8, weightedAccuracy: 0 }); // 8 answers: not enough for a level, and all wrong
    expect(spa.trend).toHaveLength(2); // one snapshot per finished paper
    expect(ins.totals).toMatchObject({ answers: 48, sessions: 2, papers: 2 });
    expect(ins.estimate).toMatchObject({ papers: 2, score: 80 }); // 16 of 24 right = 80/120
    expect(ins.mistakes).toMatchObject({ due: 0, waiting: 16, mastered: 0 });
    expect(ins.speed.byTier[0]).toMatchObject({ tier: "warm-up", medianMs: 60_000 });
  });

  it("flags very quick wrong answers as possible guesses", async () => {
    const w = await world();
    await doPaper(w, w.mira, 2015, ["SPA"], 5_000);
    const ins = (await w.app.inject({ url: "/api/insights", headers: { cookie: w.mira } })).json();
    // SPA questions are numbers 4, 10, 16, 22: the warm-up one (4) isn't flagged.
    expect(ins.speed.guesses.map((g: { number: number }) => g.number).sort((a: number, b: number) => a - b)).toEqual([10, 16, 22]);
  });

  it("keeps insights private between students", async () => {
    const w = await world();
    expect((await w.app.inject({ url: `/api/insights/${w.ids[0]}`, headers: { cookie: w.tom } })).statusCode).toBe(404);
    expect((await w.app.inject({ url: `/api/insights/${w.ids[0]}`, headers: { cookie: w.parent } })).statusCode).toBe(200);
    expect((await w.app.inject({ url: "/api/admin/benchmarks", headers: { cookie: w.tom } })).statusCode).toBe(403);
    expect((await w.app.inject({ url: "/api/admin/export/attempts.csv", headers: { cookie: w.tom } })).statusCode).toBe(403);
  });
});

describe("Fix my mistakes and Smart mix", () => {
  it("brings back exactly the questions she missed", async () => {
    const w = await world();
    await doPaper(w, w.mira, 2015, ["GEO"]);
    // Nothing is due yet (mistakes come back after a day), so it offers the ones coming up soonest.
    const start = await w.app.inject({ method: "POST", url: "/api/sessions", headers: { cookie: w.mira }, payload: { mode: "mistakes", help: "learn" } });
    expect(start.statusCode).toBe(201);
    const state = (await w.app.inject({ url: `/api/sessions/${start.json().id}`, headers: { cookie: w.mira } })).json();
    expect(state.questions.map((q: { focusPrimary: string }) => q.focusPrimary)).toEqual(["GEO", "GEO", "GEO", "GEO"]);
    expect(state.settings.timerMinutes).toBeNull();

    // Two right answers in a row (no hints) master a question.
    for (const q of state.questions) {
      await w.app.inject({ method: "POST", url: `/api/sessions/${state.id}/answers`, headers: { cookie: w.mira }, payload: { position: q.position, choice: "C", timeMs: 1000 } });
    }
    await w.app.inject({ method: "POST", url: `/api/sessions/${state.id}/finish`, headers: { cookie: w.mira } });
    const again = (await w.app.inject({ method: "POST", url: "/api/sessions", headers: { cookie: w.mira }, payload: { mode: "mistakes", help: "practice" } })).json();
    const s2 = (await w.app.inject({ url: `/api/sessions/${again.id}`, headers: { cookie: w.mira } })).json();
    for (const q of s2.questions) {
      await w.app.inject({ method: "POST", url: `/api/sessions/${s2.id}/answers`, headers: { cookie: w.mira }, payload: { position: q.position, choice: "C", timeMs: 1000 } });
    }
    await w.app.inject({ method: "POST", url: `/api/sessions/${s2.id}/finish`, headers: { cookie: w.mira } });
    const ins = (await w.app.inject({ url: "/api/insights", headers: { cookie: w.mira } })).json();
    expect(ins.mistakes).toMatchObject({ due: 0, waiting: 0, mastered: 4 });
    const none = await w.app.inject({ method: "POST", url: "/api/sessions", headers: { cookie: w.mira }, payload: { mode: "mistakes", help: "practice" } });
    expect(none.statusCode).toBe(404);
    expect(none.json().message).toMatch(/No mistakes/);
  });

  it("leans Smart mix towards the weak areas", async () => {
    const w = await world();
    await doPaper(w, w.mira, 2015, ["CMB", "ALG"]);
    const id = (await w.app.inject({ method: "POST", url: "/api/sessions", headers: { cookie: w.mira }, payload: { mode: "smart", help: "practice" } })).json().id;
    const s = (await w.app.inject({ url: `/api/sessions/${id}`, headers: { cookie: w.mira } })).json();
    expect(s.questions).toHaveLength(12);
    const weak = s.questions.filter((q: { focusPrimary: string }) => ["CMB", "ALG"].includes(q.focusPrimary)).length;
    expect(weak).toBeGreaterThanOrEqual(7); // about 60%
  });
});

describe("paper practice", () => {
  it("lets the parent print a paper for a student, keep the key, and type the answers in afterwards", async () => {
    const w = await world();
    const make = await w.app.inject({ method: "POST", url: "/api/sessions", headers: { cookie: w.parent }, payload: { mode: "paper", paperYear: 2020, help: "learn", delivery: "paper", forProfileId: w.ids[0] } });
    expect(make.statusCode).toBe(201);
    const id = make.json().id;

    const state = (await w.app.inject({ url: `/api/sessions/${id}`, headers: { cookie: w.mira } })).json();
    expect(state.settings).toMatchObject({ help: "test", timerMinutes: null, delivery: "paper" });
    expect(JSON.stringify(state)).not.toMatch(/"answer"/);
    expect((await w.app.inject({ url: `/api/sessions/${id}/key`, headers: { cookie: w.mira } })).statusCode).toBe(403);
    const key = (await w.app.inject({ url: `/api/sessions/${id}/key`, headers: { cookie: w.parent } })).json();
    expect(key).toHaveLength(24);
    expect(key[0]).toMatchObject({ position: 1, answer: "C" });

    // The app runner can't be used for a paper quiz.
    expect((await w.app.inject({ method: "POST", url: `/api/sessions/${id}/answers`, headers: { cookie: w.mira }, payload: { position: 1, choice: "C", timeMs: 1 } })).statusCode).toBe(409);

    const answers = state.questions.map((q: { position: number }) => ({ position: q.position, choice: q.position <= 20 ? "C" : q.position <= 22 ? "B" : null }));
    const res = await w.app.inject({ method: "POST", url: `/api/sessions/${id}/paper-answers`, headers: { cookie: w.parent }, payload: { answers } });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ score: 20 * 5 + 2 * 0 + 2 * 1, correct: 20, wrong: 2, blank: 2 });
    const rows = w.db.select().from(attempt).where(eq(attempt.sessionId, id)).all();
    expect(rows.every((r) => r.source === "paper" && r.timeMs === null && r.profileId === w.ids[0])).toBe(true);
    expect((await w.app.inject({ method: "POST", url: `/api/sessions/${id}/paper-answers`, headers: { cookie: w.parent }, payload: { answers } })).statusCode).toBe(409);

    // Students can't set up paper quizzes for each other.
    const nope = await w.app.inject({ method: "POST", url: "/api/sessions", headers: { cookie: w.tom }, payload: { mode: "paper", paperYear: 2020, help: "test", delivery: "paper", forProfileId: w.ids[0] } });
    expect(nope.statusCode).toBe(403);
  });
});

describe("benchmarks and export", () => {
  it("compares profiles, shows group averages only with 3 active profiles, and exports safe CSV", async () => {
    const w = await world();
    await doPaper(w, w.mira, 2020, ["SPA"]);
    await doPaper(w, w.tom, 2020, ["SPA", "LOG", "NUM"]);
    let b = (await w.app.inject({ url: "/api/admin/benchmarks", headers: { cookie: w.parent } })).json();
    expect(b.ageBand).toMatch(/12-year-olds/);
    expect(b.group).toBeNull();
    expect(b.papers[0].year).toBe(2020);
    expect(b.papers[0].scores).toHaveLength(2);

    await doPaper(w, w.ada, 2015, []);
    b = (await w.app.inject({ url: "/api/admin/benchmarks", headers: { cookie: w.parent } })).json();
    expect(b.group.profiles).toBe(3);
    expect(b.group.estimate).toBe(Math.round((100 + 60 + 120) / 3));

    const csv = await w.app.inject({ url: "/api/admin/export/attempts.csv", headers: { cookie: w.parent } });
    expect(csv.headers["content-type"]).toMatch(/text\/csv/);
    expect(csv.headers["content-disposition"]).toMatch(/attachment/);
    const lines = csv.body.trim().split("\r\n");
    expect(lines).toHaveLength(1 + 72);
    const json = (await w.app.inject({ url: `/api/admin/export.json?profileId=${w.ids[0]}`, headers: { cookie: w.parent } })).json();
    expect(json.profiles).toHaveLength(1);
    expect(json.attempts).toHaveLength(24);
    expect(JSON.stringify(json)).not.toMatch(/pin_?hash/i);
  });

  it("neutralises spreadsheet formulas in exported text", async () => {
    expect(csvCell("=HYPERLINK(1)")).toBe("'=HYPERLINK(1)");
    expect(csvCell("-2+3")).toBe("'-2+3");
    expect(csvCell('say "hi", ok')).toBe('"say ""hi"", ok"');
    expect(csvCell(null)).toBe("");
    const w = await world();
    const add = await addStudent(w.app, w.parent, "-Zed", "4321");
    expect(add.statusCode).toBe(201);
    const csv = await w.app.inject({ url: "/api/admin/export.json", headers: { cookie: w.parent } });
    expect(csv.json().profiles.map((p: { nickname: string }) => p.nickname)).toContain("-Zed");
    await doPaper(w, cookieFrom(await w.app.inject({ method: "POST", url: "/api/auth/login", payload: { profileId: add.json().id, pin: "4321" } })), 2015, []);
    const sessions = await w.app.inject({ url: "/api/admin/export/sessions.csv", headers: { cookie: w.parent } });
    expect(sessions.body).toContain(",'-Zed,");
  });
});

describe("rewards", () => {
  it("show stars and badges on the results, and keep each student's rewards private", async () => {
    const w = await world();
    const id = await doPaper(w, w.mira, 2015, ["SPA"]);
    const res = (await w.app.inject({ url: `/api/sessions/${id}/results`, headers: { cookie: w.mira } })).json();
    expect(res.rewards.stars).toBe(res.correct);
    expect(res.rewards.newBadges.map((b: { id: string }) => b.id)).toEqual(expect.arrayContaining(["first-quiz", "first-paper", "no-skip"]));
    expect(res.rewards.personalBest).toBeNull();

    const second = await doPaper(w, w.mira, 2020, []);
    const res2 = (await w.app.inject({ url: `/api/sessions/${second}/results`, headers: { cookie: w.mira } })).json();
    expect(res2.rewards.personalBest).toEqual({ score: 120, previous: res.score });
    expect(res2.rewards.newBadges.map((b: { id: string }) => b.id)).not.toContain("first-paper");

    const mine = (await w.app.inject({ url: "/api/rewards", headers: { cookie: w.mira } })).json();
    expect(mine.stars.total).toBe(res.correct + 24);
    expect(mine.streak.practisedToday).toBe(true);
    expect(mine.badges.find((b: { id: string }) => b.id === "score-100").earnedAt).not.toBeNull();

    // Tom can't see Mira's rewards; the parent can; the parent has none of their own.
    expect((await w.app.inject({ url: `/api/rewards/${w.ids[0]}`, headers: { cookie: w.tom } })).statusCode).toBe(404);
    expect((await w.app.inject({ url: `/api/rewards/${w.ids[0]}`, headers: { cookie: w.parent } })).json().stars.total).toBe(mine.stars.total);
    expect((await w.app.inject({ url: "/api/rewards", headers: { cookie: w.parent } })).statusCode).toBe(404);
  });
});
