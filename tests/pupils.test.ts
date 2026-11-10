import { describe, expect, it } from "vitest";
import { PUPIL_SHARES } from "../src/server/content/pupil-shares.js";
import { kangarooDifficulty, positionMedians, pupilStats } from "../src/server/content/pupils.js";
import { levelTarget, levelsForSkill, type Answer } from "../src/server/insights/model.js";
import { pickSmart } from "../src/server/insights/pick.js";
import { kangarooLevel } from "../src/shared/types.js";

describe("pupil numbers", () => {
  it("has a full, believable table for every year", () => {
    for (const [year, rows] of Object.entries(PUPIL_SHARES)) {
      expect(rows.length, year).toBe(year === "2005" ? 30 : 24);
      for (const r of rows) {
        const sum = r.reduce((t, x) => t + x, 0);
        expect(sum, `${year}: ${r.join(" ")}`).toBeGreaterThan(98.5);
        expect(sum, `${year}: ${r.join(" ")}`).toBeLessThan(104.5);
      }
    }
  });

  it("gives the share right, the blanks and a trap only when many fell for it", () => {
    // 2026 Q5: B 34.0, C 49.8 (right), blank 4.7.
    expect(pupilStats(2026, 5, "C")).toEqual({ year: 2026, right: 50, blank: 5, trap: { choice: "B", pct: 34 } });
    // 2026 Q1: 97% right, no wrong answer above 1%.
    expect(pupilStats(2026, 1, "B")?.trap).toBeNull();
    expect(pupilStats(2022, 1, "B")).toBeNull(); // no report
    expect(pupilStats(2014, 16, "C")).toBeNull(); // the report counted D
  });

  it("turns the share right into a level", () => {
    expect([90, 65, 64, 50, 49, 35, 34, 20, 19, 0].map(kangarooLevel)).toEqual([1, 1, 2, 2, 3, 3, 4, 4, 5, 5]);
  });

  it("estimates a level from the position for years without numbers", () => {
    const real = Object.entries(PUPIL_SHARES)
      .filter(([, rows]) => rows.length === 24)
      .flatMap(([y, rows]) => rows.map((r, i) => ({ year: Number(y), number: i + 1, questionsInPaper: 24, answer: "ABCDE"[r.slice(0, 5).indexOf(Math.max(...r.slice(0, 5)))]! })));
    const medians = positionMedians(real);
    expect(medians).toHaveLength(24);
    expect(medians[0]!).toBeGreaterThan(medians[23]!);
    expect(kangarooDifficulty({ year: 2022, number: 1, questionsInPaper: 24, answer: "A" }, medians)).toEqual({ level: kangarooLevel(medians[0]!), estimated: true });
    expect(kangarooDifficulty({ year: 2026, number: 1, questionsInPaper: 24, answer: "B" }, medians)).toEqual({ level: 1, estimated: false });
    // With nothing to go on, a plain slope from easy to hard.
    const none = positionMedians([]);
    expect(none[0]).toBe(80);
    expect(none[23]).toBe(15);
  });
});

const answer = (difficulty: number, correct: boolean, i: number): Answer => ({
  questionId: `q${difficulty}-${i}`,
  year: 2025,
  number: 1,
  tier: "core",
  primary: "NUM",
  secondary: null,
  correct,
  blank: false,
  hintUsed: false,
  timeMs: 60_000,
  answeredAt: 1_000 + i,
  sessionId: 1,
  difficulty,
});

describe("Smart mix by level", () => {
  it("stretches towards the easiest level that isn't 70% right yet", () => {
    const solid1 = Array.from({ length: 10 }, (_, i) => answer(1, true, i));
    const shaky2 = Array.from({ length: 10 }, (_, i) => answer(2, i < 5, i + 20));
    expect(levelTarget([])).toBe(1);
    expect(levelTarget(solid1)).toBe(2); // level 2 not tried yet
    expect(levelTarget([...solid1, ...shaky2])).toBe(2);
    expect(levelsForSkill("starter")).toEqual([1, 2]);
    expect(levelsForSkill("competition-ready")).toEqual([4, 5]);
  });

  it("picks by level for Kangaroo and sorts easiest first", () => {
    const qs = [1, 2, 3, 4, 5].flatMap((d) => Array.from({ length: 6 }, (_, i) => ({ id: `${d}-${i}`, year: 2024, tier: "core", difficulty: d, focusPrimary: "GEO", focusSecondary: null, voidNote: null })));
    const answers = [...Array.from({ length: 10 }, (_, i) => answer(1, true, i)), ...Array.from({ length: 10 }, (_, i) => answer(2, true, i + 20))];
    const picked = pickSmart(qs, answers, [], new Set(), 10, Date.now(), true);
    expect(picked).toHaveLength(10);
    // 30% at the target level 3; the rest from the weak areas at starter levels 1–2 (no GEO answers yet).
    expect(picked.filter((q) => q.difficulty === 3).length).toBeGreaterThanOrEqual(3);
    expect(picked.map((q) => q.difficulty)).toEqual([...picked.map((q) => q.difficulty)].sort());
  });
});
