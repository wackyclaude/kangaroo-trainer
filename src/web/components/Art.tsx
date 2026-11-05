// Small hand-drawn style illustrations, bundled with the app (nothing loads from outside).
// Outlines use the ink colour, so they follow light and dark mode. They never show answers.
import type { BadgeId, FocusArea } from "../../shared/types";
import { useSkin } from "../skin";

const S = { stroke: "var(--ink)", strokeWidth: 3, strokeLinejoin: "round" as const, strokeLinecap: "round" as const };
const SUN = "#FFC23D";
const SKY = "#7FA8FF";
const GRASS = "#5CCB95";
const BERRY = "#F37BA3";
const LILAC = "#B79CFF";
const TEAL = "#5FD0D9";
const ORANGE = "#FFA45C";

function Svg({ size, children, label }: { size: number; children: React.ReactNode; label?: string }) {
  return (
    <svg className="art" viewBox="0 0 64 64" width={size} height={size} aria-hidden={label ? undefined : true} role={label ? "img" : undefined} aria-label={label} focusable="false">
      {children}
    </svg>
  );
}

/** One picture per focus area: digits, a balance, a ruler and triangle, cubes, a magnifier, dice. */
export function AreaArt({ area, size = 48 }: { area: FocusArea; size?: number }) {
  switch (area) {
    case "NUM":
      return (
        <Svg size={size}>
          <rect x="6" y="14" width="52" height="36" rx="8" fill={SKY} {...S} />
          <path d="M16 26 l4 -3 v18 M28 27 q4 -6 8 -1 q2 4 -8 15 h9 M46 23 h7 l-5 7 q6 0 5 6 q-2 6 -8 2" fill="none" {...S} />
        </Svg>
      );
    case "ALG":
      return (
        <Svg size={size}>
          <path d="M32 12 v40 M20 54 h24 M10 20 h44" fill="none" {...S} />
          <path d="M10 20 l-6 14 h12 z M54 20 l-6 14 h12 z" fill={LILAC} {...S} />
          <circle cx="32" cy="12" r="4" fill={SUN} {...S} />
        </Svg>
      );
    case "GEO":
      return (
        <Svg size={size}>
          <path d="M8 52 L32 10 L56 52 Z" fill={GRASS} {...S} />
          <rect x="6" y="46" width="52" height="10" rx="2" fill={SUN} {...S} />
          <path d="M14 46 v4 M22 46 v6 M30 46 v4 M38 46 v6 M46 46 v4" fill="none" {...S} strokeWidth={2} />
        </Svg>
      );
    case "SPA":
      return (
        <Svg size={size}>
          <path d="M14 26 L30 18 L46 26 L30 34 Z" fill="#FFD27F" {...S} />
          <path d="M14 26 V44 L30 52 V34 Z" fill={ORANGE} {...S} />
          <path d="M46 26 V44 L30 52 V34 Z" fill="#E8843E" {...S} />
          <path d="M38 12 L48 7 L58 12 L48 17 Z M38 12 V22 L48 27 V17 Z M58 12 V22 L48 27" fill={SUN} {...S} strokeWidth={2.5} />
        </Svg>
      );
    case "LOG":
      return (
        <Svg size={size}>
          <circle cx="26" cy="26" r="16" fill="#FFF3D6" {...S} />
          <path d="M38 38 L54 54" fill="none" {...S} strokeWidth={7} />
          <path d="M38 38 L54 54" fill="none" stroke={BERRY} strokeWidth={3} strokeLinecap="round" />
          <path d="M20 22 q6 -6 12 0" fill="none" {...S} strokeWidth={2.5} />
          <circle cx="26" cy="32" r="2" fill="var(--ink)" />
        </Svg>
      );
    case "CMB":
      return (
        <Svg size={size}>
          <rect x="6" y="18" width="28" height="28" rx="6" fill="#fff" {...S} transform="rotate(-10 20 32)" />
          <rect x="30" y="22" width="28" height="28" rx="6" fill={TEAL} {...S} transform="rotate(8 44 36)" />
          <circle cx="14" cy="27" r="2.5" fill="var(--ink)" />
          <circle cx="20" cy="33" r="2.5" fill="var(--ink)" />
          <circle cx="26" cy="39" r="2.5" fill="var(--ink)" />
          <circle cx="39" cy="31" r="2.5" fill="var(--ink)" />
          <circle cx="49" cy="33" r="2.5" fill="var(--ink)" />
          <circle cx="38" cy="41" r="2.5" fill="var(--ink)" />
          <circle cx="48" cy="43" r="2.5" fill="var(--ink)" />
        </Svg>
      );
  }
}

export type TileArt = "smart" | "mistakes" | "paper" | "focus" | "progress";

