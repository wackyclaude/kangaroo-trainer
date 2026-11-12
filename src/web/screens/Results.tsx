import { useContext, useEffect, useState } from "react";
import type { PaperBenchmark, ResultRow, SessionResults } from "../../shared/types";
import { fmtAverage } from "../../shared/benchmarks";
import { api, messageOf } from "../api";
import { duration, focusColor, focusName, go, modeLabel } from "../format";
import { Steps } from "../components/Steps";
import { BadgeMedal } from "../components/Art";
import { Confetti } from "../components/Confetti";
import { MeContext } from "../contest";
import { loadQuick, startQuick } from "../quick";
import { paceLine, RevealBlock } from "../components/Olympiad";
import { PupilStrip } from "../components/PupilStrip";
import { QuestionFeedback } from "../components/Feedback";

function verdict(r: SessionResults): string {
  if (r.cutoff) {
    if (r.cutoff.diff >= 0) return `You reached the ${r.cutoff.year} cutoff!`;
    if (r.cutoff.diff >= -4) return "So close to the cutoff!";
    return "Every Olympiad paper makes the next one easier.";
  }
  if (r.pace) {
    if (r.pace.relative >= 1.2) return "Brilliant work!";
    if (r.pace.relative >= 0.9) return "Right on cutoff pace!";
    if (r.pace.relative >= 0.6) return "Good going, keep it up!";
    return "Every mistake is something new to learn.";
  }
  const pct = r.score / r.maxScore;
  if (pct >= 0.85) return "Brilliant work!";
  if (pct >= 0.65) return "Great effort!";
  if (pct >= 0.45) return "Good going, keep it up!";
  return "Every mistake is something new to learn.";
}

