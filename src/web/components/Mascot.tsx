import type { ReactNode } from "react";

/** Roo, the app's own kangaroo (an original drawing, not the contest logo). Purely decorative. */
export type Mood = "wave" | "cheer" | "think" | "calm" | "sleep";

const INK = "#1F2A56";
const FUR = "#E9A35B";
const FUR2 = "#D48A44";
const BELLY = "#FFE6BF";
const PINK = "#F59BA8";

function Limb({ d }: { d: string }) {
  return (
    <>
      <path d={d} fill="none" stroke={INK} strokeWidth={17} strokeLinejoin="round" strokeLinecap="round" />
      <path d={d} fill="none" stroke={FUR} strokeWidth={9} strokeLinejoin="round" strokeLinecap="round" />
    </>
  );
}

const DOWN_L = "M78 142 Q70 154 84 162";
const DOWN_R = "M126 142 Q134 154 120 162";

function Sparkle({ x, y, s }: { x: number; y: number; s: number }) {
  return (
    <path
      d={`M${x} ${y - s} L${x + s * 0.35} ${y - s * 0.35} L${x + s} ${y} L${x + s * 0.35} ${y + s * 0.35} L${x} ${y + s} L${x - s * 0.35} ${y + s * 0.35} L${x - s} ${y} L${x - s * 0.35} ${y - s * 0.35} Z`}
      fill="#FFC23D"
      stroke={INK}
      strokeWidth={2.5}
      strokeLinejoin="round"
    />
  );
}

export function Mascot({ mood = "wave", size = 120, className, headOnly }: { mood?: Mood; size?: number; className?: string; headOnly?: boolean }) {
  const arms =
    mood === "wave" ? (
      <>
        <Limb d="M78 140 Q60 134 58 108" />
        <Limb d={DOWN_R} />
      </>
    ) : mood === "cheer" ? (
      <>
        <Limb d="M78 140 Q58 132 54 106" />
        <Limb d="M126 140 Q146 132 150 106" />
      </>
    ) : mood === "think" ? (
      <>
        <Limb d={DOWN_L} />
        <Limb d="M126 142 Q138 128 118 124" />
      </>
    ) : (
      <>
        <Limb d={DOWN_L} />
        <Limb d={DOWN_R} />
      </>
    );
  const eyes =
    mood === "sleep" ? (
      <path d="M78 92 q8 7 16 0 M110 92 q8 7 16 0" fill="none" stroke={INK} strokeWidth={4} strokeLinecap="round" />
    ) : (
      <>
        <ellipse cx="86" cy="90" rx="6.5" ry="8" fill={INK} />
        <ellipse cx="118" cy="90" rx="6.5" ry="8" fill={INK} />
        <circle cx="88.5" cy="87" r="2.4" fill="#fff" />
        <circle cx="120.5" cy="87" r="2.4" fill="#fff" />
      </>
    );
  const mouth =
    mood === "cheer" ? (
      <>
        <path d="M92 112 q10 14 20 0 z" fill={INK} />
        <path d="M96 117 q6 5 12 0" fill={PINK} />
      </>
    ) : mood === "think" ? (
      <path d="M95 114 q7 -3 14 1" fill="none" stroke={INK} strokeWidth={3.5} strokeLinecap="round" />
    ) : mood === "sleep" ? (
      <ellipse cx="102" cy="115" rx="3.5" ry="2.5" fill={INK} />
    ) : (
      <path d="M94 112 q8 8 16 0" fill="none" stroke={INK} strokeWidth={3.5} strokeLinecap="round" />
    );

  return (
    <svg className={className} viewBox={headOnly ? "52 8 100 124" : "0 0 200 220"} width={size} height={headOnly ? (size * 124) / 100 : (size * 220) / 200} aria-hidden="true" focusable="false">
      <path d="M126 190 q40 6 58 -14 q6 -8 -2 -10 q-24 18 -60 8 z" fill={FUR2} stroke={INK} strokeWidth={4} strokeLinejoin="round" />
      <path d="M70 66 q-16 -40 -2 -50 q12 -6 22 34 z" fill={FUR} stroke={INK} strokeWidth={4} strokeLinejoin="round" />
      <path d="M74 58 q-8 -26 -1 -32 q6 -3 11 24 z" fill={PINK} />
      <path d="M134 66 q16 -40 2 -50 q-12 -6 -22 34 z" fill={FUR} stroke={INK} strokeWidth={4} strokeLinejoin="round" />
      <path d="M130 58 q8 -26 1 -32 q-6 -3 -11 24 z" fill={PINK} />
      <path d="M102 124 C 62 124 56 160 60 186 C 63 202 80 206 102 206 C 124 206 141 202 144 186 C 148 160 142 124 102 124 Z" fill={FUR} stroke={INK} strokeWidth={4} />
      <path d="M102 140 C 80 140 76 164 79 182 C 81 194 90 198 102 198 C 114 198 123 194 125 182 C 128 164 124 140 102 140 Z" fill={BELLY} />
      <path d="M84 172 q18 12 36 0" fill="none" stroke={FUR2} strokeWidth={3.5} strokeLinecap="round" />
      <ellipse cx="78" cy="208" rx="22" ry="8" fill={FUR2} stroke={INK} strokeWidth={4} />
      <ellipse cx="126" cy="208" rx="22" ry="8" fill={FUR2} stroke={INK} strokeWidth={4} />
      <path d="M102 46 C 72 46 62 66 62 88 C 62 112 80 128 102 128 C 124 128 142 112 142 88 C 142 66 132 46 102 46 Z" fill={FUR} stroke={INK} strokeWidth={4} />
      <ellipse cx="102" cy="108" rx="22" ry="16" fill={BELLY} />
      <ellipse cx="102" cy="101" rx="7" ry="5" fill={INK} />
      <circle cx="74" cy="106" r="6" fill={PINK} opacity={0.7} />
      <circle cx="130" cy="106" r="6" fill={PINK} opacity={0.7} />
      {eyes}
      {mouth}
      {arms}
      {mood === "cheer" && (
        <>
          <Sparkle x={40} y={74} s={12} />
          <Sparkle x={163} y={66} s={9} />
        </>
      )}
      {mood === "think" && (
        <>
          <circle cx="150" cy="58" r="4" fill="#fff" stroke={INK} strokeWidth={2.5} />
          <circle cx="160" cy="44" r="6" fill="#fff" stroke={INK} strokeWidth={2.5} />
        </>
      )}
      {mood === "sleep" && (
        <path d="M148 52 h12 l-12 14 h12 M164 34 h8 l-8 10 h8" fill="none" stroke={INK} strokeWidth={3.5} strokeLinecap="round" strokeLinejoin="round" />
      )}
    </svg>
  );
}

/** Roo with a speech bubble. The words are real text, so screen readers read them. */
export function MascotSays({ mood = "wave", size = 96, children, role }: { mood?: Mood; size?: number; children: ReactNode; role?: "note" | "status" }) {
  return (
    <div className="mascot-says" role={role}>
      <Mascot mood={mood} size={size} className="mascot" />
      <div className="speech">{children}</div>
    </div>
  );
}
