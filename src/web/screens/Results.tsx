import { useEffect, useState } from "react";
import type { PaperBenchmark, ResultRow, SessionResults } from "../../shared/types";
import { fmtAverage } from "../../shared/benchmarks";
import { api, messageOf } from "../api";
import { duration, focusColor, focusName, go, modeLabel } from "../format";
import { Steps } from "../components/Steps";
import { BadgeMedal } from "../components/Art";
import { Confetti } from "../components/Confetti";
import { MascotSays } from "../components/Mascot";
import { paceLine, RevealBlock } from "../components/Olympiad";

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

  useEffect(() => {
    api.get<SessionResults>(`/api/sessions/${sessionId}/results`).then(setR, (e) => setError(messageOf(e)));
  }, [sessionId]);

  if (error) return <div className="message" role="alert">{error}</div>;
  if (!r) return <div aria-busy="true" />;

  const title = modeLabel({ mode: r.mode, paperYear: r.paperYear, contest: r.contest });
  const oly = r.contest === "olympiad";
  const onPaper = r.delivery === "paper";
  const wentWell = r.rows.filter((x) => x.correct && !x.voided);

  return (
    <div className="stack" style={{ gap: 28 }}>
      <section className="score-hero">
        <div className="score-sticker" aria-hidden="true">
          <span className="score-num">{r.score}</span>
          <span className="score-max">/ {r.maxScore}</span>
        </div>
        <div>
          <p className="muted" style={{ margin: 0 }}>
            {title} · {r.delivery === "paper" ? "done on paper" : `${r.help} mode`}
          </p>
          <h1 style={{ marginBottom: 8 }}>{verdict(r)}</h1>
          <p style={{ margin: 0 }}>
            <strong>{r.correct}</strong> right · <strong>{r.wrong}</strong> wrong · <strong>{r.blank}</strong> skipped{onPaper ? "" : ` · ${duration(r.totalTimeMs)}`}
          </p>
          <p className="visually-hidden">
            Score {r.score} out of {r.maxScore}
          </p>
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

      {r.rewards && (
        <section className="panel reward-panel">
          {r.rewards.personalBest && <Confetti />}
          <MascotSays mood={r.rewards.personalBest || r.rewards.newBadges.length ? "cheer" : r.rewards.stars ? "wave" : "calm"} size={88} role="status">
            {r.rewards.personalBest && (
              <p className="big">
                New personal best: {r.rewards.personalBest.score}, up from {r.rewards.personalBest.previous}!
              </p>
            )}
            <p>
              {r.rewards.stars > 0 ? (
                <>
                  You earned <strong>{r.rewards.stars}</strong> star{r.rewards.stars === 1 ? "" : "s"}
                  {r.rewards.fixed > 0 ? `, with 2 extra for each of the ${r.rewards.fixed} old mistake${r.rewards.fixed === 1 ? "" : "s"} you fixed for good` : ""}.
                </>
              ) : (
                "No stars this time, but every question you try makes the next one easier."
              )}
            </p>
            {r.rewards.newBadges.length > 0 && <p>{r.rewards.newBadges.length === 1 ? "And a new badge:" : `And ${r.rewards.newBadges.length} new badges:`}</p>}
          </MascotSays>
          {r.rewards.newBadges.length > 0 && (
            <ul className="new-badges">
              {r.rewards.newBadges.map((b) => (
                <li key={b.id}>
                  <BadgeMedal id={b.id} earned size={56} />
                  <span>
                    <strong>{b.name}</strong>
                    <span className="muted small-line">{b.description}</span>
                  </span>
                </li>
              ))}
            </ul>
          )}
          <button type="button" className="btn quiet" onClick={() => go("#/badges")}>
            See all my badges
          </button>
        </section>
      )}

      {wentWell.length > 0 && (
        <p>
          <strong>What went well:</strong> you got {wentWell.length} right, including{" "}
          {[...new Set(wentWell.map((x) => focusName(x.focusPrimary)))].slice(0, 2).join(" and ").toLowerCase()} questions.
        </p>
      )}

      {r.practiseNext.length > 0 && (
        <section className="panel stack">
          <h2>Practise next</h2>
          <p className="muted">The areas where this {r.mode === "paper" ? "paper" : "quiz"} had the most misses. My progress shows the weak areas over all your practice.</p>
          <div className="row">
            {r.practiseNext.map((p) => (
              <span key={p.focus} className="chip" style={{ "--c": focusColor(p.focus) } as React.CSSProperties}>
                {focusName(p.focus)} · {p.missed} of {p.of}
              </span>
            ))}
          </div>
          <div>
            <button type="button" className="btn primary" onClick={() => go(`#/focus?f=${r.practiseNext.map((p) => p.focus).join(",")}`)}>
              Make a focus quiz
            </button>
          </div>
        </section>
      )}

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
                    {r.mode !== "paper" ? `${row.year} ${oly ? row.label : `Q${row.number}`} · ` : ""}
                    {row.choice ? `You said ${row.choice}` : "Skipped"} · answer {row.answer}
                    {oly ? ` · ${row.earned}/${row.points} pts` : ""}
                  </span>
                </span>
                <span className="r-time">{onPaper ? "" : duration(row.timeMs)}</span>
              </button>
              {open === row.position && <Detail row={row} oly={oly} />}
            </li>
          ))}
        </ol>
      </section>

      <div className="row">
        <button type="button" className="btn primary" onClick={() => go("#/")}>
          Back home
        </button>
        {r.mode === "paper" && (
          <button type="button" className="btn" onClick={() => go("#/paper")}>
            Another paper
          </button>
        )}
        <button type="button" className="btn" onClick={() => go("#/progress")}>
          My progress
        </button>
      </div>
    </div>
  );
}

function rowClass(r: ResultRow) {
  if (r.voided) return "voided";
  if (r.correct) return "good";
  return r.choice === null ? "skip" : "bad";
}

function Detail({ row, oly }: { row: ResultRow; oly: boolean }) {
  if (oly) {
    return (
      <div className="result-detail panel">
        <img className="q-image" src={row.imageUrl} alt={`Question ${row.label}`} />
        <p style={{ marginTop: 12 }}>
          <strong>Answer: {row.answer}</strong>
          {row.hintUsed ? " · you used a hint" : ""}
        </p>
        <RevealBlock reveal={{ note: row.note, officialUrl: row.officialUrl, stats: row.stats, level: row.level }} steps={row.steps} label={`${row.year} ${row.label}`} year={row.year} />
      </div>
    );
  }
  return (
    <div className="result-detail panel">
      {row.voided && <div className="message">The organisers cancelled this question because of a mistake in the drawing, so everyone gets the points.</div>}
      <img className="q-image" src={row.imageUrl} alt={`Question ${row.number}`} />
      <p style={{ marginTop: 12 }}>
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
    </div>
  );
}

/** A Kangaroo full paper next to how real entrants scored on it that year. */
function VsEntrants({ b, score }: { b: PaperBenchmark; score: number }) {
  const at = (x: number) => `${(Math.max(0, Math.min(120, x)) / 120) * 100}%`;
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
        In {b.year}, {b.entrants.toLocaleString("en-GB")} pupils in {b.groupName} did this paper in the real contest (50 minutes, first time seeing it)
        {b.highest !== null ? `. The top score was ${b.highest}` : ""}. A paper you've seen before, or did without the clock, will usually score higher.
      </p>
    </section>
  );
}
