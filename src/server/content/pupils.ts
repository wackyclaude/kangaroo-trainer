// Difficulty for Kangaroo questions, from how real wizSMART pupils answered them (see pupil-shares.ts).
import { CHOICES, kangarooLevel, type Choice, type OlyLevel, type PupilStats } from "../../shared/types.js";
import { PUPIL_SHARES } from "./pupil-shares.js";

/** Bump when PUPIL_SHARES or the level bands change, so the next start re-imports the bank. */
export const PUPIL_STATS_VERSION = "1";

/** A wrong answer counts as a trap when at least this share of pupils picked it. */
export const TRAP_MIN = 15;

/** Questions where the report counted a different answer from the app (2014 Q16: the official key says D, the drawing gives C). */
const KEY_DIFFERS = new Set(["2014-16"]);

export function pupilStats(year: number, number: number, answer: string): PupilStats | null {
  if (KEY_DIFFERS.has(`${year}-${number}`)) return null;
  const row = PUPIL_SHARES[year]?.[number - 1];
  const i = CHOICES.indexOf(answer as Choice);
  if (!row || i < 0) return null;
  let trap: { choice: Choice; pct: number } | null = null;
  CHOICES.forEach((c, j) => {
    if (j !== i && (trap === null || row[j]! > trap.pct)) trap = { choice: c, pct: row[j]! };
  });
  const t = trap as { choice: Choice; pct: number } | null;
  return {
    year,
    right: Math.round(row[i]!),
    blank: Math.round(row[5]),
    trap: t && Math.round(t.pct) >= TRAP_MIN ? { choice: t.choice, pct: Math.round(t.pct) } : null,
  };
}

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
};

/**
 * For papers without numbers: the middle share right at each position (1–24) over the 24-question
 * papers that have them. Later questions in a Kangaroo paper are harder, so the position is a fair guess.
 */
export function positionMedians(qs: { year: number; number: number; questionsInPaper: number; answer: string }[]): number[] {
  const at: number[][] = Array.from({ length: 24 }, () => []);
  for (const q of qs) {
    if (q.questionsInPaper !== 24) continue;
    const s = pupilStats(q.year, q.number, q.answer);
    if (s) at[q.number - 1]?.push(s.right);
  }
  // Without any numbers, fall back to a plain slope from 80% down to 15%.
  return at.map((xs, i) => (xs.length ? Math.round(median(xs)) : Math.round(80 - (65 * i) / 23)));
}

/** Level 1–5 for a Kangaroo question, and whether it is estimated from its position in the paper. */
export function kangarooDifficulty(q: { year: number; number: number; questionsInPaper: number; answer: string }, medians: number[]): { level: OlyLevel; estimated: boolean } {
  const s = pupilStats(q.year, q.number, q.answer);
  if (s) return { level: kangarooLevel(s.right), estimated: false };
  // Scale the position to a 24-question paper.
  const pos = Math.min(24, Math.max(1, Math.round((q.number / Math.max(1, q.questionsInPaper)) * 24)));
  return { level: kangarooLevel(medians[pos - 1] ?? 35), estimated: true };
}
