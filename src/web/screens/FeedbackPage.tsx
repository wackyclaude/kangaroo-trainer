import { useEffect, useState } from "react";
import type { FeedbackItem } from "../../shared/types";
import { api, messageOf } from "../api";
import { FeedbackEntry, FeedbackForm } from "../components/Feedback";
import { go } from "../format";

/** A student's page: send feedback about the app, and read the parent's replies. */
export function FeedbackPage() {
  const [items, setItems] = useState<FeedbackItem[] | null>(null);
  const [error, setError] = useState("");
  const load = () => api.get<FeedbackItem[]>("/api/feedback?limit=50").then(setItems, (e) => setError(messageOf(e)));
  useEffect(() => {
    void load().then(() => api.post("/api/feedback/seen").catch(() => undefined));
  }, []);

  return (
    <div className="stack" style={{ gap: 24 }}>
      <div>
        <button type="button" className="btn quiet" onClick={() => go("#/")}>
          ← Back
        </button>
        <h1>Feedback</h1>
        <p className="muted">Ideas, problems or things you like: your parent reads every message. About one question? Use the 💬 button on that question.</p>
      </div>
      <section className="panel stack">
        <FeedbackForm onSent={() => void load()} />
      </section>
      <section className="panel stack" aria-labelledby="mine-h">
        <h2 id="mine-h">My messages</h2>
        {error && <div className="message" role="alert">{error}</div>}
        {items === null ? (
          <p className="muted">Loading…</p>
        ) : items.length === 0 ? (
          <p className="muted">Nothing sent yet.</p>
        ) : (
          <ul className="fb-list">
            {items.map((f) => (
              <li key={f.id} className={f.reply && !f.replySeenAt ? "fb-new" : ""}>
                <FeedbackEntry f={f} />
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
