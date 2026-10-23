import { describe, expect, it } from "vitest";
import type { Answer } from "../src/server/insights/model.js";
import { addDays, dayKey, mondayOf, replayRewards, type FinishedSession } from "../src/server/rewards/model.js";
import type { FocusArea, Tier } from "../src/shared/types.js";

const TZ = "Europe/Amsterdam";
const H = 3_600_000;
// Monday 19 Oct 2026, 15:00 in Amsterdam (13:00 UTC).
const NOW = Date.UTC(2026, 9, 19, 13);

let n = 0;
function ans(p: Partial<Answer> = {}): Answer {
  n++;
  return {
    questionId: p.questionId ?? `q${n}`,
    year: p.year ?? 2020,
    number: n,
    tier: (p.tier ?? "core") as Tier,
    primary: (p.primary ?? "NUM") as FocusArea,
    secondary: null,
    correct: p.correct ?? true,
    blank: p.blank ?? false,
    hintUsed: p.hintUsed ?? false,
    timeMs: 60_000,
    answeredAt: p.answeredAt ?? NOW - 10 * H,
    sessionId: p.sessionId === undefined ? 1 : p.sessionId,
  };
}
const session = (p: Partial<FinishedSession> & { id: number; endedAt: number }): FinishedSession => ({
  mode: "focus",
  startedAt: p.endedAt - H,
  score: null,
  maxScore: null,
  questions: 10,
  ...p,
});

describe("days in the home time zone", () => {
  it("counts a late-evening answer in Amsterdam as that day, not the UTC day", () => {
    // 23:30 local on Sunday 18 Oct = 21:30 UTC.
    expect(dayKey(Date.UTC(2026, 9, 18, 21, 30), TZ)).toBe("2026-10-18");
    // 00:30 local on Monday = 22:30 UTC on Sunday.
    expect(dayKey(Date.UTC(2026, 9, 18, 22, 30), TZ)).toBe("2026-10-19");
  });
  it("does calendar arithmetic across month ends and finds Monday", () => {
    expect(addDays("2026-10-31", 1)).toBe("2026-11-01");
    expect(mondayOf("2026-10-25")).toBe("2026-10-19"); // a Sunday
    expect(mondayOf("2026-10-19")).toBe("2026-10-19");
  });
});

describe("stars", () => {
  it("gives a star per right answer and 2 extra for each mistake fixed for good", () => {
    const q = "fix-me";
    const answers = [
      ans({ questionId: q, correct: false, sessionId: 1, answeredAt: NOW - 50 * H }),
      ans({ questionId: q, correct: true, sessionId: 2, answeredAt: NOW - 30 * H }),
      ans({ questionId: q, correct: true, sessionId: 3, answeredAt: NOW - 5 * H }), // 2nd right in a row: fixed
      ans({ correct: true, sessionId: 3, answeredAt: NOW - 5 * H + 1 }),
    ];
    const sessions = [1, 2, 3].map((id, i) => session({ id, endedAt: NOW - [49, 29, 4][i]! * H }));
    const { rewards, bySession } = replayRewards(answers, sessions, NOW, TZ);
    expect(bySession.get(1)!.stars).toBe(0);
    expect(bySession.get(2)!.stars).toBe(1);
    expect(bySession.get(3)).toMatchObject({ stars: 1 + 2 + 1, fixed: 1 });
    expect(rewards.stars.total).toBe(5);
  });

  it("does not count a fix when the hint was used", () => {
    const q = "hinted";
    const answers = [
      ans({ questionId: q, correct: false, answeredAt: NOW - 50 * H }),
      ans({ questionId: q, correct: true, answeredAt: NOW - 40 * H }),
      ans({ questionId: q, correct: true, hintUsed: true, answeredAt: NOW - 30 * H }),
    ];
    const { bySession } = replayRewards(answers, [session({ id: 1, endedAt: NOW - 29 * H })], NOW, TZ);
    expect(bySession.get(1)!.fixed).toBe(0);
  });
});

