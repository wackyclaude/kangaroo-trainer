import { useEffect, useState } from "react";
import { TIERS, type Insights, type Rewards, type SpeedFlag } from "../../shared/types";
import { api, messageOf } from "../api";
import { AreaBars } from "../components/AreaBars";
import { RewardStrip } from "../components/RewardStrip";
import { MascotSays } from "../components/Mascot";
import { focusColor, focusName, go, minutes, when } from "../format";

const TIER_NAME = { "warm-up": "Warm-up", core: "Core", challenge: "Challenge" } as const;

/** My progress (student) or a student's progress (parent). */
export function Progress({ profileId, asParent }: { profileId?: number; asParent?: boolean }) {
  const [ins, setIns] = useState<Insights | null>(null);
  const [error, setError] = useState("");
  const [rewards, setRewards] = useState<Rewards | null>(null);

  useEffect(() => {
    api.get<Insights>(profileId ? `/api/insights/${profileId}` : "/api/insights").then(setIns, (e) => setError(messageOf(e)));
    if (asParent && profileId) api.get<Rewards>(`/api/rewards/${profileId}`).then(setRewards, () => undefined);
  }, [profileId, asParent]);

  if (error) return <div className="message" role="alert">{error}</div>;
  if (!ins) return <div aria-busy="true" />;

  const weak = ins.weakAreas.map((w) => w.focus);
  const nothingYet = ins.totals.answers === 0;
  const m = ins.mistakes;

  return (
    <div className="stack" style={{ gap: 28 }}>
      <div>
        <button type="button" className="btn quiet" onClick={() => go("#/")}>
          ← Back
        </button>
        <h1>{asParent ? `${ins.avatar} ${ins.nickname}'s progress` : "My progress"}</h1>
        {nothingYet ? (
          <MascotSays mood="sleep" size={80}>
            <p>Nothing to show yet. Levels appear here as questions get answered.</p>
          </MascotSays>
        ) : (
          <p className="muted">{`${ins.totals.answers} answers in ${ins.totals.sessions} finished quiz${ins.totals.sessions === 1 ? "" : "zes"} so far.`}</p>
        )}
      </div>

      {rewards && (
        <section className="stack">
          <RewardStrip r={rewards} />
          <p className="muted">
            Badges: {rewards.badges.filter((b) => b.earnedAt).length} of {rewards.badges.length}
            {rewards.badges.some((b) => b.earnedAt) ? ` (${rewards.badges.filter((b) => b.earnedAt).map((b) => b.name).join(", ")})` : ""}.
          </p>
        </section>
      )}

      <div className="stat-row">
        <div className="panel stat">
          <span className="stat-label">Contest score estimate</span>
          {ins.estimate ? (
            <>
              <span className="stat-num">
                {ins.estimate.score}
                <small> / 120</small>
              </span>
              <span className="muted">
                Likely {ins.estimate.low}–{ins.estimate.high}, from the last {ins.estimate.papers === 1 ? "paper" : `${ins.estimate.papers} papers`}
              </span>
            </>
          ) : (
            <span className="muted">Do a full past paper to get an estimate.</span>
          )}
        </div>
        <div className="panel stat">
          <span className="stat-label">Mistakes to fix</span>
          <span className="stat-num">{m.due}</span>
          <span className="muted">
            {m.due ? "ready now" : m.waiting ? `next one ${when(m.nextDueAt!)}` : "none waiting"}
            {m.waiting ? ` · ${m.waiting} coming back later` : ""} · {m.mastered} mastered
          </span>
          {!asParent && (m.due > 0 || m.waiting > 0) && (
            <button type="button" className="btn primary small" onClick={() => go("#/mistakes")}>
              Fix my mistakes
            </button>
          )}
        </div>
      </div>

      <section className="panel stack">
        <h2>Focus areas</h2>
        <p className="muted" style={{ margin: 0 }}>
          Each bar shows how many of the last 30 answers in that area were right. Harder questions and recent answers count more. The two marks are at 60% (Solid) and 80% (Competition-ready).
        </p>
        <AreaBars areas={ins.areas} weak={weak} />
      </section>

      <section className="panel stack">
        <h2>Practise next</h2>
        <div className="row">
          {ins.weakAreas.map((w) => (
            <span key={w.focus} className="chip" style={{ "--c": focusColor(w.focus) } as React.CSSProperties}>
              {focusName(w.focus)}
              {w.reason === "new" ? " · not tried much yet" : ""}
            </span>
          ))}
        </div>
        <p className="muted" style={{ margin: 0 }}>
          Smart mix picks about 60% of its questions from these areas, 30% at the {TIER_NAME[ins.tierTarget].toLowerCase()} level (the easiest level that isn't 70% right yet), and 10% from past mistakes.
        </p>
        {!asParent && (
          <div className="row">
            <button type="button" className="btn primary" onClick={() => go("#/smart")}>
              Start a Smart mix
            </button>
            <button type="button" className="btn" onClick={() => go(`#/focus?f=${weak.join(",")}`)}>
              Focus quiz on these
            </button>
          </div>
        )}
      </section>

      {!nothingYet && (
        <section className="panel stack">
          <h2>Speed</h2>
          <p className="muted" style={{ margin: 0 }}>
            Middle time per question (half the answers were quicker). In the contest there are about 2 minutes per question.
          </p>
          <table className="people">
            <thead>
              <tr>
                <th scope="col">Level</th>
                <th scope="col">Middle time</th>
                <th scope="col">Answers timed</th>
              </tr>
            </thead>
            <tbody>
              {TIERS.map((t) => {
                const row = ins.speed.byTier.find((r) => r.tier === t)!;
                return (
                  <tr key={t}>
                    <td>{TIER_NAME[t]}</td>
                    <td>{minutes(row.medianMs)}</td>
                    <td>{row.answers}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {asParent && <Flags title="Very quick wrong answers (possible guessing)" note="Under 20 seconds on a core or challenge question." items={ins.speed.guesses} />}
          {asParent && <Flags title="Right, but slow (needs fluency)" note="Over 3 minutes." items={ins.speed.slow} />}
        </section>
      )}
    </div>
  );
}

function Flags({ title, note, items }: { title: string; note: string; items: SpeedFlag[] }) {
  return (
    <div className="stack" style={{ gap: 6 }}>
      <h3 style={{ margin: 0 }}>{title}</h3>
      {items.length === 0 ? (
        <p className="muted" style={{ margin: 0 }}>
          None recently.
        </p>
      ) : (
        <>
          <p className="muted" style={{ margin: 0 }}>
            {note} Most recent first.
          </p>
          <ul className="flag-list">
            {items.map((f) => (
              <li key={`${f.questionId}-${f.at}`}>
                <span className="chip" style={{ "--c": focusColor(f.focus) } as React.CSSProperties}>
                  {focusName(f.focus)}
                </span>{" "}
                {f.year} Q{f.number} · {minutes(f.timeMs)} · <span className="muted">{when(f.at)}</span>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
