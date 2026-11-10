import { useState, type FormEvent } from "react";
import { DEFAULT_TARGET_SCORE, type Readiness } from "../../shared/types";
import { COMPARE_GROUP_NAMES, COMPARE_GROUPS, DEFAULT_COMPARE_GROUP, fmtAverage, isCompareGroup } from "../../shared/benchmarks";
import { api, messageOf } from "../api";
import { Mascot } from "./Mascot";

/** "Thursday 18 March 2027". Dates are calendar days, so format them in UTC. */
export function longDay(d: string): string {
  return new Date(`${d}T12:00:00Z`).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
}
const shortDay = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "long", timeZone: "UTC" });

function countdownLine(c: Readiness["contest"], kind: Readiness["kind"] = "kangaroo"): string {
  if (c.phase === "today") return "It's contest day. Good luck, you've got this!";
  if (c.phase === "open") return `${kind === "olympiad" ? "Round 1" : "The contest"} is on at schools now, until ${shortDay(c.windowEnd)}.`;
  if (c.phase === "done") return kind === "olympiad" ? "Round 1 done. The school hears the results a few weeks later." : "Contest done. Results come out around mid-May.";
  if (c.daysLeft === 1) return "Tomorrow!";
  const weeks = Math.floor(c.daysLeft / 7);
  return weeks >= 2 ? `That's about ${weeks} weeks.` : "Nearly there!";
}

/** One line for the parent's overview. */
export function countdownShort(c: Readiness["contest"], kind: Readiness["kind"] = "kangaroo"): string {
  if (c.phase === "countdown") return `${longDay(c.date)}: ${c.daysLeft} day${c.daysLeft === 1 ? "" : "s"} to go${c.chosen ? "" : " (first day of the window)"}.`;
  return `${longDay(c.date)}. ${countdownLine(c, kind)}`;
}

/** Date and days to go. */
export function Countdown({ r, forParent }: { r: Readiness; forParent?: boolean }) {
  const c = r.contest;
  const counting = c.phase === "countdown";
  return (
    <section className="panel side-card countdown" aria-labelledby="countdown-h">
      <div className="side-head">
        <Mascot mood={c.phase === "today" ? "cheer" : "calm"} size={44} headOnly />
        <h2 id="countdown-h">{r.kind === "olympiad" ? "Olympiad round 1" : "Kangaroo contest"}</h2>
      </div>
      <p className="contest-day">{longDay(c.date)}</p>
      {counting && (
        <p className="days-left">
          <strong>{c.daysLeft}</strong> day{c.daysLeft === 1 ? "" : "s"} to go
        </p>
      )}
      <p className="muted small-line">{countdownLine(c, r.kind)}</p>
      {!c.chosen && c.phase === "countdown" && (
        <p className="muted small-line">
          {forParent
            ? `First day of the window. Set the school's day below if you know it (up to ${shortDay(c.windowEnd)}).`
            : `Schools pick a day between ${shortDay(c.windowStart)} and ${shortDay(c.windowEnd)}.`}
        </p>
      )}
      {c.nextRound && <p className="muted small-line">Round 2 (for the best): {longDay(c.nextRound)}.</p>}
    </section>
  );
}

function Ring({ percent, size = 120 }: { percent: number; size?: number }) {
  const r = 44;
  const len = 2 * Math.PI * r;
  const colour = percent >= 80 ? "var(--grass)" : percent >= 40 ? "var(--sky)" : "var(--sun-deep)";
  return (
    <svg className="ring" viewBox="0 0 100 100" width={size} height={size} aria-hidden="true" focusable="false">
      <circle cx="50" cy="50" r={r} fill="none" stroke="var(--grid)" strokeWidth="10" />
      <circle cx="50" cy="50" r={r} fill="none" stroke={colour} strokeWidth="10" strokeLinecap="round" strokeDasharray={`${(len * percent) / 100} ${len}`} transform="rotate(-90 50 50)" />
      <text x="50" y="50" dy="0.35em" textAnchor="middle" fontFamily="Fredoka, sans-serif" fontWeight="600" fontSize="24" fill="var(--ink)">
        {percent}%
      </text>
    </svg>
  );
}