describe("streaks and the weekly goal", () => {
  const onDay = (daysAgo: number) => ans({ answeredAt: NOW - daysAgo * 24 * H });

  it("counts days in a row, and yesterday still keeps the streak alive", () => {
    const { rewards } = replayRewards([onDay(1), onDay(2), onDay(3), onDay(6), onDay(7)], [], NOW, TZ);
    expect(rewards.streak).toEqual({ current: 3, best: 3, practisedToday: false });
  });

  it("breaks the streak after a missed day", () => {
    const { rewards } = replayRewards([onDay(2), onDay(3)], [], NOW, TZ);
    expect(rewards.streak.current).toBe(0);
    expect(rewards.streak.best).toBe(2);
  });

  it("earns the 3-day badge in the session that made the third day", () => {
    const answers = [ans({ answeredAt: NOW - 48 * H, sessionId: 1 }), ans({ answeredAt: NOW - 24 * H, sessionId: 2 }), ans({ answeredAt: NOW - H, sessionId: 3 })];
    const sessions = [1, 2, 3].map((id) => session({ id, endedAt: answers[id - 1]!.answeredAt + 1 }));
    const { rewards, bySession } = replayRewards(answers, sessions, NOW, TZ);
    expect(rewards.streak.current).toBe(3);
    expect(bySession.get(3)!.newBadges.map((b) => b.id)).toContain("streak-3");
    expect(bySession.get(2)!.newBadges.map((b) => b.id)).not.toContain("streak-3");
  });

  it("shows this week from Monday, with today marked", () => {
    const { rewards } = replayRewards([ans({ answeredAt: NOW - H }), ans({ answeredAt: NOW - 3 * 24 * H })], [], NOW, TZ);
    expect(rewards.week.days[0]).toEqual({ date: "2026-10-19", practised: true, today: true });
    expect(rewards.week.practisedDays).toBe(1); // last Friday is not this week
    expect(rewards.week.goal).toBe(3);
  });
});

describe("badges", () => {
  it("awards paper badges, a personal best, and keeps progress for the rest", () => {
    const p1 = Array.from({ length: 24 }, (_, i) => ans({ sessionId: 1, correct: i < 14, blank: i >= 22, answeredAt: NOW - 60 * H + i }));
    const p2 = Array.from({ length: 24 }, (_, i) => ans({ sessionId: 2, correct: i < 20, answeredAt: NOW - 20 * H + i }));
    const sessions = [
      session({ id: 1, mode: "paper", endedAt: NOW - 59 * H, score: 72, maxScore: 120, questions: 24 }),
      session({ id: 2, mode: "paper", endedAt: NOW - 19 * H, score: 100, maxScore: 120, questions: 24 }),
    ];
    const { rewards, bySession } = replayRewards([...p1, ...p2], sessions, NOW, TZ);
    const first = bySession.get(1)!;
    const second = bySession.get(2)!;
    expect(first.newBadges.map((b) => b.id)).toEqual(expect.arrayContaining(["first-quiz", "first-paper", "on-a-roll"]));
    expect(first.newBadges.map((b) => b.id)).not.toContain("no-skip"); // 2 skipped
    expect(first.personalBest).toBeNull(); // nothing to beat yet
    expect(second.newBadges.map((b) => b.id)).toEqual(expect.arrayContaining(["no-skip", "score-80", "score-100"]));
    expect(second.personalBest).toEqual({ score: 100, previous: 72 });
    expect(rewards.bestPaper).toBe(100);
    const fixer = rewards.badges.find((b) => b.id === "fixer")!;
    expect(fixer).toMatchObject({ earnedAt: null, have: 0, need: 10 });
  });

  it("counts different questions only for the area badge, and not hinted ones", () => {
    const same = Array.from({ length: 12 }, () => ans({ primary: "SPA", questionId: "same" }));
    const hinted = Array.from({ length: 12 }, () => ans({ primary: "SPA", hintUsed: true }));
    let r = replayRewards([...same, ...hinted], [], NOW, TZ).rewards.badges.find((b) => b.id === "area-SPA")!;
    expect(r.have).toBe(1);
    const ten = Array.from({ length: 10 }, () => ans({ primary: "SPA" }));
    r = replayRewards(ten, [], NOW, TZ).rewards.badges.find((b) => b.id === "area-SPA")!;
    expect(r.earnedAt).not.toBeNull();
  });

  it("breaks 'on a roll' on a wrong or skipped answer", () => {
    const xs = [...Array.from({ length: 9 }, () => ans()), ans({ correct: false, blank: true }), ...Array.from({ length: 9 }, () => ans())];
    xs.forEach((a, i) => (a.answeredAt = NOW - 100 + i));
    const b = replayRewards(xs, [], NOW, TZ).rewards.badges.find((x) => x.id === "on-a-roll")!;
    expect(b).toMatchObject({ earnedAt: null, have: 9 });
  });
});
