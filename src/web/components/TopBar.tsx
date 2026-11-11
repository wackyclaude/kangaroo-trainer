import { Mascot } from "./Mascot";
import { MASCOT_SKINS, type Me } from "../../shared/types";
import { useSkin } from "../skin";

const TABS = [
  { hash: "#/", label: "Home", d: "M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z" },
  { hash: "#/progress", label: "Progress", d: "M4 20V10M10 20V4M16 20v-7M22 20H2" },
  { hash: "#/badges", label: "Badges", d: "M12 15a6 6 0 1 0 0-12 6 6 0 0 0 0 12zM8.500 14L7 22l5-3 5 3-1.500-8" },
  { hash: "#/me", label: "Me", d: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21a8 8 0 0 1 16 0" },
];

/** Students get four places to go (a bar at the bottom on phones); the parent keeps "Switch profile". */
export function TopBar({ me, hash = "#/", onSignOut }: { me?: Me | null; hash?: string; onSignOut?: () => void }) {
  const skin = useSkin();
  const student = me?.role === "student";
  return (
    <header className="topbar">
      <div className="brand">
        <span className="brand-badge" aria-hidden="true">
          {!MASCOT_SKINS.includes(skin) ? <span className="brand-mark">KT</span> : <Mascot mood="calm" headOnly size={26} />}
        </span>
        Kangaroo Trainer
      </div>
      {student && (
        <nav className="main-nav" aria-label="Main">
          {TABS.map((t) => (
            <a key={t.hash} href={t.hash} aria-current={hash === t.hash ? "page" : undefined}>
              <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                <path d={t.d} />
              </svg>
              {t.label}
            </a>
          ))}
        </nav>
      )}
      {me && !student && (
        <div className="row">
          <span aria-hidden="true">{me.avatar}</span>
          <strong>{me.nickname}</strong>
          <button type="button" className="btn quiet" onClick={onSignOut}>
            Switch profile
          </button>
        </div>
      )}
    </header>
  );
}
