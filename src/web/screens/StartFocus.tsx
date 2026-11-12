import { useEffect, useState } from "react";
import { FOCUS_AREAS, KANGAROO_LEVEL_TEXT, OLY_LEVEL_NAME, OLY_LEVEL_TEXT, OLY_LEVELS, OLY_PARTS, type FocusArea, type HelpLevel, type OlyLevel, type OlyPart } from "../../shared/types";
import { useContest, useLevelRange, withContest } from "../contest";
import { api, messageOf } from "../api";
import { Chips, Segmented } from "../components/Segmented";
import { focusColor, go, HELP_TEXT } from "../format";

export function StartFocus() {
  const [focus, setFocus] = useState<FocusArea[]>(() => {
    const m = window.location.hash.match(/[?&]f=([A-Z,]+)/);
    const keys = Object.keys(FOCUS_AREAS) as FocusArea[];
    return m?.[1] ? (m[1].split(",").filter((k) => (keys as string[]).includes(k)) as FocusArea[]) : [];
  });
  const [contest] = useContest();
  const oly = contest === "olympiad";
  const range = useLevelRange();
  const [levels, setLevels] = useState<string[]>([]);
  const [parts, setParts] = useState<OlyPart[]>([]);
  const [count, setCount] = useState("8");
  const [help, setHelp] = useState<HelpLevel>("practice");
  const [timer, setTimer] = useState("off");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [coverage, setCoverage] = useState<{ total: number; withSolutions: number } | null>(null);

  useEffect(() => {
    api.get<{ total: number; withSolutions: number }>(withContest("/api/solutions/coverage", contest)).then(setCoverage, () => undefined);
  }, [contest]);

  const start = async (onPaper = false) => {
    setBusy(true);
    setError("");
    try {
      const { id } = await api.post<{ id: number }>("/api/sessions", {
        mode: "focus",
        contest,
        help,
        focus,
        levels: levels.map(Number),
        ...(oly ? { parts } : {}),
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
    <div className="stack" style={{ gap: 24 }}>
      <div>
        <button type="button" className="btn quiet" onClick={() => go("#/")}>
          ← Back
        </button>
        <h1>Focus quiz{oly ? " · Olympiad" : ""}</h1>
        <p className="muted">Choose what to practise. Questions you got right in the last 30 days are saved for later.</p>
      </div>

      <section className="panel stack">
        <h2>Topics</h2>
        <p className="muted" style={{ margin: 0 }}>
          Pick one or more, or none for a mix of everything.
        </p>
        <Chips label="Focus areas" values={focus} onChange={setFocus} colorOf={focusColor} options={(Object.keys(FOCUS_AREAS) as FocusArea[]).map((f) => ({ value: f, label: FOCUS_AREAS[f] }))} />
        {oly ? (
          <>
            <h2 style={{ marginTop: 16 }}>Which part?</h2>
            <Chips label="Part" values={parts} onChange={setParts} options={OLY_PARTS.map((p) => ({ value: p, label: p === "A" ? "A: multiple choice" : "B: type the answer" }))} />
            <h2 style={{ marginTop: 16 }}>Which levels?</h2>
            <Chips label="Levels" values={levels} onChange={setLevels} options={range.map((l) => ({ value: String(l), label: `Level ${l}` }))} />
            <LevelGuide items={range.map((l) => ({ name: `Level ${l} · ${OLY_LEVEL_NAME[l as OlyLevel]}`, text: `${OLY_LEVEL_TEXT[l as OlyLevel]} got it right.` }))} />
            <p className="muted small-line" style={{ margin: 0 }}>
              None picked = all of {range.length === 1 ? `level ${range[0]}` : `levels ${range[0]}–${range[range.length - 1]}`} (the range your parent set).
            </p>
          </>
        ) : (
          <>
            <h2 style={{ marginTop: 16 }}>How hard?</h2>
            <Chips label="Levels" values={levels} onChange={setLevels} options={OLY_LEVELS.map((l) => ({ value: String(l), label: `Level ${l}` }))} />
            <LevelGuide items={OLY_LEVELS.map((l) => ({ name: `Level ${l} · ${OLY_LEVEL_NAME[l]}`, text: `${KANGAROO_LEVEL_TEXT[l]} got it right.` }))} />
            <p className="muted small-line" style={{ margin: 0 }}>
              From how real contest pupils did on each question. None picked = all levels.
            </p>
          </>
        )}
      </section>

      <section className="panel stack">
        <h2>Settings</h2>
        <div className="setting">
          <span className="setting-name">Questions</span>
          <Segmented label="Number of questions" value={count} onChange={setCount} options={["5", "8", "12", "16"].map((n) => ({ value: n, label: n }))} />
        </div>
        <div className="setting">
          <span className="setting-name">Help</span>
          <Segmented label="Help level" value={help} onChange={setHelp} options={(["test", "practice", "learn"] as const).map((h) => ({ value: h, label: HELP_TEXT[h].name }))} />
        </div>
        <p className="muted" style={{ margin: 0 }}>
          {HELP_TEXT[help].line}
        </p>
        {!oly && help === "learn" && coverage && coverage.withSolutions < coverage.total && (
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

/** One line per level, under the level chips. */
function LevelGuide({ items }: { items: { name: string; text: string }[] }) {
  return (
    <details className="more">
      <summary>What do the levels mean?</summary>
      <dl className="level-guide">
        {items.map((i) => (
          <div key={i.name}>
            <dt>{i.name}</dt>
            <dd>{i.text}</dd>
          </div>
        ))}
      </dl>
    </details>
  );
}
