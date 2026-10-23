import { AreaArt } from "./Art";
import { useState } from "react";
import { LEVEL_NAMES, LEVELS, type AreaInsight, type Level, type TrendPoint } from "../../shared/types";
import { focusColor, focusName, pct } from "../format";

const levelIndex = (l: Level) => LEVELS.indexOf(l);

/** Four steps, filled up to the current level. Shape and words carry the level, not colour. */
export function LevelSteps({ level }: { level: Level }) {
  const n = levelIndex(level) + 1;
  return (
    <span className="level" title={LEVEL_NAMES[level]}>
      <span className="level-steps" aria-hidden="true">
        {LEVELS.map((l, i) => (
          <span key={l} className={i < n ? "on" : ""} />
        ))}
      </span>
      <span className="level-name">{LEVEL_NAMES[level]}</span>
    </span>
  );
}

/** A small trend line of weighted accuracy (0–100%) over the last sessions, with a hover readout. */
export function Sparkline({ points, label }: { points: TrendPoint[]; label: string }) {
  const [hover, setHover] = useState<number | null>(null);
  if (points.length < 2) return <span className="spark-empty muted">Trend after 2 sessions</span>;
  const W = 120;
  const H = 36;
  const pad = 4;
  const x = (i: number) => pad + (i * (W - 2 * pad)) / (points.length - 1);
  const y = (v: number) => H - pad - v * (H - 2 * pad);
  const d = points.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)} ${y(p.accuracy).toFixed(1)}`).join("");
  const last = points[points.length - 1]!;
  const h = hover === null ? null : points[hover]!;
  return (
    <span className="spark">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        width={W}
        height={H}
        role="img"
        aria-label={`${label}: from ${pct(points[0]!.accuracy)} to ${pct(last.accuracy)} over ${points.length} sessions`}
        onPointerMove={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          const i = Math.round(((e.clientX - r.left) / r.width) * (points.length - 1));
          setHover(Math.max(0, Math.min(points.length - 1, i)));
        }}
        onPointerLeave={() => setHover(null)}
      >
        <line x1={pad} x2={W - pad} y1={y(0.6)} y2={y(0.6)} className="spark-ref" />
        <path d={d} className="spark-line" />
        <circle cx={x(points.length - 1)} cy={y(last.accuracy)} r={3.5} className="spark-dot" />
        {h && hover !== null && <circle cx={x(hover)} cy={y(h.accuracy)} r={4} className="spark-hover" />}
      </svg>
      <span className="spark-read muted" aria-hidden="true">
        {h ? `${new Date(h.at).toLocaleDateString([], { day: "numeric", month: "short" })}: ${pct(h.accuracy)}` : ""}
      </span>
    </span>
  );
}

/** One row per focus area: name, a bar for weighted accuracy, the level, the next step and the trend. */
export function AreaBars({ areas, weak }: { areas: AreaInsight[]; weak: string[] }) {
  return (
    <ul className="area-list">
      {areas.map((a) => (
        <li key={a.focus} className={`area-row${weak.includes(a.focus) ? " weak" : ""}`}>
          <div className="area-head">
            <AreaArt area={a.focus} size={36} />
            <strong>{focusName(a.focus)}</strong>
            {weak.includes(a.focus) && <span className="tag">Practise next</span>}
            <span className="spacer" />
            <LevelSteps level={a.level} />
          </div>
          <div className="area-body">
            <div className="bar" role="img" aria-label={`${focusName(a.focus)}: ${pct(a.weightedAccuracy)} right, ${a.attempts} answers counted`}>
              <span className="bar-fill" style={{ width: `${Math.round((a.weightedAccuracy ?? 0) * 100)}%`, background: focusColor(a.focus) }} />
              <span className="bar-mark" style={{ left: "60%" }} />
              <span className="bar-mark" style={{ left: "80%" }} />
            </div>
            <span className="bar-value">{pct(a.weightedAccuracy)}</span>
            <Sparkline points={a.trend} label={`${focusName(a.focus)} trend`} />
          </div>
          <p className="area-next muted">
            {a.nextStep} <span className="area-count">({a.attempts} answer{a.attempts === 1 ? "" : "s"} counted)</span>
          </p>
        </li>
      ))}
    </ul>
  );
}
