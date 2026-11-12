// How real Kangaroo entrants scored, from W4Kangoeroe's yearly reports ("verslag"), individual entries only.
// Only years scored like the app does (5 right, 1 blank, 0 wrong; 24 questions, maximum 120) are listed.
// Not listed: 2017 (its report repeats the 2016 table), 2018 and 2020 (no report found), 2010–2011
// (no report found), and before 2012 (different scoring). These are published statistics, not contest material.

export const COMPARE_GROUPS = ["groep7", "groep8", "vmbo1", "vmbo2"] as const;
export type CompareGroup = (typeof COMPARE_GROUPS)[number];
export const COMPARE_GROUP_NAMES: Record<CompareGroup, string> = { groep7: "groep 7", groep8: "groep 8", vmbo1: "vmbo 1", vmbo2: "vmbo 2" };
/** Groep 8 pupils are about 12, the same age as an MYP1 / klas 1 student. */
export const DEFAULT_COMPARE_GROUP: CompareGroup = "groep8";

export interface GroupYear {
  entrants: number;
  average: number;
  /** Highest individual score, when the report gives a believable one. */
  highest: number | null;
}

type Row = [entrants: number, average: number, highest: number | null];
const row = ([entrants, average, highest]: Row): GroupYear => ({ entrants, average, highest });
const year = (g7: Row, g8: Row, v1: Row, v2: Row): Record<CompareGroup, GroupYear> => ({ groep7: row(g7), groep8: row(g8), vmbo1: row(v1), vmbo2: row(v2) });

export const WIZSMART_AVERAGES: Record<number, Record<CompareGroup, GroupYear>> = {
  2012: year([6865, 54.1, 120], [7050, 64.5, 116], [7695, 46.1, 105], [2721, 50.3, 110]),
  2013: year([8109, 53.1, 120], [8731, 60.8, null], [7540, 42.6, 110], [3541, 47.0, 115]),
  2014: year([10391, 51.7, 115], [10559, 60.9, 120], [9048, 41.4, 110], [3925, 45.3, 115]),
  2015: year([10162, 54.2, 115], [10557, 64.2, 120], [8299, 44.7, 105], [3679, 48.7, 105]),
  2016: year([10682, 62.1, 120], [11183, 71.8, 120], [9125, 50.4, 115], [3789, 54.8, 115]),
  2019: year([11625, 63.3, 120], [12046, 71.9, 120], [6819, 49.8, 120], [2323, 52.3, 110]),
  2021: year([6826, 59.9, 120], [7181, 69.9, 120], [1417, 48.1, 115], [511, 50.5, 101]),
  2022: year([9970, 49, 120], [10502, 58, 120], [3389, 39, 105], [1325, 42, 100]),
  2023: year([10352, 61.4, 115], [11132, 69.3, 120], [4272, 49, 120], [1409, 50.7, 110]),
  2024: year([10731, 43.4, 120], [11170, 51.6, 115], [5331, 32.6, 91], [1350, 34.8, 85]),
  2025: year([10883, 65.4, 120], [11067, 74.4, 120], [4985, 48.5, 110], [1533, 49.7, 86]),
  2026: year([11591, 61.4, 120], [11847, 69.4, 120], [4292, 47.5, 105], [1260, 49.7, 112]),
};

// wizBRAIN (havo/vwo 1–2), from the same reports: individual entries, 30 questions, maximum 150.
// Not listed: 2017 (its report repeats the 2016 table) and before 2012 (different scoring).
// 2020 and 2021 were small, mostly online years; they are kept, as the reports give them.
export const BRAIN_GROUPS = ["hv1", "havo2", "vwo2"] as const;
export type BrainGroup = (typeof BRAIN_GROUPS)[number];
export const BRAIN_GROUP_NAMES: Record<BrainGroup, string> = { hv1: "havo/vwo 1", havo2: "havo 2", vwo2: "vwo 2" };
/** Havo/vwo 1 pupils are about 12–13, the same as an MYP1 / klas 1 student. */
export const DEFAULT_BRAIN_GROUP: BrainGroup = "hv1";

