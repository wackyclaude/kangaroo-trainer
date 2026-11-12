// Pure insight rules (no database). Everything here is calculated from the answer log,
// so it can be rebuilt at any time and tested with plain arrays.
import { FOCUS_AREAS, MASTERED_BOX, OLY_LEVELS, REVIEW_DAYS, TIERS, type Contest, type FocusArea, type Level, type OlyLevel, type Tier } from "../../shared/types.js";

const DAY = 86_400_000;

/** One counted answer: the final answer to a question in a session (or one typed in from paper). */
export interface Answer {
  questionId: string;
  year: number;
  number: number;
  tier: Tier;
  primary: FocusArea;
  secondary: FocusArea | null;
  correct: boolean;
  blank: boolean;
  hintUsed: boolean;
  /** null for answers done on paper. */
  timeMs: number | null;
  answeredAt: number;
  sessionId: number | null;
  /** Olympiad extras (missing for Kangaroo). */
  contest?: Contest;
  part?: "A" | "B" | null;
  points?: number | null;
  difficulty?: number | null;
  klas1?: number | null;
  /** The session was a full paper. */
  paper?: boolean;
}

export const FOCUS_KEYS = Object.keys(FOCUS_AREAS) as FocusArea[];
export const TIER_WEIGHT: Record<Tier, number> = { "warm-up": 1, core: 1.5, challenge: 2 };
export const WINDOW = 30; // last 30 answers per focus area
export const HALF_LIFE_DAYS = 30;
export const MIN_ATTEMPTS = 10;
export const READY_PACE_MS = 150_000; // 2.5 min per question
export const GUESS_MS = 20_000;
export const SLOW_MS = 180_000;

export function median(xs: number[]): number | null {
  if (xs.length === 0) return null;
  const a = [...xs].sort((x, y) => x - y);
  const m = Math.floor(a.length / 2);
  return a.length % 2 ? a[m]! : Math.round((a[m - 1]! + a[m]!) / 2);
}

export interface AreaScore {
  focus: FocusArea;
  level: Level;
  weightedAccuracy: number | null;
  attempts: number;
  coreCorrect: number;
  challengeCorrect: number;
  medianTimeMs: number | null;
  nextStep: string;
}

/**
 * Maturity for one focus area, from the last 30 answers that carry the area as main or second tag.
 * Weights: tier (warm-up 1, core 1.5, challenge 2) × recency (halves every 30 days) × tag (second tag ½).
 * A correct answer after a hint counts half.
 */
export function scoreArea(all: Answer[], focus: FocusArea, now: number): AreaScore {
  const mine = all
    .filter((a) => a.primary === focus || a.secondary === focus)
    .sort((x, y) => y.answeredAt - x.answeredAt)
    .slice(0, WINDOW);
  let wSum = 0;
  let cSum = 0;
  for (const a of mine) {
    const ageDays = Math.max(0, now - a.answeredAt) / DAY;
    const w = TIER_WEIGHT[a.tier] * Math.pow(0.5, ageDays / HALF_LIFE_DAYS) * (a.primary === focus ? 1 : 0.5);
    wSum += w;
    cSum += w * (a.correct ? (a.hintUsed ? 0.5 : 1) : 0);
  }
  const acc = mine.length && wSum > 0 ? cSum / wSum : null;
  const coreCorrect = mine.filter((a) => a.correct && a.tier === "core").length;
  const challengeCorrect = mine.filter((a) => a.correct && a.tier === "challenge").length;
  const medianTimeMs = median(mine.filter((a) => a.timeMs !== null && a.timeMs > 0).map((a) => a.timeMs!));
  const level = levelFor(mine.length, acc, coreCorrect, challengeCorrect, medianTimeMs);
  return { focus, level, weightedAccuracy: acc, attempts: mine.length, coreCorrect, challengeCorrect, medianTimeMs, nextStep: nextStep(level, mine.length, acc, coreCorrect, challengeCorrect, medianTimeMs) };
}

export function levelFor(n: number, acc: number | null, core: number, challenge: number, medianMs: number | null): Level {
  if (n < MIN_ATTEMPTS || acc === null || acc < 0.4) return "starter";
  const fastEnough = medianMs === null || medianMs <= READY_PACE_MS; // paper-only answers have no times
  if (acc >= 0.8 && challenge >= 3 && fastEnough) return "competition-ready";
  if (acc >= 0.6 && core >= 5) return "solid";
  return "developing";
}

