import { useState, type FormEvent } from "react";
import { api, messageOf } from "../api";
import { AvatarPicker } from "../components/AvatarPicker";
import { TopBar } from "../components/TopBar";

export function Setup({ onDone }: { onDone: () => void }) {
  const [code, setCode] = useState("");
  const [nickname, setNickname] = useState("");
  const [avatar, setAvatar] = useState("🦉");
  const [pin, setPin] = useState("");
  const [pin2, setPin2] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    if (!/^\d{6,12}$/.test(pin)) return setError("The parent PIN needs 6 to 12 digits.");
    if (pin !== pin2) return setError("The two PINs don't match.");
    setBusy(true);
    try {
      await api.post("/api/setup", { setupCode: code, nickname, avatar, pin });
      onDone();
    } catch (err) {
      setError(messageOf(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="page">
      <TopBar />
      <form className="panel stack" onSubmit={submit} style={{ maxWidth: 640 }}>
        <h1>Set up the parent profile</h1>
        <p>
          You'll use this profile to add students, change settings and see everyone's progress. The setup code is in the
          server log (see the setup guide).
        </p>
        <label className="field">
          Setup code
          <input inputMode="numeric" autoComplete="one-time-code" value={code} onChange={(e) => setCode(e.target.value)} required />
        </label>
        <label className="field">
          Your nickname <span className="hint">Shown on the profile sticker, e.g. Papa</span>
          <input value={nickname} maxLength={20} onChange={(e) => setNickname(e.target.value)} required />
        </label>
        <div className="field">
          <strong>Avatar</strong>
          <AvatarPicker value={avatar} onChange={setAvatar} />
        </div>
        <label className="field">
          Parent PIN <span className="hint">6 to 12 digits. Keep it away from the kids.</span>
          <input type="password" inputMode="numeric" autoComplete="new-password" value={pin} onChange={(e) => setPin(e.target.value)} required />
        </label>
        <label className="field">
          Type the PIN again
          <input type="password" inputMode="numeric" autoComplete="new-password" value={pin2} onChange={(e) => setPin2(e.target.value)} required />
        </label>
        {error && <div className="message" role="alert">{error}</div>}
        <div>
          <button className="btn primary" disabled={busy}>
            Create parent profile
          </button>
        </div>
      </form>
    </main>
  );
}
