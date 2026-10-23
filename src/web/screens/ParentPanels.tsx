import { useEffect, useState } from "react";
import { FOCUS_AREAS, LEVEL_NAMES, type Benchmarks, type FocusArea } from "../../shared/types";
import { api, messageOf } from "../api";
import { Chips, Segmented } from "../components/Segmented";
import { focusColor, focusName, go, minutes, pct } from "../format";

const AREAS = Object.keys(FOCUS_AREAS) as FocusArea[];

/** Compares the students. Group averages only show once 3 students have practised. */
export function BenchmarksPanel() {
  const [b, setB] = useState<Benchmarks | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    api.get<Benchmarks>("/api/admin/benchmarks").then(setB, (e) => setError(messageOf(e)));
  }, []);
  if (error) return <div className="message" role="alert">{error}</div>;
  if (!b) return null;
  const active = b.profiles.filter((p) => p.answers > 0);

  return (
    <section className="panel stack">
      <h2>Benchmarks</h2>
      <p className="muted" style={{ margin: 0 }}>
        Age band: {b.ageBand}. Percentages are weighted accuracy over each student's last 30 answers per area. Time = middle time per question; Est. = contest score estimate out of 120.{" "}
        {b.group ? "" : "Group averages appear once 3 students have practised."}
      </p>
      {active.length === 0 ? (
        <p className="muted">No practice yet.</p>
      ) : (
        <div className="table-scroll">
          <table className="people bench">
            <thead>
              <tr>
                <th scope="col">Student</th>
                {AREAS.map((f) => (
                  <th scope="col" key={f}>
                    <span className="area-dot" style={{ background: focusColor(f) }} aria-hidden="true" /> {focusName(f).split(" ")[0]}
                  </th>
                ))}
                <th scope="col">Time</th>
                <th scope="col">Est.</th>
              </tr>
            </thead>
            <tbody>
              {active.map((p) => (
                <tr key={p.id}>
                  <th scope="row">
                    <button type="button" className="btn quiet" onClick={() => go(`#/insights/${p.id}`)}>
                      {p.avatar} {p.nickname}
                    </button>
                  </th>
                  {AREAS.map((f) => {
                    const a = p.areas[f];
                    return (
                      <td key={f} title={a ? LEVEL_NAMES[a.level] : ""}>
                        {pct(a?.accuracy ?? null)}
                        {a && a.accuracy !== null && <span className="bench-level">{LEVEL_NAMES[a.level]}</span>}
                      </td>
                    );
                  })}
                  <td>{minutes(p.medianTimeMs)}</td>
                  <td>{p.estimate ?? "—"}</td>
                </tr>
              ))}
              {b.group && (
                <tr className="group-row">
                  <th scope="row">Group average ({b.group.profiles})</th>
                  {AREAS.map((f) => (
                    <td key={f}>{pct(b.group!.areas[f] ?? null)}</td>
                  ))}
                  <td>{minutes(b.group.medianTimeMs)}</td>
                  <td>{b.group.estimate ?? "—"}</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
      {b.papers.length > 0 && (
        <>
          <h3>Same paper, best score</h3>
          <div className="table-scroll">
            <table className="people">
              <thead>
                <tr>
                  <th scope="col">Paper</th>
                  {active.map((p) => (
                    <th scope="col" key={p.id}>
                      {p.avatar} {p.nickname}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {b.papers.map((row) => (
                  <tr key={row.year}>
                    <th scope="row">{row.year}</th>
                    {active.map((p) => {
                      const s = row.scores.find((x) => x.profileId === p.id);
                      return <td key={p.id}>{s ? `${s.best} / ${s.max}` : "—"}</td>;
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  );
}

interface Student {
  id: number;
  nickname: string;
  avatar: string;
}

/** Sets up a paper or quiz for a student to do on paper, then opens the printable version. */
export function PrintPanel({ students }: { students: Student[] }) {
  const [who, setWho] = useState<number | null>(students[0]?.id ?? null);
  const [kind, setKind] = useState<"paper" | "focus">("paper");
  const [years, setYears] = useState<number[]>([]);
  const [year, setYear] = useState<number | null>(null);
  const [focus, setFocus] = useState<FocusArea[]>([]);
  const [count, setCount] = useState("10");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.get<{ year: number }[]>("/api/papers").then((p) => {
      setYears(p.map((x) => x.year));
      setYear(p[0]?.year ?? null);
    }, () => undefined);
  }, []);
  useEffect(() => {
    if (who === null && students[0]) setWho(students[0].id);
  }, [students, who]);

  const make = async () => {
    if (!who) return setError("Add a student first.");
    setBusy(true);
    setError("");
    try {
      const body =
        kind === "paper"
          ? { mode: "paper", paperYear: year, help: "test", timed: false, delivery: "paper", forProfileId: who }
          : { mode: "focus", help: "test", focus, count: Number(count), delivery: "paper", forProfileId: who };
      const { id } = await api.post<{ id: number }>("/api/sessions", body);
      go(`#/print/${id}`);
    } catch (e) {
      setError(messageOf(e));
      setBusy(false);
    }
  };

  return (
    <section className="panel stack">
      <h2>Print a paper or quiz</h2>
      <p className="muted" style={{ margin: 0 }}>
        Makes a printable PDF with the questions, an answer sheet and an answer key for you. Afterwards, type the answers in so they count towards progress.
      </p>
      {students.length === 0 ? (
        <p className="muted">Add a student first.</p>
      ) : (
        <>
          <div className="setting">
            <span className="setting-name">For</span>
            <Segmented label="Student" value={String(who ?? "")} onChange={(v) => setWho(Number(v))} options={students.map((s) => ({ value: String(s.id), label: `${s.avatar} ${s.nickname}` }))} />
          </div>
          <div className="setting">
            <span className="setting-name">What</span>
            <Segmented label="Kind" value={kind} onChange={setKind} options={[{ value: "paper", label: "Full paper" }, { value: "focus", label: "Focus quiz" }]} />
          </div>
          {kind === "paper" ? (
            <label className="field">
              Year
              <select value={year ?? ""} onChange={(e) => setYear(Number(e.target.value))}>
                {years.map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <>
              <Chips label="Focus areas" values={focus} onChange={setFocus} colorOf={(f) => focusColor(f)} options={AREAS.map((f) => ({ value: f, label: FOCUS_AREAS[f] }))} />
              <div className="setting">
                <span className="setting-name">Questions</span>
                <Segmented label="Number of questions" value={count} onChange={setCount} options={["5", "10", "15", "20"].map((n) => ({ value: n, label: n }))} />
              </div>
            </>
          )}
          {error && <div className="message" role="alert">{error}</div>}
          <div>
            <button type="button" className="btn primary" disabled={busy} onClick={make}>
              Make the printable version
            </button>
          </div>
        </>
      )}
    </section>
  );
}

export function ExportPanel() {
  return (
    <section className="panel stack">
      <h2>Export data</h2>
      <p className="muted" style={{ margin: 0 }}>
        Every quiz and every answer, to open in a spreadsheet or analyse elsewhere. The questions themselves are not included.
      </p>
      <div className="row">
        <a className="btn" href="/api/admin/export/attempts.csv" download>
          Answers (CSV)
        </a>
        <a className="btn" href="/api/admin/export/sessions.csv" download>
          Quizzes (CSV)
        </a>
        <a className="btn" href="/api/admin/export.json" download>
          Everything (JSON)
        </a>
      </div>
    </section>
  );
}
