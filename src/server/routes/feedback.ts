// Feedback from students to the parent: about one question or about the app, with the parent's reply.
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { and, count, desc, eq, gt, isNotNull, isNull } from "drizzle-orm";
import type { Db } from "../db/client.js";
import { feedback, practiceSession, profile, question } from "../db/schema.js";
import { FEEDBACK_KINDS, FEEDBACK_MAX_CHARS, FEEDBACK_PER_DAY, APP_FEEDBACK, QUESTION_FEEDBACK, type Contest, type FeedbackItem, type FeedbackKind } from "../../shared/types.js";
import { contestOfQuestion, imageUrl, labelOf } from "../practice/contest.js";
import { requireParent, requireUser } from "./guards.js";

const DAY = 86_400_000;
const text = (max: number) =>
  z
    .string()
    .max(max * 2)
    // Plain text only: no control characters except new lines; trimmed.
    .transform((s) => s.replace(/[\u0000-\u0009\u000B-\u001F\u007F]/g, "").trim())
    .pipe(z.string().max(max));

const SendBody = z.object({
  kind: z.enum(FEEDBACK_KINDS),
  message: text(FEEDBACK_MAX_CHARS).default(""),
  questionId: z.string().max(40).nullable().default(null),
  sessionId: z.number().int().positive().nullable().default(null),
});
const ReplyBody = z.object({ reply: text(FEEDBACK_MAX_CHARS), done: z.boolean().default(true) });
const DoneBody = z.object({ done: z.boolean() });
const IdParam = z.object({ id: z.coerce.number().int().positive() });
const ListQuery = z.object({ status: z.enum(["open", "all"]).default("all"), limit: z.coerce.number().int().min(1).max(200).default(100) });

