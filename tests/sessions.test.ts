import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { practiceSession } from "../src/server/db/schema.js";
import { addStudent, cookieFrom, makeApp, setupParent } from "./helpers.js";

async function world() {
  const ctx = await makeApp();
  const parent = await setupParent(ctx.app);
  const miraId = (await addStudent(ctx.app, parent, "Mira", "1234")).json().id;
  const tomId = (await addStudent(ctx.app, parent, "Tom", "5678")).json().id;
  const login = async (id: number, pin: string) =>
    cookieFrom(await ctx.app.inject({ method: "POST", url: "/api/auth/login", payload: { profileId: id, pin } }));
  return { ...ctx, parent, mira: await login(miraId, "1234"), tom: await login(tomId, "5678") };
}

describe("full paper in test mode", () => {
  it("never reveals answers before the end, then scores 5 / 1 / 0 with voided questions counted as correct", async () => {
    const { app, mira } = await world();
    const start = await app.inject({ method: "POST", url: "/api/sessions", headers: { cookie: mira }, payload: { mode: "paper", paperYear: 2026, help: "test" } });
    expect(start.statusCode).toBe(201);
    const id = start.json().id;

    const state = await app.inject({ url: `/api/sessions/${id}`, headers: { cookie: mira } });
    expect(state.json().questions).toHaveLength(3);
    expect(state.json().endsAt - state.json().startedAt).toBe(50 * 60_000);
    expect(JSON.stringify(state.json())).not.toMatch(/"answer"|"steps"|Voided/);

    const answer = (position: number, choice: string | null) =>
      app.inject({ method: "POST", url: `/api/sessions/${id}/answers`, headers: { cookie: mira }, payload: { position, choice, timeMs: 30_000 } });
    expect((await answer(1, "A")).json()).toEqual({ saved: true });
    expect((await answer(1, "B")).json()).toEqual({ saved: true }); // changing your mind is fine in test mode
    await answer(2, "A");
    // question 3 left unanswered (voided anyway)

    const res = (await app.inject({ method: "POST", url: `/api/sessions/${id}/finish`, headers: { cookie: mira } })).json();
    expect(res.score).toBe(10); // 5 (right) + 0 (wrong) + 5 (voided)
    expect(res.maxScore).toBe(15);
    expect(res.rows[0]).toMatchObject({ choice: "B", answer: "B", correct: true, timeMs: 60_000, steps: ["Count the shapes.", "There are two, so it is B."] });
    expect(res.rows[2].steps).toEqual(["Because."]); // a one-paragraph solution becomes one step
    expect(res.rows[1]).toMatchObject({ choice: "A", correct: false });
    expect(res.rows[2]).toMatchObject({ choice: null, voided: true, correct: true });
    expect(res.practiseNext[0].focus).toBe("SPA");

    expect((await answer(2, "B")).statusCode).toBe(409); // finished
  });
});

describe("practice and learn modes", () => {
  it("gives feedback straight away and locks the answer", async () => {
    const { app, mira } = await world();
    const id = (await app.inject({ method: "POST", url: "/api/sessions", headers: { cookie: mira }, payload: { mode: "paper", paperYear: 2026, help: "practice", timed: false } })).json().id;
    const fb = await app.inject({ method: "POST", url: `/api/sessions/${id}/answers`, headers: { cookie: mira }, payload: { position: 2, choice: "C", timeMs: 1000 } });
    expect(fb.json()).toEqual({ saved: true, correct: false, answer: "B" });
    const again = await app.inject({ method: "POST", url: `/api/sessions/${id}/answers`, headers: { cookie: mira }, payload: { position: 2, choice: "B", timeMs: 1000 } });
    expect(again.statusCode).toBe(409);
    expect((await app.inject({ url: `/api/sessions/${id}/hint/1`, headers: { cookie: mira } })).statusCode).toBe(403);
  });

  it("offers hints and solutions in learn mode", async () => {
    const { app, mira } = await world();
    const id = (await app.inject({ method: "POST", url: "/api/sessions", headers: { cookie: mira }, payload: { mode: "paper", paperYear: 2026, help: "learn", timed: false } })).json().id;
    expect((await app.inject({ url: `/api/sessions/${id}/hint/1`, headers: { cookie: mira } })).json()).toEqual({ hint: "Count carefully." });
    const fb = await app.inject({ method: "POST", url: `/api/sessions/${id}/answers`, headers: { cookie: mira }, payload: { position: 1, choice: "B", timeMs: 1000, hintUsed: true } });
    expect(fb.json()).toEqual({ saved: true, correct: true, answer: "B", steps: ["Count the shapes.", "There are two, so it is B."] });
  });
});

describe("privacy between students", () => {
  it("keeps sessions private, but lets the parent see results", async () => {
    const { app, mira, tom, parent } = await world();
    const id = (await app.inject({ method: "POST", url: "/api/sessions", headers: { cookie: mira }, payload: { mode: "paper", paperYear: 2026, help: "test" } })).json().id;
    expect((await app.inject({ url: `/api/sessions/${id}`, headers: { cookie: tom } })).statusCode).toBe(404);
    expect((await app.inject({ method: "POST", url: `/api/sessions/${id}/answers`, headers: { cookie: tom }, payload: { position: 1, choice: "A", timeMs: 1 } })).statusCode).toBe(404);
    await app.inject({ method: "POST", url: `/api/sessions/${id}/finish`, headers: { cookie: mira } });
    expect((await app.inject({ url: `/api/sessions/${id}/results`, headers: { cookie: parent } })).statusCode).toBe(200);
    expect((await app.inject({ method: "POST", url: `/api/sessions/${id}/answers`, headers: { cookie: parent }, payload: { position: 1, choice: "A", timeMs: 1 } })).statusCode).toBe(403);
    expect((await app.inject({ url: "/api/sessions", headers: { cookie: tom } })).json()).toHaveLength(0);
  });
});