export function TileIcon({ kind, size = 56 }: { kind: TileArt; size?: number }) {
  switch (kind) {
    case "smart":
      return (
        <Svg size={size}>
          <path d="M28 8 L33 24 L50 28 L33 33 L28 50 L23 33 L6 28 L23 24 Z" fill={SUN} {...S} />
          <path d="M48 40 L50 46 L56 48 L50 50 L48 56 L46 50 L40 48 L46 46 Z" fill={BERRY} {...S} strokeWidth={2.5} />
        </Svg>
      );
    case "mistakes":
      return (
        <Svg size={size}>
          <path d="M48 22 A18 18 0 1 0 50 38" fill="none" {...S} strokeWidth={7} />
          <path d="M48 22 A18 18 0 1 0 50 38" fill="none" stroke={GRASS} strokeWidth={3} strokeLinecap="round" />
          <path d="M40 18 L50 22 L52 11" fill="none" {...S} />
          <path d="M24 33 l6 6 l11 -13" fill="none" {...S} />
        </Svg>
      );
    case "paper":
      return (
        <Svg size={size}>
          <path d="M14 6 H40 L52 18 V58 H14 Z" fill="#fff" {...S} />
          <path d="M40 6 V18 H52" fill={SKY} {...S} />
          <path d="M21 28 H44 M21 36 H44 M21 44 H36" fill="none" {...S} strokeWidth={2.5} />
          <circle cx="46" cy="48" r="8" fill={SUN} {...S} />
          <path d="M46 44 v4 l3 2" fill="none" {...S} strokeWidth={2} />
        </Svg>
      );
    case "focus":
      return (
        <Svg size={size}>
          <circle cx="30" cy="34" r="24" fill="#fff" {...S} />
          <circle cx="30" cy="34" r="15" fill={BERRY} {...S} />
          <circle cx="30" cy="34" r="6" fill={SUN} {...S} />
          <path d="M30 34 L54 10 M48 8 h7 v7" fill="none" {...S} />
        </Svg>
      );
    case "progress":
      return (
        <Svg size={size}>
          <rect x="8" y="34" width="10" height="20" rx="2" fill={SKY} {...S} />
          <rect x="27" y="22" width="10" height="32" rx="2" fill={GRASS} {...S} />
          <rect x="46" y="10" width="10" height="44" rx="2" fill={SUN} {...S} />
        </Svg>
      );
  }
}

/** A round medal for each badge. Not earned yet = grey and dashed. */
export function BadgeMedal({ id, earned, size = 64 }: { id: BadgeId; earned: boolean; size?: number }) {
  const skin = useSkin();
  if (skin === "space") return <MissionPatch id={id} earned={earned} size={size} />;
  if (skin === "modern") return <LineBadge id={id} earned={earned} size={size} />;
  const fill = earned ? MEDAL_FILL[id] ?? SUN : "var(--paper)";
  return (
    <svg viewBox="0 0 64 64" width={size} height={size} aria-hidden="true" focusable="false" className={earned ? "medal" : "medal locked"} style={earned ? ({ "--ink": "#1F2A56" } as React.CSSProperties) : undefined}>
      <circle cx="32" cy="32" r="27" fill={fill} stroke="var(--ink)" strokeWidth={3} strokeDasharray={earned ? undefined : "6 5"} />
      <circle cx="32" cy="32" r="20" fill={earned ? "#fff" : "none"} stroke="var(--ink)" strokeWidth={2} opacity={earned ? 1 : 0.4} />
      <g opacity={earned ? 1 : 0.35}>{medalSymbol(id)}</g>
    </svg>
  );
}

/** Space: a mission patch, a shield with a planet ring and stars. */
function MissionPatch({ id, earned, size }: { id: BadgeId; earned: boolean; size: number }) {
  const fill = earned ? (MEDAL_FILL[id] ?? SUN) : "var(--paper)";
  return (
    <svg viewBox="0 0 64 64" width={size} height={size} aria-hidden="true" focusable="false" className={earned ? "medal" : "medal locked"} style={earned ? ({ "--ink": "#1F2A56" } as React.CSSProperties) : undefined}>
      <path d="M32 3 L57 12 V32 C57 47 46 56 32 61 C18 56 7 47 7 32 V12 Z" fill={earned ? "#141A43" : "none"} stroke={earned ? "#8F9BFF" : "var(--ink)"} strokeWidth={3} strokeLinejoin="round" strokeDasharray={earned ? undefined : "6 5"} />
      <circle cx="32" cy="32" r="18" fill={earned ? fill : "none"} stroke={earned ? "#1F2A56" : "var(--ink)"} strokeWidth={2} opacity={earned ? 1 : 0.4} />
      {earned && (
        <>
          <ellipse cx="32" cy="32" rx="27" ry="7" fill="none" stroke="#FFD166" strokeWidth={2} transform="rotate(-18 32 32)" opacity={0.9} />
          <circle cx="14" cy="16" r="1.6" fill="#fff" />
          <circle cx="50" cy="18" r="1.2" fill="#fff" />
          <circle cx="47" cy="50" r="1.4" fill="#fff" />
        </>
      )}
      <g opacity={earned ? 1 : 0.35} transform="translate(32 32) scale(0.82) translate(-32 -32)">
        {medalSymbol(id)}
      </g>
    </svg>
  );
}

