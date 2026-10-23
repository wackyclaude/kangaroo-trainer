import { and, asc, eq, gt, sql } from "drizzle-orm";
import type { Db } from "../db/client.js";
import { attempt, practiceSession, question, sessionQuestion } from "../db/schema.js";
import { countedAnswers, reviewQueue } from "../insights/store.js";
import { pickMistakes, pickSmart, shuffle } from "../insights/pick.js";
import {
  SCORING,
  TIERS,
  type Choice,
  type FocusArea,
  type PracticeMode,
  type ResultRow,
  type SessionResults,
  type SessionSettings,
  type Tier,
} from "../../shared/types.js";

type QuestionRow = typeof question.$inferSelect;

export const TIMER_GRACE_MS = 15_000;


const tierRank = (t: string) => TIERS.indexOf(t as Tier);

/** Picks the questions for a new session. Returns null when nothing matches. */
export function pickQuestions(db: Db, profileId: number, mode: PracticeMode, paperYear: number | null, s: SessionSettings, now = Date.now()): QuestionRow[] | null {
  if (mode === "paper") {
    if (!paperYear) return null;
    const rows = db.select().from(question).where(and(eq(question.level, "wizSMART"), eq(question.year, paperYear))).orderBy(asc(question.number)).all();
    return rows.length ? rows : null;
  }

  const all = db.select().from(question).where(eq(question.level, "wizSMART")).all();
  const usable = all.filter((q) => s.help !== "learn" || hasSolution(q));
  const recentCorrectIds = (days: number) =>
    new Set(
      days > 0
        ? db
            .selectDistinct({ id: attempt.questionId })
            .from(attempt)
            .where(and(eq(attempt.profileId, profileId), eq(attempt.correct, true), gt(attempt.answeredAt, now - days * 86_400_000)))
            .all()
            .map((r) => r.id)
        : [],
    );

  if (mode === "mistakes") {
    const picked = pickMistakes(usable, reviewQueue(db, profileId, now), s.count ?? 10);
    return picked.length ? picked : null;
  }
  if (mode === "smart") {
    const picked = pickSmart(usable, countedAnswers(db, profileId), reviewQueue(db, profileId, now), recentCorrectIds(s.excludeRecentDays ?? 30), s.count ?? 12, now);
    return picked.length ? picked : null;
  }

  // Focus quiz: filter, leave out recently-mastered questions, shuffle, then easiest first.
  const focus = new Set<string>(s.focus ?? []);
  const tiers = new Set<string>(s.tiers ?? []);
  const years = new Set<number>(s.years ?? []);
  const candidates = usable.filter(
    (q) =>
      (focus.size === 0 || focus.has(q.focusPrimary) || (q.focusSecondary !== null && focus.has(q.focusSecondary))) &&
      (tiers.size === 0 || tiers.has(q.tier)) &&
      (years.size === 0 || years.has(q.year)),
  );
  if (candidates.length === 0) return null;

  const recentCorrect = recentCorrectIds(s.excludeRecentDays ?? 30);
  const fresh = shuffle(candidates.filter((q) => !recentCorrect.has(q.id)));
  const seen = shuffle(candidates.filter((q) => recentCorrect.has(q.id)));
  const count = Math.min(s.count ?? 10, candidates.length);
  return [...fresh, ...seen].slice(0, count).sort((a, b) => tierRank(a.tier) - tierRank(b.tier));
}

export function createSession(db: Db, profileId: number, mode: PracticeMode, paperYear: number | null, settings: SessionSettings, qs: QuestionRow[], now = Date.now()): number {
  return db.transaction((tx) => {
    const row = tx
      .insert(practiceSession)
      .values({ profileId, mode, settings, paperYear, startedAt: now })
      .returning({ id: practiceSession.id })
      .get();
    qs.forEach((q, i) => tx.insert(sessionQuestion).values({ sessionId: row.id, position: i + 1, questionId: q.id }).run());
    return row.id;
  });
}

export function sessionQuestions(db: Db, sessionId: number) {
  return db
    .select({ position: sessionQuestion.position, q: question })
    .from(sessionQuestion)
    .innerJoin(question, eq(question.id, sessionQuestion.questionId))
    .where(eq(sessionQuestion.sessionId, sessionId))
    .orderBy(asc(sessionQuestion.position))
    .all();
}

export interface FinalAnswer {
  choice: Choice | null;
  flagged: boolean;
  hintUsed: boolean;
  timeMs: number;
  answered: boolean;
}

/** Latest answer per question in a session, plus the total time spent on each. */
export function finalAnswers(db: Db, sessionId: number): Map<string, FinalAnswer> {
  const rows = db.select().from(attempt).where(eq(attempt.sessionId, sessionId)).orderBy(asc(attempt.id)).all();
  const out = new Map<string, FinalAnswer>();
  for (const r of rows) {
    const prev = out.get(r.questionId);
    out.set(r.questionId, {
      choice: (r.choice as Choice | null) ?? null,
      flagged: r.flagged,
      hintUsed: (prev?.hintUsed ?? false) || r.hintUsed,
      timeMs: (prev?.timeMs ?? 0) + (r.timeMs ?? 0),
      answered: true,
    });
  }
  return out;
}

