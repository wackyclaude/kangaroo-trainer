import { useEffect, useState } from "react";
import { CHOICES, type SessionResults, type SessionState } from "../../shared/types";
import { api, messageOf } from "../api";
import { go, modeLabel } from "../format";
import { readable } from "../components/Olympiad";

/** A letter, a typed B-answer, "blank", or nothing yet. */
type Pick = string | null;

/** Typing in the answers of a paper done on paper. Every question needs a letter or "blank". */
export function AnswerSheet({ sessionId }: { sessionId: number }) {
  const [s, setS] = useState<SessionState | null>(null);
  const [picks, setPicks] = useState<Map<number, Pick>>(new Map());
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.get<SessionState>(`/api/sessions/${sessionId}`).then(
      (st) => {
        if (st.endedAt) return go(`#/results/${sessionId}`);
        setS(st);
      },
      (e) => setError(messageOf(e)),
    );
  }, [sessionId]);

  if (error && !s) return <div className="message" role="alert">{error}</div>;
  if (!s) return <div aria-busy="true" />;

  const oly = s.contest === "olympiad";
  const name = (q: { position: number; label: string }) => (oly ? q.label : String(q.position));
  const missing = s.questions.filter((q) => !picks.get(q.position)?.trim()).map(name);
  const unclear = s.questions.filter((q) => q.part === "B" && picks.get(q.position) && picks.get(q.position) !== "blank" && readable(picks.get(q.position)!) !== "ok").map(name);
  const set = (pos: number, v: Pick) => setPicks((m) => new Map(m).set(pos, m.get(pos) === v ? null : v));

  const save = async () => {
    if (missing.length) return setError(`Still to fill in: question ${missing.join(", ")}. Pick "blank" for questions left empty.`);
    if (unclear.length) return setError(`Please check question ${unclear.join(", ")}: use digits, / for fractions, √, π and commas.`);
    setBusy(true);
    setError("");
    try {
      await api.post<SessionResults>(`/api/sessions/${s.id}/paper-answers`, {
        answers: s.questions.map((q) => {
          const p = picks.get(q.position);
          return { position: q.position, choice: p === "blank" || !p ? null : p.trim() };
        }),
      });
      go(`#/results/${s.id}`);
    } catch (e) {
      setError(messageOf(e));
      setBusy(false);
    }
  };

  return (
    <div className="stack" style={{ gap: 24 }}>
      <div>
        <button type="button" className="btn quiet" onClick={() => go(`#/print/${s.id}`)}>
          ← Back to the printable paper
        </button>
        <h1>Answer sheet</h1>
        <p className="muted">
          {modeLabel({ mode: s.mode, paperYear: s.paperYear, contest: s.contest })}. Copy the {oly ? "letters and the written answers" : "circled letters"} from the paper. Times aren't recorded for
          paper practice.
        </p>
      </div>
      <ol className="sheet-entry" style={{ ["--rows" as string]: Math.ceil(s.questions.length / 2) }}>
        {s.questions.map((q) => (
          <li key={q.position} className="sheet-line">
            <span className="sheet-num">{name(q)}</span>
            {q.part === "B" ? (
              <div className="sheet-choices">
                <input
                  className="sheet-typed"
                  aria-label={`Question ${name(q)} answer`}
                  value={picks.get(q.position) === "blank" ? "" : (picks.get(q.position) ?? "")}
                  maxLength={80}
                  autoComplete="off"
                  onChange={(e) => setPicks((m) => new Map(m).set(q.position, e.target.value))}
                />
                <button type="button" aria-pressed={picks.get(q.position) === "blank"} className="sheet-choice blank" onClick={() => set(q.position, "blank")}>
                  blank
                </button>
              </div>
            ) : (
            <div className="sheet-choices" role="radiogroup" aria-label={`Question ${name(q)}`}>
              {CHOICES.map((c) => (
                <button key={c} type="button" role="radio" aria-checked={picks.get(q.position) === c} className="sheet-choice" onClick={() => set(q.position, c)}>
                  {c}
                </button>
              ))}
              <button type="button" role="radio" aria-checked={picks.get(q.position) === "blank"} className="sheet-choice blank" onClick={() => set(q.position, "blank")}>
                blank
              </button>
            </div>
            )}
          </li>
        ))}
      </ol>
      {error && <div className="message" role="alert">{error}</div>}
      <div className="row">
        <button type="button" className="btn primary big" disabled={busy} onClick={save}>
          Save and see the score
        </button>
        <span className="muted">
          {s.questions.length - missing.length} of {s.questions.length} filled in
        </span>
      </div>
    </div>
  );
}
