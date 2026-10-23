import { useEffect, useState } from "react";

const COLORS = ["#FFC23D", "#3D7BFF", "#2BB673", "#E8467C", "#9B6BFF", "#FFA45C"];

/** A small, short burst of confetti. Hidden for people who prefer reduced motion (see styles.css). */
export function Confetti({ pieces = 28 }: { pieces?: number }) {
  const [on, setOn] = useState(true);
  useEffect(() => {
    const t = window.setTimeout(() => setOn(false), 2600);
    return () => window.clearTimeout(t);
  }, []);
  if (!on) return null;
  return (
    <div className="confetti" aria-hidden="true">
      {Array.from({ length: pieces }, (_, i) => (
        <span
          key={i}
          style={{
            left: `${(i * 37) % 100}%`,
            background: COLORS[i % COLORS.length],
            animationDelay: `${(i % 7) * 70}ms`,
            animationDuration: `${1500 + ((i * 53) % 900)}ms`,
            transform: `rotate(${(i * 47) % 360}deg)`,
          }}
        />
      ))}
    </div>
  );
}