describe("timer", () => {
  it("ends a timed quiz when the time is up", async () => {
    const { app, db, mira } = await world();
    const id = (await app.inject({ method: "POST", url: "/api/sessions", headers: { cookie: mira }, payload: { mode: "focus", help: "test", timerMinutes: 1 } })).json().id;
    db.update(practiceSession).set({ startedAt: Date.now() - 2 * 60_000 }).where(eq(practiceSession.id, id)).run();
    const late = await app.inject({ method: "POST", url: `/api/sessions/${id}/answers`, headers: { cookie: mira }, payload: { position: 1, choice: "A", timeMs: 1 } });
    expect(late.statusCode).toBe(409);
    expect((await app.inject({ url: `/api/sessions/${id}/results`, headers: { cookie: mira } })).statusCode).toBe(200);
  });
});

describe("focus quiz", () => {
  it("filters by focus area and skips questions answered correctly recently", async () => {
    const { app, mira } = await world();
    const start = (payload: object) => app.inject({ method: "POST", url: "/api/sessions", headers: { cookie: mira }, payload: { mode: "focus", help: "practice", ...payload } });
    const first = (await start({ focus: ["SPA"] })).json().id;
    const s1 = (await app.inject({ url: `/api/sessions/${first}`, headers: { cookie: mira } })).json();
    expect(s1.questions.map((q: { id: string }) => q.id)).toEqual(["wizSMART-2026-02"]);

    const num = (await start({ focus: ["NUM"], count: 3 })).json().id;
    const s2 = (await app.inject({ url: `/api/sessions/${num}`, headers: { cookie: mira } })).json();
    const pos1 = s2.questions.find((q: { id: string }) => q.id === "wizSMART-2026-01").position;
    await app.inject({ method: "POST", url: `/api/sessions/${num}/answers`, headers: { cookie: mira }, payload: { position: pos1, choice: "B", timeMs: 1 } });

    const next = (await start({ focus: ["NUM"], count: 3 })).json().id; // minimum quiz size is 3, only 2 NUM questions exist
    const s3 = (await app.inject({ url: `/api/sessions/${next}`, headers: { cookie: mira } })).json();
    expect(s3.questions.map((q: { id: string }) => q.id)).toEqual(["wizSMART-2026-01", "wizSMART-2026-03"]); // easiest first
    const ids = (await app.inject({ url: "/api/sessions", headers: { cookie: mira } })).json();
    expect(ids).toHaveLength(3);
    expect((await start({ focus: ["CMB"] })).statusCode).toBe(404);
  });
});

describe("question picking", () => {
  it("puts fresh questions ahead of recently mastered ones when the quiz is smaller than the pool", async () => {
    const { db } = await world();
    const { pickQuestions } = await import("../src/server/practice/engine.js");
    const { attempt } = await import("../src/server/db/schema.js");
    db.insert(attempt).values({ profileId: 2, questionId: "wizSMART-2026-01", choice: "B", correct: true, answeredAt: Date.now() }).run();
    for (let i = 0; i < 10; i++) {
      const picked = pickQuestions(db, 2, "focus", null, { help: "test", timerMinutes: null, focus: ["NUM"], count: 1 });
      expect(picked?.map((q) => q.id)).toEqual(["wizSMART-2026-03"]);
    }
  });

  it("matches topics on the main focus area only, not the second tag", async () => {
    const { db } = await world();
    const { pickQuestions } = await import("../src/server/practice/engine.js");
    // wizSMART-2026-03 is mainly NUM with LOG as its second tag.
    expect(pickQuestions(db, 2, "focus", null, { help: "test", timerMinutes: null, focus: ["LOG"], count: 5 })).toBeNull();
    const num = pickQuestions(db, 2, "focus", null, { help: "test", timerMinutes: null, focus: ["NUM"], count: 5 });
    expect(num?.every((q) => q.focusPrimary === "NUM")).toBe(true);
  });
});

describe("learn mode", () => {
  it("only picks questions that have a worked solution", async () => {
    const { app, mira } = await world();
    for (let i = 0; i < 5; i++) {
      const id = (await app.inject({ method: "POST", url: "/api/sessions", headers: { cookie: mira }, payload: { mode: "focus", help: "learn", count: 3, excludeRecentDays: 0 } })).json().id;
      const st = (await app.inject({ url: `/api/sessions/${id}`, headers: { cookie: mira } })).json();
      expect(st.questions.map((q: { id: string }) => q.id).sort()).toEqual(["wizSMART-2026-01", "wizSMART-2026-03"]);
      expect(st.questions.every((q: { hasSolution: boolean }) => q.hasSolution)).toBe(true);
    }
    const cov = (await app.inject({ url: "/api/solutions/coverage", headers: { cookie: mira } })).json();
    expect(cov).toEqual({ total: 3, withSolutions: 2 });
    const papers = (await app.inject({ url: "/api/papers", headers: { cookie: mira } })).json();
    expect(papers[0]).toMatchObject({ year: 2026, questions: 3, withSolutions: 2 });
  });
});
