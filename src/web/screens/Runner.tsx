import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { CHOICES, type AnswerFeedback, type SavedAnswer, type SessionState } from "../../shared/types";
import { api, ApiFailure, messageOf } from "../api";
import { ScratchPad } from "../components/ScratchPad";
import { Steps } from "../components/Steps";
import { MascotSays } from "../components/Mascot";
import { clock, focusColor, focusName, go, modeLabel } from "../format";
import { MathKeypad, RevealBlock } from "../components/Olympiad";
import { PupilStrip } from "../components/PupilStrip";

type Local = Omit<SavedAnswer, "position">;

/** Runs a quiz or a full paper, one question at a time, and keeps track of time per question. */
export function Runner({ sessionId }: { sessionId: number }) {
  const [s, setS] = useState<SessionState | null>(null);
  const [pos, setPos] = useState(1);
  const [answers, setAnswers] = useState<Map<number, Local>>(new Map());
  const [flags, setFlags] = useState<Set<number>>(new Set());
  const [hints, setHints] = useState<Map<number, string>>(new Map());
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(Date.now());
  const [scratch, setScratch] = useState(false);
  const [scratchKey, setScratchKey] = useState(0);
  const [confirmFinish, setConfirmFinish] = useState(false);
  // What is typed in the keypad for each B-question (kept while moving between questions).
  const [typed, setTyped] = useState<Map<number, string>>(new Map());

  // Time per question: `spent` is everything measured on this device, `sent` what the server already has.
  const spent = useRef(new Map<number, number>());
  const sent = useRef(new Map<number, number>());
  const runningSince = useRef<number | null>(null);
  const runningFor = useRef<number | null>(null);
  const skew = useRef(0);
  const finishing = useRef(false);

  const help = s?.settings.help ?? "test";
  const isTest = help === "test";
  const current = s?.questions.find((q) => q.position === pos);
  const currentAnswer = answers.get(pos);
  const locked = !isTest && currentAnswer !== undefined;

  // Calm mode: in a full paper under test conditions the decoration goes quiet, like the real contest.
  const calm = isTest && s?.mode === "paper";
  useEffect(() => {
    document.body.classList.toggle("calm", calm);
    return () => document.body.classList.remove("calm");
  }, [calm]);

  // The clock always belongs to one question; stopping it books the time to that question.
  const stopClock = useCallback(() => {
    if (runningSince.current !== null && runningFor.current !== null) {
      const p = runningFor.current;
      spent.current.set(p, (spent.current.get(p) ?? 0) + (Date.now() - runningSince.current));
    }
    runningSince.current = null;
    runningFor.current = null;
  }, []);
  const startClock = useCallback(
    (p: number) => {
      if (runningFor.current === p) return;
      stopClock();
      if (document.visibilityState === "visible") {
        runningSince.current = Date.now();
        runningFor.current = p;
      }
    },
    [stopClock],
  );

  // Load the session (also used to resume after a reload).
  useEffect(() => {
    api.get<SessionState>(`/api/sessions/${sessionId}`).then(
      (state) => {
        if (state.endedAt) return go(`#/results/${sessionId}`);
        if (state.settings.delivery === "paper") return go(`#/print/${sessionId}`);
        skew.current = state.serverNow - Date.now();
        setS(state);
        const m = new Map<number, Local>();
        for (const a of state.answers) m.set(a.position, a);
        setAnswers(m);
        setFlags(new Set(state.answers.filter((a) => a.flagged).map((a) => a.position)));
        const firstOpen = state.questions.find((q) => !m.has(q.position));
        setPos(firstOpen?.position ?? 1);
      },
      (e) => setError(messageOf(e)),
    );
  }, [sessionId]);

  // Moving to another question stops the clock for the old one (before the new picture can load).
  useLayoutEffect(() => {
    if (runningFor.current !== pos) stopClock();
    setScratchKey((k) => k + 1);
  }, [pos, stopClock]);

  // Pause the clock while the app is in the background.
  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState === "hidden") stopClock();
      else if (!locked) startClock(pos);
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [locked, pos, startClock, stopClock]);

  // Countdown tick.
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(t);
  }, []);

  const unsentFor = (p: number) => Math.round((spent.current.get(p) ?? 0) - (sent.current.get(p) ?? 0));

  const finish = useCallback(async () => {
    if (!s || finishing.current) return;
    finishing.current = true;
    setBusy(true);
    stopClock();
    try {
      // In test mode, hand in the time spent on every question (and blanks for the ones left open).
      if (s.settings.help === "test") {
        for (const q of s.questions) {
          const extra = unsentFor(q.position);
          const a = answers.get(q.position);
          if (!a && extra <= 0) continue;
          if (a && extra < 500) continue;
          await api
            .post(`/api/sessions/${s.id}/answers`, { position: q.position, choice: a?.choice ?? null, timeMs: Math.max(0, extra), flagged: flags.has(q.position) })
            .catch(() => undefined);
        }
      }
      await api.post(`/api/sessions/${s.id}/finish`);
      go(`#/results/${s.id}`);
    } catch (e) {
      setError(messageOf(e));
      finishing.current = false;
      setBusy(false);
    }
  }, [s, answers, flags, stopClock]);

  // Time's up → hand it in.
  const endsAt = s?.endsAt ?? null;
  const remaining = endsAt ? endsAt - (now + skew.current) : null;
  useEffect(() => {
    if (remaining !== null && remaining <= 0) void finish();
  }, [remaining, finish]);

  const submit = async (choice: string | null) => {
    if (!s || busy || locked) return;
    stopClock();
    const timeMs = Math.max(0, unsentFor(pos));
    setBusy(true);
    setError("");
    try {
      const fb = await api.post<AnswerFeedback>(`/api/sessions/${s.id}/answers`, {
        position: pos,
        choice,
        timeMs,
        hintUsed: hints.has(pos),
        flagged: flags.has(pos),
      });
      sent.current.set(pos, spent.current.get(pos) ?? 0);
      setAnswers((m) => new Map(m).set(pos, { choice, flagged: flags.has(pos), correct: fb.correct, answer: fb.answer, steps: fb.steps, reveal: fb.reveal }));
      if (isTest) {
        const next = s.questions.find((q) => q.position > pos && !answers.has(q.position) && q.position !== pos);
        if (next) setTimeout(() => setPos(next.position), 250);
        else startClock(pos);
      }
    } catch (e) {
      if (e instanceof ApiFailure && e.body.error === "finished") return go(`#/results/${s.id}`);
      setError(messageOf(e));
      startClock(pos);
    } finally {
      setBusy(false);
    }
  };

  const showHint = async () => {
    if (!s) return;
    try {
      const { hint } = await api.get<{ hint: string | null }>(`/api/sessions/${s.id}/hint/${pos}`);
      setHints((m) => new Map(m).set(pos, hint ?? "No hint for this one yet. Read the question again slowly, and draw what it describes."));
    } catch (e) {
      setError(messageOf(e));
    }
  };

  if (error && !s) {
    return (
      <div className="stack">
        <div className="message" role="alert">
          {error}
        </div>
        <button className="btn" onClick={() => go("#/")}>
          Back home
        </button>
      </div>
    );
  }
  if (!s || !current) return <div aria-busy="true" />;

  const total = s.questions.length;
  const answeredCount = answers.size;
  const last = pos === total;
  const lowTime = remaining !== null && remaining < 5 * 60_000;
  const title = modeLabel({ mode: s.mode, paperYear: s.paperYear, contest: s.contest });
  const oly = s.contest === "olympiad";
  const isB = current.part === "B";
  const typedNow = typed.get(pos) ?? currentAnswer?.choice ?? "";

  return (
    <div className="runner">
      <div className="runner-bar">
        <div>
          <h1 className="runner-title">{title}</h1>
          <span className="muted">
            {" "}
            · Question {oly ? `${current.label} (${pos} of ${total})` : `${pos} of ${total}`}
          </span>
        </div>
        <div className="row">
          {remaining !== null && (
            <span className={`timer${lowTime ? " low" : ""}`} role="timer" aria-label={`${clock(remaining)} left`}>
              ⏱ {clock(remaining)}
            </span>
          )}
          <button type="button" className="btn small" onClick={() => setConfirmFinish(true)} disabled={busy}>
            {isTest ? "Hand in" : "Finish"}
          </button>
        </div>
      </div>

      <div className="progress" aria-hidden="true">
        <span style={{ width: `${(answeredCount / total) * 100}%` }} />
      </div>

      {isTest && (
        <nav className="q-dots" aria-label="Questions">
          {s.questions.map((q) => (
            <button
              key={q.position}
              type="button"
              className={`q-dot${answers.has(q.position) ? " done" : ""}${flags.has(q.position) ? " flagged" : ""}`}
              aria-current={q.position === pos}
              aria-label={`Question ${q.position}${answers.has(q.position) ? ", answered" : ""}${flags.has(q.position) ? ", flagged" : ""}`}
              onClick={() => setPos(q.position)}
            >
              {oly ? q.label : q.position}
            </button>
          ))}
        </nav>
      )}

      <article className="q-stage panel">
        <div className="row q-meta">
          <span className="chip" style={{ "--c": focusColor(current.focusPrimary) } as React.CSSProperties}>
            {focusName(current.focusPrimary)}
          </span>
          {s.mode !== "paper" && <span className="chip outline">{current.year}</span>}
          {oly && (
            <span className="chip outline">
              {current.label} · {current.points} points
            </span>
          )}
          <span className="spacer" />
          <button type="button" className={`icon-btn${flags.has(pos) ? " on" : ""}`} aria-pressed={flags.has(pos)} onClick={() => setFlags((f) => {
            const n = new Set(f);
            if (n.has(pos)) n.delete(pos);
            else n.add(pos);
            return n;
          })}>
            {flags.has(pos) ? "★ Flagged" : "☆ Flag"}
          </button>
          <button type="button" className={`icon-btn${scratch ? " on" : ""}`} aria-pressed={scratch} onClick={() => setScratch((v) => !v)}>
            ✏️ Scratch pad
          </button>
          {scratch && (
            <button type="button" className="icon-btn" onClick={() => setScratchKey((k) => k + 1)}>
              Clear
            </button>
          )}
        </div>
        <div className={`q-figure${scratch ? " scratching" : ""}`}>
          <img key={current.id} className="q-image" src={current.imageUrl} alt={current.text} onLoad={() => !locked && startClock(current.position)} draggable={false} />
          {scratch && <ScratchPad clearKey={scratchKey} />}
        </div>

        {hints.get(pos) && (
          <MascotSays mood="think" size={72} role="note">
            <p>{hints.get(pos)}</p>
          </MascotSays>
        )}

        {isB ? (
          locked ? (
            <p className="typed-answer">
              Your answer: <strong>{currentAnswer?.choice ?? "skipped"}</strong>
            </p>
          ) : (
            <MathKeypad
              key={pos}
              value={typedNow}
              unit={current.unit}
              disabled={busy}
              onChange={(v) => setTyped((m) => new Map(m).set(pos, v))}
              onSubmit={() => submit(typedNow.trim())}
              submitLabel={isTest ? (currentAnswer ? "Change my answer" : "Save my answer") : "Check my answer"}
            />
          )
        ) : (
          <div className="answers" role="group" aria-label="Your answer">
            {CHOICES.map((c) => {
              const picked = currentAnswer?.choice === c;
              const isRight = locked && currentAnswer?.answer === c;
              const isWrongPick = locked && picked && !currentAnswer?.correct;
              return (
                <button
                  key={c}
                  type="button"
                  className={`btn answer${picked ? " picked" : ""}${isRight ? " right" : ""}${isWrongPick ? " wrong" : ""}`}
                  aria-pressed={picked}
                  disabled={busy || locked}
                  onClick={() => submit(c)}
                >
                  {c}
                </button>
              );
            })}
          </div>
        )}
        {isB && isTest && currentAnswer?.choice && (
          <p className="muted small-line">Saved: {currentAnswer.choice}. You can change it until you hand in.</p>
        )}
        <div className="row answer-extras">
          <button type="button" className="btn quiet" disabled={busy || locked} onClick={() => submit(null)}>
            I don't know (skip)
          </button>
          {help === "learn" && !locked && !hints.has(pos) && current.hasHint && (
            <button type="button" className="btn quiet" onClick={showHint}>
              Need a hint?
            </button>
          )}
        </div>

        {locked && currentAnswer && (
          <div className={`feedback ${currentAnswer.correct ? "good" : "notyet"}`} role="status">
            <h2>
              {currentAnswer.correct
                ? "Yes! That's right."
                : currentAnswer.choice === null
                  ? `Skipped. The answer is ${currentAnswer.answer}.`
                  : `Not quite. The answer is ${currentAnswer.answer}.`}
            </h2>
            {oly && currentAnswer.reveal && <RevealBlock reveal={currentAnswer.reveal} steps={currentAnswer.steps} label={`${current.year} ${current.label}`} year={current.year} />}
            {!oly &&
              help === "learn" &&
              (currentAnswer.steps ? (
                <>
                  <p className="steps-intro">{currentAnswer.correct ? "Here's one way to work it out:" : "Let's work it out together:"}</p>
                  <Steps key={pos} steps={currentAnswer.steps} />
                </>
              ) : (
                <p className="muted">The worked solution for this one is still being written.</p>
              ))}
            {!oly && currentAnswer.reveal && !current.voidNote && (
              <PupilStrip level={currentAnswer.reveal.level} pupils={currentAnswer.reveal.pupils} year={current.year} choice={currentAnswer.choice} />
            )}
          </div>
        )}

        {error && (
          <div className="message" role="alert">
            {error}
          </div>
        )}

        <div className="row nav-row">
          <button type="button" className="btn" disabled={pos === 1} onClick={() => setPos(pos - 1)}>
            ← Back
          </button>
          <span className="spacer" />
          {last ? (
            <button type="button" className="btn primary" onClick={() => setConfirmFinish(true)} disabled={busy}>
              {isTest ? "Hand in" : "See my results"}
            </button>
          ) : (
            <button type="button" className={`btn${locked ? " primary" : ""}`} onClick={() => setPos(pos + 1)}>
              {locked ? "Next question →" : "Next →"}
            </button>
          )}
        </div>
      </article>

      {confirmFinish && (
        <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="finish-title">
          <div className="panel modal">
            <h2 id="finish-title">{answeredCount < total ? `${total - answeredCount} question${total - answeredCount === 1 ? "" : "s"} still open` : "All done?"}</h2>
            <p>
              {answeredCount < total
                ? oly
                  ? "Open questions score 0 points, just like in the Olympiad. Hand in now?"
                  : "Open questions count as \"don't know\" (1 point each). Hand in now?"
                : "Hand in and see how you did."}
            </p>
            <div className="row">
              <button type="button" className="btn primary" onClick={() => void finish()} disabled={busy}>
                {isTest ? "Hand in" : "See my results"}
              </button>
              <button type="button" className="btn" onClick={() => setConfirmFinish(false)}>
                Keep going
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
