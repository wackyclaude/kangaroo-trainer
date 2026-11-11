import { useState } from "react";
import type { Me } from "../../shared/types";
import { ContestSwitch } from "../components/ContestSwitch";
import { LookPicker } from "../components/LookPicker";
import { useContest } from "../contest";
import { go } from "../format";
import { Explorer } from "./Explorer";

/** The student's own corner: theme, contest, feedback, and switching profile. */
export function MePage({ me, onSignOut }: { me: Me; onSignOut: () => void }) {
  const [contest, setContest, contests] = useContest();
  const [browse, setBrowse] = useState(false);
  return (
    <div className="stack page-stack">
      <div className="me-head">
        <span className="me-avatar" aria-hidden="true">
          {me.avatar}
        </span>
        <h1>{me.nickname}</h1>
      </div>
      {contests.length > 1 && (
        <section className="panel stack">
          <h2>Practising for</h2>
          <ContestSwitch value={contest} onChange={setContest} options={contests} />
        </section>
      )}
      <LookPicker />
      <div className="row">
        <button type="button" className="btn" onClick={() => go("#/feedback")}>
          Feedback for my parent
        </button>
        <button type="button" className="btn" aria-expanded={browse} onClick={() => setBrowse((b) => !b)}>
          Browse all the questions
        </button>
        <button type="button" className="btn" onClick={onSignOut}>
          Switch profile
        </button>
      </div>
      {browse && <Explorer />}
    </div>
  );
}
