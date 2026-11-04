import { and, asc, eq, gt, sql } from "drizzle-orm";
import type { Db } from "../db/client.js";
import { attempt, practiceSession, question, sessionQuestion } from "../db/schema.js";
import { countedAnswers, reviewQueue } from "../insights/store.js";
import { pickMistakes, pickSmart, shuffle } from "../insights/pick.js";
import {
  SCORING,
  TIERS,
  type Contest,
  type CutoffResult,
  type FocusArea,
  type OlyLevel,
  type OlyPart,
  type PaceMarks,
  type PracticeMode,
  type ResultRow,
  type Reveal,
  type SessionResults,
  type SessionSettings,
  type Tier,
} from "../../shared/types.js";
import { checkAnswer } from "../../shared/answers.js";
import { betterThan, olympiadPapers, paceMarks } from "../content/olympiad.js";
import { contestOfSession, imageUrl, labelOf, profileSettings } from "./contest.js";

type QuestionRow = typeof question.$inferSelect;

export const TIMER_GRACE_MS = 15_000;


const tierRank = (t: string) => TIERS.indexOf(t as Tier);
/** Easiest first: Kangaroo by tier, the Olympiad by level (A before B on a tie). */
const easiestFirst = (a: QuestionRow, b: QuestionRow) =>
  a.contest === "olympiad" ? (a.difficulty ?? 3) - (b.difficulty ?? 3) || a.number - b.number : tierRank(a.tier) - tierRank(b.tier);

/** Which rows belong to a contest's bank (Kangaroo is wizSMART only). */
export const inContest = (contest: Contest) => (contest === "olympiad" ? eq(question.contest, "olympiad") : and(eq(question.contest, "kangaroo"), eq(question.level, "wizSMART")));

/** Picks the questions for a new session. Returns null when nothing matches. */
export function pickQuestions(db: Db, profileId: number, mode: PracticeMode, paperYear: number | null, s: SessionSettings, now = Date.now()): QuestionRow[] | null {
  const contest = s.contest ?? "kangaroo";
  if (mode === "paper") {
    if (!paperYear) return null;
    const rows = db.select().from(question).where(and(inContest(contest), eq(question.year, paperYear))).orderBy(asc(question.number)).all();
    return rows.length ? rows : null;
  }

  const all = db.select().from(question).where(inContest(contest)).all();
  // Olympiad: only the levels picked for this quiz (always inside the range the parent set).
  const levels = new Set<number>(s.levels ?? []);
  const inRange = contest === "olympiad" && levels.size ? all.filter((q) => levels.has(q.difficulty ?? 0)) : all;
  // Kangaroo learn mode only picks questions with a written solution; the Olympiad also shows the official one.
  const usable = inRange.filter((q) => s.help !== "learn" || contest === "olympiad" || hasSolution(q));
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
    return picked.length ? picked.sort(easiestFirst) : null;
  }
  if (mode === "smart") {
    const recent = recentCorrectIds(s.excludeRecentDays ?? 30);
    // One stretch question from the level above the range, when the parent turned that on.
    const top = Math.max(...(s.levels ?? [0]));
    const stretchPool = contest === "olympiad" && s.stretch && top < 5 ? shuffle(all.filter((q) => q.difficulty === top + 1 && !recent.has(q.id))) : [];
    const n = (s.count ?? 12) - (stretchPool.length ? 1 : 0);
    const picked = pickSmart(usable, countedAnswers(db, profileId, undefined, contest), reviewQueue(db, profileId, now), recent, n, now);
    const out = stretchPool[0] ? [...picked, stretchPool[0]] : picked;
    return out.length ? out.sort(easiestFirst) : null;
  }

  // Focus quiz: filter, leave out recently-mastered questions, shuffle, then easiest first.
  const focus = new Set<string>(s.focus ?? []);
  const tiers = new Set<string>(contest === "olympiad" ? [] : (s.tiers ?? []));
  const years = new Set<number>(s.years ?? []);
  const parts = new Set<string>(contest === "olympiad" ? (s.parts ?? []) : []);
  const candidates = usable.filter(
    (q) =>
      (focus.size === 0 || focus.has(q.focusPrimary) || (q.focusSecondary !== null && focus.has(q.focusSecondary))) &&
      (tiers.size === 0 || tiers.has(q.tier)) &&
      (parts.size === 0 || (q.part !== null && parts.has(q.part))) &&
      (years.size === 0 || years.has(q.year)),
  );
  if (candidates.length === 0) return null;

  const recentCorrect = recentCorrectIds(s.excludeRecentDays ?? 30);
  const fresh = shuffle(candidates.filter((q) => !recentCorrect.has(q.id)));
  const seen = shuffle(candidates.filter((q) => recentCorrect.has(q.id)));
  const count = Math.min(s.count ?? 10, candidates.length);
  return [...fresh, ...seen].slice(0, count).sort(easiestFirst);
}

