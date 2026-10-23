import { useEffect, useState, type FormEvent } from "react";
import { MAX_STUDENTS, type Me, type Readiness, type Role, type SessionListItem } from "../../shared/types";
import { api, messageOf } from "../api";
import { AvatarPicker } from "../components/AvatarPicker";
import { go, modeLabel, when } from "../format";
import { Explorer } from "./Explorer";
import { BenchmarksPanel, ExportPanel, PrintPanel } from "./ParentPanels";
import { ContestSettings, ReadinessCard, countdownShort } from "../components/Readiness";

interface AdminProfile {
  id: number;
  nickname: string;
  avatar: string;
  role: Role;
  grade: string | null;
  birthYear: number | null;
  locked: boolean;
}

export function ParentHome({ me }: { me: Me }) {
  const [people, setPeople] = useState<AdminProfile[]>([]);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [adding, setAdding] = useState(false);
  const [viewing, setViewing] = useState<AdminProfile | null>(null);
  const [history, setHistory] = useState<SessionListItem[]>([]);

  const showHistory = (p: AdminProfile) => {
    setViewing(p);
    api.get<SessionListItem[]>(`/api/sessions?profileId=${p.id}&limit=30`).then(setHistory, (e) => setMsg({ ok: false, text: messageOf(e) }));
  };

  const load = () => api.get<AdminProfile[]>("/api/admin/profiles").then(setPeople, (e) => setMsg({ ok: false, text: messageOf(e) }));
  useEffect(() => {
    void load();
  }, []);

  const students = people.filter((p) => p.role === "student");
  const [ready, setReady] = useState<Record<number, Readiness>>({});
  const studentKey = students.map((s) => s.id).join(",");
  useEffect(() => {
    for (const s of students) api.get<Readiness>(`/api/readiness/${s.id}`).then((r) => setReady((x) => ({ ...x, [s.id]: r })), () => undefined);
  }, [studentKey]);

  const resetPin = async (p: AdminProfile) => {
    const rule = p.role === "parent" ? "6 to 12 digits" : "4 digits";
    const pin = window.prompt(`New PIN for ${p.nickname} (${rule}):`);
    if (!pin) return;
    try {
      await api.post(`/api/profiles/${p.id}/pin`, { pin });
      setMsg({ ok: true, text: `New PIN saved for ${p.nickname}.` });
      void load();
    } catch (e) {
      setMsg({ ok: false, text: messageOf(e) });
    }
  };

  const remove = async (p: AdminProfile) => {
    if (!window.confirm(`Delete ${p.nickname} and all of ${p.nickname}'s practice history? This can't be undone.`)) return;
    try {
      await api.del(`/api/profiles/${p.id}`);
      setMsg({ ok: true, text: `${p.nickname} was deleted.` });
      void load();
    } catch (e) {
      setMsg({ ok: false, text: messageOf(e) });
    }
  };

  return (
    <div className="stack" style={{ gap: 32 }}>
      <div>
        <h1>Parent corner</h1>
        <p className="muted">Hi {me.nickname}. See how everyone is doing, print papers, and manage students.</p>
      </div>

      <section className="panel stack">
        <h2>
          Students ({students.length} of {MAX_STUDENTS})
        </h2>
        {msg && (
          <div className={`message${msg.ok ? " ok" : ""}`} role="status">
            {msg.text}
          </div>
        )}
        <table className="people">
          <thead>
            <tr>
              <th scope="col">Profile</th>
              <th scope="col">Grade</th>
              <th scope="col">Born</th>
              <th scope="col">
                <span className="visually-hidden">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {people.map((p) => (
              <tr key={p.id}>
                <td>
                  <span aria-hidden="true">{p.avatar}</span> <strong>{p.nickname}</strong>
                  {p.role === "parent" && <span className="muted"> (parent)</span>}
                  {p.locked && <span className="locked-note"> locked</span>}
                </td>
                <td>{p.grade ?? "—"}</td>
                <td>{p.birthYear ?? "—"}</td>
                <td>
                  <div className="row" style={{ justifyContent: "flex-end" }}>
                  <button type="button" className="btn quiet" onClick={() => resetPin(p)}>
                    {p.locked ? "Unlock and set PIN" : "Set new PIN"}
                  </button>
                  {p.role === "student" && (
                    <button type="button" className="btn quiet" onClick={() => go(`#/insights/${p.id}`)}>
                      Progress
                    </button>
                  )}
                  {p.role === "student" && (
                    <button type="button" className="btn quiet" onClick={() => showHistory(p)}>
                      History
                    </button>
                  )}
                  {p.role === "student" && (
                    <button type="button" className="btn quiet" onClick={() => remove(p)}>
                      Delete
                    </button>
                  )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {adding ? (
          <AddStudent
            onCancel={() => setAdding(false)}
            onAdded={(name) => {
              setAdding(false);
              setMsg({ ok: true, text: `${name} was added. Their sticker is on the start screen now.` });
              void load();
            }}
          />
        ) : (
          <div>
            <button type="button" className="btn primary" disabled={students.length >= MAX_STUDENTS} onClick={() => setAdding(true)}>
              Add a student
            </button>
          </div>
        )}
      </section>

      {students.length > 0 && (
        <section className="panel stack" aria-labelledby="contest-h">
          <div>
            <h2 id="contest-h">Contest countdown and readiness</h2>
            <p className="muted">
              Readiness blends skill (40%: each focus area towards 80% right), score (40%: the contest estimate against the target) and practice (20%: papers and different
              questions). Set each student's school day and target here.
            </p>
          </div>
          <div className="ready-grid">
            {students.map((s) => {
              const r = ready[s.id];
              return (
                <div key={s.id} className="ready-student">
                  {r ? (
                    <>
                      <ReadinessCard r={r} headingLevel={3} title={`${s.avatar} ${s.nickname}: ${r.percent}% ready`} idKey={String(s.id)} />
                      <p className="muted small-line">{countdownShort(r.contest)}</p>
                      <ContestSettings profileId={s.id} name={s.nickname} r={r} onSaved={(n) => setReady((x) => ({ ...x, [s.id]: n }))} />
                    </>
                  ) : (
                    <p className="muted">Loading {s.nickname}…</p>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      )}

      {viewing && (
        <section className="panel stack">
          <h2>{viewing.nickname}'s practice</h2>
          {history.length === 0 ? (
            <p className="muted">No practice yet.</p>
          ) : (
            <ul className="recent">
              {history.map((r) => (
                <li key={r.id}>
                  <button
                    type="button"
                    className="recent-row"
                    disabled={!r.endedAt && r.delivery !== "paper"}
                    onClick={() => go(r.endedAt ? `#/results/${r.id}` : `#/print/${r.id}`)}
                  >
                    <span>
                      {modeLabel(r)} · {r.delivery === "paper" ? "printed" : r.help}
                    </span>
                    <span className="muted">{when(r.startedAt)}</span>
                    <strong>{r.endedAt ? `${r.score} / ${r.maxScore}` : r.delivery === "paper" ? "answers to type in" : "open"}</strong>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      <BenchmarksPanel />
      <PrintPanel students={students} />
      <ExportPanel />
      <Explorer />
    </div>
  );
}

function AddStudent({ onAdded, onCancel }: { onAdded: (name: string) => void; onCancel: () => void }) {
  const [nickname, setNickname] = useState("");
  const [avatar, setAvatar] = useState("🦘");
  const [grade, setGrade] = useState("");
  const [birthYear, setBirthYear] = useState("");
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!/^\d{4}$/.test(pin)) return setError("A student PIN is exactly 4 digits.");
    try {
      await api.post("/api/profiles", {
        nickname,
        avatar,
        grade: grade || null,
        birthYear: birthYear ? Number(birthYear) : null,
        pin,
      });
      onAdded(nickname);
    } catch (err) {
      setError(messageOf(err));
    }
  };

  return (
    <form className="stack" onSubmit={submit}>
      <h3>New student</h3>
      <label className="field">
        Nickname <span className="hint">No full names needed</span>
        <input value={nickname} maxLength={20} onChange={(e) => setNickname(e.target.value)} required />
      </label>
      <div className="field">
        <strong>Avatar</strong>
        <AvatarPicker value={avatar} onChange={setAvatar} />
      </div>
      <div className="row">
        <label className="field">
          Grade
          <input value={grade} maxLength={20} placeholder="e.g. Grade 6" onChange={(e) => setGrade(e.target.value)} />
        </label>
        <label className="field">
          Birth year
          <input inputMode="numeric" value={birthYear} placeholder="e.g. 2015" onChange={(e) => setBirthYear(e.target.value.replace(/\D/g, "").slice(0, 4))} />
        </label>
      </div>
      <label className="field">
        4-digit PIN
        <input type="password" inputMode="numeric" autoComplete="new-password" value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 4))} required />
      </label>
      {error && <div className="message" role="alert">{error}</div>}
      <div className="row">
        <button className="btn primary">Add student</button>
        <button type="button" className="btn quiet" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  );
}
