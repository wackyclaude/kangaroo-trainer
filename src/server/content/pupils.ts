// Difficulty for Kangaroo questions, from how real pupils at that level answered them (pupil-shares.ts, brain-shares.ts).
import { CHOICES, kangarooLevel, type Choice, type OlyLevel, type PupilStats } from "../../shared/types.js";
import { PUPIL_SHARES, type ShareRow } from "./pupil-shares.js";
import { BRAIN_SHARES } from "./brain-shares.js";

/** Bump when PUPIL_SHARES or the level bands change, so the next start re-imports the bank. */
export const PUPIL_STATS_VERSION = "2";

/** A wrong answer counts as a trap when at least this share of pupils picked it. */
export const TRAP_MIN = 15;

/**
 * Questions where the report counted a different answer from the app. wizSMART 2014 Q16: the official key says D,
 * the drawing gives C. wizBRAIN 2011 Q30 and 2012 Q27: no printed answer was right, so there is no "right" share.
 */
const KEY_DIFFERS: Record<string, Set<string>> = { wizSMART: new Set(["2014-16"]), wizBRAIN: new Set(["2011-30", "2012-27"]) };
const SHARES: Record<string, Record<number, ShareRow[]>> = { wizSMART: PUPIL_SHARES, wizBRAIN: BRAIN_SHARES };

export function pupilStats(level: string, year: number, number: number, answer: string): PupilStats | null {
  if (KEY_DIFFERS[level]?.has(`${year}-${number}`)) return null;
  const row = SHARES[level]?.[year]?.[number - 1];
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

type PaperQ = { level: string; year: number; number: number; questionsInPaper: number; answer: string };

/** The usual paper size for a level: wizSMART 24, wizBRAIN 30. */
const SIZE: Record<string, number> = { wizSMART: 24, wizBRAIN: 30 };
const sizeOf = (level: string) => SIZE[level] ?? 24;

/**
 * For papers without numbers: the middle share right at each position over the papers of the usual size
 * that have them. Later questions in a Kangaroo paper are harder, so the position is a fair guess.
 * Pass the questions of one level.
 */
export function positionMedians(qs: PaperQ[], level = qs[0]?.level ?? "wizSMART"): number[] {
  const size = sizeOf(level);
  const at: number[][] = Array.from({ length: size }, () => []);
  for (const q of qs) {
    if (q.level !== level || q.questionsInPaper !== size) continue;
    const s = pupilStats(q.level, q.year, q.number, q.answer);
    if (s) at[q.number - 1]?.push(s.right);
  }
  // Without any numbers, fall back to a plain slope from 80% down to 15%.
  return at.map((xs, i) => (xs.length ? Math.round(median(xs)) : Math.round(80 - (65 * i) / (size - 1))));
}

/** Level 1–5 for a Kangaroo question, and whether it is estimated from its position in the paper. */
export function kangarooDifficulty(q: PaperQ, medians: number[]): { level: OlyLevel; estimated: boolean } {
  const s = pupilStats(q.level, q.year, q.number, q.answer);
  if (s) return { level: kangarooLevel(s.right), estimated: false };
  // Scale the position to the usual paper size for the level.
  const size = medians.length;
  const pos = Math.min(size, Math.max(1, Math.round((q.number / Math.max(1, q.questionsInPaper)) * size)));
  return { level: kangarooLevel(medians[pos - 1] ?? 35), estimated: true };
}
