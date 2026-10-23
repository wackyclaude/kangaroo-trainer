// Contest countdown and readiness. Pure functions, so they are easy to test.
import { FOCUS_AREAS, type FocusArea, type Readiness } from "../../shared/types.js";
import { addDays } from "../rewards/model.js";

export const WEIGHTS = { skill: 40, score: 40, practice: 20 } as const;
export const READY_ACCURACY = 0.8; // Competition-ready
export const MIN_AREA_ANSWERS = 10;
export const PAPERS_FOR_FULL = 8;
export const QUESTIONS_FOR_FULL = 300;

/** The contest runs at school from the 3rd Thursday of March up to and including 31 March. */
export function contestWindow(year: number): { start: string; end: string } {
  const first = new Date(Date.UTC(year, 2, 1));
  const toThursday = (4 - first.getUTCDay() + 7) % 7; // 4 = Thursday
  const day = 1 + toThursday + 14;
  return { start: `${year}-03-${String(day).padStart(2, "0")}`, end: `${year}-03-31` };
}

const daysBetween = (from: string, to: string) => Math.round((Date.parse(`${to}T12:00:00Z`) - Date.parse(`${from}T12:00:00Z`)) / 86_400_000);

/** Which contest to count down to, given today (home time zone) and the school's day if the parent set one. */
export function contestFor(today: string, chosen: string | null): Readiness["contest"] {
  let year = Number(today.slice(0, 4));
  if (today > `${year}-03-31`) year++;
  const w = contestWindow(year);
  // A chosen day only counts when it falls inside this year's window.
  const useChosen = chosen !== null && chosen >= w.start && chosen <= w.end;
  const date = useChosen ? chosen! : w.start;
  const daysLeft = Math.max(0, daysBetween(today, date));
  const phase = today < date ? "countdown" : today === date ? "today" : useChosen ? "done" : "open";
  return { date, chosen: useChosen, windowStart: w.start, windowEnd: w.end, daysLeft, phase };
}

export interface ReadinessInput {
  areas: { focus: FocusArea; weightedAccuracy: number | null; attempts: number }[];
  estimate: number | null;
  papers: number;
  distinctQuestions: number;
  target: number;
}

const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
const pct = (x: number) => Math.round(clamp01(x) * 100);

export function readiness(input: ReadinessInput): Pick<Readiness, "percent" | "parts" | "tip"> {
  const areaScores = (Object.keys(FOCUS_AREAS) as FocusArea[]).map((f) => {
    const a = input.areas.find((x) => x.focus === f);
    if (!a || a.weightedAccuracy === null) return 0;
    return clamp01(a.weightedAccuracy / READY_ACCURACY) * clamp01(a.attempts / MIN_AREA_ANSWERS);
  });
  const skill = areaScores.reduce((s, x) => s + x, 0) / areaScores.length;
  const score = input.estimate === null ? 0 : clamp01(input.estimate / input.target);
  const practice = 0.5 * clamp01(input.papers / PAPERS_FOR_FULL) + 0.5 * clamp01(input.distinctQuestions / QUESTIONS_FOR_FULL);
  const total = (WEIGHTS.skill * skill + WEIGHTS.score * score + WEIGHTS.practice * practice) / 100;

  const ready = areaScores.filter((x) => x >= 1).length;
  const parts = {
    skill: {
      percent: pct(skill),
      weight: WEIGHTS.skill,
      label: "Skill",
      detail: `How close each focus area is to 80% right. ${ready} of 6 area${ready === 1 ? " is" : "s are"} there.`,
    },
    score: {
      percent: pct(score),
      weight: WEIGHTS.score,
      label: "Score",
      detail: input.estimate === null ? `Do a full past paper to get a contest score estimate (target ${input.target}).` : `Estimated ${input.estimate} out of 120, target ${input.target}.`,
    },
    practice: {
      percent: pct(practice),
      weight: WEIGHTS.practice,
      label: "Practice",
      detail: `${Math.min(input.papers, PAPERS_FOR_FULL)} of ${PAPERS_FOR_FULL} full papers, ${Math.min(input.distinctQuestions, QUESTIONS_FOR_FULL)} of ${QUESTIONS_FOR_FULL} different questions.`,
    },
  };

  // The part with the most points still to gain.
  // On a tie the score comes first: a full paper also fills in the skill and practice parts.
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
        ? input.estimate === null
          ? "Biggest step: do a full past paper, so the score part can count."
          : "Biggest step: full past papers, to push the score estimate up."
        : top.k === "skill"
          ? "Biggest step: Smart mix, to work on the weakest focus areas."
          : "Biggest step: practise more questions, and try a full paper.";
  return { percent: Math.round(total * 100), parts, tip };
}
