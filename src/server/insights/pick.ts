// Picks questions for "Fix my mistakes" and "Smart mix".
import crypto from "node:crypto";
import type { FocusArea, Level, Tier } from "../../shared/types.js";
import { TIERS } from "../../shared/types.js";
import { scoreAreas, tierTarget, tiersForLevel, weakAreas, type Answer } from "./model.js";

export interface PickQuestion {
  id: string;
  year: number;
  tier: string;
  focusPrimary: string;
  focusSecondary: string | null;
  voidNote: string | null;
}

export function shuffle<T>(items: T[]): T[] {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = crypto.randomInt(i + 1);
    [a[i], a[j]] = [a[j] as T, a[i] as T];
  }
  return a;
}

const tierRank = (t: string) => TIERS.indexOf(t as Tier);
const byTier = <Q extends PickQuestion>(qs: Q[]) => [...qs].sort((a, b) => tierRank(a.tier) - tierRank(b.tier));
const hasArea = (q: PickQuestion, f: FocusArea) => q.focusPrimary === f || q.focusSecondary === f;
/** Newer papers first (2013+ feel more like today's contest), random within each group. */
const newerFirst = <Q extends PickQuestion>(qs: Q[]) => [...shuffle(qs.filter((q) => q.year >= 2013)), ...shuffle(qs.filter((q) => q.year < 2013))];

/** Fix my mistakes: due questions first (oldest due first), then the ones coming back soonest. */
export function pickMistakes<Q extends PickQuestion>(all: Q[], queue: { questionId: string; due: boolean }[], count: number): Q[] {
  const byId = new Map(all.map((q) => [q.id, q]));
  const picked = queue.map((r) => byId.get(r.questionId)).filter((q): q is Q => !!q && !q.voidNote);
  return byTier(picked.slice(0, count));
}

/**
 * Smart mix: about 60% from the 2 weakest areas (at a tier that suits each area's level),
 * 30% at the tier to stretch towards, 10% review of past mistakes. Leaves out questions answered
 * correctly in the last 30 days, and leans towards papers from 2013 on.
 */
export function pickSmart<Q extends PickQuestion>(all: Q[], answers: Answer[], queue: { questionId: string; due: boolean }[], recentCorrect: Set<string>, count: number, now: number): Q[] {
  const pool = all.filter((q) => !q.voidNote && !recentCorrect.has(q.id));
  const scores = scoreAreas(answers, now);
  const weak = weakAreas(scores);
  const levelOf = new Map<FocusArea, Level>(scores.map((s) => [s.focus, s.level]));
  const target = tierTarget(answers);

  const nWeak = Math.round(count * 0.6);
  const nTier = Math.round(count * 0.3);
  const nReview = Math.max(0, count - nWeak - nTier);
  const chosen = new Map<string, Q>();
  const take = (qs: Q[], n: number) => {
    let added = 0;
    for (const q of qs) {
      if (added >= n) break;
      if (chosen.has(q.id)) continue;
      chosen.set(q.id, q);
      added++;
    }
    return added;
  };

  // 1. Weak areas, shared between the two.
  weak.forEach((w, i) => {
    const share = i === 0 ? Math.ceil(nWeak / weak.length) : nWeak - Math.ceil(nWeak / weak.length);
    const tiers = new Set<string>(tiersForLevel(levelOf.get(w.focus) ?? "starter"));
    const inArea = pool.filter((q) => hasArea(q, w.focus));
    const got = take(newerFirst(inArea.filter((q) => tiers.has(q.tier))), share);
    if (got < share) take(newerFirst(inArea), share - got);
  });

  // 2. The tier to stretch towards, from any area.
  take(newerFirst(pool.filter((q) => q.tier === target)), nTier);

  // 3. Review: past mistakes that are due, then any past mistakes.
  const byId = new Map(all.map((q) => [q.id, q]));
  const due = queue.filter((r) => r.due).map((r) => byId.get(r.questionId)).filter((q): q is Q => !!q && !q.voidNote);
  const later = queue.filter((r) => !r.due).map((r) => byId.get(r.questionId)).filter((q): q is Q => !!q && !q.voidNote);
  take([...due, ...later], nReview);

  // Top up from everything else if any part came up short.
  if (chosen.size < count) take(newerFirst(pool), count - chosen.size);
  return byTier([...chosen.values()].slice(0, count));
}
