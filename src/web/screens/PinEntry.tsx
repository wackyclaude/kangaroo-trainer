import { useState } from "react";
import type { ProfileCard } from "../../shared/types";
import { api, ApiFailure, messageOf } from "../api";
import { PinPad } from "../components/PinPad";
import { TopBar } from "../components/TopBar";

export function PinEntry({ profile, onBack, onSignedIn }: { profile: ProfileCard; onBack: () => void; onSignedIn: () => void }) {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [shake, setShake] = useState(0);
  const isParent = profile.role === "parent";

  const submit = async (pin: string) => {
    setBusy(true);
    setError("");
    try {
      await api.post("/api/auth/login", { profileId: profile.id, pin });
      onSignedIn();
    } catch (e) {
      if (e instanceof ApiFailure && e.body.retryAfterSeconds) {
        const mins = Math.ceil(e.body.retryAfterSeconds / 60);
        setError(`Too many wrong tries. This profile can try again in ${mins} minute${mins === 1 ? "" : "s"}.`);
      } else setError(messageOf(e));
      setShake((s) => s + 1);
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="page">
      <TopBar />
      <div className="stack center" style={{ justifyItems: "center" }}>
        <span className="sticker-face tint-0" aria-hidden="true">
          {profile.avatar}
        </span>
        <h1>Hi {profile.nickname}! Type your PIN</h1>
        {isParent && <p className="muted">Parent PIN: 6 to 12 digits, then tap OK.</p>}
        <PinPad length={isParent ? 6 : 4} maxLength={isParent ? 12 : undefined} busy={busy} shakeKey={shake} onSubmit={submit} />
        <div style={{ minHeight: 48 }}>{error && <div className="message" role="alert">{error}</div>}</div>
        <button type="button" className="btn quiet" onClick={onBack}>
          That's not me
        </button>
      </div>
    </main>
  );
}
