// Stars, streaks and badges, worked out from the answer log (nothing extra is stored).
import { BADGES, FOCUS_AREAS, type Badge, type BadgeId, type FocusArea, type Rewards, type SessionRewards, type WeekDay } from "../../shared/types.js";
import { scoreAreas, type Answer } from "../insights/model.js";

export interface FinishedSession {
  id: number;
  mode: string;
  startedAt: number;
  endedAt: number;
  score: number | null;
  maxScore: number | null;
  questions: number;
  /** Missing = Kangaroo. */
  contest?: "kangaroo" | "olympiad";
  /** Olympiad full paper: that year's klas 1–3 cutoff. */
  cutoff?: number | null;
}

export const WEEK_GOAL = 3;
export const FIX_BONUS = 2;

/** "YYYY-MM-DD" for a moment, in the family's time zone. */
export function dayKey(ms: number, timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(ms);
}

/** Shifts a "YYYY-MM-DD" key by whole days (calendar arithmetic, no time zone involved). */
export function addDays(key: string, n: number): string {
  const d = new Date(`${key}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** Monday of the week that contains this day. */
export function mondayOf(key: string): string {
  const dow = new Date(`${key}T12:00:00Z`).getUTCDay(); // 0 = Sunday
  return addDays(key, -((dow + 6) % 7));
}

interface Earned {
  at: number;
  sessionId: number | null;
}

export interface RewardsReplay {
  rewards: Rewards;
  bySession: Map<number, SessionRewards>;
}

/**
 * Replays the answer log and the finished sessions in time order.
 * A badge is earned at the answer (or session end) that first makes its rule true.
 */
export function replayRewards(answers: Answer[], sessions: FinishedSession[], now: number, timeZone: string): RewardsReplay {
  type Ev = { at: number; kind: "answer"; a: Answer } | { at: number; kind: "end"; s: FinishedSession };
  const events: Ev[] = [
    ...answers.map((a) => ({ at: a.answeredAt, kind: "answer" as const, a })),
    ...sessions.map((s) => ({ at: s.endedAt, kind: "end" as const, s })),
  ];
  // Answers before the session end that holds them.
  events.sort((x, y) => x.at - y.at || (x.kind === y.kind ? 0 : x.kind === "answer" ? -1 : 1));

  const earned = new Map<BadgeId, Earned>();
  const have = new Map<BadgeId, number>();
  const bump = (id: BadgeId, value: number, at: number, sessionId: number | null) => {
    have.set(id, Math.max(have.get(id) ?? 0, value));
    const need = BADGES.find((b) => b.id === id)!.need;
    if (value >= need && !earned.has(id)) earned.set(id, { at, sessionId });
  };

  const perSession = new Map<number, { stars: number; fixed: number }>();
  const addStars = (sessionId: number | null, stars: number, fixed: number) => {
    if (sessionId === null) return;
    const cur = perSession.get(sessionId) ?? { stars: 0, fixed: 0 };
    perSession.set(sessionId, { stars: cur.stars + stars, fixed: cur.fixed + fixed });
  };

  const review = new Map<string, { missed: boolean; streak: number; mastered: boolean }>();
  const rightNoHint = new Map<FocusArea, Set<string>>(Object.keys(FOCUS_AREAS).map((k) => [k as FocusArea, new Set<string>()]));
  const challengeRight = new Set<string>();
  const years = new Set<number>();
  const runInSession = new Map<number, number>();
  const days = new Set<string>();
  let fixedTotal = 0;
  let starsTotal = 0;
  const seen: Answer[] = [];
  let bestPaper: number | null = null;
  const personalBests = new Map<number, { score: number; previous: number }>();
  let finished = 0;
  const today = dayKey(now, timeZone);
  const monday = mondayOf(today);
  let weekStars = 0;

  for (const ev of events) {
    if (ev.kind === "answer") {
      const a = ev.a;
      const sid = a.sessionId;
      seen.push(a);
      // Stars: one per right answer, two extra for each past mistake fixed for good.
      let fixedNow = 0;
      const r = review.get(a.questionId) ?? { missed: false, streak: 0, mastered: false };
      if (!a.correct) review.set(a.questionId, { missed: true, streak: 0, mastered: false });
      else if (r.missed && !r.mastered) {
        const streak = a.hintUsed ? 0 : r.streak + 1;
        const mastered = streak >= 2;
        if (mastered) fixedNow = 1;
        review.set(a.questionId, { missed: true, streak, mastered });
      }
      const stars = (a.correct ? 1 : 0) + fixedNow * FIX_BONUS;
      starsTotal += stars;
      if (dayKey(a.answeredAt, timeZone) >= monday) weekStars += stars;
      fixedTotal += fixedNow;
      addStars(sid, stars, fixedNow);

      // Practice days and streaks.
      const day = dayKey(a.answeredAt, timeZone);
      if (!days.has(day)) {
        days.add(day);
        let run = 1;
        while (days.has(addDays(day, -run))) run++;
        bump("streak-3", run, a.answeredAt, sid);
        bump("streak-7", run, a.answeredAt, sid);
      }

      years.add(a.year);
      bump("time-traveller", years.size, a.answeredAt, sid);
      if (a.correct && a.tier === "challenge") {
        challengeRight.add(a.questionId);
        bump("challenge-5", challengeRight.size, a.answeredAt, sid);
      }
      if (a.correct && a.part === "B") bump("oly-first-b", 1, a.answeredAt, sid);
      if (a.correct && !a.hintUsed) {
        const set = rightNoHint.get(a.primary)!;
        set.add(a.questionId);
        bump(`area-${a.primary}` as BadgeId, set.size, a.answeredAt, sid);
      }
      if (fixedNow) bump("fixer", fixedTotal, a.answeredAt, sid);
      if (sid !== null) {
        const run = a.correct ? (runInSession.get(sid) ?? 0) + 1 : 0;
        runInSession.set(sid, run);
        bump("on-a-roll", run, a.answeredAt, sid);
      }
    } else {
      const s = ev.s;
      finished++;
      bump("first-quiz", finished, s.endedAt, s.id);
      if (s.mode === "paper" && s.score !== null) {
        const mine = seen.filter((a) => a.sessionId === s.id);
        if (mine.length >= s.questions && mine.every((a) => !a.blank)) bump("no-skip", 1, s.endedAt, s.id);
      }
      if (s.mode === "paper" && s.score !== null && s.contest === "olympiad") {
        bump("oly-first-paper", 1, s.endedAt, s.id);
        if (s.cutoff != null && s.score >= s.cutoff) bump("oly-cutoff", 1, s.endedAt, s.id);
      } else if (s.mode === "paper" && s.score !== null) {
        bump("first-paper", 1, s.endedAt, s.id);
        bump("score-80", s.score, s.endedAt, s.id);
        bump("score-100", s.score, s.endedAt, s.id);
        if (bestPaper !== null && s.score > bestPaper) personalBests.set(s.id, { score: s.score, previous: bestPaper });
        bestPaper = Math.max(bestPaper ?? s.score, s.score);
      }
      if (!earned.has("ready")) {
        // Per contest: a Kangaroo area and an Olympiad area are different skills.
        const ready = (["kangaroo", "olympiad"] as const).some((c) => scoreAreas(seen.filter((a) => (a.contest ?? "kangaroo") === c), s.endedAt).some((x) => x.level === "competition-ready"));
        if (ready) bump("ready", 1, s.endedAt, s.id);
      }
    }
  }

  const badges: Badge[] = BADGES.map((b) => {
    const e = earned.get(b.id);
    return {
      id: b.id,
      name: b.name,
      description: b.description,
      earnedAt: e?.at ?? null,
      sessionId: e?.sessionId ?? null,
      have: Math.min(have.get(b.id) ?? 0, b.need),
      need: b.need,
    };
  });

  // Streaks and this week, counted in home days.
  let current = 0;
  const start = days.has(today) ? today : addDays(today, -1); // yesterday still keeps the streak alive
  while (days.has(addDays(start, -current))) current++;
  let best = 0;
  for (const d of days) {
    if (days.has(addDays(d, -1))) continue; // only count from the first day of each run
    let n = 1;
    while (days.has(addDays(d, n))) n++;
    best = Math.max(best, n);
  }
  const week: WeekDay[] = Array.from({ length: 7 }, (_, i) => {
    const date = addDays(monday, i);
    return { date, practised: days.has(date), today: date === today };
  });

  const bySession = new Map<number, SessionRewards>();
  for (const s of sessions) {
    const st = perSession.get(s.id) ?? { stars: 0, fixed: 0 };
    bySession.set(s.id, {
      stars: st.stars,
      fixed: st.fixed,
      newBadges: badges.filter((b) => b.sessionId === s.id),
      personalBest: personalBests.get(s.id) ?? null,
    });
  }

  return {
    rewards: {
      stars: { total: starsTotal, thisWeek: weekStars },
      streak: { current, best, practisedToday: days.has(today) },
      week: { goal: WEEK_GOAL, practisedDays: week.filter((d) => d.practised).length, days: week },
      badges,
      bestPaper,
    },
    bySession,
  };
}
