import { useState } from "react";

/** A worked solution shown one step at a time, so the student can try the next bit first. */
export function Steps({ steps, startOpen = 1, all = false }: { steps: string[]; startOpen?: number; all?: boolean }) {
  const [shown, setShown] = useState(all ? steps.length : Math.min(startOpen, steps.length));
  const done = shown >= steps.length;
  return (
    <div className="steps">
      <ol>
        {steps.slice(0, shown).map((s, i) => (
          <li key={i}>
            <span className="step-num" aria-hidden="true">
              {i + 1}
            </span>
            <span>{s}</span>
          </li>
        ))}
      </ol>
      {!done && (
        <div className="row">
          <button type="button" className="btn small" onClick={() => setShown((n) => n + 1)}>
            Show step {shown + 1} of {steps.length}
          </button>
          <button type="button" className="btn quiet" onClick={() => setShown(steps.length)}>
            Show all steps
          </button>
        </div>
      )}
    </div>
  );
}
