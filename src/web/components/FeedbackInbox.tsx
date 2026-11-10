import { useEffect, useState } from "react";
import { FEEDBACK_MAX_CHARS, type FeedbackItem } from "../../shared/types";
import { api, messageOf } from "../api";
import { FeedbackEntry, questionName } from "./Feedback";

/** Parent corner: messages from students, newest first, with reply / done / delete. */
export function FeedbackInbox() {
  const [items, setItems] = useState<FeedbackItem[] | null>(null);
  const [showDone, setShowDone] = useState(false);
  const [error, setError] = useState("");
  const load = () => api.get<FeedbackItem[]>(`/api/feedback?status=${showDone ? "all" : "open"}`).then(setItems, (e) => setError(messageOf(e)));
  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showDone]);

  const act = (p: Promise<unknown>) => p.then(() => load(), (e) => setError(messageOf(e)));
  const open = items?.filter((f) => !f.doneAt).length ?? 0;

  return (
    <section className="panel stack" aria-labelledby="fb-h">
      <div className="row" style={{ justifyContent: "space-between" }}>
        <h2 id="fb-h">
          Feedback from students{open ? <span className="count-badge">{open} new</span> : null}
        </h2>
        <label className="toggle">
          <input type="checkbox" checked={showDone} onChange={(e) => setShowDone(e.target.checked)} />
          <span>Show done ones too</span>
        </label>
      </div>
      {error && <div className="message" role="alert">{error}</div>}
      {items === null ? (
        <p className="muted">Loading…</p>
      ) : items.length === 0 ? (
        <p className="muted">{showDone ? "No feedback yet." : "Nothing new. Students can send feedback from their home screen or from any question."}</p>
      ) : (
        <ul className="fb-list">
          {items.map((f) => (
            <li key={f.id}>
              <InboxItem f={f} act={act} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function InboxItem({ f, act }: { f: FeedbackItem; act: (p: Promise<unknown>) => Promise<unknown> }) {
  const [reply, setReply] = useState("");
  const [replying, setReplying] = useState(false);
  return (
    <div className="stack">
      <FeedbackEntry f={f} showWho />
      {f.question && (
        <details className="official">
          <summary>
            Show {questionName(f.question)} (answer {f.question.answer})
          </summary>
          <img className="q-image" src={f.question.imageUrl} alt={f.question.text} loading="lazy" />
        </details>
      )}
      {replying ? (
        <form
          className="stack"
          onSubmit={(e) => {
            e.preventDefault();
            if (reply.trim()) void act(api.post(`/api/feedback/${f.id}/reply`, { reply, done: true })).then(() => setReplying(false));
          }}
        >
          <label className="field">
            Reply to {f.nickname} <span className="hint">{f.nickname} sees this on the feedback page</span>
            <textarea rows={2} maxLength={FEEDBACK_MAX_CHARS} value={reply} onChange={(e) => setReply(e.target.value)} />
          </label>
          <div className="row">
            <button type="submit" className="btn primary small">
              Send reply and mark done
            </button>
            <button type="button" className="btn quiet" onClick={() => setReplying(false)}>
              Cancel
            </button>
          </div>
        </form>
      ) : (
        <div className="row">
          <button type="button" className="btn small" onClick={() => setReplying(true)}>
            {f.reply ? "Change reply" : "Reply"}
          </button>
          <button type="button" className="btn quiet" onClick={() => void act(api.post(`/api/feedback/${f.id}/done`, { done: !f.doneAt }))}>
            {f.doneAt ? "Mark as not done" : "Mark done"}
          </button>
          <button type="button" className="btn quiet" onClick={() => window.confirm(`Delete this message from ${f.nickname}?`) && void act(api.del(`/api/feedback/${f.id}`))}>
            Delete
          </button>
        </div>
      )}
    </div>
  );
}
