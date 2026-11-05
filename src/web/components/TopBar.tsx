import { Mascot } from "./Mascot";
import type { Me } from "../../shared/types";
import { useSkin } from "../skin";

export function TopBar({ me, onSignOut }: { me?: Me | null; onSignOut?: () => void }) {
  const skin = useSkin();
  return (
    <header className="topbar">
      <div className="brand">
        <span className="brand-badge" aria-hidden="true">
          {skin === "modern" ? <span className="brand-mark">KT</span> : <Mascot mood="calm" headOnly size={26} />}
        </span>
        Kangaroo Trainer
      </div>
      {me && (
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
