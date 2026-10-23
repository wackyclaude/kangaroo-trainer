import { useEffect, useState } from "react";
import type { Rewards } from "../../shared/types";
import { api, messageOf } from "../api";
import { go } from "../format";
import { BadgeMedal } from "../components/Art";
import { MascotSays } from "../components/Mascot";

const dateOf = (ms: number) => new Date(ms).toLocaleDateString(undefined, { day: "numeric", month: "short" });

export function Badges() {
  const [r, setR] = useState<Rewards | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    api.get<Rewards>("/api/rewards").then(setR, (e) => setError(messageOf(e)));
  }, []);
  if (error) return <div className="message" role="alert">{error}</div>;
  if (!r) return <div aria-busy="true" />;
  const got = r.badges.filter((b) => b.earnedAt);
  return (
    <div className="stack" style={{ gap: 24 }}>
      <div>
        <button type="button" className="btn quiet" onClick={() => go("#/")}>
          ← Back
        </button>
        <h1>My badges</h1>
      </div>
      <MascotSays mood={got.length ? "cheer" : "wave"}>
        {got.length === 0
          ? "Badges are for trying things: your first quiz, a full paper, fixing old mistakes. Let's earn the first one!"
          : got.length === r.badges.length
            ? "You've got every badge. Wow!"
            : `You've earned ${got.length} of ${r.badges.length} badges. The grey ones are still waiting for you.`}
      </MascotSays>
      <ul className="badge-grid">
        {r.badges.map((b) => (
          <li key={b.id} className={`badge-card${b.earnedAt ? "" : " locked"}`}>
            <BadgeMedal id={b.id} earned={!!b.earnedAt} />
            <span className="badge-name">{b.name}</span>
            <span className="muted badge-desc">{b.description}</span>
            {b.earnedAt ? (
              <span className="badge-when">Earned {dateOf(b.earnedAt)}</span>
            ) : b.need > 1 ? (
              <span className="badge-progress" aria-label={`${b.have} of ${b.need}`}>
                <span className="mini-bar" aria-hidden="true">
                  <span style={{ width: `${(100 * b.have) / b.need}%` }} />
                </span>
                {b.have} / {b.need}
              </span>
            ) : (
              <span className="badge-when muted">Not yet</span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