/** The worked solution as steps (older content has one paragraph, which becomes one step). */
export function solutionSteps(q: QuestionRow): string[] | null {
  if (q.solutionSteps && q.solutionSteps.length > 0) return q.solutionSteps;
  return q.solutionEn ? [q.solutionEn] : null;
}

const hasSolution = (q: QuestionRow) => solutionSteps(q) !== null;

export function isCorrect(q: QuestionRow, choice: Choice | null): boolean {
  if (q.voidNote) return true; // voided by the organisers: everyone gets the points
  return choice !== null && choice === q.answer;
}

export function points(q: QuestionRow, choice: Choice | null): number {
  if (q.voidNote) return SCORING.correct;
  if (choice === null) return SCORING.blank;
  return choice === q.answer ? SCORING.correct : SCORING.wrong;
}

/** Ends a session: unanswered questions get a blank attempt, then the score is stored. */
export function finishSession(db: Db, sessionId: number, profileId: number, now = Date.now()): void {
  const s = db.select().from(practiceSession).where(eq(practiceSession.id, sessionId)).get();
  if (!s || s.endedAt) return;
  const qs = sessionQuestions(db, sessionId);
  const finals = finalAnswers(db, sessionId);
  db.transaction((tx) => {
    let score = 0;
    for (const { q } of qs) {
      const f = finals.get(q.id);
      if (!f) {
        tx.insert(attempt)
          .values({ sessionId, profileId, questionId: q.id, choice: null, correct: isCorrect(q, null), timeMs: null, answeredAt: now })
          .run();
      }
      score += points(q, f?.choice ?? null);
    }
    tx.update(practiceSession)
      .set({ endedAt: now, score, maxScore: qs.length * SCORING.correct })
      .where(eq(practiceSession.id, sessionId))
      .run();
  });
}

export function buildResults(db: Db, sessionId: number): SessionResults | null {
  const s = db.select().from(practiceSession).where(eq(practiceSession.id, sessionId)).get();
  if (!s || !s.endedAt) return null;
  const finals = finalAnswers(db, sessionId);
  const rows: ResultRow[] = sessionQuestions(db, sessionId).map(({ position, q }) => {
    const f = finals.get(q.id);
    const choice = f?.choice ?? null;
    return {
      position,
      id: q.id,
      year: q.year,
      number: q.number,
      tier: q.tier as Tier,
      focusPrimary: q.focusPrimary as FocusArea,
      focusSecondary: (q.focusSecondary as FocusArea | null) ?? null,
      imageUrl: `/content/${q.imagePath}`,
      choice,
      answer: q.answer as Choice,
      correct: isCorrect(q, choice),
      voided: q.voidNote !== null,
      timeMs: f?.timeMs ?? 0,
      hintUsed: f?.hintUsed ?? false,
      hint: q.hintEn,
      steps: solutionSteps(q),
    };
  });

  // "Practise next": focus areas with the most misses in this session (main tag counts 1, second tag ½).
  const tally = new Map<FocusArea, { missed: number; of: number }>();
  const add = (f: FocusArea, weight: number, missed: boolean) => {
    const t = tally.get(f) ?? { missed: 0, of: 0 };
    t.of += weight;
    if (missed) t.missed += weight;
    tally.set(f, t);
  };
  for (const r of rows) {
    if (r.voided) continue;
    add(r.focusPrimary, 1, !r.correct);
    if (r.focusSecondary) add(r.focusSecondary, 0.5, !r.correct);
  }
  const practiseNext = [...tally.entries()]
    .filter(([, t]) => t.missed > 0)
    .sort((a, b) => b[1].missed / b[1].of - a[1].missed / a[1].of || b[1].missed - a[1].missed)
    .slice(0, 3)
    .map(([focus, t]) => ({ focus, missed: t.missed, of: t.of }));

  const settings = s.settings as SessionSettings;
  return {
    id: s.id,
    mode: s.mode,
    paperYear: s.paperYear,
    help: settings.help,
    delivery: settings.delivery ?? "app",
    startedAt: s.startedAt,
    endedAt: s.endedAt,
    score: s.score ?? 0,
    maxScore: s.maxScore ?? rows.length * SCORING.correct,
    correct: rows.filter((r) => r.correct).length,
    wrong: rows.filter((r) => !r.correct && r.choice !== null).length,
    blank: rows.filter((r) => !r.correct && r.choice === null).length,
    totalTimeMs: rows.reduce((t, r) => t + r.timeMs, 0),
    rows,
    practiseNext,
  };
}

/** Best score per paper year for a profile, used on the paper picker. */
export function bestByYear(db: Db, profileId: number): Map<number, { best: number; max: number; attempts: number }> {
  const rows = db
    .select({
      year: practiceSession.paperYear,
      best: sql<number>`max(${practiceSession.score})`,
      max: sql<number>`max(${practiceSession.maxScore})`,
      n: sql<number>`count(*)`,
    })
    .from(practiceSession)
    .where(and(eq(practiceSession.profileId, profileId), eq(practiceSession.mode, "paper"), sql`${practiceSession.endedAt} is not null`))
    .groupBy(practiceSession.paperYear)
    .all();
  const m = new Map<number, { best: number; max: number; attempts: number }>();
  for (const r of rows) if (r.year !== null) m.set(r.year, { best: r.best, max: r.max, attempts: r.n });
  return m;
}

