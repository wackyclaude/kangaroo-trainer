import { useState, type FormEvent } from "react";
import { CONTEST_NAMES, CONTESTS, OLY_LEVELS, OLY_LEVEL_TEXT, type Contest, type OlympiadSettings, type Readiness } from "../../shared/types";
import { api, messageOf } from "../api";
import { Chips } from "./Segmented";

export interface SavedOlympiad {
  contests: Contest[];
  olympiad: OlympiadSettings;
  readiness: Readiness | null;
}

/** Which contests a student practises for (parent). */
export function ContestToggles({ profileId, name, value, onSaved }: { profileId: number; name: string; value: Contest[]; onSaved: (s: SavedOlympiad) => void }) {
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const change = async (next: Contest[]) => {
    if (next.length === 0) return setMsg({ ok: false, text: "Keep at least one contest on." });
    try {
      const saved = await api.put<SavedOlympiad>(`/api/profiles/${profileId}/olympiad`, { contests: next });
      setMsg({ ok: true, text: `${name}: ${next.map((c) => CONTEST_NAMES[c]).join(" and ")}.` });
      onSaved(saved);
    } catch (e) {
      setMsg({ ok: false, text: messageOf(e) });
    }
  };
  return (
    <div className="stack" style={{ gap: 8 }}>
      <Chips label={`Contests for ${name}`} values={value} onChange={change} options={CONTESTS.map((c) => ({ value: c, label: CONTEST_NAMES[c] }))} />
      {msg && (
        <span className={`small-line ${msg.ok ? "muted" : "error-text"}`} role="status">
          {msg.text}
        </span>
      )}
    </div>
  );
}

/** Olympiad level range, stretch question, the school's day and the target (parent). */
export function OlympiadSettingsForm({ profileId, name, value, r, onSaved }: { profileId: number; name: string; value: OlympiadSettings; r: Readiness; onSaved: (s: SavedOlympiad) => void }) {
  const [min, setMin] = useState(String(value.minLevel));
  const [max, setMax] = useState(String(value.maxLevel));
  const [stretch, setStretch] = useState(value.stretch);
  const [day, setDay] = useState(value.date ?? "");
  const [shift, setShift] = useState(String(value.targetShift));
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const save = async (e: FormEvent) => {
    e.preventDefault();
    try {
      const saved = await api.put<SavedOlympiad>(`/api/profiles/${profileId}/olympiad`, {
        minLevel: Number(min),
        maxLevel: Number(max),
        stretch,
        date: day || null,
        targetShift: Number(shift),
      });
      setMsg({ ok: true, text: `Saved for ${name}.` });
      onSaved(saved);
    } catch (err) {
      setMsg({ ok: false, text: messageOf(err) });
    }
  };

  return (
    <form className="contest-form stack" onSubmit={save}>
      <div className="row">
        <label className="field">
          Lowest level
          <select value={min} onChange={(e) => setMin(e.target.value)}>
            {OLY_LEVELS.map((l) => (
              <option key={l} value={l}>
                {l}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          Highest level
          <select value={max} onChange={(e) => setMax(e.target.value)}>
            {OLY_LEVELS.filter((l) => l >= Number(min)).map((l) => (
              <option key={l} value={l}>
                {l}
              </option>
            ))}
          </select>
        </label>
      </div>
      <p className="hint" style={{ margin: 0 }}>
        For focus quizzes, Smart mix and Fix my mistakes; full papers are never filtered. Level {max}: {OLY_LEVEL_TEXT[Number(max) as 1]} got it right. Levels 1–4 is a good start for klas 1.
      </p>
      <label className="toggle">
        <input type="checkbox" checked={stretch} onChange={(e) => setStretch(e.target.checked)} />
        <span>One stretch question from the level above in each Smart mix</span>
      </label>
      <div className="row">
        <label className="field">
          School's round-1 day
          <input type="date" value={day} min={r.contest.windowStart} max={r.contest.windowEnd} onChange={(e) => setDay(e.target.value)} />
          <span className="hint">Empty = first day of the window.</span>
        </label>
        <label className="field">
          Target
          <select value={shift} onChange={(e) => setShift(e.target.value)}>
            {[-4, -3, -2, -1, 0, 1, 2, 3, 4, 5, 6].map((n) => (
              <option key={n} value={n}>
                {n === 0 ? "Reach the cutoff" : n > 0 ? `${n} above the cutoff` : `${-n} below the cutoff`}
              </option>
            ))}
          </select>
          <span className="hint">Counts as 100% on the score part, per paper.</span>
        </label>
      </div>
      <div className="row">
        <button type="submit" className="btn primary">
          Save
        </button>
      </div>
      {msg && (
        <div className={`message${msg.ok ? " ok" : ""}`} role="status">
          {msg.text}
        </div>
      )}
    </form>
  );
}
