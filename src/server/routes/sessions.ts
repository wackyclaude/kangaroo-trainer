import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { and, desc, eq, isNull, sql } from "drizzle-orm";
import type { Db } from "../db/client.js";
import { attempt, practiceSession, profile, question, sessionQuestion } from "../db/schema.js";
import {
  CHOICES,
  FOCUS_AREAS,
  HELP_LEVELS,
  PAPER_MINUTES,
  TIERS,
  type AnswerFeedback,
  type Choice,
  type FocusArea,
  type PaperKeyRow,
  type SessionListItem,
  type SessionSettings,
  type SessionState,
  type Tier,
} from "../../shared/types.js";
import { requireParent, requireUser } from "./guards.js";
import { afterSessionEnded } from "../insights/store.js";
import { buildRewards } from "../rewards/store.js";
import type { SessionUser } from "../auth/session.js";
import { bestByYear, buildResults, createSession, finalAnswers, finishSession, isCorrect, pickQuestions, sessionQuestions, solutionSteps, TIMER_GRACE_MS } from "../practice/engine.js";

const focusKeys = Object.keys(FOCUS_AREAS) as [FocusArea, ...FocusArea[]];

// "paper" delivery = printed and done on paper. The parent may set one up for a student (forProfileId).
const paperExtras = {
  delivery: z.enum(["app", "paper"]).default("app"),
  forProfileId: z.number().int().positive().optional(),
};

const StartBody = z.discriminatedUnion("mode", [
  z.object({
    mode: z.literal("paper"),
    paperYear: z.number().int().min(2000).max(2100),
    help: z.enum(HELP_LEVELS),
    timed: z.boolean().default(true),
    ...paperExtras,
  }),
  z.object({
    mode: z.literal("mistakes"),
    help: z.enum(HELP_LEVELS),
    count: z.number().int().min(3).max(30).default(10),
  }),
  z.object({
    mode: z.literal("smart"),
    help: z.enum(HELP_LEVELS),
    count: z.number().int().min(3).max(30).default(12),
    timerMinutes: z.number().int().min(1).max(90).nullable().default(null),
  }),
  z.object({
    mode: z.literal("focus"),
    help: z.enum(HELP_LEVELS),
    focus: z.array(z.enum(focusKeys)).max(6).default([]),
    tiers: z.array(z.enum(TIERS)).max(3).default([]),
    years: z.array(z.number().int()).max(30).default([]),
    count: z.number().int().min(3).max(30).default(10),
    timerMinutes: z.number().int().min(1).max(90).nullable().default(null),
    excludeRecentDays: z.number().int().min(0).max(365).default(30),
    ...paperExtras,
  }),
]);

const PaperAnswersBody = z.object({
  answers: z.array(z.object({ position: z.number().int().min(1).max(40), choice: z.enum(CHOICES).nullable() })).min(1).max(40),
});

const AnswerBody = z.object({
  position: z.number().int().min(1).max(40),
  choice: z.enum(CHOICES).nullable(),
  timeMs: z.number().int().min(0).max(3 * 3600_000),
  hintUsed: z.boolean().default(false),
  flagged: z.boolean().default(false),
});

type SessionRow = typeof practiceSession.$inferSelect;

