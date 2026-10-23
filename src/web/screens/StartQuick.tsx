import { useEffect, useState } from "react";
import type { HelpLevel, Insights } from "../../shared/types";
import { api, messageOf } from "../api";
import { MascotSays } from "../components/Mascot";
import { Segmented } from "../components/Segmented";
import { focusName, go, HELP_TEXT, when } from "../format";

/** Start screen for "Fix my mistakes" and "Smart mix": the app picks the questions. */
export function StartQuick({ mode }: { mode: "mistakes" | "smart" }) {
  const [ins, setIns] = useState<Insights | null>(null);
  const [help, setHelp] = useState<HelpLevel>(mode === "mistakes" ? "learn" : "practice");
  const [count, setCount] = useState(mode === "mistakes" ? "10" : "12");
  const [timer, setTimer] = useState("off");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.get<Insights>("/api/insights").then(setIns, () => undefined);
  }, []);

  const start = async () => {
    setBusy(true);
    setError("");
    try {
      const body = mode === "mistakes" ? { mode, help, count: Number(count) } : { mode, help, count: Number(count), timerMinutes: timer === "off" ? null : Number(timer) };
      const { id } = await api.post<{ id: number }>("/api/sessions", body);
      go(`#/quiz/${id}`);
    } catch (e) {
      setError(messageOf(e));
      setBusy(false);
    }
  };

  const m = ins?.mistakes;
  const none = mode === "mistakes" && m && m.due + m.waiting === 0;

  return (
    <div className="stack" style={{ gap: 28 }}>
      <div>
        <button type="button" className="btn quiet" onClick={() => go("#/")}>
          ← Back
        </button>
        <h1>{mode === "mistakes" ? "Fix my mistakes" : "Smart mix"}</h1>
        {mode === "mistakes" ? (
          <p className="muted">
            Questions you got wrong or skipped come back after 1, 3, 7 and 21 days. Get one right twice in a row without a hint and it's mastered.
          </p>
        ) : (
          <p className="muted">The app picks for you: mostly your weakest areas, some harder questions to stretch, and a past mistake or two.</p>
        )}
      </div>

      {ins && mode === "mistakes" && m && (
        <MascotSays mood={none ? (m.mastered ? "cheer" : "sleep") : m.due ? "wave" : "calm"} size={80} role="status">
          <p>
          {none
            ? m.mastered
              ? `Nothing to fix: all ${m.mastered} past mistakes are mastered. Brilliant!`
              : "No mistakes saved yet. They appear here after a quiz."
            : m.due
              ? `${m.due} ready to try again${m.waiting ? `, and ${m.waiting} coming back later` : ""}.`
              : `None are due yet. The next comes back ${when(m.nextDueAt!)}. You can still practise the ${m.waiting} waiting now.`}
          </p>
        </MascotSays>
      )}
      {ins && mode === "smart" && (
        <MascotSays mood="think" size={80} role="status">
          <p>
            <strong>Focus this time: {ins.weakAreas.map((w) => focusName(w.focus)).join(" and ")}.</strong>
          </p>
        </MascotSays>
      )}

      <section className="panel stack">
        <h2>Settings</h2>
        <div className="setting">
          <span className="setting-name">Questions</span>
          <Segmented label="Number of questions" value={count} onChange={setCount} options={(mode === "mistakes" ? ["5", "10", "15"] : ["8", "12", "16"]).map((n) => ({ value: n, label: n }))} />
        </div>
        <div className="setting">
          <span className="setting-name">Help</span>
          <Segmented label="Help level" value={help} onChange={setHelp} options={(["test", "practice", "learn"] as const).map((h) => ({ value: h, label: HELP_TEXT[h].name }))} />
        </div>
        <p className="muted" style={{ margin: 0 }}>
          {HELP_TEXT[help].line}
          {help === "learn" ? " Using a hint is fine, but the question then needs another go before it counts as mastered." : ""}
        </p>
        {mode === "smart" && (
          <div className="setting">
            <span className="setting-name">Timer</span>
            <Segmented label="Timer" value={timer} onChange={setTimer} options={[{ value: "off", label: "Off" }, ...["15", "25"].map((x) => ({ value: x, label: `${x} min` }))]} />
          </div>
        )}
        {error && <div className="message" role="alert">{error}</div>}
        <div>
          <button type="button" className="btn primary big" disabled={busy || !!none} onClick={start}>
            Start
          </button>
        </div>
      </section>
    </div>
  );
}
