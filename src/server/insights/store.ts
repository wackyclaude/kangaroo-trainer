// Reads the answer log from the database and turns it into insights.
import { and, asc, eq, isNotNull, lte, sql } from "drizzle-orm";
import type { Db } from "../db/client.js";
import { attempt, masterySnapshot, practiceSession, profile, question, reviewItem } from "../db/schema.js";
import { COMPARE_GROUP_NAMES, DEFAULT_COMPARE_GROUP, groupYear, isCompareGroup, type CompareGroup } from "../../shared/benchmarks.js";
import {
  MASTERED_BOX,
  OLY_LEVELS,
  type BenchmarkProfile,
  type Benchmarks,
  type Contest,
  type FocusArea,
  type Insights,
  type VsAverage,
  type Level,
  type OlyLevel,
  type OlympiadInsights,
  type SessionSettings,
  type Tier,
  type TrendPoint,
} from "../../shared/types.js";
import { olympiadPapers, paceMarks } from "../content/olympiad.js";
import { profileSettings } from "../practice/contest.js";
import { contestEstimate, FOCUS_KEYS, median, replayReviews, scoreAreas, speedStats, levelTarget, tierTarget, weakAreas, type Answer } from "./model.js";

/**
 * The answer log for one profile, one entry per question per session (the final answer there).
 * Answers in a test-mode session only count once it has finished; voided questions never count.
 */
export function countedAnswers(db: Db, profileId: number, upTo = Number.MAX_SAFE_INTEGER, contest?: Contest): Answer[] {
  const rows = db
    .select({ a: attempt, q: question, s: practiceSession })
    .from(attempt)
    .innerJoin(question, eq(question.id, attempt.questionId))
    .leftJoin(practiceSession, eq(practiceSession.id, attempt.sessionId))
    .where(and(eq(attempt.profileId, profileId), lte(attempt.answeredAt, upTo), contest ? eq(question.contest, contest) : undefined))
    .orderBy(asc(attempt.id))
    .all();
  const finals = new Map<string, Answer>();
  for (const { a, q, s } of rows) {
    if (q.voidNote) continue;
    if (s && s.endedAt === null && (s.settings as SessionSettings).help === "test") continue;
    if (s && s.endedAt !== null && s.endedAt > upTo) continue;
    const key = `${a.sessionId ?? `x${a.id}`}:${a.questionId}`;
    const prev = finals.get(key);
    finals.set(key, {
      questionId: q.id,
      year: q.year,
      number: q.number,
      tier: q.tier as Tier,
      primary: q.focusPrimary as FocusArea,
      secondary: (q.focusSecondary as FocusArea | null) ?? null,
      correct: a.correct,
      blank: a.choice === null,
      hintUsed: (prev?.hintUsed ?? false) || a.hintUsed,
      timeMs: a.timeMs === null && !prev?.timeMs ? null : (prev?.timeMs ?? 0) + (a.timeMs ?? 0),
      answeredAt: a.answeredAt,
      sessionId: a.sessionId,
      contest: q.contest,
      part: q.part,
      points: q.points,
      difficulty: q.difficulty,
      klas1: q.stats?.klas1 ?? null,
      paper: s?.mode === "paper",
    });
  }
  return [...finals.values()].sort((x, y) => x.answeredAt - y.answeredAt);
}

/** Rewrites the profile's mistake memory from its answer log. */
export function rebuildReviews(db: Db, profileId: number, answers = countedAnswers(db, profileId)): void {
  const states = replayReviews(answers);
  db.transaction((tx) => {
    tx.delete(reviewItem).where(eq(reviewItem.profileId, profileId)).run();
    for (const r of states.values()) tx.insert(reviewItem).values({ profileId, questionId: r.questionId, box: r.box, dueAt: r.dueAt, streak: r.streak }).run();
  });
}

