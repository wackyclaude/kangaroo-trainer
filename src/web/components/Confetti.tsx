import { useEffect, useState } from "react";
import { useSkin } from "../skin";

const COLORS = ["#FFC23D", "#3D7BFF", "#2BB673", "#E8467C", "#9B6BFF", "#FFA45C"];
// Space: a shower of stars.
const STARS = ["#FFD166", "#FFFFFF", "#8F9BFF", "#7FE0C4"];
// Modern: thin streamers in the student's own colours.
const STREAMERS = ["var(--sun)", "var(--accent-2)", "var(--sun-deep)", "var(--ink)"];

/** A small, short burst of confetti. Hidden for people who prefer reduced motion (see styles.css). */
export function Confetti({ pieces = 28 }: { pieces?: number }) {
  const skin = useSkin();
  const [on, setOn] = useState(true);
  useEffect(() => {
    const t = window.setTimeout(() => setOn(false), 2600);
    return () => window.clearTimeout(t);
  }, []);
  if (!on) return null;
  const colours = skin === "space" ? STARS : skin === "modern" ? STREAMERS : COLORS;
  return (
    <div className="confetti" aria-hidden="true">
      {Array.from({ length: pieces }, (_, i) => (
        <span
          key={i}
          style={{
            left: `${(i * 37) % 100}%`,
            background: colours[i % colours.length],
            animationDelay: `${(i % 7) * 70}ms`,
            animationDuration: `${1500 + ((i * 53) % 900)}ms`,
            transform: `rotate(${(i * 47) % 360}deg)`,
          }}
        />
      ))}
    </div>
  );
}
