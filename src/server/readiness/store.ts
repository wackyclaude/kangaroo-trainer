import { eq } from "drizzle-orm";
import type { Db } from "../db/client.js";
import { profile, question } from "../db/schema.js";
import { DEFAULT_TARGET_SCORE, FOCUS_AREAS, type Contest, type FocusArea, type Readiness } from "../../shared/types.js";
import { buildInsights, countedAnswers, finishedPapers } from "../insights/store.js";
import { dayKey } from "../rewards/model.js";
import { HOME_TIME_ZONE } from "../rewards/store.js";
import { contestFor, readiness } from "./model.js";
import { olympiadContestFor, olympiadReadiness } from "./olympiad.js";
import { olympiadOf } from "../practice/contest.js";
import { olympiadPapers } from "../content/olympiad.js";

export function buildReadiness(db: Db, profileId: number, now = Date.now(), contest: Contest = "kangaroo"): Readiness | null {
  const p = db.select().from(profile).where(eq(profile.id, profileId)).get();
  if (!p || p.role !== "student") return null;
  const today = dayKey(now, HOME_TIME_ZONE);
  if (contest === "olympiad") {
    const o = olympiadOf(p);
    const answers = countedAnswers(db, profileId, undefined, "olympiad");
    const easy = answers.filter((a) => (a.difficulty ?? 9) <= 3);
    const pool = db.select({ f1: question.focusPrimary, f2: question.focusSecondary, d: question.difficulty }).from(question).where(eq(question.contest, "olympiad")).all().filter((q) => (q.d ?? 9) <= 3);
    const areas = (Object.keys(FOCUS_AREAS) as FocusArea[]).map((f) => {
      const mine = easy.filter((a) => a.primary === f || a.secondary === f).slice(-30);
      return { focus: f, right: mine.filter((a) => a.correct).length, answers: mine.length, available: pool.filter((q) => q.f1 === f || q.f2 === f).length };
    });
    const { facts } = olympiadPapers(db);
    const papers = finishedPapers(db, profileId, "olympiad")
      .filter((x) => x.year !== null && facts.get(x.year)?.cutoff != null)
      .sort((a, b) => a.endedAt - b.endedAt)
      .map((x) => ({ score: x.score, cutoff: facts.get(x.year!)!.cutoff! }));
    const r = olympiadReadiness({ areas, papers, distinctQuestions: new Set(answers.map((a) => a.questionId)).size, shift: o.targetShift });
    return { kind: "olympiad", contest: olympiadContestFor(today, o.date), target: o.targetShift, ...r };
  }
  const ins = buildInsights(db, profileId, now, "kangaroo");
  if (!ins) return null;
  const target = p.targetScore ?? DEFAULT_TARGET_SCORE;
  const distinct = new Set(countedAnswers(db, profileId, undefined, "kangaroo").map((a) => a.questionId)).size;
  const r = readiness({
    areas: ins.areas.map((a) => ({ focus: a.focus, weightedAccuracy: a.weightedAccuracy, attempts: a.attempts })),
    estimate: ins.estimate?.score ?? null,
    papers: ins.totals.papers,
    distinctQuestions: distinct,
    target,
  });
  return { kind: "kangaroo", contest: contestFor(today, p.contestDate), target, ...r };
}
