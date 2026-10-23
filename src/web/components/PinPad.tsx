import { useEffect, useState } from "react";

interface Props {
  length: number; // exact length, or the minimum when `maxLength` is set
  maxLength?: number;
  busy?: boolean;
  shakeKey?: number; // change it to shake the dots after a wrong PIN
  onSubmit: (pin: string) => void;
}

/** Big, calculator-style keypad. Also works with a hardware keyboard. */
export function PinPad({ length, maxLength, busy, shakeKey, onSubmit }: Props) {
  const [pin, setPin] = useState("");
  const max = maxLength ?? length;
  const auto = maxLength === undefined;

  useEffect(() => setPin(""), [shakeKey]);

  const press = (d: string) => {
    if (busy) return;
    setPin((p) => {
      if (p.length >= max) return p;
      const next = p + d;
      if (auto && next.length === length) setTimeout(() => onSubmit(next), 120);
      return next;
    });
  };
  const back = () => setPin((p) => p.slice(0, -1));

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (/^\d$/.test(e.key)) press(e.key);
      else if (e.key === "Backspace") back();
      else if (e.key === "Enter" && !auto && pin.length >= length) onSubmit(pin);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const dots = Array.from({ length: Math.max(max === length ? length : pin.length, length) });
  return (
    <div className="pin-wrap">
      <div className={`pin-dots${shakeKey ? " shake" : ""}`} key={shakeKey} role="status" aria-label={`${pin.length} digits typed`}>
        {dots.map((_, i) => (
          <span key={i} className={`pin-dot${i < pin.length ? " on" : ""}`} />
        ))}
      </div>
      <div className="pin-pad">
        {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((d) => (
          <button key={d} type="button" className="key" onClick={() => press(d)} disabled={busy}>
            {d}
          </button>
        ))}
        <button type="button" className="key fn" onClick={back} aria-label="Delete last digit">
          ⌫
        </button>
        <button type="button" className="key" onClick={() => press("0")} disabled={busy}>
          0
        </button>
        {auto ? (
          <span />
        ) : (
          <button type="button" className="key fn" onClick={() => onSubmit(pin)} disabled={busy || pin.length < length} aria-label="Done">
            OK
          </button>
        )}
      </div>
    </div>
  );
}
