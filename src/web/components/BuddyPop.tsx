import { useEffect, useState } from "react";
import type { Reaction } from "../buddy";
import { Mascot } from "./Mascot";

/**
 * The buddy's reaction in a quiz: pops up in a corner, plays its move and says its line, then
 * leaves on its own. It never covers a button (clicks go straight through) and never holds up
 * the next question. The words are also announced politely to screen readers.
 */
export function BuddyPop({ reaction, id }: { reaction: Reaction | null; id: number }) {
  const [shown, setShown] = useState<Reaction | null>(null);
  useEffect(() => {
    if (!reaction) return;
    setShown(reaction);
    const t = setTimeout(() => setShown(null), reaction.text ? 4500 : 1600);
    return () => clearTimeout(t);
  }, [reaction, id]);

  return (
    <div className="buddy-pop" aria-hidden={shown ? undefined : true}>
      <p className="sr-only" role="status" aria-live="polite">
        {shown?.text ?? ""}
      </p>
      {shown && (
        <div key={id} className={`buddy-pop-inner move-${shown.move}`} aria-hidden="true">
          {shown.text && <div className="buddy-bubble">{shown.text}</div>}
          {shown.move === "bigjump" && <span className="buddy-burst" />}
          <span className="buddy-body">
            <Mascot mood={shown.mood} size={shown.move === "bigjump" ? 112 : 92} />
          </span>
        </div>
      )}
    </div>
  );
}
