// Olympiad round 1: countdown and readiness. Pure functions, like the Kangaroo ones.
import { FOCUS_AREAS, type FocusArea, type Readiness } from "../../shared/types.js";
import { WEIGHTS } from "./model.js";

/** Known round dates; later years fall back to the usual pattern (third Monday of January, two school weeks). */
const KNOWN: Record<number, { start: string; end: string; round2: string | null }> = {
  2027: { start: "2027-01-18", end: "2027-01-29", round2: "2027-03-19" },
};

export function olympiadWindow(year: number): { start: string; end: string; round2: string | null } {
  const k = KNOWN[year];
  if (k) return k;
  const first = new Date(Date.UTC(year, 0, 1));
  const toMonday = (1 - first.getUTCDay() + 7) % 7;
  const day = 1 + toMonday + 14;
  const pad = (n: number) => String(n).padStart(2, "0");
  return { start: `${year}-01-${pad(day)}`, end: `${year}-01-${pad(day + 11)}`, round2: null };
}

const daysBetween = (from: string, to: string) => Math.round((Date.parse(`${to}T12:00:00Z`) - Date.parse(`${from}T12:00:00Z`)) / 86_400_000);

export function olympiadContestFor(today: string, chosen: string | null): Readiness["contest"] {
  let year = Number(today.slice(0, 4));
  if (today > olympiadWindow(year).end) year++;
  const w = olympiadWindow(year);
  const useChosen = chosen !== null && chosen >= w.start && chosen <= w.end;
  const date = useChosen ? chosen! : w.start;
  const daysLeft = Math.max(0, daysBetween(today, date));
  const phase = today < date ? "countdown" : today === date ? "today" : useChosen ? "done" : "open";
  return { date, chosen: useChosen, windowStart: w.start, windowEnd: w.end, daysLeft, phase, nextRound: w.round2 };
}

export const OLY_READY_ACCURACY = 0.75; // "most" level 1–3 questions
export const OLY_AREA_ANSWERS = 8;
export const OLY_PAPERS_FOR_FULL = 6;
export const OLY_QUESTIONS_FOR_FULL = 120;
export const OLY_RECENT_PAPERS = 3;

export interface OlympiadReadinessInput {
  /** Per area: answers to level 1–3 questions (short quizzes and papers alike). */
  areas: { focus: FocusArea; right: number; answers: number; available: number }[];
  /** Recent full papers, oldest first. */
  papers: { score: number; cutoff: number }[];
  distinctQuestions: number;
  shift: number;
}

const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
const pct = (x: number) => Math.round(clamp01(x) * 100);

export function olympiadReadiness(input: OlympiadReadinessInput): Pick<Readiness, "percent" | "parts" | "tip"> {
  const areaScores = (Object.keys(FOCUS_AREAS) as FocusArea[]).map((f) => {
    const a = input.areas.find((x) => x.focus === f);
    if (!a || a.answers === 0) return 0;
    const need = Math.max(1, Math.min(OLY_AREA_ANSWERS, a.available));
    return clamp01(a.right / a.answers / OLY_READY_ACCURACY) * clamp01(a.answers / need);
  });
  const skill = areaScores.reduce((s, x) => s + x, 0) / areaScores.length;
  const recent = input.papers.slice(-OLY_RECENT_PAPERS);
  const score = recent.length ? recent.reduce((t, p) => t + clamp01(p.score / Math.max(1, p.cutoff + input.shift)), 0) / recent.length : 0;
  const practice = 0.5 * clamp01(input.papers.length / OLY_PAPERS_FOR_FULL) + 0.5 * clamp01(input.distinctQuestions / OLY_QUESTIONS_FOR_FULL);
  const total = (WEIGHTS.skill * skill + WEIGHTS.score * score + WEIGHTS.practice * practice) / 100;

  const ready = areaScores.filter((x) => x >= 1).length;
  const avgDiff = recent.length ? Math.round(recent.reduce((t, p) => t + p.score - (p.cutoff + input.shift), 0) / recent.length) : 0;
  const targetWord = input.shift === 0 ? "the cutoff" : input.shift > 0 ? `${input.shift} above the cutoff` : `${-input.shift} below the cutoff`;
  const parts = {
    skill: {
      percent: pct(skill),
      weight: WEIGHTS.skill,
      label: "Skill",
      detail: `How close each focus area is to solving most level 1–3 questions. ${ready} of 6 area${ready === 1 ? " is" : "s are"} there.`,
    },
    score: {
      percent: pct(score),
      weight: WEIGHTS.score,
      label: "Score",
      detail: recent.length
        ? `Last ${recent.length === 1 ? "paper" : `${recent.length} papers`}: on average ${avgDiff === 0 ? "right on" : avgDiff > 0 ? `${avgDiff} above` : `${-avgDiff} below`} target (${targetWord}).`
        : `Do a full Olympiad paper to compare with its cutoff (target: ${targetWord}).`,
    },
    practice: {
      percent: pct(practice),
      weight: WEIGHTS.practice,
      label: "Practice",
      detail: `${Math.min(input.papers.length, OLY_PAPERS_FOR_FULL)} of ${OLY_PAPERS_FOR_FULL} full papers, ${Math.min(input.distinctQuestions, OLY_QUESTIONS_FOR_FULL)} of ${OLY_QUESTIONS_FOR_FULL} different questions.`,
    },
  };
  const gains = [
    { k: "score", gain: WEIGHTS.score * (1 - score) },
    { k: "skill", gain: WEIGHTS.skill * (1 - skill) },
    { k: "practice", gain: WEIGHTS.practice * (1 - practice) },
  ].sort((a, b) => b.gain - a.gain);
  const top = gains[0]!;
  const tip =
    top.gain < 1
      ? "Ready! Keep it fresh with a paper now and then."
      : top.k === "score"
        ? recent.length === 0
          ? "Biggest step: do a full Olympiad paper (120 minutes), so the score part can count."
          : "Biggest step: full papers, to get closer to each year's cutoff."
        : top.k === "skill"
          ? "Biggest step: Smart mix, to work on the weakest focus areas."
          : "Biggest step: practise more questions, and try a full paper.";
  return { percent: Math.round(total * 100), parts, tip };
}