/** Stores a maturity snapshot per focus area (for the trend lines), per contest. */
export function snapshotMastery(db: Db, profileId: number, at: number, answers = countedAnswers(db, profileId, at, "kangaroo"), contest: Contest = "kangaroo"): void {
  const scores = scoreAreas(answers.filter((a) => (a.contest ?? "kangaroo") === contest), at);
  db.transaction((tx) => {
    for (const s of scores) {
      if (s.attempts === 0) continue;
      tx.insert(masterySnapshot)
        .values({ profileId, contest, focusArea: s.focus, level: s.level, weightedAccuracy: s.weightedAccuracy ?? 0, attempts: s.attempts, computedAt: at })
        .run();
    }
  });
}

/** Called whenever a session ends (in the app, by timeout, or by typing in paper answers). */
export function afterSessionEnded(db: Db, profileId: number, at = Date.now(), contest: Contest = "kangaroo"): void {
  const answers = countedAnswers(db, profileId);
  rebuildReviews(db, profileId, answers);
  snapshotMastery(db, profileId, at, answers.filter((a) => a.answeredAt <= at), contest);
}

/** At start-up: fill in mistake memory and trend history for practice done before M4. */
export function backfillInsights(db: Db): number {
  let filled = 0;
  const students = db.select({ id: profile.id }).from(profile).where(eq(profile.role, "student")).all();
  for (const { id } of students) {
    const hasSnapshots = db.select({ n: sql<number>`count(*)` }).from(masterySnapshot).where(eq(masterySnapshot.profileId, id)).get()?.n ?? 0;
    const ends = db
      .select({ endedAt: practiceSession.endedAt })
      .from(practiceSession)
      .where(and(eq(practiceSession.profileId, id), isNotNull(practiceSession.endedAt)))
      .orderBy(asc(practiceSession.endedAt))
      .all();
    rebuildReviews(db, id);
    if (hasSnapshots === 0 && ends.length > 0) {
      for (const e of ends) snapshotMastery(db, id, e.endedAt!, countedAnswers(db, id, e.endedAt!, "kangaroo"));
      filled++;
    }
  }
  return filled;
}

export function finishedPapers(db: Db, profileId: number, contest: Contest = "kangaroo") {
  return db
    .select({ id: practiceSession.id, year: practiceSession.paperYear, score: practiceSession.score, maxScore: practiceSession.maxScore, endedAt: practiceSession.endedAt })
    .from(practiceSession)
    .where(and(eq(practiceSession.profileId, profileId), eq(practiceSession.mode, "paper"), eq(practiceSession.contest, contest), isNotNull(practiceSession.endedAt)))
    .all()
    .filter((p) => p.score !== null && p.maxScore)
    .map((p) => ({ id: p.id, year: p.year, score: p.score!, maxScore: p.maxScore!, endedAt: p.endedAt! }));
}

export const PACE_WINDOW = 60;
export const WIDEN_WINDOW = 20;
export const WIDEN_SHARE = 0.7;

/** Olympiad extras: running cutoff pace, paper scores against their cutoffs, and whether to widen the range. */
export function olympiadInsights(db: Db, profileId: number, answers: Answer[]): OlympiadInsights {
  const recent = answers.slice(-PACE_WINDOW);
  const earned = recent.reduce((t, a) => t + (a.correct ? (a.points ?? 0) : 0), 0);
  const pace = recent.length >= 6 ? { ...paceMarks(db, recent.map((a) => ({ year: a.year, points: a.points ?? 0, klas1: a.klas1 ?? 0 })), earned), rough: recent.length < 12 } : null;
  const { facts } = olympiadPapers(db);
  const papers = finishedPapers(db, profileId, "olympiad")
    .filter((p) => p.year !== null && facts.get(p.year)?.cutoff != null)
    .sort((a, b) => a.endedAt - b.endedAt)
    .map((p) => ({ sessionId: p.id, year: p.year!, score: p.score, cutoff: facts.get(p.year!)!.cutoff!, at: p.endedAt }));
  const levels = OLY_LEVELS.map((level) => {
    const at = answers.filter((a) => a.difficulty === level).slice(-WIDEN_WINDOW);
    return { level, answers: at.length, right: at.filter((a) => a.correct).length };
  });
  const range = profileSettings(db, profileId)?.olympiad;
  let suggestWiden: OlympiadInsights["suggestWiden"] = null;
  if (range && range.maxLevel < 5) {
    const top = levels.find((l) => l.level === range.maxLevel)!;
    if (top.answers >= WIDEN_WINDOW && top.right / top.answers >= WIDEN_SHARE) suggestWiden = { to: (range.maxLevel + 1) as OlyLevel, right: top.right, of: top.answers };
  }
  return { pace, papers, levels, suggestWiden };
}