// Rounded down, so "now 79%" never reads as if the 80% bar was reached.
const pct = (x: number) => `${Math.floor(x * 100 + 1e-9)}%`;

function nextStep(level: Level, n: number, acc: number | null, core: number, challenge: number, medianMs: number | null): string {
  if (n < MIN_ATTEMPTS) {
    const left = MIN_ATTEMPTS - n;
    return n === 0 ? "Not tried yet. Answer 10 questions to get a level." : `Answer ${left} more question${left === 1 ? "" : "s"} to get a level.`;
  }
  const a = acc ?? 0;
  switch (level) {
    case "starter":
      return `Now at ${pct(a)}. Get above 40% to reach Developing.`;
    case "developing": {
      const needs: string[] = [];
      if (a < 0.6) needs.push(`get above 60% (now ${pct(a)})`);
      if (core < 5) needs.push(`get ${5 - core} more core question${5 - core === 1 ? "" : "s"} right`);
      return `To reach Solid: ${needs.join(" and ")}.`;
    }
    case "solid": {
      const needs: string[] = [];
      if (a < 0.8) needs.push(`get above 80% (now ${pct(a)})`);
      if (challenge < 3) needs.push(`get ${3 - challenge} more challenge question${3 - challenge === 1 ? "" : "s"} right`);
      if (medianMs !== null && medianMs > READY_PACE_MS) needs.push(`answer in 2½ minutes or less (now ${Math.round(medianMs / 6000) / 10} min)`);
      return `To reach Competition-ready: ${needs.join(", ")}.`;
    }
    case "competition-ready":
      return "Contest ready here. Keep it fresh with a challenge question now and then.";
  }
}

export function scoreAreas(all: Answer[], now: number): AreaScore[] {
  return FOCUS_KEYS.map((f) => scoreArea(all, f, now));
}

export const WEAK_MIN_ANSWERS = 3;

/** The 2 weakest areas: lowest accuracy among areas with 3+ answers, topped up with the least-practised areas. */
export function weakAreas(scores: AreaScore[]): { focus: FocusArea; reason: "low" | "new" }[] {
  const tried = scores
    .filter((s) => s.attempts >= WEAK_MIN_ANSWERS && s.weightedAccuracy !== null)
    .sort((a, b) => a.weightedAccuracy! - b.weightedAccuracy! || a.attempts - b.attempts);
  const out: { focus: FocusArea; reason: "low" | "new" }[] = tried.slice(0, 2).map((s) => ({ focus: s.focus, reason: "low" }));
  if (out.length < 2) {
    const rest = scores.filter((s) => !out.some((o) => o.focus === s.focus)).sort((a, b) => a.attempts - b.attempts || FOCUS_KEYS.indexOf(a.focus) - FOCUS_KEYS.indexOf(b.focus));
    for (const s of rest.slice(0, 2 - out.length)) out.push({ focus: s.focus, reason: s.attempts >= WEAK_MIN_ANSWERS ? "low" : "new" });
  }
  return out;
}

/** The tier to stretch towards: the first tier where accuracy (last 30 there) is under 70% or that has under 5 answers. */
export function tierTarget(all: Answer[]): Tier {
  for (const t of TIERS) {
    const xs = all.filter((a) => a.tier === t).sort((x, y) => y.answeredAt - x.answeredAt).slice(0, WINDOW);
    if (xs.length < 5) return t;
    if (xs.filter((a) => a.correct).length / xs.length < 0.7) return t;
  }
  return "challenge";
}

/** Kangaroo: the easiest level (1–5) where fewer than 70% of the last 30 answers are right (or under 5 answers yet). */
export function levelTarget(all: Answer[]): OlyLevel {
  for (const l of OLY_LEVELS) {
    const xs = all.filter((a) => a.difficulty === l).sort((x, y) => y.answeredAt - x.answeredAt).slice(0, WINDOW);
    if (xs.length < 5) return l;
    if (xs.filter((a) => a.correct).length / xs.length < 0.7) return l;
  }
  return 5;
}

