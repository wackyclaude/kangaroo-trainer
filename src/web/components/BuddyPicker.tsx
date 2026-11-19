import { useState } from "react";
import { BUDDIES, BUDDY_LINE, BUDDY_NAMES, type Buddy, type BuddyMode, type Me } from "../../shared/types";
import { api, messageOf } from "../api";
import { Mascot } from "./Mascot";
import { Segmented } from "./Segmented";

const MODES: { value: BuddyMode; label: string; hint: string }[] = [
  { value: "lively", label: "Lively", hint: "Cheers, comforts, gives hints and wraps up each quiz." },
  { value: "quiet", label: "Quiet", hint: "Only hints and the end of a quiz." },
  { value: "off", label: "Off", hint: "Never shows up in quizzes." },
];

/** Me page: pick a quiz buddy (or none) and how chatty it is. */
export function BuddyPicker({ me, onChange }: { me: Me; onChange: (p: { buddy: Buddy; buddyMode: BuddyMode }) => void }) {
  const [error, setError] = useState("");
  const save = async (buddy: Buddy, buddyMode: BuddyMode) => {
    setError("");
    try {
      await api.put("/api/me/buddy", { buddy, buddyMode });
      onChange({ buddy, buddyMode });
    } catch (e) {
      setError(messageOf(e));
    }
  };
  const mode = MODES.find((m) => m.value === me.buddyMode) ?? MODES[0]!;

  return (
    <section className="panel stack">
      <h2>My quiz buddy</h2>
      <p className="muted" style={{ margin: 0 }}>
        Your buddy cheers you on, gives hints and keeps you company in quizzes. Pick one, or none.
      </p>
      <div className="buddy-grid" role="radiogroup" aria-label="Quiz buddy">
        {BUDDIES.map((b) => (
          <button
            key={b}
            type="button"
            role="radio"
            aria-checked={me.buddy === b}
            className="buddy-choice"
            onClick={() => void save(b, me.buddyMode)}
          >
            <span className={`buddy-face${b === "none" ? " none-face" : ""}`}>
              {b === "none" ? "—" : <Mascot buddy={b} mood={me.buddy === b ? "cheer" : "wave"} size={80} />}
            </span>
            <strong>{BUDDY_NAMES[b]}</strong>
            <small>{BUDDY_LINE[b]}</small>
          </button>
        ))}
      </div>
      {me.buddy !== "none" && (
        <div className="stack">
          <h3 style={{ margin: 0 }}>How chatty?</h3>
          <Segmented label="How chatty?" value={me.buddyMode} onChange={(m) => void save(me.buddy, m)} options={MODES.map(({ value, label }) => ({ value, label }))} />
          <p className="muted small-line">{mode.hint} Buddies stay quiet during tests and full papers until the results.</p>
        </div>
      )}
      {error && <p className="message">{error}</p>}
    </section>
  );
}
