import type { Rewards } from "../../shared/types";

const DAY_LETTERS = ["M", "T", "W", "T", "F", "S", "S"];

/** Streak, stars and this week's practice days. No comparison with anyone else. */
export function RewardStrip({ r }: { r: Rewards }) {
  const left = Math.max(0, r.week.goal - r.week.practisedDays);
  return (
    <div className="reward-strip">
      <div className="reward-stat">
        <span className="reward-icon" aria-hidden="true">
          <svg viewBox="0 0 32 32" width="34" height="34">
            <path d="M16 29 q-10 -3 -9 -13 q1 -6 6 -10 q0 6 4 7 q-1 -7 4 -11 q9 8 6 18 q-2 7 -11 9 z" fill={r.streak.current > 0 ? "#FFA45C" : "var(--paper)"} stroke="var(--ink)" strokeWidth="2.5" strokeLinejoin="round" />
          </svg>
        </span>
        <span>
          <strong className="reward-num">{r.streak.current}</strong> day{r.streak.current === 1 ? "" : "s"} in a row
          <span className="muted small-line">
            {r.streak.current === 0
              ? "Practise today to start a streak."
              : r.streak.practisedToday
                ? `Best ever: ${r.streak.best}.`
                : "Practise today to keep it going!"}
          </span>
        </span>
      </div>
      <div className="reward-stat">
        <span className="reward-icon" aria-hidden="true">
          <svg viewBox="0 0 32 32" width="34" height="34">
            <path d="M16 3 L20 12 L29 13 L22 19 L24 28 L16 23 L8 28 L10 19 L3 13 L12 12 Z" fill="#FFC23D" stroke="var(--ink)" strokeWidth="2.5" strokeLinejoin="round" />
          </svg>
        </span>
        <span>
          <strong className="reward-num">{r.stars.thisWeek}</strong> star{r.stars.thisWeek === 1 ? "" : "s"} this week
          <span className="muted small-line">{r.stars.total} in total</span>
        </span>
      </div>
      <div className="reward-stat week">
        <ol className="week-dots" aria-label={`This week: practised on ${r.week.practisedDays} of ${r.week.goal} days`}>
          {r.week.days.map((d, i) => (
            <li key={d.date} className={`${d.practised ? "done" : ""}${d.today ? " today" : ""}`} aria-hidden="true">
              {DAY_LETTERS[i]}
            </li>
          ))}
        </ol>
        <span className="muted small-line">
          {left === 0 ? `Week goal reached: ${r.week.goal} days. Brilliant!` : `${left} more day${left === 1 ? "" : "s"} for this week's goal of ${r.week.goal}.`}
        </span>
      </div>
    </div>
  );
}
