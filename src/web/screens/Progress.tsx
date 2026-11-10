import { useEffect, useState } from "react";
import { CONTESTS, OLY_LEVEL_TEXT, TIERS, type Contest, type Insights, type Rewards, type SpeedFlag } from "../../shared/types";
import { fmtAverage } from "../../shared/benchmarks";
import { useContest, withContest } from "../contest";
import { ContestSwitch } from "../components/ContestSwitch";
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
  const [mine, setMine, myContests] = useContest();
  const [parentPick, setParentPick] = useState<Contest>("kangaroo");
  const contest = asParent ? parentPick : mine;
  const [widened, setWidened] = useState("");

  const load = () => api.get<Insights>(withContest(profileId ? `/api/insights/${profileId}` : "/api/insights", contest)).then(setIns, (e) => setError(messageOf(e)));
  useEffect(() => {
    setIns(null);
    void load();
    if (asParent && profileId) api.get<Rewards>(`/api/rewards/${profileId}`).then(setRewards, () => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profileId, asParent, contest]);

  const widen = async (to: number) => {
    if (!profileId) return;
    try {
      await api.put(`/api/profiles/${profileId}/olympiad`, { maxLevel: to });
      setWidened(`Done: ${ins?.nickname ?? "the student"} now gets questions up to level ${to}.`);
      void load();
    } catch (e) {
      setError(messageOf(e));
    }
  };

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
        {asParent ? (
          <ContestSwitch value={parentPick} onChange={setParentPick} options={[...CONTESTS]} />
        ) : (
          myContests.length > 1 && <ContestSwitch value={mine} onChange={setMine} options={myContests} />
        )}
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

      {ins.olympiad?.suggestWiden && asParent && (
        <div className="message ok stack" role="status">
          <span>
            {ins.nickname} got {ins.olympiad.suggestWiden.right} of the last {ins.olympiad.suggestWiden.of} level-{ins.olympiad.suggestWiden.to - 1} questions right. Ready for level {ins.olympiad.suggestWiden.to} ({OLY_LEVEL_TEXT[ins.olympiad.suggestWiden.to]})?
          </span>
          <div>
            <button type="button" className="btn primary small" onClick={() => widen(ins.olympiad!.suggestWiden!.to)}>
              Add level {ins.olympiad.suggestWiden.to}
            </button>
          </div>
        </div>
      )}
      {widened && (
        <div className="message ok" role="status">
          {widened}
        </div>
      )}

      <div className="stat-row">
        <div className="panel stat">
          <span className="stat-label">{ins.contest === "olympiad" ? "Cutoff pace (last 60 questions)" : "Contest score estimate"}</span>
          {ins.contest === "olympiad" ? (
            ins.olympiad?.pace ? (
              <>
                <span className="stat-num">
                  {Math.round(ins.olympiad.pace.relative * 100)}
                  <small>%</small>
                </span>
                <span className="muted">
                  Like about {ins.olympiad.pace.fullPaper} of 36 on a full paper · {ins.olympiad.pace.points} points where cutoff pace is {ins.olympiad.pace.pace}
                  {ins.olympiad.pace.rough ? " · rough, fewer than 12 questions" : ""}
                </span>
              </>
            ) : (
              <span className="muted">Answer 6 Olympiad questions to see this.</span>
            )
          ) : ins.estimate ? (
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

      {ins.vsAverage && ins.vsAverage.papers.length > 0 && (
        <section className="panel stack" aria-labelledby="vs-avg-h">
          <h2 id="vs-avg-h">Full papers vs real {ins.vsAverage.groupName} entrants</h2>
          <p className="muted" style={{ margin: 0 }}>
            Each paper next to the average {ins.vsAverage.groupName} score in the real contest that year. The line marks the average; the bar is {asParent ? `${ins.nickname}'s` : "your"} score.
          </p>
          <ul className="vs-list">
            {[...ins.vsAverage.papers].reverse().map((p) => (
              <li key={p.sessionId}>
                <button type="button" className="vs-row" onClick={() => go(`#/results/${p.sessionId}`)}>
                  <span className="vs-row-head">
                    <span>{p.year} paper</span>
                    <span className="muted">{when(p.at)}</span>
                    <strong>
                      {p.score} vs {fmtAverage(p.average)} · {Math.abs(p.diff) < 0.5 ? "on average" : `${fmtAverage(Math.abs(p.diff))} ${p.diff > 0 ? "above" : "below"}`}
                    </strong>
                  </span>
                  <span className="vs-scale small" aria-hidden="true">
                    <span className="cutoff-fill" style={{ width: `${(p.score / 120) * 100}%` }} />
                    <span className="vs-mark main" style={{ left: `${(p.average / 120) * 100}%` }} />
                  </span>
                </button>
              </li>
            ))}
          </ul>
          <p className="muted small-line" style={{ margin: 0 }}>
            Source: W4Kangoeroe's yearly reports. The real contest is 50 minutes on a paper nobody has seen, so a redo or untimed paper usually scores higher.
          </p>
        </section>
      )}

      {ins.olympiad && ins.olympiad.papers.length > 0 && (
        <section className="panel stack">
          <h2>Full papers against the cutoff</h2>
          <ul className="recent">
            {[...ins.olympiad.papers].reverse().map((p) => (
              <li key={p.sessionId}>
                <button type="button" className="recent-row" onClick={() => go(`#/results/${p.sessionId}`)}>
                  <span>{p.year} paper</span>
                  <span className="muted">{when(p.at)}</span>
                  <strong>
                    {p.score} / 36 · {p.score >= p.cutoff ? `${p.score - p.cutoff} above` : `${p.cutoff - p.score} below`} the cutoff ({p.cutoff})
                  </strong>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {ins.olympiad && (
        <section className="panel stack">
          <h2>By level</h2>
          <p className="muted" style={{ margin: 0 }}>
            Right answers over the last 20 questions at each level. Level 1: {OLY_LEVEL_TEXT[1]} got it right; level 5: {OLY_LEVEL_TEXT[5]}.
          </p>
          <table className="people">
            <thead>
              <tr>
                <th scope="col">Level</th>
                <th scope="col">Right</th>
              </tr>
            </thead>
            <tbody>
              {ins.olympiad.levels.map((l) => (
                <tr key={l.level}>
                  <td>Level {l.level}</td>
                  <td>{l.answers ? `${l.right} of ${l.answers}` : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

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
            Middle time per question (half the answers were quicker).{" "}
            {ins.contest === "olympiad" ? "In Olympiad round 1 there are 10 minutes per question on average; B-problems take longer." : "In the contest there are about 2 minutes per question."}
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
