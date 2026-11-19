import { useContext, type ReactNode } from "react";
import { buddyOf, type Buddy } from "../../shared/types";
import { MeContext } from "../contest";
import { useSkin } from "../skin";

/** The quiz buddies, all original drawings: Roo (kangaroo), Nova (alien astronaut), Pixel (little robot)
 *  and Kit (fox in a hoodie). Each student picks one, or none. Purely decorative: words go in real text. */
export type Mood = "wave" | "cheer" | "think" | "calm" | "sleep" | "comfort" | "point" | "nod";

const INK = "#1F2A56";
const PINK = "#F59BA8";

function Limb({ d, colour }: { d: string; colour: string }) {
  return (
    <>
      <path d={d} fill="none" stroke={INK} strokeWidth={17} strokeLinejoin="round" strokeLinecap="round" />
      <path d={d} fill="none" stroke={colour} strokeWidth={9} strokeLinejoin="round" strokeLinecap="round" />
    </>
  );
}

const DOWN_L = "M78 142 Q70 154 84 162";
const DOWN_R = "M126 142 Q134 154 120 162";

function Sparkle({ x, y, s, fill = "#FFC23D" }: { x: number; y: number; s: number; fill?: string }) {
  return (
    <path
      d={`M${x} ${y - s} L${x + s * 0.35} ${y - s * 0.35} L${x + s} ${y} L${x + s * 0.35} ${y + s * 0.35} L${x} ${y + s} L${x - s * 0.35} ${y + s * 0.35} L${x - s} ${y} L${x - s * 0.35} ${y - s * 0.35} Z`}
      fill={fill}
      stroke={INK}
      strokeWidth={2.5}
      strokeLinejoin="round"
    />
  );
}

function Arms({ mood, colour }: { mood: Mood; colour: string }) {
  const [l, r] =
    mood === "wave"
      ? ["M78 140 Q60 134 58 108", DOWN_R]
      : mood === "cheer"
        ? ["M78 140 Q58 132 54 106", "M126 140 Q146 132 150 106"]
        : mood === "think"
          ? [DOWN_L, "M126 142 Q138 128 118 124"]
          : mood === "comfort"
            ? ["M78 142 Q92 152 102 146", "M126 142 Q112 152 102 146"]
            : mood === "point"
              ? [DOWN_L, "M126 140 Q150 128 152 100"]
              : mood === "nod"
                ? [DOWN_L, "M126 140 Q150 140 152 120"]
                : [DOWN_L, DOWN_R];
  return (
    <>
      <Limb d={l} colour={colour} />
      <Limb d={r} colour={colour} />
    </>
  );
}

/** Eyes and mouth for the round-faced buddies. dy moves the face down a little. */
function Face({ mood, dy = 0 }: { mood: Mood; dy?: number }) {
  const eyes =
    mood === "sleep" ? (
      <path d={`M78 ${92 + dy} q8 7 16 0 M110 ${92 + dy} q8 7 16 0`} fill="none" stroke={INK} strokeWidth={4} strokeLinecap="round" />
    ) : mood === "cheer" ? (
      <path d={`M80 ${92 + dy} q6 -6 12 0 M112 ${92 + dy} q6 -6 12 0`} fill="none" stroke={INK} strokeWidth={4} strokeLinecap="round" />
    ) : (
      <>
        <ellipse cx="86" cy={90 + dy} rx="6.5" ry="8" fill={INK} />
        <ellipse cx="118" cy={90 + dy} rx="6.5" ry="8" fill={INK} />
        <circle cx="88.5" cy={87 + dy} r="2.4" fill="#fff" />
        <circle cx="120.5" cy={87 + dy} r="2.4" fill="#fff" />
        {mood === "comfort" && <path d={`M78 ${77 + dy} q8 -4 14 0 M112 ${77 + dy} q8 -4 14 0`} fill="none" stroke={INK} strokeWidth={3} strokeLinecap="round" />}
      </>
    );
  const y = 112 + dy;
  const mouth =
    mood === "cheer" ? (
      <>
        <path d={`M90 ${y} q12 18 24 0 z`} fill={INK} />
        <path d={`M95 ${y + 6} q7 6 14 0`} fill={PINK} />
      </>
    ) : mood === "think" ? (
      <path d={`M95 ${y + 2} q7 -3 14 1`} fill="none" stroke={INK} strokeWidth={3.5} strokeLinecap="round" />
    ) : mood === "comfort" ? (
      <path d={`M95 ${y + 3} q7 4 14 0`} fill="none" stroke={INK} strokeWidth={3.5} strokeLinecap="round" />
    ) : mood === "sleep" ? (
      <ellipse cx="102" cy={y + 3} rx="3.5" ry="2.5" fill={INK} />
    ) : (
      <path d={`M94 ${y} q8 8 16 0`} fill="none" stroke={INK} strokeWidth={3.5} strokeLinecap="round" />
    );
  return (
    <>
      {eyes}
      {mouth}
    </>
  );
}

