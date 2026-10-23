import { describe, expect, it } from "vitest";
import { contestEstimate, levelFor, replayReviews, scoreArea, tierTarget, weakAreas, type Answer } from "../src/server/insights/model.js";
import type { FocusArea, Tier } from "../src/shared/types.js";

const DAY = 86_400_000;
const NOW = Date.UTC(2026, 9, 18);
let n = 0;
function ans(p: Partial<Answer> & { primary: FocusArea }): Answer {
  n++;
  return {
    questionId: p.questionId ?? `q${n}`,
    year: 2020,
    number: n,
    tier: (p.tier ?? "core") as Tier,
    primary: p.primary,
    secondary: p.secondary ?? null,
    correct: p.correct ?? true,
    blank: p.blank ?? false,
    hintUsed: p.hintUsed ?? false,
    timeMs: p.timeMs === undefined ? 60_000 : p.timeMs,
    answeredAt: p.answeredAt ?? NOW - n * 1000,
    sessionId: 1,
  };
}
const many = (k: number, p: Partial<Answer> & { primary: FocusArea }) => Array.from({ length: k }, () => ans(p));

describe("maturity levels", () => {
  it("needs 10 answers before giving a level", () => {
    const s = scoreArea(many(9, { primary: "NUM" }), "NUM", NOW);
    expect(s.level).toBe("starter");
    expect(s.nextStep).toMatch(/1 more question/);
  });

  it("follows the PRD thresholds", () => {
    expect(levelFor(12, 0.39, 9, 9, 60_000)).toBe("starter");
    expect(levelFor(12, 0.5, 9, 9, 60_000)).toBe("developing");
    expect(levelFor(12, 0.7, 4, 9, 60_000)).toBe("developing"); // needs 5 core right for Solid
    expect(levelFor(12, 0.7, 5, 0, 60_000)).toBe("solid");
    expect(levelFor(12, 0.85, 5, 2, 60_000)).toBe("solid"); // needs 3 challenge right
    expect(levelFor(12, 0.85, 5, 3, 200_000)).toBe("solid"); // too slow
    expect(levelFor(12, 0.85, 5, 3, 150_000)).toBe("competition-ready");
  });

  it("weights challenge questions more, halves second tags and hint-assisted answers, and fades old answers", () => {
    // 1 challenge right (weight 2) + 1 warm-up wrong (weight 1) = 2/3
    const a = scoreArea([ans({ primary: "GEO", tier: "challenge", answeredAt: NOW }), ans({ primary: "GEO", tier: "warm-up", correct: false, answeredAt: NOW })], "GEO", NOW);
    expect(a.weightedAccuracy).toBeCloseTo(2 / 3);
    // a right answer as second tag weighs half: 0.75 / (0.75 + 1.5)
    const b = scoreArea([ans({ primary: "NUM", secondary: "CMB", answeredAt: NOW }), ans({ primary: "CMB", correct: false, answeredAt: NOW })], "CMB", NOW);
    expect(b.weightedAccuracy).toBeCloseTo(1 / 3);
    // a correct answer with a hint counts half
    const c = scoreArea([ans({ primary: "LOG", hintUsed: true, answeredAt: NOW })], "LOG", NOW);
    expect(c.weightedAccuracy).toBeCloseTo(0.5);
    // a wrong answer 30 days ago weighs half a right answer today: 1 / 1.5
    const d = scoreArea([ans({ primary: "SPA", answeredAt: NOW }), ans({ primary: "SPA", correct: false, answeredAt: NOW - 30 * DAY })], "SPA", NOW);
    expect(d.weightedAccuracy).toBeCloseTo(2 / 3);
  });

  it("only looks at the last 30 answers in an area", () => {
    const old = many(30, { primary: "ALG", correct: false, answeredAt: NOW - 10 * DAY });
    const fresh = Array.from({ length: 30 }, (_, i) => ans({ primary: "ALG", correct: true, answeredAt: NOW - i }));
    const s = scoreArea([...old, ...fresh], "ALG", NOW);
    expect(s.attempts).toBe(30);
    expect(s.weightedAccuracy).toBe(1);
  });
});