export function Results({ sessionId }: { sessionId: number }) {
  const [r, setR] = useState<SessionResults | null>(null);
  const [open, setOpen] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [listOpen, setListOpen] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const me = useContext(MeContext);
  const student = me?.role === "student";

  useEffect(() => {
    api.get<SessionResults>(`/api/sessions/${sessionId}/results`).then(setR, (e) => setError(messageOf(e)));
  }, [sessionId]);

  if (error) return <div className="message" role="alert">{error}</div>;
  if (!r) return <div aria-busy="true" />;

  const title = modeLabel({ mode: r.mode, paperYear: r.paperYear, contest: r.contest });
  const oly = r.contest === "olympiad";
  const onPaper = r.delivery === "paper";
  const inPoints = oly || r.mode === "paper";
  const missed = r.rows.filter((x) => !x.correct && !x.voided).length;
  const showList = listOpen ?? (!student || r.help === "test" || r.mode === "paper");
  const rw = r.rewards;

  const again = async (mode: "smart" | "mistakes") => {
    setBusy(true);
    try {
      go(`#/quiz/${await startQuick(mode, loadQuick(me?.id ?? 0, mode), r.contest)}`);
    } catch {
      go(mode === "smart" ? "#/smart" : "#/mistakes");
    }
  };

  return (
    <div className="stack page-stack">
      <section className="result-hero">
        {rw?.personalBest && <Confetti />}
        <p className="eyebrow">
          {title} · {onPaper ? "done on paper" : duration(r.totalTimeMs)}
        </p>
        <h1>{inPoints ? `${r.score} out of ${r.maxScore} points` : `${r.correct} out of ${r.rows.length}`}</h1>
        <p className="lead">{verdict(r)}</p>
        <div className="q-track big" role="img" aria-label={`${r.correct} right, ${r.wrong} wrong, ${r.blank} skipped`}>
          {r.rows.map((row) => (
            <span key={row.position} className={row.voided || row.correct ? "right" : row.choice === null ? "skip" : "wrong"} />
          ))}
        </div>
        {rw && (
          <p className="muted" role="status">
            {rw.personalBest ? `New personal best: ${rw.personalBest.score}, up from ${rw.personalBest.previous}! ` : ""}
            {rw.stars > 0 ? `You earned ${rw.stars} star${rw.stars === 1 ? "" : "s"}.` : "Every question you try makes the next one easier."}
          </p>
        )}
        {rw && rw.newBadges.length > 0 && (
          <ul className="new-badges">
            {rw.newBadges.map((b) => (
              <li key={b.id}>
                <BadgeMedal id={b.id} earned size={56} />
                <span>
                  <strong>New badge: {b.name}</strong>
                  <span className="muted small-line">{b.description}</span>
                </span>
              </li>
            ))}
          </ul>
        )}
        {student ? (
          missed > 0 ? (
            <button type="button" className="btn primary play" disabled={busy} onClick={() => void again("mistakes")}>
              Fix my mistakes
            </button>
          ) : (
            <button type="button" className="btn primary play" disabled={busy} onClick={() => void again("smart")}>
              Play again
            </button>
          )
        ) : (
          <button type="button" className="btn primary" onClick={() => go("#/")}>
            Back
          </button>
        )}
        <div className="row hero-links">
          <button type="button" className="btn quiet" aria-expanded={showList} onClick={() => setListOpen(!showList)}>
            {showList ? "Hide the questions" : "See all questions"}
          </button>
          {student && (
            <button type="button" className="btn quiet" onClick={() => go("#/")}>
              Done for today
            </button>
          )}
        </div>
      </section>

      {r.cutoff && (
        <section className="panel stack cutoff-panel" aria-labelledby="cutoff-h">
          <h2 id="cutoff-h">Compared with the real contest</h2>
          <p className="big">
            {r.score} points:{" "}
            {r.cutoff.diff === 0 ? `exactly the ${r.cutoff.year} cutoff` : `${Math.abs(r.cutoff.diff)} ${r.cutoff.diff > 0 ? "above" : "below"} the ${r.cutoff.year} cutoff`} ({r.cutoff.cutoff}).
          </p>
          <div className="cutoff-scale" aria-hidden="true">
            <span className="cutoff-fill" style={{ width: `${(r.score / r.maxScore) * 100}%` }} />
            <span className="cutoff-mark" style={{ left: `${(r.cutoff.cutoff / r.maxScore) * 100}%` }} />
          </div>
          <p>
            That's better than <strong>{r.cutoff.betterThan}%</strong> of the klas 1–3 students who did this paper in {r.cutoff.year}.
          </p>
          {r.cutoff.target !== r.cutoff.cutoff && (
            <p className="muted small-line">
              Your target for this paper: {r.cutoff.target} ({r.cutoff.target > r.cutoff.cutoff ? `${r.cutoff.target - r.cutoff.cutoff} above` : `${r.cutoff.cutoff - r.cutoff.target} below`} the cutoff).
            </p>
          )}
        </section>
      )}

      {r.benchmark && <VsEntrants b={r.benchmark} score={r.score} />}

      {r.pace && (
        <section className="panel stack" aria-labelledby="pace-h">
          <h2 id="pace-h">How that compares</h2>
          <p>{paceLine(r.pace)}.</p>
          <p className="muted small-line">
            The klas-1 average is what a typical klas-1 student scores on exactly these questions. Cutoff pace is roughly what someone who just reaches the cutoff scores on them.
            {r.pace.rough ? " With fewer than 12 questions this is a rough guide." : ""}
          </p>
        </section>
      )}

      {showList && r.practiseNext.length > 0 && (
        <section className="panel stack">
          <h2>Practise next</h2>
          <div className="row">
            {r.practiseNext.map((p) => (
              <span key={p.focus} className="chip" style={{ "--c": focusColor(p.focus) } as React.CSSProperties}>
                {focusName(p.focus)} · {p.missed} of {p.of} missed
              </span>
            ))}
          </div>
          <div>
            <button type="button" className="btn" onClick={() => go(`#/focus?f=${r.practiseNext.map((p) => p.focus).join(",")}`)}>
              Make a focus quiz
            </button>
          </div>
        </section>
      )}

      {showList && (
        <section className="stack">
          <h2>Question by question</h2>
          <ol className="result-list">
            {r.rows.map((row) => (
              <li key={row.position}>
                <button type="button" className={`result-row ${rowClass(row)}`} aria-expanded={open === row.position} onClick={() => setOpen(open === row.position ? null : row.position)}>
                  <span className="r-num">{oly ? row.label : row.position}</span>
                  <span className="r-mark" aria-hidden="true">
                    {row.voided ? "•" : row.correct ? "✓" : row.choice === null ? "–" : "✗"}
                  </span>
                  <span className="r-main">
                    <span className="chip" style={{ "--c": focusColor(row.focusPrimary) } as React.CSSProperties}>
                      {focusName(row.focusPrimary)}
                    </span>
                    <span className="muted">
                      {row.choice ? `You said ${row.choice}` : "Skipped"} · answer {row.answer}
                      {oly ? ` · ${row.earned}/${row.points} pts` : ""}
                    </span>
                  </span>
                  <span className="r-time">{onPaper ? "" : duration(row.timeMs)}</span>
                </button>
                {open === row.position && <Detail row={row} oly={oly} sessionId={sessionId} />}
              </li>
            ))}
          </ol>
        </section>
      )}
    </div>
  );
}

