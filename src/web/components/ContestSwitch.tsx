import { CONTEST_NAMES, type Contest } from "../../shared/types";

const LINE: Record<Contest, string> = { kangaroo: "Kangaroo · groep 7–8", brain: "Kangaroo · klas 1–2", olympiad: "Round 1 · January" };

/** wizSMART, wizBRAIN or Olympiad: everything below follows this choice. */
export function ContestSwitch({ value, onChange, options, compact = false }: { value: Contest; onChange: (c: Contest) => void; options: Contest[]; compact?: boolean }) {
  return (
    <div className={`contest-switch${compact ? " compact" : ""}`} role="radiogroup" aria-label="Contest">
      {options.map((c) => (
        <button key={c} type="button" role="radio" aria-checked={c === value} className={`contest-opt ${c}`} onClick={() => onChange(c)}>
          <span className="contest-name">{CONTEST_NAMES[c]}</span>
          {!compact && <span className="contest-line">{LINE[c]}</span>}
        </button>
      ))}
    </div>
  );
}
