import { track } from "../usage";
import { useState } from "react";
import type { Me } from "../../shared/types";
import { ContestSwitch } from "../components/ContestSwitch";
import { LookPicker } from "../components/LookPicker";
import { Face } from "../components/Face";
import { PicturePicker } from "../components/PicturePicker";
import { useContest } from "../contest";
import { go } from "../format";
import { Explorer } from "./Explorer";

/** The student's own corner: theme, contest, feedback, and switching profile. */
export function MePage({ me, onSignOut, onMe }: { me: Me; onSignOut: () => void; onMe: (m: Me) => void }) {
  const [contest, setContest, contests] = useContest();
  const [browse, setBrowse] = useState(false);
  return (
    <div className="stack page-stack">
      <div className="me-head">
        <Face avatar={me.avatar} photo={me.photo} className="me-avatar" />
        <h1>{me.nickname}</h1>
      </div>
      {contests.length > 1 && (
        <section className="panel stack">
          <h2>Practising for</h2>
          <ContestSwitch value={contest} onChange={setContest} options={contests} />
        </section>
      )}
      <PicturePicker me={me} onChange={(p) => onMe({ ...me, ...p })} />
      <LookPicker />
      <div className="row">
        <button type="button" className="btn" onClick={() => go("#/feedback")}>
          Feedback for the admin
        </button>
        <button type="button" className="btn" aria-expanded={browse} onClick={() => (!browse && track("explorer_open"), setBrowse((b) => !b))}>
          Browse all the questions
        </button>
        <button type="button" className="btn" onClick={onSignOut}>
          Switch profile
        </button>
      </div>
      {browse && <Explorer />}
      <p className="muted small-line">
        The app counts which buttons you use and how long questions take, so the admin can see what helps. It never keeps your drawings or anything you type.
      </p>
    </div>
  );
}
