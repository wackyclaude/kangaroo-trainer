import { useEffect, useState } from "react";
import type { Insights, Me, Readiness, Rewards, SessionListItem } from "../../shared/types";
import { api } from "../api";
import { focusColor, focusName, go, modeLabel, when } from "../format";
import { LevelSteps } from "../components/AreaBars";
import { Explorer } from "./Explorer";
import { BadgeMedal, TileIcon } from "../components/Art";
import { MascotSays, type Mood } from "../components/Mascot";
import { RewardStrip } from "../components/RewardStrip";
import { Countdown, ReadinessCard } from "../components/Readiness";
import { ContestSwitch } from "../components/ContestSwitch";
import { LookPicker } from "../components/LookPicker";
import { useContest, withContest } from "../contest";

/** What Roo says on the home screen. Encouraging, never about other children. */
function greeting(me: Me, ins: Insights | null, r: Rewards | null): { mood: Mood; text: string } {
  if (!ins || ins.totals.answers === 0) return { mood: "wave", text: `Hi ${me.nickname}, I'm Roo! Pick anything below to start. I'll keep track of what you get right, and bring back the tricky ones later.` };
  if (r && r.streak.current >= 2 && !r.streak.practisedToday) return { mood: "wave", text: `Hi ${me.nickname}! You've practised ${r.streak.current} days in a row. One quiz today keeps the streak going.` };
  if (r && r.streak.practisedToday) return { mood: "cheer", text: `Nice work today, ${me.nickname}! Fancy one more? Smart mix picks the questions for you.` };
  const weak = ins.weakAreas[0];
  if (weak) return { mood: "think", text: `Hi ${me.nickname}! Want to try a few ${focusName(weak.focus).toLowerCase()} questions today? That's where you'll grow the most.` };
  return { mood: "wave", text: `Hi ${me.nickname}, ready to jump in?` };
}

interface Open {
  id: number;
  contest?: string;
  mode: string;
  paperYear: number | null;
  delivery?: string;
}