const brainYear = (h1: Row, h2: Row, v2: Row): Record<BrainGroup, GroupYear> => ({ hv1: row(h1), havo2: row(h2), vwo2: row(v2) });

export const WIZBRAIN_AVERAGES: Record<number, Record<BrainGroup, GroupYear>> = {
  2012: brainYear([22818, 61.9, 141], [3818, 59.1, 145], [7791, 74.5, 140]),
  2013: brainYear([22651, 49.7, 140], [3482, 46.9, 112], [8070, 59.7, 150]),
  2014: brainYear([24787, 63.2, 150], [3982, 61.1, 145], [8793, 76.5, 150]),
  2015: brainYear([22951, 67.6, 135], [3442, 64.3, 121], [8285, 77.5, 140]),
  2016: brainYear([23073, 66.7, 145], [4035, 63.5, 132], [7995, 80.4, 150]),
  2018: brainYear([23200, 60.9, 140], [3794, 59.2, 150], [7947, 72.5, 145]),
  2019: brainYear([21626, 70.5, 150], [3182, 68.1, 145], [6819, 86.7, 150]),
  2020: brainYear([2912, 77.5, 150], [445, 74.2, 146], [819, 90.4, 150]),
  2021: brainYear([3516, 62.6, 142], [482, 59.2, 114], [1193, 73.3, 150]),
  2022: brainYear([11958, 45, 150], [1832, 43, 100], [3225, 55, 140]),
  2023: brainYear([16050, 55.9, 140], [2624, 52.2, 110], [4848, 64.5, 150]),
  2024: brainYear([15417, 59.0, 140], [2363, 54.5, 120], [3895, 70.9, 145]),
  2025: brainYear([14311, 70.2, 145], [1851, 66.9, 141], [4374, 81.6, 150]),
  2026: brainYear([13864, 52.2, 141], [1624, 48.9, 119], [4251, 63.6, 141]),
};

/** The comparison groups for a Kangaroo level: wizSMART uses the parent's pick, wizBRAIN always starts at havo/vwo 1. */
export function groupsFor(level: "wizSMART" | "wizBRAIN", picked: CompareGroup) {
  if (level === "wizBRAIN") {
    return {
      max: 150,
      group: DEFAULT_BRAIN_GROUP as string,
      groupName: BRAIN_GROUP_NAMES[DEFAULT_BRAIN_GROUP],
      at: (year: number | null) => (year === null ? null : (WIZBRAIN_AVERAGES[year]?.[DEFAULT_BRAIN_GROUP] ?? null)),
      others: (year: number) => BRAIN_GROUPS.filter((g) => g !== DEFAULT_BRAIN_GROUP).flatMap((g) => (WIZBRAIN_AVERAGES[year]?.[g] ? [{ groupName: BRAIN_GROUP_NAMES[g], average: WIZBRAIN_AVERAGES[year]![g].average }] : [])),
    };
  }
  return {
    max: 120,
    group: picked as string,
    groupName: COMPARE_GROUP_NAMES[picked],
    at: (year: number | null) => groupYear(year, picked),
    others: (year: number) => COMPARE_GROUPS.filter((g) => g !== picked).flatMap((g) => (WIZSMART_AVERAGES[year]?.[g] ? [{ groupName: COMPARE_GROUP_NAMES[g], average: WIZSMART_AVERAGES[year]![g].average }] : [])),
  };
}

export const isCompareGroup = (x: unknown): x is CompareGroup => typeof x === "string" && (COMPARE_GROUPS as readonly string[]).includes(x);

export function groupYear(paperYear: number | null, group: CompareGroup): GroupYear | null {
  if (paperYear === null) return null;
  return WIZSMART_AVERAGES[paperYear]?.[group] ?? null;
}

/** Rounds an average for display: 69.4 stays, 58 stays 58. */
export const fmtAverage = (x: number) => (Number.isInteger(x) ? String(x) : x.toFixed(1));
