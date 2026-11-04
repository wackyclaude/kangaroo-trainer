import { useEffect, useState } from "react";
import { FOCUS_AREAS, TIERS, type FocusArea, type QuestionDetail, type QuestionSummary } from "../../shared/types";
import { api, messageOf } from "../api";
import { useContest, withContest } from "../contest";

const focusVar = (f: FocusArea) => `var(--${f})`;

/** Browse the question bank by year, focus area and tier. Answering comes in the practice modes. */
export function Explorer() {
  const [contest] = useContest();
  const oly = contest === "olympiad";
  const [years, setYears] = useState<number[]>([]);
  const [year, setYear] = useState<string>("2026");
  const [focus, setFocus] = useState<string>("");
  const [tier, setTier] = useState<string>("");
  const [list, setList] = useState<QuestionSummary[]>([]);
  const [current, setCurrent] = useState<QuestionDetail | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api.get<{ years: { year: number }[] }>(withContest("/api/questions/overview", contest)).then(
      (o) => setYears(o.years.map((y) => y.year).reverse()),
      (e) => setError(messageOf(e)),
    );
  }, [contest]);

  useEffect(() => {
    const qs = new URLSearchParams();
    if (year) qs.set("year", year);
    if (focus) qs.set("focus", focus);
    if (tier) qs.set("tier", tier);
    if (oly) qs.set("contest", contest);
    api.get<QuestionSummary[]>(`/api/questions?${qs}`).then(
      (l) => {
        setList(l);
        setCurrent(null);
      },
      (e) => setError(messageOf(e)),
    );
  }, [year, focus, tier, contest, oly]);

  const open = (id: string) => api.get<QuestionDetail>(`/api/questions/${id}`).then(setCurrent, (e) => setError(messageOf(e)));

  return (
    <section>
      <h2>Question bank{oly ? " · Olympiad" : ""}</h2>
      <div className="filters">
        <label>
          <span className="visually-hidden">Year</span>
          <select value={year} onChange={(e) => setYear(e.target.value)}>
            <option value="">All years</option>
            {years.map((y) => (
              <option key={y}>{y}</option>
            ))}
          </select>
        </label>
        <label>
          <span className="visually-hidden">Focus area</span>
          <select value={focus} onChange={(e) => setFocus(e.target.value)}>
            <option value="">All focus areas</option>
            {Object.entries(FOCUS_AREAS).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span className="visually-hidden">Tier</span>
          <select value={tier} onChange={(e) => setTier(e.target.value)}>
            <option value="">All tiers</option>
            {TIERS.map((t) => (
              <option key={t}>{t}</option>
            ))}
          </select>
        </label>
        <span className="muted" style={{ alignSelf: "center" }}>
          {list.length} questions
        </span>
      </div>
      {error && <div className="message" role="alert">{error}</div>}
      <div className="q-list">
        {list.map((q) => (
          <button
            key={q.id}
            type="button"
            className="q-cell"
            aria-current={current?.id === q.id}
            aria-label={`${q.year} question ${q.label}, ${FOCUS_AREAS[q.focusPrimary]}`}
            style={{ ["--focus" as string]: focusVar(q.focusPrimary) }}
            onClick={() => open(q.id)}
          >
            {year ? q.label : `${String(q.year).slice(2)}·${q.label}`}
          </button>
        ))}
      </div>
      {current && (
        <article className="q-view panel">
          <div className="row" style={{ marginBottom: 12 }}>
            <h3 style={{ margin: 0 }}>
              {current.year}, question {current.label}
            </h3>
            <span className="chip" style={{ "--c": focusVar(current.focusPrimary) } as React.CSSProperties}>
              {FOCUS_AREAS[current.focusPrimary]}
            </span>
            {current.focusSecondary && (
              <span className="chip" style={{ "--c": focusVar(current.focusSecondary) } as React.CSSProperties}>
                {FOCUS_AREAS[current.focusSecondary]}
              </span>
            )}
            <span className="chip outline">{current.tier}</span>
          </div>
          {current.voidNote && <div className="message">{current.voidNote}</div>}
          <img className="q-image" src={current.imageUrl} alt={current.text} />
        </article>
      )}
    </section>
  );
}
