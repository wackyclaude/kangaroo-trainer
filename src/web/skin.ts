import { createContext, useContext } from "react";
import { ACCENTS, APPEARANCES, SKINS, type Accent, type Appearance, type Skin } from "../shared/types";

export interface Look {
  theme: Skin;
  appearance: Appearance;
  accent: Accent;
}

const KEY = "kt.look";
export const DEFAULT_LOOK: Look = { theme: "classic", appearance: "auto", accent: "violet" };

/** The look last used on this device, so the profile picker matches before anyone signs in. */
export function deviceLook(): Look {
  try {
    const v = JSON.parse(window.localStorage.getItem(KEY) ?? "null") as Partial<Look> | null;
    if (v && (SKINS as readonly string[]).includes(v.theme ?? "") && (APPEARANCES as readonly string[]).includes(v.appearance ?? "")) {
      return { theme: v.theme!, appearance: v.appearance!, accent: (ACCENTS as readonly string[]).includes(v.accent ?? "") ? v.accent! : "violet" };
    }
  } catch {
    /* private mode or bad value */
  }
  return DEFAULT_LOOK;
}

/** Puts the look on <html>: data-skin picks the theme, data-theme forces light or dark. */
export function applyLook(look: Look) {
  const root = document.documentElement;
  root.dataset.skin = look.theme;
  root.dataset.accent = look.accent;
  if (look.appearance === "auto") delete root.dataset.theme;
  else root.dataset.theme = look.appearance;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(look));
  } catch {
    /* ignore */
  }
  // The browser bar colour follows the page.
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) {
    requestAnimationFrame(() => meta.setAttribute("content", getComputedStyle(root).getPropertyValue("--bar").trim() || "#FFC23D"));
  }
}

export const LookContext = createContext<{ look: Look; setLook: (l: Look) => void }>({ look: DEFAULT_LOOK, setLook: () => undefined });
export const useLook = () => useContext(LookContext);
export const useSkin = (): Skin => useContext(LookContext).look.theme;
