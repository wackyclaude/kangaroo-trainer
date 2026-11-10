import { useContext, useId, useState, type FormEvent } from "react";
import { APP_FEEDBACK, FEEDBACK_LABEL, FEEDBACK_MAX_CHARS, QUESTION_FEEDBACK, type FeedbackItem, type FeedbackKind } from "../../shared/types";
import { api, messageOf } from "../api";
import { MeContext } from "../contest";
import { when } from "../format";

/** "2024 Kangaroo Q7" or "2025 Olympiad B2". */
export const questionName = (q: NonNullable<FeedbackItem["question"]>) => `${q.year} ${q.contest === "olympiad" ? `Olympiad ${q.label}` : `Kangaroo Q${q.label}`}`;

/** A student's message to the parent: about one question (questionId) or about the app. */
export function FeedbackForm({ questionId = null, sessionId = null, onSent, onCancel }: { questionId?: string | null; sessionId?: number | null; onSent?: () => void; onCancel?: () => void }) {
  const kinds = questionId ? QUESTION_FEEDBACK : APP_FEEDBACK;
  const [kind, setKind] = useState<FeedbackKind | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [sent, setSent] = useState(false);
  const id = useId();
  const needsWords = !questionId || kind === "other";

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!kind) return setError("Pick what it's about first.");
    if (needsWords && message.trim().length < 2) return setError("Write a few words so your parent knows what you mean.");
    setBusy(true);
    setError("");
    try {
      await api.post("/api/feedback", { kind, message, questionId, sessionId });
      setSent(true);
      setKind(null);
      setMessage("");
      onSent?.();
    } catch (err) {
      setError(messageOf(err));
    } finally {
      setBusy(false);
    }
  };

  if (sent) {
    return (
      <div className="message ok feedback-sent" role="status">
        Sent to your parent. Thank you!{" "}
        <button type="button" className="btn quiet" onClick={() => (onCancel ? onCancel() : setSent(false))}>
          {onCancel ? "Close" : "Send another"}
        </button>
      </div>
    );
  }
  return (
    <form className="feedback-form stack" onSubmit={submit} aria-labelledby={`${id}-h`}>
      <strong id={`${id}-h`}>{questionId ? "Tell your parent about this question" : "Tell your parent"}</strong>
      <div className="chip-row" role="group" aria-label="What is it about?">
        {kinds.map((k) => (
          <button key={k} type="button" className="pick-chip plain" aria-pressed={kind === k} onClick={() => setKind(k)}>
            {FEEDBACK_LABEL[k]}
          </button>
        ))}
      </div>
      <label className="field">
        <span>
          {needsWords ? "Your message" : "Anything to add?"} <span className="hint">{needsWords ? "" : "(you can leave this empty)"}</span>
        </span>
        <textarea rows={3} maxLength={FEEDBACK_MAX_CHARS} value={message} onChange={(e) => setMessage(e.target.value)} />
        <span className="hint">
          {message.length} / {FEEDBACK_MAX_CHARS}
        </span>
      </label>
      {error && (
        <div className="message" role="alert">
          {error}
        </div>
      )}
      <div className="row">
        <button type="submit" className="btn primary" disabled={busy}>
          Send
        </button>
        {onCancel && (
          <button type="button" className="btn quiet" onClick={onCancel}>
            Cancel
          </button>
        )}
      </div>
    </form>
  );
}

/** A small "about this question" button that opens the form (students only). */
export function QuestionFeedback({ questionId, sessionId }: { questionId: string; sessionId?: number | null }) {
  const me = useContext(MeContext);
  const [open, setOpen] = useState(false);
  if (me?.role !== "student") return null;
  return open ? (
    <FeedbackForm questionId={questionId} sessionId={sessionId} onCancel={() => setOpen(false)} />
  ) : (
    <div>
      <button type="button" className="btn quiet" onClick={() => setOpen(true)}>
        💬 Something wrong or unclear? Tell your parent
      </button>
    </div>
  );
}

/** One message with its reply, for the student's page and the parent's inbox. */
export function FeedbackEntry({ f, showWho }: { f: FeedbackItem; showWho?: boolean }) {
  return (
    <div className="fb-entry stack">
      <div className="fb-head">
        {showWho && (
          <strong>
            <span aria-hidden="true">{f.avatar}</span> {f.nickname}
          </strong>
        )}
        <span className="chip outline">{FEEDBACK_LABEL[f.kind]}</span>
        {f.question && <span className="muted">{questionName(f.question)}</span>}
        <span className="muted">{when(f.createdAt)}</span>
        {f.doneAt && <span className="fb-done">Done</span>}
      </div>
      {f.message && <p className="fb-message">{f.message}</p>}
      {f.reply && (
        <div className="fb-reply">
          <strong>{showWho ? "Your reply" : "Reply"}:</strong> {f.reply}
        </div>
      )}
    </div>
  );
}
