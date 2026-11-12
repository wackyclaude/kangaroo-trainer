import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { question } from "../src/server/db/schema.js";
import { addStudent, cookieFrom, makeApp, setupParent } from "./helpers.js";

async function world(contests: string[] | null = ["kangaroo", "brain"]) {
  const ctx = await makeApp();
  const parent = await setupParent(ctx.app);
  const miraId: number = (await addStudent(ctx.app, parent, "Mira", "1234")).json().id;
  if (contests) await ctx.app.inject({ method: "PUT", url: `/api/profiles/${miraId}/olympiad`, headers: { cookie: parent }, payload: { contests } });
  const mira = cookieFrom(await ctx.app.inject({ method: "POST", url: "/api/auth/login", payload: { profileId: miraId, pin: "1234" } }));
  const start = (payload: Record<string, unknown>) => ctx.app.inject({ method: "POST", url: "/api/sessions", headers: { cookie: mira }, payload });
  const answer = (id: number, position: number, choice: string | null) =>
    ctx.app.inject({ method: "POST", url: `/api/sessions/${id}/answers`, headers: { cookie: mira }, payload: { position, choice, timeMs: 60_000 } });
  return { ...ctx, parent, mira, miraId, start, answer };
}

describe("wizBRAIN", () => {
  it("is off until the parent turns it on", async () => {
    const { app, start, parent, miraId } = await world(null);
    expect((await start({ mode: "paper", paperYear: 2026, help: "test", contest: "brain" })).statusCode).toBe(403);
    const on = await app.inject({ method: "PUT", url: `/api/profiles/${miraId}/olympiad`, headers: { cookie: parent }, payload: { contests: ["kangaroo", "brain", "olympiad"] } });
    expect(on.json().contests).toEqual(["kangaroo", "brain", "olympiad"]);
    expect((await start({ mode: "paper", paperYear: 2026, help: "test", contest: "brain" })).statusCode).toBe(201);
  });

  it("keeps its own bank: papers, pictures and quizzes", async () => {
    const { app, db, mira, start } = await world();
    const papers = await app.inject({ url: "/api/papers?contest=brain", headers: { cookie: mira } });
    expect(papers.json()).toEqual([expect.objectContaining({ year: 2026, questions: 30 })]);
    expect((await app.inject({ url: "/api/papers", headers: { cookie: mira } })).json()[0].questions).toBe(3);
    expect(db.select().from(question).where(eq(question.id, "wizBRAIN-2026-01")).get()).toMatchObject({ contest: "kangaroo", level: "wizBRAIN", imagePath: "brain/img/2026-01.png" });
    expect((await app.inject({ url: "/content/brain/img/2026-01.png", headers: { cookie: mira } })).statusCode).toBe(200);
    const quiz = await start({ mode: "smart", help: "practice", count: 5, timerMinutes: null, contest: "brain" });
    expect(quiz.statusCode).toBe(201);
    const s = await app.inject({ url: `/api/sessions/${quiz.json().id}`, headers: { cookie: mira } });
    expect(s.json().questions.every((q: { id: string }) => q.id.startsWith("wizBRAIN-"))).toBe(true);
  });

  it("scores a full paper out of 150 with a 75-minute timer, apart from wizSMART", async () => {
    const { app, mira, start, answer } = await world();
    const res = await start({ mode: "paper", paperYear: 2026, help: "test", timed: true, contest: "brain" });
    const id = res.json().id;
    const s = (await app.inject({ url: `/api/sessions/${id}`, headers: { cookie: mira } })).json();
    expect(s.settings.timerMinutes).toBe(75);
    expect(s.questions).toHaveLength(30);
    // 20 right (C), 10 blank: 100 + 10 = 110.
    for (let p = 1; p <= 20; p++) await answer(id, p, "C");
    await app.inject({ method: "POST", url: `/api/sessions/${id}/finish`, headers: { cookie: mira } });
    const r = (await app.inject({ url: `/api/sessions/${id}/results`, headers: { cookie: mira } })).json();
    expect(r).toMatchObject({ contest: "brain", score: 110, maxScore: 150 });
    expect(r.benchmark).toMatchObject({ year: 2026, groupName: "havo/vwo 1", max: 150, average: 52.2 });
    expect(r.benchmark.others.map((o: { groupName: string }) => o.groupName)).toEqual(["havo 2", "vwo 2"]);

    const ins = (await app.inject({ url: "/api/insights?contest=brain", headers: { cookie: mira } })).json();
    expect(ins).toMatchObject({ contest: "brain", paperMax: 150, estimate: { score: 110 }, totals: { papers: 1 } });
    expect(ins.vsAverage).toMatchObject({ max: 150, groupName: "havo/vwo 1" });
    const smart = (await app.inject({ url: "/api/insights", headers: { cookie: mira } })).json();
    expect(smart).toMatchObject({ contest: "kangaroo", paperMax: 120, estimate: null, totals: { answers: 0, papers: 0 } });

    const ready = (await app.inject({ url: "/api/readiness?contest=brain", headers: { cookie: mira } })).json();
    expect(ready).toMatchObject({ kind: "brain", max: 150, target: 125 });
    expect(ready.parts.score.detail).toBe("Estimated 110 out of 150, target 125.");
  });
});