export function createSession(db: Db, profileId: number, mode: PracticeMode, paperYear: number | null, settings: SessionSettings, qs: QuestionRow[], now = Date.now()): number {
  return db.transaction((tx) => {
    const row = tx
      .insert(practiceSession)
      .values({ profileId, mode, contest: settings.contest ?? "kangaroo", settings, paperYear, startedAt: now })
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
  choice: string | null;
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
      choice: r.choice ?? null,
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

/** Marks an answer: a letter for multiple choice, the typed value for Olympiad B-problems. */
export function mark(q: QuestionRow, choice: string | null): { correct: boolean; note: string | null; readable: boolean } {
  if (q.voidNote) return { correct: true, note: null, readable: true }; // voided by the organisers: everyone gets the points
  if (choice === null) return { correct: false, note: null, readable: true };
  if (q.part === "B" && q.answerSpec) {
    const c = checkAnswer(q.answerSpec, choice, q.answerUnit);
    // Name the simplest form: the official answer.
    return c.correct && c.note ? { ...c, note: `In the contest, write it as simply as you can: ${q.answer}.` } : c;
  }
  return { correct: choice === q.answer, note: null, readable: true };
}

export const isCorrect = (q: QuestionRow, choice: string | null): boolean => mark(q, choice).correct;

/** The most a question is worth: Olympiad A 2, B 5; Kangaroo 5. */
export const maxPoints = (q: QuestionRow) => (q.contest === "olympiad" ? (q.points ?? 0) : SCORING.correct);

export function points(q: QuestionRow, choice: string | null): number {
  if (q.contest === "olympiad") return isCorrect(q, choice) ? (q.points ?? 0) : 0; // wrong or blank: 0
  if (q.voidNote) return SCORING.correct;
  if (choice === null) return SCORING.blank;
  return choice === q.answer ? SCORING.correct : SCORING.wrong;
}

/** What an Olympiad question shows once it is graded: the official solution, class stats and level. */
export function revealOf(q: QuestionRow, note: string | null = null): Reveal | undefined {
  if (q.contest !== "olympiad") return undefined;
  return { note, officialUrl: q.officialPath ? imageUrl(q.officialPath) : null, stats: q.stats ?? null, level: (q.difficulty as OlyLevel | null) ?? null };
}

/** Ends a session: unanswered questions get a blank attempt, then the score is stored. */
export function finishSession(db: Db, sessionId: number, profileId: number, now = Date.now()): void {
  const s = db.select().from(practiceSession).where(eq(practiceSession.id, sessionId)).get();
  if (!s || s.endedAt) return;
  const qs = sessionQuestions(db, sessionId);
  const finals = finalAnswers(db, sessionId);
  db.transaction((tx) => {
    let score = 0;
    let max = 0;
    for (const { q } of qs) {
      max += maxPoints(q);
      const f = finals.get(q.id);
      if (!f) {
        tx.insert(attempt)
          .values({ sessionId, profileId, questionId: q.id, choice: null, correct: isCorrect(q, null), timeMs: null, answeredAt: now })
          .run();
      }
      score += points(q, f?.choice ?? null);
    }
    tx.update(practiceSession)
      .set({ endedAt: now, score, maxScore: max })
      .where(eq(practiceSession.id, sessionId))
      .run();
  });
}

export function buildResults(db: Db, sessionId: number): SessionResults | null {
  const s = db.select().from(practiceSession).where(eq(practiceSession.id, sessionId)).get();
  if (!s || !s.endedAt) return null;
  const finals = finalAnswers(db, sessionId);
  const qrows = sessionQuestions(db, sessionId);
  const rows: ResultRow[] = qrows.map(({ position, q }) => {
    const f = finals.get(q.id);
    const choice = f?.choice ?? null;
    const m = mark(q, choice);
    const rv = revealOf(q, m.note);
    return {
      position,
      id: q.id,
      label: labelOf(q),
      part: (q.part as OlyPart | null) ?? null,
      points: maxPoints(q),
      earned: points(q, choice),
      note: m.note,
      officialUrl: rv?.officialUrl ?? null,
      stats: rv?.stats ?? null,
      level: rv?.level ?? null,
      year: q.year,
      number: q.number,
      tier: q.tier as Tier,
      focusPrimary: q.focusPrimary as FocusArea,
      focusSecondary: (q.focusSecondary as FocusArea | null) ?? null,
      imageUrl: imageUrl(q.imagePath),
      choice,
      answer: q.answer,
      correct: m.correct,
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
  const contest = contestOfSession(s);
  const score = s.score ?? 0;
  let cutoff: CutoffResult | null = null;
  let pace: PaceMarks | null = null;
  if (contest === "olympiad" && s.mode === "paper" && s.paperYear !== null) {
    const f = olympiadPapers(db).facts.get(s.paperYear);
    if (f && f.cutoff !== null) {
      const shift = profileSettings(db, s.profileId)?.olympiad.targetShift ?? 0;
      cutoff = { year: s.paperYear, cutoff: f.cutoff, diff: score - f.cutoff, betterThan: betterThan(f.scores, score), target: f.cutoff + shift };
    }
  } else if (contest === "olympiad" && rows.length >= 6) {
    pace = paceMarks(
      db,
      qrows.map(({ q }) => ({ year: q.year, points: q.points ?? 0, klas1: q.stats?.klas1 ?? 0 })),
      score,
    );
  }
  return {
    id: s.id,
    contest,
    cutoff,
    pace,
    mode: s.mode,
    paperYear: s.paperYear,
    help: settings.help,
    delivery: settings.delivery ?? "app",
    startedAt: s.startedAt,
    endedAt: s.endedAt,
    score,
    maxScore: s.maxScore ?? rows.reduce((t, r) => t + r.points, 0),
    correct: rows.filter((r) => r.correct).length,
    wrong: rows.filter((r) => !r.correct && r.choice !== null).length,
    blank: rows.filter((r) => !r.correct && r.choice === null).length,
    totalTimeMs: rows.reduce((t, r) => t + r.timeMs, 0),
    rows,
    practiseNext,
  };
}

/** Best score per paper year for a profile, used on the paper picker. */
export function bestByYear(db: Db, profileId: number, contest: Contest = "kangaroo"): Map<number, { best: number; max: number; attempts: number }> {
  const rows = db
    .select({
      year: practiceSession.paperYear,
      best: sql<number>`max(${practiceSession.score})`,
      max: sql<number>`max(${practiceSession.maxScore})`,
      n: sql<number>`count(*)`,
    })
    .from(practiceSession)
    .where(and(eq(practiceSession.profileId, profileId), eq(practiceSession.mode, "paper"), eq(practiceSession.contest, contest), sql`${practiceSession.endedAt} is not null`))
    .groupBy(practiceSession.paperYear)
    .all();
  const m = new Map<number, { best: number; max: number; attempts: number }>();
  for (const r of rows) if (r.year !== null) m.set(r.year, { best: r.best, max: r.max, attempts: r.n });
  return m;
}

