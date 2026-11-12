// Which contests a profile has, and the Olympiad settings the parent chose.
import { and, eq, type SQL } from "drizzle-orm";
import type { Db } from "../db/client.js";
import { profile, question } from "../db/schema.js";
import { CONTESTS, DEFAULT_OLYMPIAD, KANGAROO_LEVEL, OLY_LEVELS, type Contest, type OlyLevel, type OlympiadSettings } from "../../shared/types.js";

type ProfileRow = typeof profile.$inferSelect;
type QuestionRow = typeof question.$inferSelect;

export function contestsOf(p: Pick<ProfileRow, "role" | "contests">): Contest[] {
  if (p.role === "parent") return [...CONTESTS];
  const list = (p.contests ?? ["kangaroo"]).filter((c): c is Contest => (CONTESTS as readonly string[]).includes(c));
  return list.length ? list : ["kangaroo"];
}

const isLevel = (x: unknown): x is OlyLevel => typeof x === "number" && (OLY_LEVELS as readonly number[]).includes(x);

export function olympiadOf(p: Pick<ProfileRow, "olympiad">): OlympiadSettings {
  const o = (p.olympiad ?? {}) as Partial<OlympiadSettings>;
  const minLevel = isLevel(o.minLevel) ? o.minLevel : DEFAULT_OLYMPIAD.minLevel;
  const maxLevel = isLevel(o.maxLevel) && o.maxLevel >= minLevel ? o.maxLevel : Math.max(minLevel, DEFAULT_OLYMPIAD.maxLevel) as OlyLevel;
  return {
    minLevel,
    maxLevel,
    stretch: typeof o.stretch === "boolean" ? o.stretch : DEFAULT_OLYMPIAD.stretch,
    date: typeof o.date === "string" ? o.date : null,
    targetShift: typeof o.targetShift === "number" && Number.isInteger(o.targetShift) ? Math.max(-10, Math.min(10, o.targetShift)) : 0,
  };
}

export function profileSettings(db: Db, profileId: number) {
  const p = db.select().from(profile).where(eq(profile.id, profileId)).get();
  return p ? { contests: contestsOf(p), olympiad: olympiadOf(p) } : null;
}

export const contestOfSession = (s: { contest?: string | null }): Contest => (s.contest === "olympiad" || s.contest === "brain" ? s.contest : "kangaroo");

/** Which contest a question belongs to: both Kangaroo levels are stored as contest "kangaroo". */
export const contestOfQuestion = (q: Pick<QuestionRow, "contest" | "level">): Contest => (q.contest === "olympiad" ? "olympiad" : q.level === KANGAROO_LEVEL.brain ? "brain" : "kangaroo");

/** Which question rows belong to a contest's bank. */
export const inContest = (contest: Contest): SQL =>
  contest === "olympiad" ? eq(question.contest, "olympiad") : and(eq(question.contest, "kangaroo"), eq(question.level, KANGAROO_LEVEL[contest]))!;

/** "7" for Kangaroo; "A3" or "B2" for the Olympiad (B-numbers restart after the 8 A-questions). */
export function labelOf(q: Pick<QuestionRow, "contest" | "part" | "number">): string {
  if (q.contest !== "olympiad" || !q.part) return String(q.number);
  return `${q.part}${q.part === "B" ? q.number - 8 : q.number}`;
}

export const imageUrl = (path: string) => `/content/${path}`;
