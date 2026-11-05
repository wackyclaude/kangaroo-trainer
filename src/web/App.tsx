import { useCallback, useEffect, useMemo, useState } from "react";
import type { Me, ProfileCard } from "../shared/types";
import { api, ApiFailure, messageOf } from "./api";
import { TopBar } from "./components/TopBar";
import { Setup } from "./screens/Setup";
import { Picker } from "./screens/Picker";
import { PinEntry } from "./screens/PinEntry";
import { StudentHome } from "./screens/StudentHome";
import { ParentHome } from "./screens/ParentHome";
import { StartPaper } from "./screens/StartPaper";
import { StartFocus } from "./screens/StartFocus";
import { Runner } from "./screens/Runner";
import { Results } from "./screens/Results";
import { Progress } from "./screens/Progress";
import { Badges } from "./screens/Badges";
import { StartQuick } from "./screens/StartQuick";
import { Print } from "./screens/Print";
import { AnswerSheet } from "./screens/AnswerSheet";
import { MeContext } from "./contest";
import { applyLook, deviceLook, LookContext, type Look } from "./skin";

type View = { kind: "loading" } | { kind: "error"; text: string } | { kind: "setup" } | { kind: "pick" } | { kind: "pin"; profile: ProfileCard } | { kind: "in"; me: Me };

function useHash(): string {
  const [hash, setHash] = useState(window.location.hash || "#/");
  useEffect(() => {
    const on = () => {
      setHash(window.location.hash || "#/");
      window.scrollTo(0, 0);
    };
    window.addEventListener("hashchange", on);
    return () => window.removeEventListener("hashchange", on);
  }, []);
  return hash;
}

export function App() {
  const [view, setView] = useState<View>({ kind: "loading" });
  const hash = useHash();
  const [look, setLookState] = useState<Look>(deviceLook);
  useEffect(() => applyLook(look), [look]);
  const lookCtx = useMemo(() => ({ look, setLook: setLookState }), [look]);
  // Signed in: the profile's own look.
  const meLook = view.kind === "in" ? `${view.me.theme}/${view.me.appearance}` : "";
  useEffect(() => {
    if (view.kind === "in") setLookState({ theme: view.me.theme, appearance: view.me.appearance });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meLook]);

  const boot = useCallback(async () => {
    try {
      const status = await api.get<{ needsSetup: boolean }>("/api/setup/status");
      if (status.needsSetup) return setView({ kind: "setup" });
      try {
        const me = await api.get<Me>("/api/me");
        setView({ kind: "in", me });
      } catch (e) {
        if (e instanceof ApiFailure && e.status === 401) setView({ kind: "pick" });
        else throw e;
      }
    } catch (e) {
      setView({ kind: "error", text: messageOf(e) });
    }
  }, []);

  useEffect(() => {
    void boot();
  }, [boot]);

  const signOut = async () => {
    await api.post("/api/auth/logout").catch(() => undefined);
    navigator.serviceWorker?.controller?.postMessage("signed-out");
    window.location.hash = "#/";
    setView({ kind: "pick" });
  };

  return <LookContext.Provider value={lookCtx}>{screen()}</LookContext.Provider>;

  function screen() {
  switch (view.kind) {
    case "loading":
      return <main className="page" aria-busy="true" />;
    case "error":
      return (
        <main className="page">
          <TopBar />
          <div className="message" role="alert">
            {view.text}
          </div>
          <button className="btn" onClick={() => void boot()} style={{ marginTop: 16 }}>
            Try again
          </button>
        </main>
      );
    case "setup":
      return <Setup onDone={() => void boot()} />;
    case "pick":
      return <Picker onPick={(profile) => setView({ kind: "pin", profile })} />;
    case "pin":
      return <PinEntry profile={view.profile} onBack={() => setView({ kind: "pick" })} onSignedIn={() => void boot()} />;
    case "in": {
      const quiz = hash.match(/^#\/quiz\/(\d+)$/);
      const results = hash.match(/^#\/results\/(\d+)$/);
      const insights = hash.match(/^#\/insights\/(\d+)$/);
      const print = hash.match(/^#\/print\/(\d+)$/);
      const sheet = hash.match(/^#\/answer-sheet\/(\d+)$/);
      let body;
      if (quiz) body = <Runner key={quiz[1]} sessionId={Number(quiz[1])} />;
      else if (results) body = <Results key={results[1]} sessionId={Number(results[1])} />;
      else if (print) body = <Print key={print[1]} sessionId={Number(print[1])} me={view.me} />;
      else if (sheet) body = <AnswerSheet key={sheet[1]} sessionId={Number(sheet[1])} />;
      else if (insights && view.me.role === "parent") body = <Progress key={insights[1]} profileId={Number(insights[1])} asParent />;
      else if (hash === "#/progress" && view.me.role === "student") body = <Progress />;
      else if (hash === "#/badges" && view.me.role === "student") body = <Badges />;
      else if (hash === "#/mistakes") body = <StartQuick key="m" mode="mistakes" />;
      else if (hash === "#/smart") body = <StartQuick key="s" mode="smart" />;
      else if (hash === "#/paper") body = <StartPaper />;
      else if (hash.startsWith("#/focus")) body = <StartFocus key={hash} />;
      else body = view.me.role === "parent" ? <ParentHome me={view.me} /> : <StudentHome me={view.me} />;
      return (
        <MeContext.Provider value={view.me}>
          <main className={`page${quiz ? " page-quiz" : ""}${print ? " page-print" : ""}`}>
            {!quiz && (
              <div className="no-print">
                <TopBar me={view.me} onSignOut={() => void signOut()} />
              </div>
            )}
            {body}
          </main>
        </MeContext.Provider>
      );
    }
  }
  }
}
