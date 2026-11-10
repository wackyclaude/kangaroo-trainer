import { describe, expect, it } from "vitest";
import { FEEDBACK_PER_DAY } from "../src/shared/types.js";
import { feedback } from "../src/server/db/schema.js";
import { addStudent, cookieFrom, makeApp, setupParent } from "./helpers.js";

async function world() {
  const ctx = await makeApp();
  const parent = await setupParent(ctx.app);
  const miraId = (await addStudent(ctx.app, parent, "Mira", "1234")).json().id;
  const tomId = (await addStudent(ctx.app, parent, "Tom", "5678")).json().id;
  const login = async (id: number, pin: string) => cookieFrom(await ctx.app.inject({ method: "POST", url: "/api/auth/login", payload: { profileId: id, pin } }));
  const as = (cookie: string) => ({
    get: (url: string) => ctx.app.inject({ url, headers: { cookie } }),
    post: (url: string, payload: object = {}) => ctx.app.inject({ method: "POST", url, headers: { cookie }, payload }),
    del: (url: string) => ctx.app.inject({ method: "DELETE", url, headers: { cookie } }),
  });
  return { ...ctx, parent: as(parent), mira: as(await login(miraId, "1234")), tom: as(await login(tomId, "5678")), miraId };
}

describe("feedback from students", () => {
  it("goes from a student to the parent and back", async () => {
    const { parent, mira, tom } = await world();
    // About one question: the kind is enough; about the app: a few words are needed.
    expect((await mira.post("/api/feedback", { kind: "wrong-answer", questionId: "wizSMART-2026-02" })).statusCode).toBe(201);
    expect((await mira.post("/api/feedback", { kind: "idea" })).statusCode).toBe(400);
    expect((await mira.post("/api/feedback", { kind: "idea", message: "  More space puzzles please!\u0007 " })).statusCode).toBe(201);
    // Kinds must fit: an app kind on a question is refused, and so is an unknown question.
    expect((await mira.post("/api/feedback", { kind: "like", questionId: "wizSMART-2026-02", message: "hi" })).statusCode).toBe(400);
    expect((await mira.post("/api/feedback", { kind: "unclear", questionId: "nope" })).statusCode).toBe(404);
    // Parents read feedback; they don't send it.
    expect((await parent.post("/api/feedback", { kind: "idea", message: "test" })).statusCode).toBe(403);

    const inbox = (await parent.get("/api/feedback?status=open")).json();
    expect(inbox).toHaveLength(2);
    expect(inbox[0]).toMatchObject({ nickname: "Mira", kind: "idea", message: "More space puzzles please!", question: null });
    expect(inbox[1].question).toMatchObject({ id: "wizSMART-2026-02", year: 2026, label: "2", answer: "B" });
    expect((await parent.get("/api/feedback/summary")).json()).toEqual({ open: 2, unseenReplies: 0 });

    // Students only see their own, and never the answer.
    expect((await tom.get("/api/feedback")).json()).toHaveLength(0);
    const mine = (await mira.get("/api/feedback")).json();
    expect(mine).toHaveLength(2);
    expect(mine[1].question.answer).toBeUndefined();

    // Students can't reply, mark done or delete.
    expect((await mira.post(`/api/feedback/${inbox[0].id}/reply`, { reply: "x" })).statusCode).toBe(403);
    expect((await mira.del(`/api/feedback/${inbox[0].id}`)).statusCode).toBe(403);

    expect((await parent.post(`/api/feedback/${inbox[0].id}/reply`, { reply: "Great idea, I'll add some." })).statusCode).toBe(200);
    expect((await parent.get("/api/feedback/summary")).json().open).toBe(1);
    expect((await mira.get("/api/feedback/summary")).json()).toEqual({ open: 0, unseenReplies: 1 });
    expect((await mira.get("/api/feedback")).json()[0]).toMatchObject({ reply: "Great idea, I'll add some.", replySeenAt: null });
    await mira.post("/api/feedback/seen");
    expect((await mira.get("/api/feedback/summary")).json().unseenReplies).toBe(0);

    expect((await parent.post(`/api/feedback/${inbox[1].id}/done`, { done: true })).statusCode).toBe(200);
    expect((await parent.get("/api/feedback?status=open")).json()).toHaveLength(0);
    expect((await parent.get("/api/feedback")).json()).toHaveLength(2);
    expect((await parent.del(`/api/feedback/${inbox[1].id}`)).statusCode).toBe(200);
    expect((await parent.get("/api/feedback")).json()).toHaveLength(1);
    expect((await parent.post("/api/feedback/999/done", { done: true })).statusCode).toBe(404);
  });

  it("keeps messages short and limits how many a day", async () => {
    const { db, mira, tom, miraId } = await world();
    expect((await mira.post("/api/feedback", { kind: "problem", message: "x".repeat(501) })).statusCode).toBe(400);
    // A quiz that belongs to someone else can't be attached.
    const s = (await tom.post("/api/sessions", { mode: "focus", help: "practice" })).json().id;
    expect((await mira.post("/api/feedback", { kind: "too-hard", questionId: "wizSMART-2026-03", sessionId: s })).statusCode).toBe(404);
    const now = Date.now();
    for (let i = 0; i < FEEDBACK_PER_DAY; i++) db.insert(feedback).values({ profileId: miraId, kind: "idea", message: "hi", createdAt: now - i }).run();
    expect((await mira.post("/api/feedback", { kind: "idea", message: "one more" })).statusCode).toBe(429);
  });
});
