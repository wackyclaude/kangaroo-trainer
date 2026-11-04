import { useRef, useState } from "react";
import { OLY_LEVEL_TEXT, type ClassStats, type OlyLevel, type Reveal } from "../../shared/types";
import { normalise, parseValue, splitItems } from "../../shared/answers";
import { CLASS_NAMES } from "../format";
import { Steps } from "./Steps";

/** "Klas 1: 42% · klas 2: 47% …", shown only after answering. */
export function StatsStrip({ stats, level, year }: { stats: ClassStats; level: OlyLevel | null; year?: number }) {
  const keys = Object.keys(CLASS_NAMES) as (keyof ClassStats)[];
  return (
    <div className="stats-strip" aria-label={`How students did${year ? ` in ${year}` : ""}`}>
      <span className="stats-title">How others did{year ? ` in ${year}` : ""}:</span>
      <ul>
        {keys.map((k) => (
          <li key={k}>
            <span className="stats-class">{CLASS_NAMES[k]}</span>
            <span className="stats-bar" aria-hidden="true">
              <span style={{ width: `${stats[k]}%` }} />
            </span>
            <strong>{stats[k]}%</strong>
          </li>
        ))}
      </ul>
      {level !== null && (
        <span className="muted small-line">
          Level {level} of 5: {OLY_LEVEL_TEXT[level]} got it right.
        </span>
      )}
    </div>
  );
}

/** The official solution as a picture, closed until tapped. */
export function OfficialSolution({ url, label }: { url: string; label: string }) {
  return (
    <details className="official">
      <summary>Official solution</summary>
      <img className="q-image" src={url} alt={`Official solution for ${label}`} loading="lazy" />
    </details>
  );
}

/** The three layers once a question is graded: my explanation (open), the official solution (closed), the class stats. */
export function RevealBlock({ reveal, steps, label, year }: { reveal: Reveal; steps: string[] | null | undefined; label: string; year?: number }) {
  return (
    <div className="reveal stack">
      {reveal.note && <p className="reveal-note">{reveal.note}</p>}
      {steps && steps.length > 0 ? (
        <div>
          <h3 className="reveal-h">How to work it out</h3>
          <Steps steps={steps} all />
        </div>
      ) : (
        <p className="muted">My explanation for this one is still being written{reveal.officialUrl ? ". The official solution is below." : "."}</p>
      )}
      {reveal.officialUrl && <OfficialSolution url={reveal.officialUrl} label={label} />}
      {reveal.stats && <StatsStrip stats={reveal.stats} level={reveal.level} year={year} />}
    </div>
  );
}

/** Whether a typed answer looks like something the marker can read (numbers, lists, words or a time). The server has the last word. */
export function readable(input: string): "empty" | "ok" | "unclear" {
  const t = normalise(input).replace(/\s*(°|degrees?)$/i, "");
  if (!t) return "empty";
  const one = (item: string, depth: number): boolean => {
    const s = item.trim();
    if (depth > 3 || !s) return false;
    const parts = splitItems(s);
    if (parts.length > 1) return parts.every((p) => one(p, depth + 1));
    const wrapped = /^[({[].*[)}\]]$/.test(s) ? s.slice(1, -1) : null;
    if (wrapped !== null && splitItems(wrapped).length > 1) return one(wrapped, depth + 1);
    return parseValue(s) !== null || /^[\p{L}\s]+$/u.test(s) || /^\d{1,2}[:.]\d{2}([:.]\d{2})?$/.test(s);
  };
  return one(t, 0) ? "ok" : "unclear";
}

const KEYS = ["7", "8", "9", "/", "4", "5", "6", "√", "1", "2", "3", "π", "0", "-", ",", "°", "(", ")", ":", "⌫"] as const;
const KEY_NAMES: Record<string, string> = { "/": "fraction bar", "√": "square root", π: "pi", "-": "minus", ",": "comma (between answers)", "°": "degrees", "(": "open bracket", ")": "close bracket", ":": "colon", "⌫": "delete" };

/** Typing an exact answer: an on-screen maths keypad, with the device keyboard one tap away for words. */
export function MathKeypad({ value, onChange, onSubmit, disabled, unit, submitLabel }: { value: string; onChange: (v: string) => void; onSubmit: () => void; disabled?: boolean; unit: string | null; submitLabel: string }) {
  const [keyboard, setKeyboard] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const state = readable(value);

  const press = (k: string) => {
    const el = input.current;
    const start = el?.selectionStart ?? value.length;
    const end = el?.selectionEnd ?? value.length;
    let next: string;
    let caret: number;
    if (k === "⌫") {
      const from = start === end ? Math.max(0, start - 1) : start;
      next = value.slice(0, from) + value.slice(end);
      caret = from;
    } else {
      const ins = k === "," ? ", " : k;
      next = value.slice(0, start) + ins + value.slice(end);
      caret = start + ins.length;
    }
    onChange(next.slice(0, 80));
    requestAnimationFrame(() => {
      el?.setSelectionRange(caret, caret);
    });
  };

  return (
    <div className="keypad-wrap">
      <label className="field keypad-field">
        <span>Your answer{unit ? ` (in ${unit === "°" ? "degrees" : unit})` : ""}</span>
        <span className="keypad-line">
          <input
            ref={input}
            className="keypad-input"
            value={value}
            inputMode={keyboard ? "text" : "none"}
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="off"
            spellCheck={false}
            maxLength={80}
            disabled={disabled}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && state === "ok") onSubmit();
            }}
            aria-describedby="keypad-help"
          />
          {unit && <span className="keypad-unit">{unit}</span>}
        </span>
      </label>
      <p id="keypad-help" className={`muted small-line keypad-status ${state}`} aria-live="polite">
        {state === "empty"
          ? "Exact answers only: 9/2 or 4½, 2√3, 6π. Several answers? Put commas between them."
          : state === "ok"
            ? "Looks good."
            : "Not a finished answer yet. Use digits, / for a fraction, √, π, and commas between answers."}
      </p>
      <div className="keypad" role="group" aria-label="Maths keypad">
        {KEYS.map((k) => (
          <button key={k} type="button" className={`key${/\d/.test(k) ? " digit" : ""}`} aria-label={KEY_NAMES[k] ?? k} disabled={disabled} onClick={() => press(k)}>
            {k}
          </button>
        ))}
      </div>
      <div className="row">
        <button type="button" className="btn primary" disabled={disabled || state !== "ok"} onClick={onSubmit}>
          {submitLabel}
        </button>
        <button
          type="button"
          className={`icon-btn${keyboard ? " on" : ""}`}
          aria-pressed={keyboard}
          disabled={disabled}
          onClick={() => {
            setKeyboard((v) => !v);
            requestAnimationFrame(() => input.current?.focus());
          }}
        >
          ⌨️ Letters keyboard
        </button>
        {value && (
          <button type="button" className="btn quiet" disabled={disabled} onClick={() => onChange("")}>
            Clear
          </button>
        )}
      </div>
    </div>
  );
}

/** One line per mark on a short quiz, e.g. "125% of cutoff pace, like about 19 of 36". */
export function paceLine(p: { points: number; maxPoints: number; klas1: number; pace: number; relative: number; fullPaper: number }) {
  return `${p.points} of ${p.maxPoints} points · klas-1 average ${fmt(p.klas1)} · cutoff pace ${fmt(p.pace)} · ${Math.round(p.relative * 100)}% of cutoff pace, like about ${p.fullPaper} of 36 on a full paper`;
}
const fmt = (x: number) => (Number.isInteger(x) ? String(x) : x.toFixed(1));
