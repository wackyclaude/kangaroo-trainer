import { useEffect, useState } from "react";
import type { Insights, Me, Readiness, Rewards, SessionListItem } from "../../shared/types";
import { api } from "../api";
import { focusName, go, modeLabel } from "../format";
import { TileIcon } from "../components/Art";
import { Mascot } from "../components/Mascot";
import { useContest, withContest } from "../contest";
import { loadQuick, startQuick } from "../quick";

interface Open {
  id: number;
  contest?: string;
  mode: string;
  paperYear: number | null;
  delivery?: string;
}

/** Home: one clear next step (Play), one line on how she's doing, and three other ways to practise. */
export function StudentHome({ me }: { me: Me }) {
  const [contest] = useContest();
  const oly = contest === "olympiad";
  const [open, setOpen] = useState<Open | null>(null);
  const [recent, setRecent] = useState<SessionListItem[]>([]);
  const [ins, setIns] = useState<Insights | null>(null);
  const [rewards, setRewards] = useState<Rewards | null>(null);
  const [ready, setReady] = useState<Readiness | null>(null);
  const [replies, setReplies] = useState(0);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.get<Open | null>("/api/sessions-open").then(setOpen, () => undefined);
    api.get<{ unseenReplies: number }>("/api/feedback/summary").then((x) => setReplies(x.unseenReplies), () => undefined);
    api.get<Rewards>("/api/rewards").then(setRewards, () => undefined);
  }, []);
  useEffect(() => {
    setIns(null);
    setReady(null);
    api.get<SessionListItem[]>(withContest("/api/sessions?limit=6", contest)).then(setRecent, () => undefined);
    api.get<Insights>(withContest("/api/insights", contest)).then(setIns, () => undefined);
    api.get<Readiness>(withContest("/api/readiness", contest)).then(setReady, () => undefined);
  }, [contest]);

  const prefs = loadQuick(me.id, "smart");
  const play = async () => {
    setBusy(true);
    try {
      go(`#/quiz/${await startQuick("smart", prefs, contest)}`);
    } catch {
      // Something to sort out first (for example no questions left at this level): the setup screen explains.
      go("#/smart");
    }
  };

  const due = ins?.mistakes.due ?? 0;
  const waiting = ins?.mistakes.waiting ?? 0;
  const waitingPapers = recent.filter((r) => !r.endedAt && r.delivery === "paper");
  const carryOn = open && open.delivery !== "paper" ? open : null;
  const doneToday = rewards?.streak.practisedToday ?? false;
  const areas = ins && ins.totals.answers > 0 ? ins.weakAreas.map((w) => focusName(w.focus).toLowerCase()).join(" and ") : "";
  const c = ready?.contest;
  const streak = rewards?.streak.current ?? 0;

  return (
    <div className="home">
      <section className="home-hero">
        <Mascot mood={doneToday ? "cheer" : "wave"} size={88} />
        <h1>{doneToday ? `Nice work today, ${me.nickname}. One more?` : `Hi ${me.nickname}. Ready for ${prefs.count}?`}</h1>
        <p className="muted">
          {areas ? `Today's mix: ${areas}.` : "Questions picked for you."} About {Math.round(prefs.count * 1.25)} minutes.
        </p>
        <button type="button" className="btn primary play" disabled={busy} onClick={() => void play()}>
          Play
          <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
            <path d="M7 4l12 8-12 8z" />
          </svg>
        </button>
        <button type="button" className="btn quiet" onClick={() => go("#/smart")}>
          Change
        </button>
        {(c || rewards) && (
          <p className="home-facts">
            {c?.phase === "countdown" && (
              <span>
                {c.daysLeft} day{c.daysLeft === 1 ? "" : "s"} to go
              </span>
            )}
            {ready && <span className="fact-good">{ready.percent}% ready</span>}
            {streak > 0 && (
              <span>
                {streak} day{streak === 1 ? "" : "s"} in a row
              </span>
            )}
          </p>
        )}
      </section>

      {(carryOn || replies > 0 || waitingPapers.length > 0) && (
        <div className="home-notices">
          {carryOn && (
            <button type="button" className="notice" onClick={() => go(`#/quiz/${carryOn.id}`)}>
              <strong>Carry on</strong>
              <span className="muted">{modeLabel({ mode: carryOn.mode, paperYear: carryOn.paperYear, contest: carryOn.contest })} is still open</span>
              <span aria-hidden="true">→</span>
            </button>
          )}
          {replies > 0 && (
            <button type="button" className="notice" onClick={() => go("#/feedback")}>
              <strong>Your parent replied</strong>
              <span className="muted">{replies === 1 ? "1 new reply" : `${replies} new replies`}</span>
              <span aria-hidden="true">→</span>
            </button>
          )}
          {waitingPapers.map((w) => (
            <button key={w.id} type="button" className="notice" onClick={() => go(`#/answer-sheet/${w.id}`)}>
              <strong>Type in your paper answers</strong>
              <span className="muted">{modeLabel({ mode: w.mode, paperYear: w.paperYear, questions: w.questions, contest: w.contest })}</span>
              <span aria-hidden="true">→</span>
            </button>
          ))}
        </div>
      )}

      <section className="home-modes" aria-label="Other ways to practise">
        <button type="button" className="mode" onClick={() => go("#/mistakes")}>
          <TileIcon kind="mistakes" size={40} />
          <span>
            <strong>Fix mistakes</strong>
            <span className="muted">{due ? `${due} waiting` : waiting ? "None due today" : "All clear"}</span>
          </span>
        </button>
        <button type="button" className="mode" onClick={() => go("#/focus")}>
          <TileIcon kind="focus" size={40} />
          <span>
            <strong>Pick a topic</strong>
            <span className="muted">You choose</span>
          </span>
        </button>
        <button type="button" className="mode" onClick={() => go("#/paper")}>
          <TileIcon kind="paper" size={40} />
          <span>
            <strong>Full paper</strong>
            <span className="muted">{oly ? "8 + 4 questions" : "24 questions, 50 min"}</span>
          </span>
        </button>
      </section>
    </div>
  );
}
