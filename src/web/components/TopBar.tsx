import { Mascot } from "./Mascot";
import type { Me } from "../../shared/types";

export function TopBar({ me, onSignOut }: { me?: Me | null; onSignOut?: () => void }) {
  return (
    <header className="topbar">
      <div className="brand">
        <span className="brand-badge" aria-hidden="true">
          <Mascot mood="calm" headOnly size={26} />
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