export async function feedbackRoutes(app: FastifyInstance, deps: { db: Db }): Promise<void> {
  const { db } = deps;

  const toItem = (r: { f: typeof feedback.$inferSelect; p: typeof profile.$inferSelect; q: typeof question.$inferSelect | null }, forParent: boolean): FeedbackItem => ({
    id: r.f.id,
    profileId: r.f.profileId,
    nickname: r.p.nickname,
    avatar: r.p.avatar,
    kind: r.f.kind as FeedbackKind,
    message: r.f.message,
    createdAt: r.f.createdAt,
    question: r.q
      ? {
          id: r.q.id,
          contest: contestOfQuestion(r.q),
          year: r.q.year,
          label: labelOf(r.q),
          imageUrl: imageUrl(r.q.imagePath),
          text: r.q.text,
          ...(forParent ? { answer: r.q.answer } : {}),
        }
      : null,
    reply: r.f.reply,
    repliedAt: r.f.repliedAt,
    replySeenAt: r.f.replySeenAt,
    doneAt: r.f.doneAt,
  });

  // A student sends feedback.
  app.post("/api/feedback", { config: { rateLimit: { max: 10, timeWindow: "1 minute" } } }, async (req, reply) => {
    const user = requireUser(req, reply);
    if (!user) return;
    if (user.role !== "student") return reply.code(403).send({ error: "students_only", message: "Feedback is for students to send to the parent." });
    const body = SendBody.safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: "invalid", message: `Please pick what it's about and keep the message under ${FEEDBACK_MAX_CHARS} characters.` });
    const b = body.data;
    const allowed = b.questionId ? QUESTION_FEEDBACK : APP_FEEDBACK;
    if (!allowed.includes(b.kind)) return reply.code(400).send({ error: "invalid", message: "Please pick what it's about." });
    if (b.message.length < 2 && (!b.questionId || b.kind === "other")) return reply.code(400).send({ error: "invalid", message: "Please write a few words so your parent knows what you mean." });
    if (b.questionId && !db.select({ id: question.id }).from(question).where(eq(question.id, b.questionId)).get()) {
      return reply.code(404).send({ error: "not_found", message: "That question doesn't exist." });
    }
    if (b.sessionId) {
      const s = db.select({ profileId: practiceSession.profileId }).from(practiceSession).where(eq(practiceSession.id, b.sessionId)).get();
      if (!s || s.profileId !== user.id) return reply.code(404).send({ error: "not_found", message: "That quiz doesn't exist." });
    }
    const now = Date.now();
    const today = db.select({ n: count() }).from(feedback).where(and(eq(feedback.profileId, user.id), gt(feedback.createdAt, now - DAY))).get()?.n ?? 0;
    if (today >= FEEDBACK_PER_DAY) return reply.code(429).send({ error: "slow_down", message: "That's a lot of messages for one day. Your parent will read them; send more tomorrow." });
    const row = db
      .insert(feedback)
      .values({ profileId: user.id, questionId: b.questionId, sessionId: b.sessionId, kind: b.kind, message: b.message, createdAt: now })
      .returning({ id: feedback.id })
      .get();
    return reply.code(201).send({ id: row.id });
  });

  // Students see their own messages; the parent sees everyone's.
  app.get("/api/feedback", async (req, reply) => {
    const user = requireUser(req, reply);
    if (!user) return;
    const q = ListQuery.safeParse(req.query);
    if (!q.success) return reply.code(400).send({ error: "invalid", message: "That list request wasn't right." });
    const parent = user.role === "parent";
    const where = and(parent ? undefined : eq(feedback.profileId, user.id), q.data.status === "open" ? isNull(feedback.doneAt) : undefined);
    const rows = db
      .select({ f: feedback, p: profile, q: question })
      .from(feedback)
      .innerJoin(profile, eq(profile.id, feedback.profileId))
      .leftJoin(question, eq(question.id, feedback.questionId))
      .where(where)
      .orderBy(desc(feedback.createdAt), desc(feedback.id))
      .limit(q.data.limit)
      .all();
    return rows.map((r) => toItem(r, parent));
  });

  // Counts for badges on the home screens: open items (parent) or unseen replies (student).
  app.get("/api/feedback/summary", async (req, reply) => {
    const user = requireUser(req, reply);
    if (!user) return;
    if (user.role === "parent") {
      return { open: db.select({ n: count() }).from(feedback).where(isNull(feedback.doneAt)).get()?.n ?? 0, unseenReplies: 0 };
    }
    const unseen = db
      .select({ n: count() })
      .from(feedback)
      .where(and(eq(feedback.profileId, user.id), isNotNull(feedback.reply), isNull(feedback.replySeenAt)))
      .get()?.n ?? 0;
    return { open: 0, unseenReplies: unseen };
  });

  // A student has read the parent's replies.
  app.post("/api/feedback/seen", async (req, reply) => {
    const user = requireUser(req, reply);
    if (!user) return;
    db.update(feedback)
      .set({ replySeenAt: Date.now() })
      .where(and(eq(feedback.profileId, user.id), isNotNull(feedback.reply), isNull(feedback.replySeenAt)))
      .run();
    return { ok: true };
  });

  const findOr404 = (id: number) => db.select().from(feedback).where(eq(feedback.id, id)).get();

  // The parent replies (the student sees it on their feedback page) and usually marks it done.
  app.post("/api/feedback/:id/reply", async (req, reply) => {
    const user = requireParent(req, reply);
    if (!user) return;
    const p = IdParam.safeParse(req.params);
    const body = ReplyBody.safeParse(req.body);
    if (!p.success || !body.success || body.data.reply.length < 1) return reply.code(400).send({ error: "invalid", message: `Write a reply of up to ${FEEDBACK_MAX_CHARS} characters.` });
    if (!findOr404(p.data.id)) return reply.code(404).send({ error: "not_found", message: "That message doesn't exist." });
    const now = Date.now();
    db.update(feedback)
      .set({ reply: body.data.reply, repliedAt: now, replySeenAt: null, ...(body.data.done ? { doneAt: now } : {}) })
      .where(eq(feedback.id, p.data.id))
      .run();
    return { ok: true };
  });

  app.post("/api/feedback/:id/done", async (req, reply) => {
    const user = requireParent(req, reply);
    if (!user) return;
    const p = IdParam.safeParse(req.params);
    const body = DoneBody.safeParse(req.body);
    if (!p.success || !body.success) return reply.code(400).send({ error: "invalid", message: "That request wasn't right." });
    if (!findOr404(p.data.id)) return reply.code(404).send({ error: "not_found", message: "That message doesn't exist." });
    db.update(feedback)
      .set({ doneAt: body.data.done ? Date.now() : null })
      .where(eq(feedback.id, p.data.id))
      .run();
    return { ok: true };
  });

  app.delete("/api/feedback/:id", async (req, reply) => {
    const user = requireParent(req, reply);
    if (!user) return;
    const p = IdParam.safeParse(req.params);
    if (!p.success) return reply.code(400).send({ error: "invalid", message: "That request wasn't right." });
    if (!findOr404(p.data.id)) return reply.code(404).send({ error: "not_found", message: "That message doesn't exist." });
    db.delete(feedback).where(eq(feedback.id, p.data.id)).run();
    return { ok: true };
  });
}
