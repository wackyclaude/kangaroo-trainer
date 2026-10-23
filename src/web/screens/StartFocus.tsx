import { useEffect, useState } from "react";
import { FOCUS_AREAS, TIERS, type FocusArea, type HelpLevel, type Tier } from "../../shared/types";
import { api, messageOf } from "../api";
import { Chips, Segmented } from "../components/Segmented";
import { focusColor, go, HELP_TEXT } from "../format";

const TIER_LABEL: Record<Tier, string> = { "warm-up": "Warm-up", core: "Core", challenge: "Challenge" };

export function StartFocus() {
  const [focus, setFocus] = useState<FocusArea[]>(() => {
    const m = window.location.hash.match(/[?&]f=([A-Z,]+)/);
    const keys = Object.keys(FOCUS_AREAS) as FocusArea[];
    return m?.[1] ? (m[1].split(",").filter((k) => (keys as string[]).includes(k)) as FocusArea[]) : [];
  });
  const [tiers, setTiers] = useState<Tier[]>([]);
  const [count, setCount] = useState("10");
  const [help, setHelp] = useState<HelpLevel>("practice");
  const [timer, setTimer] = useState("off");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [coverage, setCoverage] = useState<{ total: number; withSolutions: number } | null>(null);

  useEffect(() => {
    api.get<{ total: number; withSolutions: number }>("/api/solutions/coverage").then(setCoverage, () => undefined);
  }, []);

  const start = async (onPaper = false) => {
    setBusy(true);
    setError("");
    try {
      const { id } = await api.post<{ id: number }>("/api/sessions", {
        mode: "focus",
        help,
        focus,
        tiers,
        count: Number(count),
        timerMinutes: timer === "off" ? null : Number(timer),
        delivery: onPaper ? "paper" : "app",
      });
      go(onPaper ? `#/print/${id}` : `#/quiz/${id}`);
    } catch (e) {
      setError(messageOf(e));
      setBusy(false);
    }
  };

  return (
    <div className="stack" style={{ gap: 28 }}>
      <div>
        <button type="button" className="btn quiet" onClick={() => go("#/")}>
          ← Back
        </button>
        <h1>Focus quiz</h1>
        <p className="muted">Choose what to practise. Questions you got right in the last 30 days are saved for later.</p>
      </div>

      <section className="panel stack">
        <h2>Topics</h2>
        <p className="muted" style={{ margin: 0 }}>
          Pick one or more, or none for a mix of everything.
        </p>
        <Chips label="Focus areas" values={focus} onChange={setFocus} colorOf={focusColor} options={(Object.keys(FOCUS_AREAS) as FocusArea[]).map((f) => ({ value: f, label: FOCUS_AREAS[f] }))} />
        <h2 style={{ marginTop: 12 }}>How hard?</h2>
        <Chips label="Difficulty" values={tiers} onChange={setTiers} options={TIERS.map((t) => ({ value: t, label: TIER_LABEL[t] }))} />
      </section>

      <section className="panel stack">
        <h2>Settings</h2>
        <div className="setting">
          <span className="setting-name">Questions</span>
          <Segmented label="Number of questions" value={count} onChange={setCount} options={["5", "10", "15", "20"].map((n) => ({ value: n, label: n }))} />
        </div>
        <div className="setting">
          <span className="setting-name">Help</span>
          <Segmented label="Help level" value={help} onChange={setHelp} options={(["test", "practice", "learn"] as const).map((h) => ({ value: h, label: HELP_TEXT[h].name }))} />
        </div>
        <p className="muted" style={{ margin: 0 }}>
          {HELP_TEXT[help].line}
        </p>
        {help === "learn" && coverage && coverage.withSolutions < coverage.total && (
          <div className="message ok">
            Learn mode only picks questions that already have a step-by-step solution ({coverage.withSolutions} of {coverage.total} so far).
          </div>
        )}
        <div className="setting">
          <span className="setting-name">Timer</span>
          <Segmented label="Timer" value={timer} onChange={setTimer} options={[{ value: "off", label: "Off" }, ...["10", "20", "30"].map((m) => ({ value: m, label: `${m} min` }))]} />
        </div>
        {error && <div className="message" role="alert">{error}</div>}
        <div>
          <button type="button" className="btn primary big" disabled={busy} onClick={() => start()}>
            Start quiz
          </button>
        </div>
        <p className="muted" style={{ margin: 0 }}>
          Rather do it on paper?{" "}
          <button type="button" className="btn quiet" disabled={busy} onClick={() => start(true)}>
            Print these questions
          </button>
        </p>
      </section>
    </div>
  );
}