/** The readiness percentage, its three parts and the next step. */
export function ReadinessCard({ r, headingLevel = 2, title = "Contest ready", idKey = "me" }: { r: Readiness; headingLevel?: 2 | 3; title?: string; idKey?: string }) {
  const H = headingLevel === 2 ? "h2" : "h3";
  const hid = `ready-h-${idKey}`;
  const parts = [r.parts.skill, r.parts.score, r.parts.practice];
  return (
    <section className="panel side-card readiness" aria-labelledby={hid}>
      <H id={hid}>{title}</H>
      <div className="ready-top">
        <Ring percent={r.percent} />
        <p className="ready-sum">
          <span className="visually-hidden">{r.percent}% ready. </span>
          {r.tip}
        </p>
      </div>
      <ul className="ready-parts">
        {parts.map((p) => (
          <li key={p.label}>
            <span className="part-head">
              <strong>{p.label}</strong>
              <span className="muted"> counts {p.weight}%</span>
              <span className="part-pct">{p.percent}%</span>
            </span>
            <span className="part-bar" aria-hidden="true">
              <span style={{ width: `${p.percent}%` }} />
            </span>
            <span className="muted small-line">{p.detail}</span>
          </li>
        ))}
      </ul>
      {r.vsAverage && (
        <p className="vs-line small-line">
          <strong>Vs {r.vsAverage.groupName}:</strong>{" "}
          {Math.abs(r.vsAverage.diff) < 0.5
            ? "right on their average"
            : `${fmtAverage(Math.abs(r.vsAverage.diff))} points ${r.vsAverage.diff > 0 ? "above" : "below"} their average`}{" "}
          over the last {r.vsAverage.papers === 1 ? "paper" : `${r.vsAverage.papers} papers`} ({fmtAverage(r.vsAverage.score)} vs {fmtAverage(r.vsAverage.average)}).
        </p>
      )}
    </section>
  );
}

/** The parent sets the school's contest day and what score counts as 100% ready. */
export function ContestSettings({ profileId, name, r, onSaved }: { profileId: number; name: string; r: Readiness; onSaved: (r: Readiness) => void }) {
  const [day, setDay] = useState(r.contest.chosen ? r.contest.date : "");
  const [target, setTarget] = useState(String(r.target));
  const [group, setGroup] = useState(isCompareGroup(r.compareGroup) ? r.compareGroup : DEFAULT_COMPARE_GROUP);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const save = async (e: FormEvent, reset = false) => {
    e.preventDefault();
    try {
      const body = reset
        ? { contestDate: null, targetScore: null, compareGroup: DEFAULT_COMPARE_GROUP }
        : { contestDate: day || null, targetScore: Number(target) === DEFAULT_TARGET_SCORE ? null : Number(target), compareGroup: group };
      const next = await api.put<Readiness>(`/api/profiles/${profileId}/contest`, body);
      if (reset) {
        setDay("");
        setTarget(String(DEFAULT_TARGET_SCORE));
        setGroup(DEFAULT_COMPARE_GROUP);
      }
      setMsg({ ok: true, text: `Saved for ${name}.` });
      onSaved(next);
    } catch (err) {
      setMsg({ ok: false, text: messageOf(err) });
    }
  };

  return (
    <form className="contest-form stack" onSubmit={(e) => save(e)}>
      <div className="row">
        <label className="field">
          School's contest day
          <input type="date" value={day} min={r.contest.windowStart} max={r.contest.windowEnd} onChange={(e) => setDay(e.target.value)} />
          <span className="hint">Empty = first day ({shortDay(r.contest.windowStart)}).</span>
        </label>
        <label className="field">
          Target score
          <input type="number" inputMode="numeric" min={40} max={120} step={1} required value={target} onChange={(e) => setTarget(e.target.value)} />
          <span className="hint">Out of 120. This score counts as 100% on the score part.</span>
        </label>
        <label className="field">
          Compare with
          <select value={group} onChange={(e) => setGroup(e.target.value as typeof group)}>
            {COMPARE_GROUPS.map((g) => (
              <option key={g} value={g}>
                {COMPARE_GROUP_NAMES[g]}
              </option>
            ))}
          </select>
          <span className="hint">Real wizSMART entrants' average. Groep 8 is about her age.</span>
        </label>
      </div>
      <div className="row">
        <button type="submit" className="btn primary">
          Save
        </button>
        <button type="button" className="btn quiet" onClick={(e) => save(e, true)}>
          Back to defaults
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
