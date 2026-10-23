import { useEffect, useState } from "react";
import type { ProfileCard } from "../../shared/types";
import { api, messageOf } from "../api";
import { Sticker } from "../components/Sticker";
import { TopBar } from "../components/TopBar";

export function Picker({ onPick }: { onPick: (p: ProfileCard) => void }) {
  const [profiles, setProfiles] = useState<ProfileCard[] | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api.get<ProfileCard[]>("/api/profiles").then(setProfiles, (e) => setError(messageOf(e)));
  }, []);

  const students = profiles?.filter((p) => p.role === "student") ?? [];
  const parents = profiles?.filter((p) => p.role === "parent") ?? [];

  return (
    <main className="page">
      <TopBar />
      <h1 className="center">Who's practising today?</h1>
      {error && <div className="message" role="alert">{error}</div>}
      {profiles && students.length === 0 && (
        <p className="center muted" style={{ margin: "16px auto" }}>
          No students yet. The parent can add them after signing in below.
        </p>
      )}
      <div className="sticker-wall">
        {students.map((p, i) => (
          <Sticker key={p.id} avatar={p.avatar} name={p.nickname} tint={i} note={p.locked ? "Taking a short break" : undefined} onClick={() => onPick(p)} />
        ))}
      </div>
      <div className="sticker-wall" style={{ marginTop: 40 }}>
        {parents.map((p) => (
          <Sticker key={p.id} small avatar={p.avatar} name={`${p.nickname} (parent)`} tint={5} onClick={() => onPick(p)} />
        ))}
      </div>
    </main>
  );
}
