import { CONTEST_NAMES, type Contest } from "../../shared/types";

const LINE: Record<Contest, string> = { kangaroo: "wizSMART · March", olympiad: "Round 1 · January" };

/** Kangaroo or Olympiad: everything below follows this choice. */
export function ContestSwitch({ value, onChange, options }: { value: Contest; onChange: (c: Contest) => void; options: Contest[] }) {
  return (
    <div className="contest-switch" role="radiogroup" aria-label="Contest">
      {options.map((c) => (
        <button key={c} type="button" role="radio" aria-checked={c === value} className={`contest-opt ${c}`} onClick={() => onChange(c)}>
          <span className="contest-name">{CONTEST_NAMES[c]}</span>
          <span className="contest-line">{LINE[c]}</span>
        </button>
      ))}
    </div>
  );
}
