import { useEffect, useState } from "react";
import type { UsageReport } from "../../shared/types";
import { api, messageOf } from "../api";
import { Segmented } from "./Segmented";

const TIER_NAME: Record<string, string> = {
  "warm-up": "Warm-up (first third)",
  core: "Core (middle third)",
  challenge: "Challenge (last third)",
};
const sec = (s: number | null) =>
  s === null
    ? "—"
    : s < 90
      ? `${s} s`
      : `${Math.round((s / 60) * 10) / 10} min`;

/** Parent view: how a student uses the app. Counts and averages only, from this server. */
export function UsagePanel({
  profileId,
  name,
}: {
  profileId: number;
  name: string;
}) {
  const [days, setDays] = useState<"7" | "30" | "90">("30");
  const [u, setU] = useState<UsageReport | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    setU(null);
    api
      .get<UsageReport>(`/api/usage/${profileId}?days=${days}`)
      .then(setU, (e) => setError(messageOf(e)));
  }, [profileId, days]);

  return (
    <section className="panel stack usage">
      <div className="pic-head">
        <h2>How {name} uses the app</h2>
        <Segmented
          label="Period"
          value={days}
          onChange={setDays}
          options={[
            { value: "7", label: "7 days" },
            { value: "30", label: "30 days" },
            { value: "90", label: "90 days" },
          ]}
        />
      </div>
      <p className="muted" style={{ margin: 0 }}>
        Counts and averages only, across all contests. Nothing is drawn, typed
        or recorded, and nothing leaves your own server.
      </p>
      {error && <p className="message">{error}</p>}
      {!u && !error && <p className="muted">Loading…</p>}
      {u && u.answers === 0 && u.activeDays === 0 && (
        <p className="muted">No activity in this period.</p>
      )}
      {u && (u.answers > 0 || u.activeDays > 0) && (
        <>
          <div className="stat-row">
            <div className="panel stat">
              <span className="stat-label">Active days</span>
              <span className="stat-num">
                {u.activeDays}
                <small> / {u.days}</small>
              </span>
              <span className="muted">{u.answers} questions answered</span>
            </div>
            <div className="panel stat">
              <span className="stat-label">Time per question</span>
              <span className="stat-num">{sec(u.medianSeconds)}</span>
              <span className="muted">
                middle value · {u.quick}% under 15 s · {u.slow}% over 5 min
              </span>
            </div>
          </div>

          <h3>Time and results by part of the paper</h3>
          <div className="table-scroll">
            <table className="people">
              <thead>
                <tr>
                  <th>Part</th>
                  <th>Answers</th>
                  <th>Time per question</th>
                  <th>Right</th>
                </tr>
              </thead>
              <tbody>
                {u.byTier.map((t) => (
                  <tr key={t.tier}>
                    <td>{TIER_NAME[t.tier] ?? t.tier}</td>
                    <td>{t.answers}</td>
                    <td>{sec(t.medianSeconds)}</td>
                    <td>{t.answers ? `${t.right}%` : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <h3>Answers and helpers</h3>
          <div className="usage-picks" aria-label="Which options were picked">
            {u.picks.map((p) => (
              <span key={p.option} className="chip outline">
                {p.option}: {p.share}%
              </span>
            ))}
          </div>
          <ul className="usage-list">
            <li>
              Changed the pick before checking on{" "}
              <strong>{u.changed.share}%</strong> of questions
              {u.changed.right !== null
                ? `, and ${u.changed.right}% of those ended right`
                : ""}
              .
            </li>
            <li>
              Used a hint on <strong>{u.hintShare}%</strong>, and drew on the
              scratch pad on <strong>{u.scratchShare}%</strong> of questions.
            </li>
          </ul>

          <h3>Features used</h3>
          <div className="table-scroll">
            <table className="people">
              <tbody>
                {u.features
                  .filter((f) => f.count > 0)
                  .map((f) => (
                    <tr key={f.key}>
                      <td>{f.label}</td>
                      <td>{f.count}×</td>
                    </tr>
                  ))}
                {u.features.every((f) => f.count === 0) && (
                  <tr>
                    <td className="muted">None counted yet.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <h3>Devices</h3>
          {u.devices.length ? (
            <div className="table-scroll">
              <table className="people">
                <thead>
                  <tr>
                    <th>Device</th>
                    <th>System</th>
                    <th>Browser</th>
                    <th>Visits</th>
                  </tr>
                </thead>
                <tbody>
                  {u.devices.map((d) => (
                    <tr key={`${d.device}-${d.os}-${d.browser}`}>
                      <td style={{ textTransform: "capitalize" }}>
                        {d.device}
                      </td>
                      <td>{d.os}</td>
                      <td>{d.browser}</td>
                      <td>{d.visits}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="muted">No visits counted yet.</p>
          )}
        </>
      )}
    </section>
  );
}
