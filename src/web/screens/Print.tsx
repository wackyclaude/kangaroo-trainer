import { useEffect, useState } from "react";
import { CHOICES, SCORING, type Me, type PaperKeyRow, type SessionState } from "../../shared/types";
import { api, messageOf } from "../api";
import { go, modeLabel } from "../format";

/** A printable paper: the questions, an A–E answer sheet, and (for the parent) the answer key. Saved as PDF from the print dialog. */
export function Print({ sessionId, me }: { sessionId: number; me: Me }) {
  const [s, setS] = useState<SessionState | null>(null);
  const [key, setKey] = useState<PaperKeyRow[] | null>(null);
  const [withKey, setWithKey] = useState(true);
  const [error, setError] = useState("");
  const [loaded, setLoaded] = useState(0);
  const [waited, setWaited] = useState(false);

  // Never block printing for long if a picture doesn't report back.
  useEffect(() => {
    const t = window.setTimeout(() => setWaited(true), 8000);
    return () => window.clearTimeout(t);
  }, []);

  useEffect(() => {
    api.get<SessionState>(`/api/sessions/${sessionId}`).then(setS, (e) => setError(messageOf(e)));
    if (me.role === "parent") api.get<PaperKeyRow[]>(`/api/sessions/${sessionId}/key`).then(setKey, () => undefined);
  }, [sessionId, me.role]);

  if (error) return <div className="message" role="alert">{error}</div>;
  if (!s) return <div aria-busy="true" />;

  const title = modeLabel({ mode: s.mode, paperYear: s.paperYear, contest: s.contest });
  const oly = s.contest === "olympiad";
  const n = s.questions.length;
  const ready = loaded >= n || waited;
  const isPaperYear = s.mode === "paper";

  return (
    <div className="print-page">
      <div className="no-print stack" style={{ marginBottom: 24 }}>
        <div>
          <button type="button" className="btn quiet" onClick={() => go("#/")}>
            ← Back
          </button>
          <h1>Print: {title}</h1>
          <p className="muted">
            Press Print, then choose "Save as PDF" or a printer. On the iPad: Share → Print, then pinch the preview outwards to get a PDF.
            {s.endedAt ? "" : " When the paper is done, type the answers in so they count."}
          </p>
        </div>
        {key && (
          <label className="toggle">
            <input type="checkbox" checked={withKey} onChange={(e) => setWithKey(e.target.checked)} />
            <span>Add the answer key as the last page (for you, not the student)</span>
          </label>
        )}
        <div className="row">
          <button type="button" className="btn primary" disabled={!ready} onClick={() => window.print()}>
            {ready ? "Print / Save as PDF" : `Loading pictures… ${loaded}/${n}`}
          </button>
          {!s.endedAt && (
            <button type="button" className="btn" onClick={() => go(`#/answer-sheet/${s.id}`)}>
              Type in the answers
            </button>
          )}
        </div>
      </div>

      <header className="print-head">
        <div>
          <strong className="print-title">{oly ? "Olympiad round 1" : "wizSMART"} · {title}</strong>
          <div className="print-sub">
            {oly
              ? `${n} questions${isPaperYear ? ", 120 minutes" : ""}, no calculator. A-questions: 2 points, B-questions: 5 points for the exact answer. Wrong or blank = 0.`
              : `${n} questions${isPaperYear ? ", 50 minutes" : ""}, no calculator. Right = ${SCORING.correct} points, blank = ${SCORING.blank}, wrong = ${SCORING.wrong}.`}
          </div>
        </div>
        <div className="print-name">
          Name: ____________________ &nbsp; Date: ____________
        </div>
      </header>

      <ol className="print-questions">
        {s.questions.map((q) => (
          <li key={q.position} className="print-q">
            {/* A full paper keeps the numbers printed in the pictures. A quiz numbers its own questions. */}
            {!isPaperYear && (
              <div className="print-q-label">
                Question {q.position} <span className="print-q-src">({q.year} {oly ? q.label : `Q${q.number}`} — the number in the picture)</span>
              </div>
            )}
            <img src={q.imageUrl} alt={`Question ${q.position}`} onLoad={() => setLoaded((x) => x + 1)} onError={() => setLoaded((x) => x + 1)} />
          </li>
        ))}
      </ol>

      <section className="print-sheet">
        <h2>Answer sheet · {title}</h2>
        <p>Name: ____________________ &nbsp; Date: ____________</p>
        <p>
          {oly
            ? "A-questions: circle one letter. B-questions: write the exact, simplified answer in the box."
            : `Circle one letter for each question. Leave it empty if you don't know: a blank still scores ${SCORING.blank} point.`}
        </p>
        <ol className="sheet-cols">
          {s.questions.map((q) => (
            <li key={q.position}>
              <span className="sheet-n">{oly && isPaperYear ? q.label : q.position}</span>
              {q.part === "B" ? (
                <span className="write-box" />
              ) : (
                CHOICES.map((c) => (
                  <span key={c} className="bubble">
                    {c}
                  </span>
                ))
              )}
            </li>
          ))}
        </ol>
      </section>

      {key && withKey && (
        <section className="print-key">
          <h2>Answer key (parent)</h2>
          <ol className="key-cols">
            {key.map((k) => (
              <li key={k.position}>
                <span className="sheet-n">{oly && isPaperYear ? k.label : k.position}</span> <strong>{k.voided ? "any" : k.answer}</strong>
                {!isPaperYear && (
                  <span className="print-q-src">
                    {" "}
                    {k.year} {oly ? k.label : `Q${k.number}`}
                  </span>
                )}
              </li>
            ))}
          </ol>
          {key.some((k) => k.voided) && <p className="print-q-src">"any": the organisers cancelled this question, so every answer scores.</p>}
        </section>
      )}
    </div>
  );
}