export function buildInsights(db: Db, profileId: number, now = Date.now(), contest: Contest = "kangaroo"): Insights | null {
  const who = db.select().from(profile).where(eq(profile.id, profileId)).get();
  if (!who) return null;
  const answers = countedAnswers(db, profileId, undefined, contest);
  const scores = scoreAreas(answers, now);

  const snaps = db
    .select()
    .from(masterySnapshot)
    .where(and(eq(masterySnapshot.profileId, profileId), eq(masterySnapshot.contest, contest)))
    .orderBy(asc(masterySnapshot.computedAt))
    .all();
  const trend = new Map<FocusArea, TrendPoint[]>();
  for (const s of snaps) {
    const list = trend.get(s.focusArea as FocusArea) ?? [];
    list.push({ at: s.computedAt, accuracy: s.weightedAccuracy, level: s.level as Level });
    trend.set(s.focusArea as FocusArea, list);
  }

  const reviews = db
    .select({ r: reviewItem })
    .from(reviewItem)
    .innerJoin(question, eq(question.id, reviewItem.questionId))
    .where(and(eq(reviewItem.profileId, profileId), eq(question.contest, contest)))
    .all()
    .map((x) => x.r);
  const open = reviews.filter((r) => r.box < MASTERED_BOX);
  const waiting = open.filter((r) => r.dueAt > now);
  const papers = finishedPapers(db, profileId, contest);
  const sessions =
    db
      .select({ n: sql<number>`count(*)` })
      .from(practiceSession)
      .where(and(eq(practiceSession.profileId, profileId), eq(practiceSession.contest, contest), isNotNull(practiceSession.endedAt)))
      .get()?.n ?? 0;

  return {
    profileId,
    nickname: who.nickname,
    avatar: who.avatar,
    areas: scores.map((s) => ({ ...s, trend: (trend.get(s.focus) ?? []).slice(-20) })),
    weakAreas: weakAreas(scores),
    mistakes: {
      due: open.length - waiting.length,
      waiting: waiting.length,
      mastered: reviews.length - open.length,
      nextDueAt: waiting.length ? Math.min(...waiting.map((r) => r.dueAt)) : null,
    },
    speed: speedStats(answers),
    estimate: contest === "kangaroo" ? contestEstimate(papers) : null,
    totals: { answers: answers.length, sessions, papers: papers.length },
    tierTarget: tierTarget(answers),
    levelTarget: levelTarget(answers),
    byLevel: OLY_LEVELS.map((level) => {
      const at = answers.filter((a) => a.difficulty === level).slice(-WIDEN_WINDOW);
      return { level, answers: at.length, right: at.filter((a) => a.correct).length };
    }),
    contest,
    ...(contest === "olympiad" ? { olympiad: olympiadInsights(db, profileId, answers) } : { vsAverage: vsAverage(db, profileId, compareGroupOf(who)) }),
  };
}

export const compareGroupOf = (p: { compareGroup: string | null }): CompareGroup => (isCompareGroup(p.compareGroup) ? p.compareGroup : DEFAULT_COMPARE_GROUP);

