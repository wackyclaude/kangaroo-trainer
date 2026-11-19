// Counts how often features are used (statistics only: no content, no timestamps), and once per visit
// the kind of device. Sent in small batches to the family's own server; nothing goes anywhere else.
import type { UsageDevice, UsageKey } from "../shared/types";

const pending = new Map<UsageKey, number>();
let timer: ReturnType<typeof setTimeout> | null = null;

function send(body: unknown) {
  void fetch("/api/usage", {
    method: "POST",
    credentials: "same-origin",
    keepalive: true,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }).catch(() => undefined);
}

export function flushUsage() {
  if (timer) clearTimeout(timer);
  timer = null;
  if (!pending.size) return;
  const counts = Object.fromEntries(pending);
  pending.clear();
  send({ counts });
}

/** Counts one use of a feature. */
export function track(key: UsageKey) {
  pending.set(key, (pending.get(key) ?? 0) + 1);
  if (!timer) timer = setTimeout(flushUsage, 20_000);
}

/** Once per signed-in visit: phone, tablet or computer (the server adds the browser family). */
export function trackVisit() {
  const touch = navigator.maxTouchPoints > 0;
  const short = Math.min(window.screen.width, window.screen.height);
  const finePointer = window.matchMedia("(pointer: fine)").matches;
  // iPads say "Macintosh" but have a touch screen; touch laptops have a fine pointer (trackpad or mouse).
  const device: UsageDevice = !touch ? "computer" : short < 600 ? "phone" : !finePointer || /iPad|Macintosh/.test(navigator.userAgent) ? "tablet" : "computer";
  send({ visit: { device, touch } });
}

if (typeof document !== "undefined") {
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") flushUsage();
  });
}