function rowClass(r: ResultRow) {
  if (r.voided) return "voided";
  if (r.correct) return "good";
  return r.choice === null ? "skip" : "bad";
}

function Detail({ row, oly, sessionId }: { row: ResultRow; oly: boolean; sessionId: number }) {
  if (oly) {
    return (
      <div className="result-detail panel">
        <img className="q-image" src={row.imageUrl} alt={`Question ${row.label}`} />
        <p style={{ marginTop: 16 }}>
          <strong>Answer: {row.answer}</strong>
          {row.hintUsed ? " · you used a hint" : ""}
        </p>
        <RevealBlock reveal={{ note: row.note, officialUrl: row.officialUrl, stats: row.stats, level: row.level }} steps={row.steps} label={`${row.year} ${row.label}`} year={row.year} />
        <QuestionFeedback questionId={row.id} sessionId={sessionId} />
      </div>
    );
  }
  return (
    <div className="result-detail panel">
      {row.voided && <div className="message">The organisers cancelled this question because of a mistake in the drawing, so everyone gets the points.</div>}
      <img className="q-image" src={row.imageUrl} alt={`Question ${row.number}`} />
      <p style={{ marginTop: 16 }}>
        <strong>Answer: {row.answer}</strong>
        {row.hintUsed ? " · you used a hint" : ""}
      </p>
      {row.hint && (
        <p>
          <strong>Hint:</strong> {row.hint}
        </p>
      )}
      {row.steps ? (
        <>
          <h3>Worked solution</h3>
          <Steps steps={row.steps} startOpen={1} />
        </>
      ) : (
        <p className="muted">The worked solution for this question is still being written.</p>
      )}
      {!row.voided && <PupilStrip level={row.level} pupils={row.pupils} year={row.year} choice={row.choice} />}
      <QuestionFeedback questionId={row.id} sessionId={sessionId} />
    </div>
  );
}

/** A Kangaroo full paper next to how real entrants scored on it that year. */
function VsEntrants({ b, score }: { b: PaperBenchmark; score: number }) {
  const at = (x: number) => `${(Math.max(0, Math.min(b.max, x)) / b.max) * 100}%`;
  const diff = Math.abs(b.diff);
  return (
    <section className="panel stack cutoff-panel" aria-labelledby="vs-h">
      <h2 id="vs-h">Compared with the real contest</h2>
      <p className="big">
        {score} points:{" "}
        {diff < 0.5 ? `right on the ${b.groupName} average` : `${fmtAverage(diff)} ${b.diff > 0 ? "above" : "below"} the ${b.groupName} average`} ({fmtAverage(b.average)}).
      </p>
      <div className="vs-scale" aria-hidden="true">
        <span className="cutoff-fill" style={{ width: at(score) }} />
        {b.others.map((o) => (
          <span key={o.groupName} className="vs-mark other" style={{ left: at(o.average) }} />
        ))}
        <span className="vs-mark main" style={{ left: at(b.average) }} />
      </div>
      <ul className="vs-legend muted small-line">
        <li>
          <span className="vs-key main" aria-hidden="true" /> {b.groupName} average {fmtAverage(b.average)}
        </li>
        {b.others.map((o) => (
          <li key={o.groupName}>
            <span className="vs-key other" aria-hidden="true" /> {o.groupName} {fmtAverage(o.average)}
          </li>
        ))}
      </ul>
      <p className="muted small-line">
        In {b.year}, {b.entrants.toLocaleString("en-GB")} pupils in {b.groupName} did this paper in the real contest ({b.max === 150 ? 75 : 50} minutes, first time seeing it)
        {b.highest !== null ? `. The top score was ${b.highest}` : ""}. A paper you've seen before, or did without the clock, will usually score higher.
      </p>
    </section>
  );
}