function Extras({ mood }: { mood: Mood }) {
  return (
    <>
      {mood === "cheer" && (
        <>
          <Sparkle x={36} y={70} s={13} />
          <Sparkle x={166} y={62} s={10} />
          <Sparkle x={176} y={104} s={7} fill="#3D7BFF" />
        </>
      )}
      {mood === "think" && (
        <>
          <circle cx="150" cy="58" r="4" fill="#fff" stroke={INK} strokeWidth={2.5} />
          <circle cx="160" cy="44" r="6" fill="#fff" stroke={INK} strokeWidth={2.5} />
        </>
      )}
      {mood === "point" && (
        <>
          <circle cx="160" cy="70" r="15" fill="#FFE27A" stroke={INK} strokeWidth={3} />
          <path d="M154 86 h12 M156 92 h8" stroke={INK} strokeWidth={3} strokeLinecap="round" />
          <path d="M160 50 v-8 M178 58 l6 -6 M142 58 l-6 -6" stroke="#F2A900" strokeWidth={3} strokeLinecap="round" />
        </>
      )}
      {mood === "sleep" && <path d="M148 52 h12 l-12 14 h12 M164 34 h8 l-8 10 h8" fill="none" stroke={INK} strokeWidth={3.5} strokeLinecap="round" strokeLinejoin="round" />}
    </>
  );
}

const ROO = { fur: "#E9A35B", fur2: "#D48A44", belly: "#FFE6BF" };
function RooArt({ mood }: { mood: Mood }) {
  return (
    <>
      <path d="M126 190 q40 6 58 -14 q6 -8 -2 -10 q-24 18 -60 8 z" fill={ROO.fur2} stroke={INK} strokeWidth={4} strokeLinejoin="round" />
      <path d="M70 66 q-16 -40 -2 -50 q12 -6 22 34 z" fill={ROO.fur} stroke={INK} strokeWidth={4} strokeLinejoin="round" />
      <path d="M74 58 q-8 -26 -1 -32 q6 -3 11 24 z" fill={PINK} />
      <path d="M134 66 q16 -40 2 -50 q-12 -6 -22 34 z" fill={ROO.fur} stroke={INK} strokeWidth={4} strokeLinejoin="round" />
      <path d="M130 58 q8 -26 1 -32 q-6 -3 -11 24 z" fill={PINK} />
      <path d="M102 124 C 62 124 56 160 60 186 C 63 202 80 206 102 206 C 124 206 141 202 144 186 C 148 160 142 124 102 124 Z" fill={ROO.fur} stroke={INK} strokeWidth={4} />
      <path d="M102 140 C 80 140 76 164 79 182 C 81 194 90 198 102 198 C 114 198 123 194 125 182 C 128 164 124 140 102 140 Z" fill={ROO.belly} />
      <path d="M84 172 q18 12 36 0" fill="none" stroke={ROO.fur2} strokeWidth={3.5} strokeLinecap="round" />
      <ellipse cx="78" cy="208" rx="22" ry="8" fill={ROO.fur2} stroke={INK} strokeWidth={4} />
      <ellipse cx="126" cy="208" rx="22" ry="8" fill={ROO.fur2} stroke={INK} strokeWidth={4} />
      <path d="M102 46 C 72 46 62 66 62 88 C 62 112 80 128 102 128 C 124 128 142 112 142 88 C 142 66 132 46 102 46 Z" fill={ROO.fur} stroke={INK} strokeWidth={4} />
      <ellipse cx="102" cy="108" rx="22" ry="16" fill={ROO.belly} />
      <ellipse cx="102" cy="101" rx="7" ry="5" fill={INK} />
      <circle cx="74" cy="106" r="6" fill={PINK} opacity={0.7} />
      <circle cx="130" cy="106" r="6" fill={PINK} opacity={0.7} />
      <Face mood={mood} />
      <Arms mood={mood} colour={ROO.fur} />
      <Extras mood={mood} />
    </>
  );
}