/** Full Kangaroo papers (out of 120) next to that year's real average for the chosen group. */
export function vsAverage(db: Db, profileId: number, group: CompareGroup): VsAverage {
  const papers = finishedPapers(db, profileId, "kangaroo")
    .filter((p) => p.maxScore === 120 && groupYear(p.year, group) !== null)
    .sort((a, b) => a.endedAt - b.endedAt)
    .map((p) => {
      const g = groupYear(p.year, group)!;
      return { sessionId: p.id, year: p.year!, score: p.score, average: g.average, entrants: g.entrants, diff: Math.round((p.score - g.average) * 10) / 10, at: p.endedAt };
    });
  const last = papers.slice(-3);
  const mean = (xs: number[]) => Math.round((xs.reduce((s, x) => s + x, 0) / xs.length) * 10) / 10;
  return {
    group,
    groupName: COMPARE_GROUP_NAMES[group],
    papers,
    recent: last.length ? { papers: last.length, diff: mean(last.map((p) => p.diff)), score: mean(last.map((p) => p.score)), average: mean(last.map((p) => p.average)) } : null,
  };
}

export const AGE_BAND = "12-year-olds";

/** Compares all students (parent only). Group averages only with 3 or more profiles that have data. */
export function buildBenchmarks(db: Db, now = Date.now()): Benchmarks {
  const students = db.select().from(profile).where(eq(profile.role, "student")).orderBy(asc(profile.id)).all();
  const profiles: BenchmarkProfile[] = [];
  const paperScores = new Map<number, { profileId: number; best: number; max: number }[]>();
  for (const p of students) {
    const answers = countedAnswers(db, p.id, undefined, "kangaroo");
    const scores = scoreAreas(answers, now);
    const papers = finishedPapers(db, p.id);
    const est = contestEstimate(papers);
    const areas: BenchmarkProfile["areas"] = {};
    for (const s of scores) areas[s.focus] = { accuracy: s.weightedAccuracy, level: s.level };
    profiles.push({
      id: p.id,
      nickname: p.nickname,
      avatar: p.avatar,
      answers: answers.length,
      areas,
      medianTimeMs: median(answers.filter((a) => a.timeMs !== null && a.timeMs > 0).map((a) => a.timeMs!)),
      estimate: est?.score ?? null,
    });
    const best = new Map<number, { best: number; max: number }>();
    for (const x of papers) {
      if (x.year === null) continue;
      const b = best.get(x.year);
      if (!b || x.score > b.best) best.set(x.year, { best: x.score, max: x.maxScore });
    }
    for (const [year, b] of best) paperScores.set(year, [...(paperScores.get(year) ?? []), { profileId: p.id, ...b }]);
  }

  const active = profiles.filter((p) => p.answers > 0);
  let group: Benchmarks["group"] = null;
  if (active.length >= 3) {
    const avg = (xs: (number | null)[]) => {
      const v = xs.filter((x): x is number => x !== null);
      return v.length ? v.reduce((t, x) => t + x, 0) / v.length : null;
    };
    const areas: Partial<Record<FocusArea, number>> = {};
    for (const f of FOCUS_KEYS) {
      const a = avg(active.map((p) => p.areas[f]?.accuracy ?? null));
      if (a !== null) areas[f] = a;
    }
    const est = avg(active.map((p) => p.estimate));
    const med = avg(active.map((p) => p.medianTimeMs));
    group = { areas, medianTimeMs: med === null ? null : Math.round(med), estimate: est === null ? null : Math.round(est), profiles: active.length };
  }

  return {
    ageBand: AGE_BAND,
    profiles,
    papers: [...paperScores.entries()].sort((a, b) => b[0] - a[0]).map(([year, scores]) => ({ year, scores })),
    group,
  };
}

/** Due mistakes first (oldest due first), then the ones coming up soonest. */
export function reviewQueue(db: Db, profileId: number, now = Date.now()): { questionId: string; due: boolean }[] {
  return db
    .select()
    .from(reviewItem)
    .where(and(eq(reviewItem.profileId, profileId), sql`${reviewItem.box} < ${MASTERED_BOX}`))
    .orderBy(asc(reviewItem.dueAt))
    .all()
    .map((r) => ({ questionId: r.questionId, due: r.dueAt <= now }));
}
