import { eq } from "drizzle-orm";
import type { Db } from "../db/client.js";
import { profile } from "../db/schema.js";
import { DEFAULT_TARGET_SCORE, type Readiness } from "../../shared/types.js";
import { buildInsights, countedAnswers } from "../insights/store.js";
import { dayKey } from "../rewards/model.js";
import { HOME_TIME_ZONE } from "../rewards/store.js";
import { contestFor, readiness } from "./model.js";

export function buildReadiness(db: Db, profileId: number, now = Date.now()): Readiness | null {
  const p = db.select().from(profile).where(eq(profile.id, profileId)).get();
  if (!p || p.role !== "student") return null;
  const ins = buildInsights(db, profileId, now);
  if (!ins) return null;
  const target = p.targetScore ?? DEFAULT_TARGET_SCORE;
  const distinct = new Set(countedAnswers(db, profileId).map((a) => a.questionId)).size;
  const r = readiness({
    areas: ins.areas.map((a) => ({ focus: a.focus, weightedAccuracy: a.weightedAccuracy, attempts: a.attempts })),
    estimate: ins.estimate?.score ?? null,
    papers: ins.totals.papers,
    distinctQuestions: distinct,
    target,
  });
  return { contest: contestFor(dayKey(now, HOME_TIME_ZONE), p.contestDate), target, ...r };
}
