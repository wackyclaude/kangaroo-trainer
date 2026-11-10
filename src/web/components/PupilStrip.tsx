import { OLY_LEVEL_NAME, type OlyLevel, type PupilStats } from "../../shared/types";

/**
 * Kangaroo, once a question is graded: its level 1–5 and how real wizSMART pupils answered it
 * ("62% of pupils got this right"), with the most popular wrong answer when many fell for it.
 */
export function PupilStrip({ level, pupils, year, choice }: { level: OlyLevel | null; pupils: PupilStats | null | undefined; year: number; choice?: string | null }) {
  if (level === null) return null;
  const name = OLY_LEVEL_NAME[level];
  if (!pupils) {
    return (
      <div className="stats-strip pupil-strip">
        <span className="stats-title">
          Level {level} of 5 · {name}
        </span>
        <span className="muted small-line">There are no pupil numbers for {year}, so this level is a guess from where the question sits in the paper.</span>
      </div>
    );
  }
  const { right, blank, trap } = pupils;
  const fellForIt = trap && choice === trap.choice;
  return (
    <div className="stats-strip pupil-strip" aria-label={`How pupils did in ${year}`}>
      <span className="stats-title">
        {right}% of pupils got this right · level {level} of 5 ({name})
      </span>
      <ul>
        <li>
          <span className="stats-class">Right</span>
          <span className="stats-bar" aria-hidden="true">
            <span style={{ width: `${right}%` }} />
          </span>
          <strong>{right}%</strong>
        </li>
        {trap && (
          <li className="trap">
            <span className="stats-class">Picked {trap.choice}</span>
            <span className="stats-bar" aria-hidden="true">
              <span style={{ width: `${trap.pct}%` }} />
            </span>
            <strong>{trap.pct}%</strong>
          </li>
        )}
        <li className="blank">
          <span className="stats-class">Skipped</span>
          <span className="stats-bar" aria-hidden="true">
            <span style={{ width: `${blank}%` }} />
          </span>
          <strong>{blank}%</strong>
        </li>
      </ul>
      {trap && (
        <span className="small-line">
          {fellForIt ? (
            <>
              <strong>Common trap:</strong> you picked {trap.choice}, like {trap.pct}% of pupils. Worth a look at why it seems right but isn't.
            </>
          ) : (
            <>
              <strong>Common trap:</strong> {trap.pct}% of pupils picked {trap.choice}.
            </>
          )}
        </span>
      )}
      <span className="muted small-line">Real wizSMART pupils in {year}.</span>
    </div>
  );
}