/** Levels 1–5 that suit practice in an area at a given skill level. */
export function levelsForSkill(level: Level): OlyLevel[] {
  switch (level) {
    case "starter":
      return [1, 2];
    case "developing":
      return [2, 3];
    case "solid":
      return [3, 4];
    case "competition-ready":
      return [4, 5];
  }
}

/** Tiers that suit practice in an area at a given level. */
export function tiersForLevel(level: Level): Tier[] {
  switch (level) {
    case "starter":
      return ["warm-up", "core"];
    case "developing":
      return ["core"];
    case "solid":
      return ["core", "challenge"];
    case "competition-ready":
      return ["challenge"];
  }
}

export interface ReviewState {
  questionId: string;
  box: number; // 1–4 = coming back after REVIEW_DAYS[box-1] days; 5 = mastered
  dueAt: number;
  streak: number; // correct answers in a row without a hint
}

/**
 * Mistake memory, replayed from the answer log in time order.
 * A wrong or skipped answer puts a question in box 1 (back in 1 day). A correct answer steps it up
 * (3, 7, then 21 days). It is mastered after 2 correct answers in a row without a hint.
 */
export function replayReviews(all: Answer[]): Map<string, ReviewState> {
  const m = new Map<string, ReviewState>();
  for (const a of [...all].sort((x, y) => x.answeredAt - y.answeredAt)) {
    const cur = m.get(a.questionId);
    if (!a.correct) {
      m.set(a.questionId, { questionId: a.questionId, box: 1, dueAt: a.answeredAt + REVIEW_DAYS[0] * DAY, streak: 0 });
      continue;
    }
    if (!cur || cur.box >= MASTERED_BOX) continue; // never missed, or already mastered
    const streak = a.hintUsed ? 0 : cur.streak + 1;
    if (streak >= 2) {
      m.set(a.questionId, { questionId: a.questionId, box: MASTERED_BOX, dueAt: Number.MAX_SAFE_INTEGER, streak });
    } else {
      const box = Math.min(cur.box + 1, REVIEW_DAYS.length);
      m.set(a.questionId, { questionId: a.questionId, box, dueAt: a.answeredAt + REVIEW_DAYS[box - 1]! * DAY, streak });
    }
  }
  return m;
}

export function speedStats(all: Answer[]) {
  const timed = all.filter((a) => a.timeMs !== null && a.timeMs > 0);
  const byTier = TIERS.map((tier) => {
    const xs = timed.filter((a) => a.tier === tier).map((a) => a.timeMs!);
    return { tier, medianMs: median(xs), answers: xs.length };
  });
  const byArea = FOCUS_KEYS.map((focus) => {
    const xs = timed.filter((a) => a.primary === focus).map((a) => a.timeMs!);
    return { focus, medianMs: median(xs), answers: xs.length };
  });
  const flag = (a: Answer) => ({ questionId: a.questionId, year: a.year, number: a.number, tier: a.tier, focus: a.primary, timeMs: a.timeMs!, at: a.answeredAt });
  const recent = [...timed].sort((x, y) => y.answeredAt - x.answeredAt);
  const guesses = recent.filter((a) => !a.correct && !a.blank && a.tier !== "warm-up" && a.timeMs! < GUESS_MS).slice(0, 10).map(flag);
  const slow = recent.filter((a) => a.correct && a.timeMs! > SLOW_MS).slice(0, 10).map(flag);
  return { byTier, byArea, guesses, slow };
}

/** Projected score out of max (120 wizSMART, 150 wizBRAIN) from the last 3 finished full papers, scaled so older paper sizes fit. */
export function contestEstimate(papers: { score: number; maxScore: number; endedAt: number }[], max = 120) {
  const last = [...papers].sort((a, b) => b.endedAt - a.endedAt).slice(0, 3).map((p) => (p.score / p.maxScore) * max);
  if (last.length === 0) return null;
  const mean = last.reduce((t, x) => t + x, 0) / last.length;
  // With one paper we only know it roughly: ±10 points. With more, use the spread of the papers (at least ±5).
  const unit = max / 120;
  const spread = last.length === 1 ? 10 * unit : Math.max(5 * unit, (Math.max(...last) - Math.min(...last)) / 2);
  const clip = (x: number) => Math.max(0, Math.min(max, Math.round(x)));
  return { score: clip(mean), low: clip(mean - spread), high: clip(mean + spread), papers: last.length };
}