/** Modern: a thin ring and the symbol as a line drawing in the accent colour. */
function LineBadge({ id, earned, size }: { id: BadgeId; earned: boolean; size: number }) {
  return (
    <svg viewBox="0 0 64 64" width={size} height={size} aria-hidden="true" focusable="false" className={`art medal-line${earned ? "" : " locked"}`}>
      <circle cx="32" cy="32" r="28" strokeDasharray={earned ? undefined : "3 5"} />
      <g opacity={earned ? 1 : 0.35}>{medalSymbol(id)}</g>
    </svg>
  );
}

const MEDAL_FILL: Partial<Record<BadgeId, string>> = {
  "first-quiz": GRASS,
  "first-paper": SKY,
  "no-skip": TEAL,
  "score-80": SUN,
  "score-100": ORANGE,
  "on-a-roll": BERRY,
  fixer: GRASS,
  "streak-3": ORANGE,
  "streak-7": BERRY,
  "challenge-5": LILAC,
  "time-traveller": SKY,
  "area-NUM": SKY,
  "area-ALG": LILAC,
  "area-GEO": GRASS,
  "area-SPA": ORANGE,
  "area-LOG": BERRY,
  "area-CMB": TEAL,
  ready: SUN,
  "oly-first-paper": TEAL,
  "oly-first-b": LILAC,
  "oly-cutoff": GRASS,
};

function Txt({ t, size = 15 }: { t: string; size?: number }) {
  return (
    <text x="32" y={32 + size / 3} textAnchor="middle" fontFamily="Fredoka, sans-serif" fontWeight={700} fontSize={size} fill="#1F2A56">
      {t}
    </text>
  );
}

const M = { stroke: "#1F2A56", strokeWidth: 3, strokeLinejoin: "round" as const, strokeLinecap: "round" as const, fill: "none" };

function medalSymbol(id: BadgeId) {
  switch (id) {
    case "first-quiz":
      return <path d="M24 42 V20 L40 26 L24 32" {...M} />;
    case "first-paper":
      return <path d="M24 20 H36 L41 25 V44 H24 Z M28 30 H37 M28 36 H37" {...M} />;
    case "no-skip":
      return <path d="M22 33 L29 40 L43 24" {...M} strokeWidth={4} />;
    case "score-80":
      return <Txt t="80" size={17} />;
    case "score-100":
      return <Txt t="100" size={15} />;
    case "on-a-roll":
      return <path d="M32 44 q-10 -4 -8 -13 q2 -6 6 -9 q0 6 4 7 q-1 -6 3 -10 q8 8 5 17 q-2 6 -10 8 z" {...M} fill={SUN} />;
    case "fixer":
      return <path d="M40 22 a7 7 0 0 0 -9 9 l-9 9 l4 4 l9 -9 a7 7 0 0 0 9 -9 l-5 3 l-3 -3 z" {...M} />;
    case "streak-3":
      return <Txt t="3d" size={16} />;
    case "streak-7":
      return <Txt t="7d" size={16} />;
    case "challenge-5":
      return <path d="M20 42 L29 26 L34 33 L38 28 L45 42 Z" {...M} />;
    case "time-traveller":
      return (
        <>
          <circle cx="32" cy="32" r="11" {...M} />
          <path d="M32 25 V32 L37 35" {...M} />
        </>
      );
    case "ready":
      return <path d="M24 22 H40 V28 a8 8 0 0 1 -16 0 Z M32 36 V41 M26 43 H38" {...M} />;
    case "oly-first-paper":
      return <Txt t="36" size={16} />;
    case "oly-first-b":
      return <Txt t="B✓" size={14} />;
    case "oly-cutoff":
      return <path d="M20 40 H44 M24 40 V30 M32 40 V24 M40 40 V18 M20 28 H44" {...M} />;
    default: {
      const area = id.slice(5) as FocusArea;
      return (
        <g transform="translate(14 14) scale(0.56)">
          <AreaArtRaw area={area} />
        </g>
      );
    }
  }
}

/** The area picture as plain SVG children (for use inside a medal). */
// (Kept skin-neutral: the frame around it carries the theme.)
function AreaArtRaw({ area }: { area: FocusArea }) {
  const svg = AreaArt({ area, size: 64 }) as React.ReactElement<{ children: React.ReactNode }>;
  return <>{svg.props.children}</>;
}