export async function sessionRoutes(app: FastifyInstance, deps: { db: Db }): Promise<void> {
  const { db } = deps;
  const idParam = z.object({ id: z.coerce.number().int().positive() });

  /** Loads a session the signed-in user may see (own, or any for the parent). */
  const loadSession = (req: FastifyRequest, reply: FastifyReply, user: SessionUser): SessionRow | undefined => {
    const p = idParam.safeParse(req.params);
    if (!p.success) {
      void reply.code(400).send({ error: "invalid", message: "Unknown session." });
      return undefined;
    }
    const s = db.select().from(practiceSession).where(eq(practiceSession.id, p.data.id)).get();
    if (!s || (s.profileId !== user.id && user.role !== "parent")) {
      void reply.code(404).send({ error: "not_found", message: "That session doesn't exist." });
      return undefined;
    }
    return s;
  };

  /** Ends a session and refreshes the profile's mistake memory and maturity trend. */
  const finish = (s: SessionRow, at = Date.now()) => {
    finishSession(db, s.id, s.profileId, at);
    afterSessionEnded(db, s.profileId, at);
  };

  const endsAt = (s: SessionRow) => {
    const m = (s.settings as SessionSettings).timerMinutes;
    return m ? s.startedAt + m * 60_000 : null;
  };

  /** A timed session whose time ran out is finished automatically. */
  const settleTimeout = (s: SessionRow, now = Date.now()): SessionRow => {
    const e = endsAt(s);
    if (!s.endedAt && e && now > e + TIMER_GRACE_MS) {
      finish(s, e);
      return db.select().from(practiceSession).where(eq(practiceSession.id, s.id)).get() ?? s;
    }
    return s;
  };

  app.post("/api/sessions", async (req, reply) => {
    const user = requireUser(req, reply);
    if (!user) return;
    const body = StartBody.safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: "invalid", message: "Please check the quiz settings." });
    const b = body.data;
    const onPaper = (b.mode === "paper" || b.mode === "focus") && b.delivery === "paper";
    let settings: SessionSettings;
    switch (b.mode) {
      case "paper":
        settings = { help: b.help, timerMinutes: b.timed ? PAPER_MINUTES : null };
        break;
      case "focus":
        settings = { help: b.help, timerMinutes: b.timerMinutes, focus: b.focus, tiers: b.tiers, years: b.years, count: b.count, excludeRecentDays: b.excludeRecentDays };
        break;
      case "mistakes":
        settings = { help: b.help, timerMinutes: null, count: b.count };
        break;
      case "smart":
        settings = { help: b.help, timerMinutes: b.timerMinutes, count: b.count, excludeRecentDays: 30 };
        break;
    }
    // On paper there is no timer and no help: answers are typed in afterwards and scored like a test.
    if (onPaper) settings = { ...settings, help: "test", timerMinutes: null, delivery: "paper" };

    let profileId = user.id;
    const forId = (b.mode === "paper" || b.mode === "focus") && b.forProfileId;
    if (forId && forId !== user.id) {
      if (user.role !== "parent" || !onPaper) return reply.code(403).send({ error: "parent_only", message: "Only the parent can set up a paper quiz for someone else." });
      const target = db.select().from(profile).where(eq(profile.id, forId)).get();
      if (!target || target.role !== "student") return reply.code(404).send({ error: "not_found", message: "That student doesn't exist." });
      profileId = forId;
    }

    const paperYear = b.mode === "paper" ? b.paperYear : null;
    const qs = pickQuestions(db, profileId, b.mode, paperYear, settings);
    if (!qs) {
      const message = b.mode === "mistakes" ? "No mistakes to fix right now. Well done!" : "No questions match those choices. Try fewer filters.";
      return reply.code(404).send({ error: "no_questions", message });
    }
    const id = createSession(db, profileId, b.mode, paperYear, settings, qs);
    return reply.code(201).send({ id });
  });

  app.get("/api/sessions", async (req, reply) => {
    const user = requireUser(req, reply);
    if (!user) return;
    const q = z.object({ profileId: z.coerce.number().int().positive().optional(), limit: z.coerce.number().int().min(1).max(100).default(20) }).safeParse(req.query);
    if (!q.success) return reply.code(400).send({ error: "invalid", message: "Bad filter." });
    const profileId = user.role === "parent" && q.data.profileId ? q.data.profileId : user.id;
    const rows = db
      .select({ s: practiceSession, n: sql<number>`(select count(*) from ${sessionQuestion} where ${sessionQuestion.sessionId} = ${practiceSession.id})` })
      .from(practiceSession)
      .where(eq(practiceSession.profileId, profileId))
      .orderBy(desc(practiceSession.startedAt))
      .limit(q.data.limit)
      .all();
    const list: SessionListItem[] = rows.map(({ s, n }) => {
      const settled = settleTimeout(s);
      return {
        id: settled.id,
        mode: settled.mode,
        paperYear: settled.paperYear,
        help: (settled.settings as SessionSettings).help,
        delivery: (settled.settings as SessionSettings).delivery ?? "app",
        startedAt: settled.startedAt,
        endedAt: settled.endedAt,
        score: settled.score,
        maxScore: settled.maxScore,
        questions: n,
      };
    });
    return list;
  });

  app.get("/api/papers", async (req, reply) => {
    const user = requireUser(req, reply);
    if (!user) return;
    const years = db
      .select({
        year: question.year,
        n: sql<number>`count(*)`,
        solved: sql<number>`sum(case when ${question.solutionEn} is not null or ${question.solutionSteps} is not null then 1 else 0 end)`,
      })
      .from(question)
      .where(eq(question.level, "wizSMART"))
      .groupBy(question.year)
      .orderBy(desc(question.year))
      .all();
    const best = bestByYear(db, user.id);
    return years.map((y) => ({ year: y.year, questions: y.n, withSolutions: y.solved, best: best.get(y.year) ?? null }));
  });

  app.get("/api/solutions/coverage", async (req, reply) => {
    if (!requireUser(req, reply)) return;
    const row = db
      .select({
        total: sql<number>`count(*)`,
        solved: sql<number>`sum(case when ${question.solutionEn} is not null or ${question.solutionSteps} is not null then 1 else 0 end)`,
      })
      .from(question)
      .where(eq(question.level, "wizSMART"))
      .get();
    return { total: row?.total ?? 0, withSolutions: row?.solved ?? 0 };
  });

  app.get("/api/sessions/:id", async (req, reply) => {
    const user = requireUser(req, reply);
    if (!user) return;
    const loaded = loadSession(req, reply, user);
    if (!loaded) return;
    const s = settleTimeout(loaded);
    const settings = s.settings as SessionSettings;
    const reveal = s.endedAt !== null || settings.help !== "test";
    const qs = sessionQuestions(db, s.id);
    const finals = finalAnswers(db, s.id);
    const state: SessionState = {
      id: s.id,
      mode: s.mode,
      paperYear: s.paperYear,
      settings,
      startedAt: s.startedAt,
      endsAt: endsAt(s),
      endedAt: s.endedAt,
      serverNow: Date.now(),
      questions: qs.map(({ position, q }) => ({
        position,
        id: q.id,
        year: q.year,
        number: q.number,
        tier: q.tier as Tier,
        focusPrimary: q.focusPrimary as FocusArea,
        focusSecondary: (q.focusSecondary as FocusArea | null) ?? null,
        imageUrl: `/content/${q.imagePath}`,
        text: q.text,
        hasHint: settings.help === "learn" && !!q.hintEn,
        hasSolution: solutionSteps(q) !== null,
        voidNote: s.endedAt ? q.voidNote : null,
      })),
      answers: qs
        .filter(({ q }) => finals.has(q.id))
        .map(({ position, q }) => {
          const f = finals.get(q.id)!;
          return {
            position,
            choice: f.choice,
            flagged: f.flagged,
            ...(reveal ? { correct: isCorrect(q, f.choice), answer: q.answer as Choice } : {}),
            ...(reveal && (settings.help === "learn" || s.endedAt) ? { steps: solutionSteps(q) } : {}),
          };
        }),
    };
    return state;
  });

  // Learn mode only: the hint for one question.
  app.get("/api/sessions/:id/hint/:position", async (req, reply) => {
    const user = requireUser(req, reply);
    if (!user) return;
    const s = loadSession(req, reply, user);
    if (!s) return;
    const pos = z.coerce.number().int().min(1).safeParse((req.params as { position?: string }).position);
    if (!pos.success) return reply.code(400).send({ error: "invalid", message: "Unknown question." });
    if ((s.settings as SessionSettings).help !== "learn" || s.endedAt) {
      return reply.code(403).send({ error: "no_hints", message: "Hints are only on in learn mode." });
    }
    const row = sessionQuestions(db, s.id).find((r) => r.position === pos.data);
    if (!row) return reply.code(404).send({ error: "not_found", message: "Unknown question." });
    return { hint: row.q.hintEn };
  });

  app.post("/api/sessions/:id/answers", async (req, reply) => {
    const user = requireUser(req, reply);
    if (!user) return;
    const loaded = loadSession(req, reply, user);
    if (!loaded) return;
    if (loaded.profileId !== user.id) return reply.code(403).send({ error: "not_yours", message: "This isn't your quiz." });
    const s = settleTimeout(loaded);
    if (s.endedAt) return reply.code(409).send({ error: "finished", message: "This quiz has already finished." });
    if ((s.settings as SessionSettings).delivery === "paper") return reply.code(409).send({ error: "on_paper", message: "This quiz is on paper. Type the answers in on the answer sheet screen." });
    const body = AnswerBody.safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: "invalid", message: "That answer couldn't be saved." });
    const row = sessionQuestions(db, s.id).find((r) => r.position === body.data.position);
    if (!row) return reply.code(404).send({ error: "not_found", message: "Unknown question." });

    const settings = s.settings as SessionSettings;
    const already = finalAnswers(db, s.id).get(row.q.id);
    if (settings.help !== "test" && already) {
      return reply.code(409).send({ error: "already_answered", message: "You've already answered this one." });
    }
    const correct = isCorrect(row.q, body.data.choice);
    db.insert(attempt)
      .values({
        sessionId: s.id,
        profileId: user.id,
        questionId: row.q.id,
        choice: body.data.choice,
        correct,
        timeMs: body.data.timeMs,
        hintUsed: body.data.hintUsed,
        flagged: body.data.flagged,
        answeredAt: Date.now(),
      })
      .run();
    const fb: AnswerFeedback = { saved: true };
    if (settings.help !== "test") {
      fb.correct = correct;
      fb.answer = row.q.answer as Choice;
      if (settings.help === "learn") fb.steps = solutionSteps(row.q);
    }
    return fb;
  });

  app.post("/api/sessions/:id/finish", async (req, reply) => {
    const user = requireUser(req, reply);
    if (!user) return;
    const s = loadSession(req, reply, user);
    if (!s) return;
    if (s.profileId !== user.id) return reply.code(403).send({ error: "not_yours", message: "This isn't your quiz." });
    if (!s.endedAt) finish(s);
    return buildResults(db, s.id);
  });

  app.get("/api/sessions/:id/results", async (req, reply) => {
    const user = requireUser(req, reply);
    if (!user) return;
    const loaded = loadSession(req, reply, user);
    if (!loaded) return;
    const s = settleTimeout(loaded);
    const r = buildResults(db, s.id);
    if (!r) return reply.code(409).send({ error: "not_finished", message: "Finish the quiz to see the results." });
    return { ...r, rewards: buildRewards(db, s.profileId)?.bySession.get(s.id) ?? null };
  });

  // Latest unfinished session, so the home screen can offer "Carry on".
  app.get("/api/sessions-open", async (req, reply) => {
    const user = requireUser(req, reply);
    if (!user) return;
    const rows = db
      .select()
      .from(practiceSession)
      .where(and(eq(practiceSession.profileId, user.id), isNull(practiceSession.endedAt)))
      .orderBy(desc(practiceSession.startedAt))
      .limit(3)
      .all()
      .map((s) => settleTimeout(s))
      .filter((s) => !s.endedAt);
    const s = rows[0];
    return s ? { id: s.id, mode: s.mode, paperYear: s.paperYear, startedAt: s.startedAt, delivery: (s.settings as SessionSettings).delivery ?? "app" } : null;
  });

  // Answers done on paper, typed in afterwards by the student or the parent. No times are recorded.
  app.post("/api/sessions/:id/paper-answers", async (req, reply) => {
    const user = requireUser(req, reply);
    if (!user) return;
    const s = loadSession(req, reply, user);
    if (!s) return;
    if ((s.settings as SessionSettings).delivery !== "paper") return reply.code(409).send({ error: "not_paper", message: "This quiz was done in the app." });
    if (s.endedAt) return reply.code(409).send({ error: "finished", message: "The answers for this paper are already in." });
    const body = PaperAnswersBody.safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: "invalid", message: "Please check the answers." });
    const rows = sessionQuestions(db, s.id);
    const byPos = new Map(rows.map((r) => [r.position, r.q]));
    if (body.data.answers.some((a) => !byPos.has(a.position))) return reply.code(400).send({ error: "invalid", message: "That answer sheet doesn't match this paper." });
    const now = Date.now();
    db.transaction((tx) => {
      for (const a of body.data.answers) {
        const q = byPos.get(a.position)!;
        tx.insert(attempt)
          .values({ sessionId: s.id, profileId: s.profileId, questionId: q.id, choice: a.choice, correct: isCorrect(q, a.choice), timeMs: null, source: "paper", answeredAt: now })
          .run();
      }
    });
    finish(s, now);
    return buildResults(db, s.id);
  });

  // The answer key for printing. Parent only: students see answers after finishing, in the results.
  app.get("/api/sessions/:id/key", async (req, reply) => {
    const user = requireParent(req, reply);
    if (!user) return;
    const s = loadSession(req, reply, user);
    if (!s) return;
    const key: PaperKeyRow[] = sessionQuestions(db, s.id).map(({ position, q }) => ({ position, year: q.year, number: q.number, answer: q.answer as Choice, voided: q.voidNote !== null }));
    return key;
  });
}
