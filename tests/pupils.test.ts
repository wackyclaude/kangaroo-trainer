import { describe, expect, it } from "vitest";
import { PUPIL_SHARES } from "../src/server/content/pupil-shares.js";
import { BRAIN_SHARES } from "../src/server/content/brain-shares.js";
import { groupsFor, WIZBRAIN_AVERAGES } from "../src/shared/benchmarks.js";
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
    expect(pupilStats("wizSMART", 2026, 5, "C")).toEqual({ year: 2026, right: 50, blank: 5, trap: { choice: "B", pct: 34 } });
    // 2026 Q1: 97% right, no wrong answer above 1%.
    expect(pupilStats("wizSMART", 2026, 1, "B")?.trap).toBeNull();
    expect(pupilStats("wizSMART", 2022, 1, "B")).toBeNull(); // no report
    expect(pupilStats("wizSMART", 2014, 16, "C")).toBeNull(); // the report counted D
  });

  it("turns the share right into a level", () => {
    expect([90, 65, 64, 50, 49, 35, 34, 20, 19, 0].map(kangarooLevel)).toEqual([1, 1, 2, 2, 3, 3, 4, 4, 5, 5]);
  });

  it("estimates a level from the position for years without numbers", () => {
    const real = Object.entries(PUPIL_SHARES)
      .filter(([, rows]) => rows.length === 24)
      .flatMap(([y, rows]) => rows.map((r, i) => ({ level: "wizSMART", year: Number(y), number: i + 1, questionsInPaper: 24, answer: "ABCDE"[r.slice(0, 5).indexOf(Math.max(...r.slice(0, 5)))]! })));
    const medians = positionMedians(real);
    expect(medians).toHaveLength(24);
    expect(medians[0]!).toBeGreaterThan(medians[23]!);
    expect(kangarooDifficulty({ level: "wizSMART", year: 2022, number: 1, questionsInPaper: 24, answer: "A" }, medians)).toEqual({ level: kangarooLevel(medians[0]!), estimated: true });
    expect(kangarooDifficulty({ level: "wizSMART", year: 2026, number: 1, questionsInPaper: 24, answer: "B" }, medians)).toEqual({ level: 1, estimated: false });
    // With nothing to go on, a plain slope from easy to hard.
    const none = positionMedians([]);
    expect(none[0]).toBe(80);
    expect(none[23]).toBe(15);
  });
});

describe("wizBRAIN pupil numbers", () => {
  it("has 30 believable rows for every year", () => {
    expect(Object.keys(BRAIN_SHARES)).toHaveLength(20);
    for (const [year, rows] of Object.entries(BRAIN_SHARES)) {
      expect(rows.length, year).toBe(30);
      for (const r of rows) {
        const sum = r.reduce((t, x) => t + x, 0);
        expect(sum, `${year}: ${r.join(" ")}`).toBeGreaterThan(96.5);
        expect(sum, `${year}: ${r.join(" ")}`).toBeLessThan(104.5);
      }
    }
  });

  it("keeps the two levels apart", () => {
    // 2026 Q1: wizBRAIN answer E, wizSMART answer B: each level reads its own table.
    expect(pupilStats("wizBRAIN", 2026, 1, "E")?.right).toBe(Math.round(BRAIN_SHARES[2026]![0]![4]));
    expect(pupilStats("wizSMART", 2026, 1, "B")?.right).toBe(Math.round(PUPIL_SHARES[2026]![0]![1]));
    expect(pupilStats("wizBRAIN", 2012, 27, "A")).toBeNull(); // no printed answer was right
    expect(pupilStats("wizBRAIN", 2022, 1, "B")).toBeNull(); // report is pictures only
  });

  it("estimates over 30 positions", () => {
    const medians = positionMedians([{ level: "wizBRAIN", year: 2026, number: 1, questionsInPaper: 30, answer: "E" }], "wizBRAIN");
    expect(medians).toHaveLength(30);
    expect(kangarooDifficulty({ level: "wizBRAIN", year: 2022, number: 30, questionsInPaper: 30, answer: "B" }, medians).estimated).toBe(true);
  });

  it("compares wizBRAIN papers with havo/vwo 1, out of 150", () => {
    const g = groupsFor("wizBRAIN", "groep8");
    expect(g.max).toBe(150);
    expect(g.groupName).toBe("havo/vwo 1");
    expect(g.at(2026)?.average).toBe(WIZBRAIN_AVERAGES[2026]!.hv1.average);
    expect(g.others(2026).map((o) => o.groupName)).toEqual(["havo 2", "vwo 2"]);
    expect(g.at(2017)).toBeNull();
    expect(groupsFor("wizSMART", "groep8").max).toBe(120);
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
