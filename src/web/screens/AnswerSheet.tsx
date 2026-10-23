import { useEffect, useState } from "react";
import { CHOICES, type Choice, type SessionResults, type SessionState } from "../../shared/types";
import { api, messageOf } from "../api";
import { go, modeLabel } from "../format";

type Pick = Choice | "blank" | null;

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

  const missing = s.questions.filter((q) => !picks.get(q.position)).map((q) => q.position);
  const set = (pos: number, v: Pick) => setPicks((m) => new Map(m).set(pos, m.get(pos) === v ? null : v));

  const save = async () => {
    if (missing.length) return setError(`Still to fill in: question ${missing.join(", ")}. Pick "blank" for questions left empty.`);
    setBusy(true);
    setError("");
    try {
      await api.post<SessionResults>(`/api/sessions/${s.id}/paper-answers`, {
        answers: s.questions.map((q) => {
          const p = picks.get(q.position);
          return { position: q.position, choice: p === "blank" ? null : p };
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
          {modeLabel({ mode: s.mode, paperYear: s.paperYear })}. Copy the circled letters from the paper. Times aren't recorded for paper practice.
        </p>
      </div>
      <ol className="sheet-entry" style={{ ["--rows" as string]: Math.ceil(s.questions.length / 2) }}>
        {s.questions.map((q) => (
          <li key={q.position} className="sheet-line">
            <span className="sheet-num">{q.position}</span>
            <div className="sheet-choices" role="radiogroup" aria-label={`Question ${q.position}`}>
              {CHOICES.map((c) => (
                <button key={c} type="button" role="radio" aria-checked={picks.get(q.position) === c} className="sheet-choice" onClick={() => set(q.position, c)}>
                  {c}
                </button>
              ))}
              <button type="button" role="radio" aria-checked={picks.get(q.position) === "blank"} className="sheet-choice blank" onClick={() => set(q.position, "blank")}>
                blank
              </button>
            </div>
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
