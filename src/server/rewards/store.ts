import { and, count, eq, isNotNull } from "drizzle-orm";
import type { Db } from "../db/client.js";
import { practiceSession, profile, sessionQuestion } from "../db/schema.js";
import { countedAnswers } from "../insights/store.js";
import { replayRewards, type FinishedSession, type RewardsReplay } from "./model.js";

function validTimeZone(tz: string | undefined): string {
  const fallback = "Europe/Amsterdam";
  if (!tz) return fallback;
  try {
    new Intl.DateTimeFormat("en-CA", { timeZone: tz });
    return tz;
  } catch {
    return fallback;
  }
}

/** Days (for streaks and the weekly goal) are counted in the family's time zone, not the server's. */
export const HOME_TIME_ZONE = validTimeZone(process.env.KT_TIME_ZONE);

export function buildRewards(db: Db, profileId: number, now = Date.now()): RewardsReplay | null {
  const who = db.select({ role: profile.role }).from(profile).where(eq(profile.id, profileId)).get();
  if (!who || who.role !== "student") return null;
  const counts = new Map(
    db
      .select({ id: sessionQuestion.sessionId, n: count() })
      .from(sessionQuestion)
      .innerJoin(practiceSession, eq(practiceSession.id, sessionQuestion.sessionId))
      .where(eq(practiceSession.profileId, profileId))
      .groupBy(sessionQuestion.sessionId)
      .all()
      .map((r) => [r.id, r.n]),
  );
  const sessions: FinishedSession[] = db
    .select()
    .from(practiceSession)
    .where(and(eq(practiceSession.profileId, profileId), isNotNull(practiceSession.endedAt)))
    .all()
    .map((s) => ({ id: s.id, mode: s.mode, startedAt: s.startedAt, endedAt: s.endedAt!, score: s.score, maxScore: s.maxScore, questions: counts.get(s.id) ?? 0 }));
  return replayRewards(countedAnswers(db, profileId), sessions, now, HOME_TIME_ZONE);
}
