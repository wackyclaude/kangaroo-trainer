import { useEffect, useState } from "react";
import type { HelpLevel } from "../../shared/types";
import { api, messageOf } from "../api";
import { Segmented } from "../components/Segmented";
import { go, HELP_TEXT } from "../format";

interface PaperInfo {
  year: number;
  questions: number;
  withSolutions: number;
  best: { best: number; max: number; attempts: number } | null;
}

export function StartPaper() {
  const [papers, setPapers] = useState<PaperInfo[]>([]);
  const [year, setYear] = useState<number | null>(null);
  const [help, setHelp] = useState<HelpLevel>("test");
  const [timed, setTimed] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.get<PaperInfo[]>("/api/papers").then(
      (p) => {
        setPapers(p);
        const firstNew = p.find((x) => !x.best) ?? p[0];
        setYear(firstNew?.year ?? null);
      },
      (e) => setError(messageOf(e)),
    );
  }, []);

  const start = async () => {
    if (!year) return;
    setBusy(true);
    try {
      const { id } = await api.post<{ id: number }>("/api/sessions", { mode: "paper", paperYear: year, help, timed });
      go(`#/quiz/${id}`);
    } catch (e) {
      setError(messageOf(e));
      setBusy(false);
    }
  };

  const printIt = async () => {
    if (!year) return;
    setBusy(true);
    try {
      const { id } = await api.post<{ id: number }>("/api/sessions", { mode: "paper", paperYear: year, help: "test", timed: false, delivery: "paper" });
      go(`#/print/${id}`);
    } catch (e) {
      setError(messageOf(e));
      setBusy(false);
    }
  };

  const chosen = papers.find((p) => p.year === year);

  return (
    <div className="stack" style={{ gap: 28 }}>
      <div>
        <button type="button" className="btn quiet" onClick={() => go("#/")}>
          ← Back
        </button>
        <h1>Full past paper</h1>
        <p className="muted">Pick a year. A real paper has 24 questions and 50 minutes, and gets harder as you go.</p>
      </div>

      <section aria-label="Choose a year">
        <div className="year-grid">
          {papers.map((p) => (
            <button key={p.year} type="button" className="year-card" aria-pressed={p.year === year} onClick={() => setYear(p.year)}>
              <span className="year">{p.year}</span>
              <span className="year-note">{p.best ? `Best ${p.best.best} / ${p.best.max}` : `${p.questions} questions`}</span>
            </button>
          ))}
        </div>
      </section>

      <section className="panel stack">
        <h2>How do you want to do it?</h2>
        <Segmented
          label="Help level"
          value={help}
          onChange={(h) => {
            setHelp(h);
            setTimed(h === "test");
          }}
          options={(["test", "practice", "learn"] as const).map((h) => ({ value: h, label: HELP_TEXT[h].name }))}
        />
        <p className="muted" style={{ margin: 0 }}>
          {HELP_TEXT[help].line}
        </p>
        {help === "learn" && chosen && chosen.withSolutions < chosen.questions && (
          <div className="message">
            {chosen.withSolutions === 0
              ? `The worked solutions for ${chosen.year} are still being written, so Learn mode will only show the right answer. Years marked "Solutions ✓" have them.`
              : `${chosen.withSolutions} of ${chosen.questions} questions in ${chosen.year} have worked solutions so far.`}
          </div>
        )}
        <label className="toggle">
          <input type="checkbox" checked={timed} onChange={(e) => setTimed(e.target.checked)} />
          <span>50-minute timer</span>
        </label>
        {error && <div className="message" role="alert">{error}</div>}
        <div>
          <button type="button" className="btn primary big" disabled={!year || busy} onClick={start}>
            Start {chosen?.year ?? ""} paper
          </button>
        </div>
        <p className="muted" style={{ margin: 0 }}>
          Rather do it on paper?{" "}
          <button type="button" className="btn quiet" disabled={!year || busy} onClick={printIt}>
            Print the {chosen?.year ?? ""} paper
          </button>
        </p>
      </section>
    </div>
  );
}