function NovaArt({ mood }: { mood: Mood }) {
  return (
    <>
      <path d="M102 132 C 66 132 58 160 61 186 C 63 202 80 206 102 206 C 124 206 141 202 143 186 C 146 160 138 132 102 132 Z" fill="#F2F3FF" stroke={INK} strokeWidth={4} />
      <circle cx="102" cy="172" r="12" fill="#8F9BFF" stroke={INK} strokeWidth={3} />
      <path d="M102 163 L104.5 169.5 L111 170 L106 174.5 L107.5 181 L102 177.5 L96.5 181 L98 174.5 L93 170 L99.5 169.5 Z" fill="#FFD166" stroke={INK} strokeWidth={1.5} strokeLinejoin="round" />
      <ellipse cx="78" cy="208" rx="20" ry="8" fill="#8F9BFF" stroke={INK} strokeWidth={4} />
      <ellipse cx="126" cy="208" rx="20" ry="8" fill="#8F9BFF" stroke={INK} strokeWidth={4} />
      <Arms mood={mood} colour="#C9CFF7" />
      <ellipse cx="102" cy="140" rx="38" ry="10" fill="#C9CFF7" stroke={INK} strokeWidth={4} />
      <path d="M102 52 L102 40" stroke={INK} strokeWidth={4} strokeLinecap="round" />
      <circle cx="102" cy="37" r="6" fill="#FFD166" stroke={INK} strokeWidth={3} />
      <path d="M102 56 C 72 56 64 74 64 94 C 64 116 82 130 102 130 C 122 130 140 116 140 94 C 140 74 132 56 102 56 Z" fill="#7FE0C4" stroke={INK} strokeWidth={4} />
      <path d="M78 66 q-14 -6 -16 -20" fill="none" stroke={INK} strokeWidth={4} strokeLinecap="round" />
      <circle cx="61" cy="44" r="5" fill="#5CC9AA" stroke={INK} strokeWidth={3} />
      <circle cx="74" cy="106" r="6" fill={PINK} opacity={0.6} />
      <circle cx="130" cy="106" r="6" fill={PINK} opacity={0.6} />
      <Face mood={mood} dy={2} />
      <circle cx="102" cy="88" r="60" fill="#D9F1FF" fillOpacity={0.28} stroke={INK} strokeWidth={4} />
      <path d="M62 70 q10 -22 34 -26" fill="none" stroke="#fff" strokeWidth={5} strokeLinecap="round" opacity={0.9} />
      <Extras mood={mood} />
    </>
  );
}

/** Pixel's face is a little screen: the eyes and mouth glow. */
function PixelArt({ mood }: { mood: Mood }) {
  const G = "#5CF2C4";
  const eyes =
    mood === "sleep" ? (
      <path d="M74 88 h16 M110 88 h16" stroke={G} strokeWidth={4} strokeLinecap="round" />
    ) : mood === "cheer" ? (
      <path d="M74 92 l8 -8 l8 8 M110 92 l8 -8 l8 8" fill="none" stroke={G} strokeWidth={4} strokeLinecap="round" strokeLinejoin="round" />
    ) : mood === "comfort" ? (
      <path d="M74 84 l14 4 M126 84 l-14 4 M78 94 h8 M114 94 h8" stroke={G} strokeWidth={4} strokeLinecap="round" />
    ) : (
      <>
        <rect x="76" y="80" width="12" height="16" rx="3" fill={G} />
        <rect x="112" y="80" width="12" height="16" rx="3" fill={G} />
      </>
    );
  const mouth =
    mood === "cheer" ? (
      <path d="M86 104 q14 14 28 0 z" fill={G} />
    ) : mood === "think" ? (
      <path d="M90 108 h20" stroke={G} strokeWidth={4} strokeLinecap="round" />
    ) : mood === "comfort" ? (
      <path d="M90 110 q10 -4 20 0" fill="none" stroke={G} strokeWidth={4} strokeLinecap="round" />
    ) : (
      <path d="M88 104 q12 8 24 0" fill="none" stroke={G} strokeWidth={4} strokeLinecap="round" />
    );
  return (
    <>
      <path d="M100 30 v18" stroke={INK} strokeWidth={4} strokeLinecap="round" />
      <circle cx="100" cy="26" r="7" fill="#E8467C" stroke={INK} strokeWidth={3} />
      <rect x="62" y="142" width="76" height="58" rx="16" fill="#D6DEF5" stroke={INK} strokeWidth={4} />
      <circle cx="100" cy="170" r="10" fill="#FFC23D" stroke={INK} strokeWidth={3} />
      <rect x="66" y="198" width="26" height="14" rx="6" fill="#8D9CC6" stroke={INK} strokeWidth={4} />
      <rect x="108" y="198" width="26" height="14" rx="6" fill="#8D9CC6" stroke={INK} strokeWidth={4} />
      <Arms mood={mood} colour="#B9C6E8" />
      <rect x="46" y="48" width="108" height="86" rx="22" fill="#B9C6E8" stroke={INK} strokeWidth={4} />
      <rect x="60" y="62" width="80" height="56" rx="12" fill={INK} />
      {eyes}
      {mouth}
      <Extras mood={mood} />
    </>
  );
}