describe("weak areas", () => {
  it("picks the two lowest areas with enough answers, then areas not tried yet", () => {
    const answers = [
      ...many(6, { primary: "NUM", correct: true }),
      ...many(6, { primary: "SPA", correct: false }),
      ...many(2, { primary: "LOG", correct: false }), // too few to judge
    ];
    const scores = (["NUM", "ALG", "GEO", "SPA", "LOG", "CMB"] as FocusArea[]).map((f) => scoreArea(answers, f, NOW));
    expect(weakAreas(scores)).toEqual([
      { focus: "SPA", reason: "low" },
      { focus: "NUM", reason: "low" },
    ]);
    const onlyOne = scores.map((s) => (s.focus === "NUM" ? { ...s, attempts: 0, weightedAccuracy: null } : s));
    expect(weakAreas(onlyOne)).toEqual([
      { focus: "SPA", reason: "low" },
      { focus: "NUM", reason: "new" },
    ]);
  });
});

describe("tier to stretch towards", () => {
  it("is the first tier under 70% (or with under 5 answers)", () => {
    expect(tierTarget([])).toBe("warm-up");
    const warm = many(10, { primary: "NUM", tier: "warm-up" });
    expect(tierTarget(warm)).toBe("core");
    const core = many(10, { primary: "NUM", tier: "core", correct: false });
    expect(tierTarget([...warm, ...core])).toBe("core");
    const coreOk = many(10, { primary: "NUM", tier: "core" });
    const chal = many(10, { primary: "NUM", tier: "challenge" });
    expect(tierTarget([...warm, ...coreOk, ...chal])).toBe("challenge");
  });
});

describe("mistake memory", () => {
  it("brings a miss back after 1 day, steps up after a right answer, and masters it after 2 in a row without a hint", () => {
    const q = "wizSMART-2020-05";
    const t0 = NOW - 40 * DAY;
    const r1 = replayReviews([ans({ primary: "NUM", questionId: q, correct: false, answeredAt: t0 })]).get(q)!;
    expect(r1).toMatchObject({ box: 1, dueAt: t0 + DAY, streak: 0 });

    const r2 = replayReviews([ans({ primary: "NUM", questionId: q, correct: false, answeredAt: t0 }), ans({ primary: "NUM", questionId: q, answeredAt: t0 + 2 * DAY })]).get(q)!;
    expect(r2).toMatchObject({ box: 2, dueAt: t0 + 5 * DAY, streak: 1 });

    const hinted = replayReviews([
      ans({ primary: "NUM", questionId: q, correct: false, answeredAt: t0 }),
      ans({ primary: "NUM", questionId: q, answeredAt: t0 + 2 * DAY, hintUsed: true }),
      ans({ primary: "NUM", questionId: q, answeredAt: t0 + 6 * DAY }),
    ]).get(q)!;
    expect(hinted).toMatchObject({ box: 3, streak: 1, dueAt: t0 + 13 * DAY }); // the hint didn't count towards mastery

    const mastered = replayReviews([
      ans({ primary: "NUM", questionId: q, correct: false, answeredAt: t0 }),
      ans({ primary: "NUM", questionId: q, answeredAt: t0 + 2 * DAY }),
      ans({ primary: "NUM", questionId: q, answeredAt: t0 + 6 * DAY }),
    ]).get(q)!;
    expect(mastered.box).toBe(5);

    const backToStart = replayReviews([
      ans({ primary: "NUM", questionId: q, correct: false, answeredAt: t0 }),
      ans({ primary: "NUM", questionId: q, answeredAt: t0 + 2 * DAY }),
      ans({ primary: "NUM", questionId: q, correct: false, blank: true, answeredAt: t0 + 6 * DAY }),
    ]).get(q)!;
    expect(backToStart).toMatchObject({ box: 1, streak: 0 });

    // A question answered right the first time never enters the memory.
    expect(replayReviews([ans({ primary: "NUM", questionId: "x" })]).size).toBe(0);
  });
});

describe("contest-score estimate", () => {
  it("scales to 120 and gives a range", () => {
    expect(contestEstimate([])).toBeNull();
    expect(contestEstimate([{ score: 90, maxScore: 120, endedAt: 1 }])).toEqual({ score: 90, low: 80, high: 100, papers: 1 });
    const e = contestEstimate([
      { score: 60, maxScore: 120, endedAt: 1 }, // oldest, dropped
      { score: 80, maxScore: 120, endedAt: 2 },
      { score: 100, maxScore: 120, endedAt: 3 },
      { score: 120, maxScore: 150, endedAt: 4 }, // 2005 paper: 96 out of 120
    ]);
    expect(e).toEqual({ score: 92, low: 82, high: 102, papers: 3 });
  });
});
