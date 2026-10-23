interface Option<T extends string> {
  value: T;
  label: string;
}

export function Segmented<T extends string>({ label, options, value, onChange }: { label: string; options: Option<T>[]; value: T; onChange: (v: T) => void }) {
  return (
    <div className="segmented" role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button key={o.value} type="button" role="radio" aria-checked={o.value === value} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Chips<T extends string>({ label, options, values, onChange, colorOf }: { label: string; options: Option<T>[]; values: T[]; onChange: (v: T[]) => void; colorOf?: (v: T) => string }) {
  const toggle = (v: T) => onChange(values.includes(v) ? values.filter((x) => x !== v) : [...values, v]);
  return (
    <div className="chip-row" role="group" aria-label={label}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          className="pick-chip"
          aria-pressed={values.includes(o.value)}
          style={colorOf ? { ["--chip" as string]: colorOf(o.value) } : undefined}
          onClick={() => toggle(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
