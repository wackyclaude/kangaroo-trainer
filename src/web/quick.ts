// One-tap start for Smart mix and Fix my mistakes: uses the settings picked last time on this device.
import type { Contest, HelpLevel } from "../shared/types";
import { api } from "./api";

export type QuickMode = "smart" | "mistakes";
export interface QuickPrefs {
  count: number;
  help: HelpLevel;
  /** Minutes, or "off". Smart mix only. */
  timer: string;
}

/** Short rounds by default: 8 questions is about 10 minutes. */
export const QUICK_COUNTS: Record<QuickMode, number[]> = { smart: [8, 12, 16], mistakes: [5, 8, 12] };
const DEFAULTS: Record<QuickMode, QuickPrefs> = {
  smart: { count: 8, help: "practice", timer: "off" },
  mistakes: { count: 8, help: "learn", timer: "off" },
};
const HELPS: HelpLevel[] = ["test", "practice", "learn"];
const key = (profileId: number, mode: QuickMode) => `kt.quick.${profileId}.${mode}`;

export function loadQuick(profileId: number, mode: QuickMode): QuickPrefs {
  const d = DEFAULTS[mode];
  try {
    const raw = JSON.parse(window.localStorage.getItem(key(profileId, mode)) ?? "null") as Partial<QuickPrefs> | null;
    if (!raw) return d;
    return {
      count: QUICK_COUNTS[mode].includes(Number(raw.count)) ? Number(raw.count) : d.count,
      help: HELPS.includes(raw.help as HelpLevel) ? (raw.help as HelpLevel) : d.help,
      timer: mode === "smart" && ["off", "15", "25"].includes(String(raw.timer)) ? String(raw.timer) : "off",
    };
  } catch {
    return d;
  }
}

export function saveQuick(profileId: number, mode: QuickMode, p: QuickPrefs) {
  try {
    window.localStorage.setItem(key(profileId, mode), JSON.stringify(p));
  } catch {
    /* private mode: the defaults are used next time */
  }
}

/** Starts a quiz and returns its id. */
export async function startQuick(mode: QuickMode, p: QuickPrefs, contest: Contest): Promise<number> {
  const body = mode === "mistakes" ? { mode, help: p.help, count: p.count, contest } : { mode, help: p.help, count: p.count, timerMinutes: p.timer === "off" ? null : Number(p.timer), contest };
  const { id } = await api.post<{ id: number }>("/api/sessions", body);
  return id;
}
