import { FOCUS_AREAS, type FocusArea, type HelpLevel } from "../shared/types";

export const focusName = (f: FocusArea) => FOCUS_AREAS[f];
export const focusColor = (f: FocusArea) => `var(--${f})`;

export function clock(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, "0")}`;
}

export function duration(ms: number): string {
  const s = Math.round(ms / 1000);
  if (ms > 0 && s < 1) return "<1 s";
  if (s < 60) return `${s} s`;
  const m = Math.floor(s / 60);
  return s % 60 ? `${m} min ${s % 60} s` : `${m} min`;
}

export function when(ts: number): string {
  const d = new Date(ts);
  const today = new Date();
  const sameDay = d.toDateString() === today.toDateString();
  const time = d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  return sameDay ? `Today ${time}` : `${d.toLocaleDateString([], { day: "numeric", month: "short" })} ${time}`;
}

export const HELP_TEXT: Record<HelpLevel, { name: string; line: string }> = {
  test: { name: "Test", line: "Like the real contest: no help, results at the end." },
  practice: { name: "Practice", line: "See right or wrong after each answer." },
  learn: { name: "Learn", line: "Hints when stuck, and the full solution after each answer." },
};

export function go(hash: string) {
  window.location.hash = hash;
}

export function modeLabel(r: { mode: string; paperYear: number | null; questions?: number; delivery?: string; contest?: string }): string {
  const oly = r.contest === "olympiad";
  const named = oly ? "Olympiad" : r.contest === "brain" ? "wizBRAIN" : "";
  const base =
    (named && r.mode !== "paper" ? `${named} · ` : "") +
    (r.mode === "paper"
      ? `${r.paperYear} ${named ? `${named} ` : ""}paper`
      : r.mode === "mistakes"
        ? "Fix my mistakes"
        : r.mode === "smart"
          ? "Smart mix"
          : `Focus quiz${r.questions ? ` · ${r.questions} questions` : ""}`);
  return r.delivery === "paper" ? `${base} · on paper` : base;
}

/** Rounded down, matching the level rules (79.8% is not yet 80%). */
export const pct = (x: number | null) => (x === null ? "—" : `${Math.floor(x * 100 + 1e-9)}%`);

export function minutes(ms: number | null): string {
  if (ms === null) return "—";
  const s = Math.round(ms / 1000);
  return s < 60 ? `${s} s` : `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")} min`;
}

/** "A3" style label, or the plain number for Kangaroo. */
export const qLabel = (q: { label?: string; number: number }) => q.label ?? String(q.number);

/** Klas 4 and 5 in the reports are vwo. */
export const CLASS_NAMES = { klas1: "Klas 1", klas2: "Klas 2", klas3: "Klas 3", klas4: "4-vwo", klas5: "5-vwo" } as const;
