import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { asc, eq, inArray } from "drizzle-orm";
import type { Db } from "../db/client.js";
import { attempt, practiceSession, profile, question, sessionQuestion } from "../db/schema.js";
import type { SessionSettings } from "../../shared/types.js";
import { requireParent, requireUser } from "./guards.js";
import { buildBenchmarks, buildInsights } from "../insights/store.js";
import { toCsv as csv } from "../csv.js";
import { buildRewards } from "../rewards/store.js";
import { buildReadiness } from "../readiness/store.js";
import { profile as profileTable } from "../db/schema.js";

const iso = (ms: number | null) => (ms === null ? "" : new Date(ms).toISOString());

export async function insightRoutes(app: FastifyInstance, deps: { db: Db }): Promise<void> {
  const { db } = deps;

  // A student's own insights.
  app.get("/api/insights", async (req, reply) => {
    const user = requireUser(req, reply);
    if (!user) return;
    return buildInsights(db, user.id);
  });

  // The parent can look at any student.
  app.get("/api/insights/:profileId", async (req, reply) => {
    const user = requireUser(req, reply);
    if (!user) return;
    const p = z.object({ profileId: z.coerce.number().int().positive() }).safeParse(req.params);
    if (!p.success) return reply.code(400).send({ error: "invalid", message: "Unknown profile." });
    if (p.data.profileId !== user.id && user.role !== "parent") return reply.code(404).send({ error: "not_found", message: "Nothing here." });
    const out = buildInsights(db, p.data.profileId);
    if (!out) return reply.code(404).send({ error: "not_found", message: "That profile doesn't exist." });
    return out;
  });

  // Stars, streak and badges: a student's own, or any student's for the parent.
  app.get("/api/rewards", async (req, reply) => {
    const user = requireUser(req, reply);
    if (!user) return;
    const out = buildRewards(db, user.id);
    if (!out) return reply.code(404).send({ error: "not_found", message: "Rewards are for students." });
    return out.rewards;
  });

  app.get("/api/rewards/:profileId", async (req, reply) => {
    const user = requireUser(req, reply);
    if (!user) return;
    const p = z.object({ profileId: z.coerce.number().int().positive() }).safeParse(req.params);
    if (!p.success) return reply.code(400).send({ error: "invalid", message: "Unknown profile." });
    if (p.data.profileId !== user.id && user.role !== "parent") return reply.code(404).send({ error: "not_found", message: "Nothing here." });
    const out = buildRewards(db, p.data.profileId);
    if (!out) return reply.code(404).send({ error: "not_found", message: "That student doesn't exist." });
    return out.rewards;
  });

  // Contest countdown and readiness: a student's own, or any student's for the parent.
  app.get("/api/readiness", async (req, reply) => {
    const user = requireUser(req, reply);
    if (!user) return;
    const out = buildReadiness(db, user.id);
    if (!out) return reply.code(404).send({ error: "not_found", message: "Readiness is for students." });
    return out;
  });

  app.get("/api/readiness/:profileId", async (req, reply) => {
    const user = requireUser(req, reply);
    if (!user) return;
    const p = z.object({ profileId: z.coerce.number().int().positive() }).safeParse(req.params);
    if (!p.success) return reply.code(400).send({ error: "invalid", message: "Unknown profile." });
    if (p.data.profileId !== user.id && user.role !== "parent") return reply.code(404).send({ error: "not_found", message: "Nothing here." });
    const out = buildReadiness(db, p.data.profileId);
    if (!out) return reply.code(404).send({ error: "not_found", message: "That student doesn't exist." });
    return out;
  });

  // The parent sets the school's contest day and the target score for a student.
  const IsoDay = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/).refine((d) => !Number.isNaN(Date.parse(`${d}T12:00:00Z`)) && new Date(`${d}T12:00:00Z`).toISOString().startsWith(d));
  const ContestSettings = z.object({
    contestDate: IsoDay.nullable(),
    targetScore: z.number().int().min(40).max(120).nullable(),
  });
  app.put("/api/profiles/:profileId/contest", async (req, reply) => {
    if (!requireParent(req, reply)) return;
    const p = z.object({ profileId: z.coerce.number().int().positive() }).safeParse(req.params);
    const body = ContestSettings.safeParse(req.body);
    if (!p.success || !body.success) return reply.code(400).send({ error: "invalid", message: "Please pick a date in March and a target between 40 and 120." });
    const d = body.data.contestDate;
    if (d && !(d.slice(5, 7) === "03" && Number(d.slice(8)) >= 15)) {
      return reply.code(400).send({ error: "invalid", message: "The contest is held between the third Thursday of March and 31 March." });
    }
    const target = db.select({ role: profileTable.role }).from(profileTable).where(eq(profileTable.id, p.data.profileId)).get();
    if (!target || target.role !== "student") return reply.code(404).send({ error: "not_found", message: "That student doesn't exist." });
    db.update(profileTable).set({ contestDate: d, targetScore: body.data.targetScore }).where(eq(profileTable.id, p.data.profileId)).run();
    return buildReadiness(db, p.data.profileId);
  });

  app.get("/api/admin/benchmarks", async (req, reply) => {
    if (!requireParent(req, reply)) return;
    return buildBenchmarks(db);
  });

  // ---------- export (parent only) ----------
  const ExportQuery = z.object({ profileId: z.coerce.number().int().positive().optional() });

  const gather = (profileId?: number) => {
    const people = db
      .select({ id: profile.id, nickname: profile.nickname, avatar: profile.avatar, grade: profile.grade, birthYear: profile.birthYear, createdAt: profile.createdAt })
      .from(profile)
      .where(eq(profile.role, "student"))
      .orderBy(asc(profile.id))
      .all()
      .filter((p) => !profileId || p.id === profileId);
    const ids = people.map((p) => p.id);
    const sessions = ids.length ? db.select().from(practiceSession).where(inArray(practiceSession.profileId, ids)).orderBy(asc(practiceSession.id)).all() : [];
    const counts = new Map<number, number>();
    if (sessions.length) {
      for (const r of db.select({ id: sessionQuestion.sessionId }).from(sessionQuestion).where(inArray(sessionQuestion.sessionId, sessions.map((s) => s.id))).all()) counts.set(r.id, (counts.get(r.id) ?? 0) + 1);
    }
    const attempts = ids.length
      ? db.select({ a: attempt, q: question }).from(attempt).innerJoin(question, eq(question.id, attempt.questionId)).where(inArray(attempt.profileId, ids)).orderBy(asc(attempt.id)).all()
      : [];
    return { people, sessions, counts, attempts };
  };

  const sendFile = (reply: import("fastify").FastifyReply, name: string, type: string, body: string) =>
    reply.header("Content-Type", `${type}; charset=utf-8`).header("Content-Disposition", `attachment; filename="${name}"`).header("Cache-Control", "no-store").send(body);
  const stamp = () => new Date().toISOString().slice(0, 10);

  app.get("/api/admin/export.json", async (req, reply) => {
    if (!requireParent(req, reply)) return;
    const q = ExportQuery.safeParse(req.query);
    if (!q.success) return reply.code(400).send({ error: "invalid", message: "Bad filter." });
    const { people, sessions, counts, attempts } = gather(q.data.profileId);
    const body = {
      exportedAt: new Date().toISOString(),
      note: "Kangaroo Trainer practice data. Question content is not included.",
      profiles: people,
      sessions: sessions.map((s) => ({ ...s, questions: counts.get(s.id) ?? 0 })),
      attempts: attempts.map(({ a, q }) => ({ ...a, year: q.year, number: q.number, tier: q.tier, focusPrimary: q.focusPrimary, focusSecondary: q.focusSecondary, answer: q.answer })),
    };
    return sendFile(reply, `kangaroo-export-${stamp()}.json`, "application/json", JSON.stringify(body, null, 2));
  });

  app.get("/api/admin/export/attempts.csv", async (req, reply) => {
    if (!requireParent(req, reply)) return;
    const q = ExportQuery.safeParse(req.query);
    if (!q.success) return reply.code(400).send({ error: "invalid", message: "Bad filter." });
    const { people, attempts } = gather(q.data.profileId);
    const name = new Map(people.map((p) => [p.id, p.nickname]));
    const body = csv(
      ["attempt_id", "session_id", "profile_id", "nickname", "question_id", "year", "number", "tier", "focus_primary", "focus_secondary", "choice", "answer", "correct", "time_ms", "hint_used", "flagged", "source", "answered_at"],
      attempts.map(({ a, q }) => [a.id, a.sessionId, a.profileId, name.get(a.profileId), a.questionId, q.year, q.number, q.tier, q.focusPrimary, q.focusSecondary, a.choice, q.answer, a.correct, a.timeMs, a.hintUsed, a.flagged, a.source, iso(a.answeredAt)]),
    );
    return sendFile(reply, `kangaroo-attempts-${stamp()}.csv`, "text/csv", body);
  });

  app.get("/api/admin/export/sessions.csv", async (req, reply) => {
    if (!requireParent(req, reply)) return;
    const q = ExportQuery.safeParse(req.query);
    if (!q.success) return reply.code(400).send({ error: "invalid", message: "Bad filter." });
    const { people, sessions, counts } = gather(q.data.profileId);
    const name = new Map(people.map((p) => [p.id, p.nickname]));
    const body = csv(
      ["session_id", "profile_id", "nickname", "mode", "help", "delivery", "paper_year", "questions", "score", "max_score", "started_at", "ended_at"],
      sessions.map((s) => {
        const st = s.settings as SessionSettings;
        return [s.id, s.profileId, name.get(s.profileId), s.mode, st.help, st.delivery ?? "app", s.paperYear, counts.get(s.id) ?? 0, s.score, s.maxScore, iso(s.startedAt), iso(s.endedAt)];
      }),
    );
    return sendFile(reply, `kangaroo-sessions-${stamp()}.csv`, "text/csv", body);
  });
}