const KIT = { fur: "#F07A3A", white: "#FFF4E8", hoodie: "#3D7BFF" };
function KitArt({ mood }: { mood: Mood }) {
  return (
    <>
      <path d="M134 186 q46 -6 52 -46 q-22 18 -50 22 z" fill={KIT.fur} stroke={INK} strokeWidth={4} strokeLinejoin="round" />
      <path d="M182 148 q-6 22 -26 30 q20 -2 30 -20 z" fill={KIT.white} />
      <path d="M100 128 C 62 128 58 162 62 188 C 64 202 80 206 100 206 C 120 206 136 202 138 188 C 142 162 138 128 100 128 Z" fill={KIT.hoodie} stroke={INK} strokeWidth={4} />
      <path d="M84 140 l16 18 l16 -18" fill="none" stroke={KIT.white} strokeWidth={4} strokeLinecap="round" />
      <ellipse cx="78" cy="208" rx="20" ry="8" fill={INK} />
      <ellipse cx="122" cy="208" rx="20" ry="8" fill={INK} />
      <Arms mood={mood} colour={KIT.hoodie} />
      <path d="M58 70 L66 20 L96 52 Z" fill={KIT.fur} stroke={INK} strokeWidth={4} strokeLinejoin="round" />
      <path d="M142 70 L134 20 L104 52 Z" fill={KIT.fur} stroke={INK} strokeWidth={4} strokeLinejoin="round" />
      <path d="M100 44 C 66 44 52 70 54 92 C 56 116 78 132 100 132 C 122 132 144 116 146 92 C 148 70 134 44 100 44 Z" fill={KIT.fur} stroke={INK} strokeWidth={4} />
      <path d="M58 96 C 70 128 130 128 142 96 C 128 108 112 104 100 118 C 88 104 72 108 58 96 Z" fill={KIT.white} />
      <ellipse cx="100" cy="112" rx="7" ry="5" fill={INK} />
      <Face mood={mood} dy={-2} />
      <Extras mood={mood} />
    </>
  );
}

const ART: Record<Exclude<Buddy, "none">, (p: { mood: Mood }) => ReactNode> = { roo: RooArt, nova: NovaArt, pixel: PixelArt, kit: KitArt };

/** The signed-in student's buddy; before sign-in (or for the admin) the theme decides. */
export function useBuddy(): Buddy {
  const me = useContext(MeContext);
  const skin = useSkin();
  return me?.buddy ?? buddyOf(null, skin);
}

interface MascotProps {
  mood?: Mood;
  size?: number;
  className?: string;
  headOnly?: boolean;
  /** Draw this buddy instead of the student's own (the buddy picker). */
  buddy?: Buddy;
}

/** The student's buddy, or nothing when they picked none. */
export function Mascot({ buddy: forced, ...props }: MascotProps) {
  const own = useBuddy();
  const buddy = forced ?? own;
  if (buddy === "none") return null;
  return <BuddyArt buddy={buddy} {...props} />;
}

function BuddyArt({ buddy, mood = "wave", size = 120, className, headOnly }: MascotProps & { buddy: Exclude<Buddy, "none"> }) {
  const Art = ART[buddy];
  return (
    <svg
      className={className}
      viewBox={headOnly ? "40 14 124 124" : "0 0 200 220"}
      width={size}
      height={headOnly ? size : (size * 220) / 200}
      aria-hidden="true"
      focusable="false"
    >
      <Art mood={mood} />
    </svg>
  );
}

/** A buddy with a speech bubble. The words are real text, so screen readers read them. */
export function MascotSays({ mood = "wave", size = 96, children, role }: { mood?: Mood; size?: number; children: ReactNode; role?: "note" | "status" }) {
  return (
    <div className="mascot-says" role={role}>
      <Mascot mood={mood} size={size} className="mascot" />
      <div className="speech">{children}</div>
    </div>
  );
}
