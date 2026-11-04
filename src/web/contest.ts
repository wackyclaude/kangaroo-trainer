import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { CONTEST_NAMES, DEFAULT_OLYMPIAD, OLY_LEVELS, type Contest, type Me, type OlyLevel } from "../shared/types";

/** The signed-in profile, for screens deep in the tree. */
export const MeContext = createContext<Me | null>(null);

const key = (id: number) => `kt.contest.${id}`;
const EVENT = "kt-contest";

function read(me: Me | null): Contest {
  const list = me?.contests ?? ["kangaroo"];
  let saved: string | null = null;
  try {
    saved = me ? window.localStorage.getItem(key(me.id)) : null;
  } catch {
    /* private mode: just use the first contest */
  }
  return list.includes(saved as Contest) ? (saved as Contest) : (list[0] ?? "kangaroo");
}

/** The contest the student is practising for. Remembered per profile on this device. */
export function useContest(): [Contest, (c: Contest) => void, Contest[]] {
  const me = useContext(MeContext);
  const [contest, setState] = useState<Contest>(() => read(me));
  useEffect(() => {
    const on = () => setState(read(me));
    window.addEventListener(EVENT, on);
    return () => window.removeEventListener(EVENT, on);
  }, [me]);
  const set = useCallback(
    (c: Contest) => {
      try {
        if (me) window.localStorage.setItem(key(me.id), c);
      } catch {
        /* ignore */
      }
      setState(c);
      window.dispatchEvent(new Event(EVENT));
    },
    [me],
  );
  return [contest, set, me?.contests ?? ["kangaroo"]];
}

/** The Olympiad levels this student may pick from. */
export function useLevelRange(): OlyLevel[] {
  const me = useContext(MeContext);
  const o = me?.olympiad ?? DEFAULT_OLYMPIAD;
  return OLY_LEVELS.filter((l) => l >= o.minLevel && l <= o.maxLevel);
}

export const contestName = (c: Contest) => CONTEST_NAMES[c];
export const q = (c: Contest) => (c === "kangaroo" ? "" : `contest=${c}`);
/** Adds ?contest=… (or &contest=…) to a URL for the Olympiad. */
export const withContest = (url: string, c: Contest) => (c === "kangaroo" ? url : `${url}${url.includes("?") ? "&" : "?"}contest=${c}`);