export function StudentHome({ me }: { me: Me }) {
  const [contest, setContest, contests] = useContest();
  const oly = contest === "olympiad";
  const [open, setOpen] = useState<Open | null>(null);
  const [recent, setRecent] = useState<SessionListItem[]>([]);
  const [ins, setIns] = useState<Insights | null>(null);
  const [browse, setBrowse] = useState(false);
  const [rewards, setRewards] = useState<Rewards | null>(null);
  const [ready, setReady] = useState<Readiness | null>(null);

  useEffect(() => {
    api.get<Open | null>("/api/sessions-open").then(setOpen, () => undefined);
    api.get<Rewards>("/api/rewards").then(setRewards, () => undefined);
  }, []);
  useEffect(() => {
    setIns(null);
    setReady(null);
    api.get<SessionListItem[]>(withContest("/api/sessions?limit=6", contest)).then(setRecent, () => undefined);
    api.get<Insights>(withContest("/api/insights", contest)).then(setIns, () => undefined);
    api.get<Readiness>(withContest("/api/readiness", contest)).then(setReady, () => undefined);
  }, [contest]);

  const finished = recent.filter((r) => r.endedAt);
  const due = ins?.mistakes.due ?? 0;
  const waiting = ins?.mistakes.waiting ?? 0;
  const waitingPapers = recent.filter((r) => !r.endedAt && r.delivery === "paper");
  const carryOn = open && open.delivery !== "paper" ? open : null;

  return (
    <div className="home-layout">
      <div className="home-greet">
        <h1 className="visually-hidden">Hi {me.nickname}</h1>
        <MascotSays mood={greeting(me, ins, rewards).mood} size={104}>
          <p>{greeting(me, ins, rewards).text}</p>
        </MascotSays>
      </div>
      {ready && (
        <aside className="home-side stack" aria-label="Contest countdown and readiness">
          <Countdown r={ready} />
          <ReadinessCard r={ready} />
        </aside>
      )}
      <div className="home-main stack" style={{ gap: 32 }}>
      {contests.length > 1 && <ContestSwitch value={contest} onChange={setContest} options={contests} />}
      {rewards && <RewardStrip r={rewards} />}

      {carryOn && (
        <button type="button" className="panel tile carry-on" onClick={() => go(`#/quiz/${carryOn.id}`)}>
          <span className="big">Carry on where you stopped</span>
          <span className="muted">{modeLabel({ mode: carryOn.mode, paperYear: carryOn.paperYear, contest: carryOn.contest })} is still open.</span>
        </button>
      )}
      {waitingPapers.map((w) => (
        <button key={w.id} type="button" className="panel tile carry-on" onClick={() => go(`#/answer-sheet/${w.id}`)}>
          <span className="big">Type in your paper answers</span>
          <span className="muted">{modeLabel({ mode: w.mode, paperYear: w.paperYear, questions: w.questions, contest: w.contest })} was printed {when(w.startedAt)}. Copy your answers in so they count.</span>
        </button>
      ))}

      <div className="home-grid">
        <button type="button" className="panel tile go-tile" onClick={() => go("#/smart")}>
          <span className="tile-icon">
            <TileIcon kind="smart" />
          </span>
          <span className="big">Smart mix</span>
          <span className="muted">
            {ins && ins.totals.answers > 0
              ? `12 questions picked for you, mostly ${ins.weakAreas.map((w) => focusName(w.focus).toLowerCase()).join(" and ")}.`
              : "12 questions picked for you from your weakest areas."}
          </span>
        </button>
        <button type="button" className="panel tile go-tile" onClick={() => go("#/mistakes")}>
          <span className="tile-icon">
            <TileIcon kind="mistakes" />
          </span>
          <span className="big">Fix my mistakes</span>
          <span className="muted">
            {due ? `${due} question${due === 1 ? "" : "s"} ready to try again.` : waiting ? `None due today, ${waiting} coming back later.` : "Missed questions come back here."}
          </span>
        </button>
        <button type="button" className="panel tile go-tile" onClick={() => go("#/paper")}>
          <span className="tile-icon">
            <TileIcon kind="paper" />
          </span>
          <span className="big">{oly ? "Full Olympiad paper" : "Full past paper"}</span>
          <span className="muted">{oly ? "8 + 4 real questions, 120 minutes, compared with that year's cutoff." : "24 real questions, 50 minutes, just like the contest."}</span>
        </button>
        <button type="button" className="panel tile go-tile" onClick={() => go("#/focus")}>
          <span className="tile-icon">
            <TileIcon kind="focus" />
          </span>
          <span className="big">Focus quiz</span>
          <span className="muted">Pick a topic and practise a handful of questions.</span>
        </button>
      </div>

      {ins && ins.totals.answers > 0 && (
        <button type="button" className="panel tile progress-tile" onClick={() => go("#/progress")}>
          <span className="big">My progress</span>
          <span className="mini-areas">
            {ins.areas.map((a) => (
              <span key={a.focus} className="mini-area">
                <span className="area-dot" style={{ background: focusColor(a.focus) }} aria-hidden="true" />
                <span>{focusName(a.focus)}</span>
                <LevelSteps level={a.level} />
              </span>
            ))}
          </span>
          {ins.estimate && <span className="muted">Contest score estimate: about {ins.estimate.score} out of 120.</span>}
          {ins.olympiad?.pace && (
            <span className="muted">
              Cutoff pace over your last {ins.olympiad.pace.questions} questions: {Math.round(ins.olympiad.pace.relative * 100)}%, like about {ins.olympiad.pace.fullPaper} of 36.
            </span>
          )}
        </button>
      )}

      {rewards && (
        <button type="button" className="panel tile badges-tile" onClick={() => go("#/badges")}>
          <span className="big">My badges</span>
          <span className="medal-row" aria-hidden="true">
            {rewards.badges
              .filter((b) => b.earnedAt)
              .sort((a, b) => b.earnedAt! - a.earnedAt!)
              .slice(0, 6)
              .map((b) => (
                <BadgeMedal key={b.id} id={b.id} earned size={44} />
              ))}
          </span>
          <span className="muted">
            {rewards.badges.filter((b) => b.earnedAt).length} of {rewards.badges.length} earned
            {(() => {
              const next = rewards.badges.filter((b) => !b.earnedAt && b.need > 1 && b.have > 0).sort((a, b) => b.have / b.need - a.have / a.need)[0];
              return next ? ` · next: ${next.name} (${next.have}/${next.need})` : "";
            })()}
          </span>
        </button>
      )}

      {finished.length > 0 && (
        <section className="stack">
          <h2>Recently</h2>
          <ul className="recent">
            {finished.map((r) => (
              <li key={r.id}>
                <button type="button" className="recent-row" onClick={() => go(`#/results/${r.id}`)}>
                  <span>{modeLabel(r)}</span>
                  <span className="muted">{when(r.startedAt)}</span>
                  <strong>
                    {r.score} / {r.maxScore}
                  </strong>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <LookPicker />

      <section>
        {browse ? (
          <Explorer />
        ) : (
          <button type="button" className="btn quiet" onClick={() => setBrowse(true)}>
            Browse all the questions
          </button>
        )}
      </section>
      </div>
    </div>
  );
}
