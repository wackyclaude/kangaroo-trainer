import { useState } from "react";
import { ACCENT_NAMES, ACCENTS, DARK_ONLY_SKINS, SKIN_NAMES, SKINS, type Accent, type Appearance, type Skin } from "../../shared/types";
import { api, messageOf } from "../api";
import { useLook } from "../skin";
import { Segmented } from "./Segmented";

const LINE: Record<Skin, string> = {
  classic: "Squared paper, stickers and Roo the kangaroo.",
  space: "Twinkling stars, glowing panels and Nova the alien astronaut.",
  modern: "Sleek and dark, in your own colour. No cartoons.",
  calm: "Big, clear and quiet. Lots of white space, one thing at a time.",
  stickers: "Bold colourful tiles and chunky outlines. No mascot.",
  arcade: "Retro game style: deep purple, neon colours, pixel labels. Always dark.",
};

/** The student picks her own theme. It is saved to her profile, so every device shows it. */
export function LookPicker() {
  const { look, setLook } = useLook();
  const [error, setError] = useState("");

  const save = async (theme: Skin, appearance: Appearance, accent: Accent = look.accent) => {
    const before = look;
    setLook({ theme, appearance, accent }); // show it straight away
    setError("");
    try {
      await api.put("/api/me/look", { theme, appearance, accent });
    } catch (e) {
      setLook(before);
      setError(messageOf(e));
    }
  };

  // Modern is dark-first: "auto" means dark there, so it offers Dark / Light only.
  const modes: { value: Appearance; label: string }[] =
    look.theme === "modern"
      ? [
          { value: "auto", label: "Dark" },
          { value: "light", label: "Light" },
        ]
      : [
          { value: "auto", label: "Like my device" },
          { value: "light", label: "Light" },
          { value: "dark", label: "Dark" },
        ];
  const mode = look.theme === "modern" && look.appearance === "dark" ? "auto" : look.appearance;

  return (
    <section className="panel stack" aria-labelledby="look-h">
      <div>
        <h2 id="look-h">My theme</h2>
        <p className="muted" style={{ margin: 0 }}>
          Pick how the app looks for you. It's saved to your profile.
        </p>
      </div>
      <div className="look-grid" role="radiogroup" aria-label="Theme">
        {SKINS.map((t) => (
          <button key={t} type="button" role="radio" aria-checked={look.theme === t} className="look-card" onClick={() => save(t, look.theme === "modern" || t === "modern" || DARK_ONLY_SKINS.includes(t) ? "auto" : look.appearance)}>
            <span className={`look-swatch ${t}`} aria-hidden="true">
              <span className="sw-a" />
              <span className="sw-b" />
            </span>
            <span className="look-name">{SKIN_NAMES[t]}</span>
            <span className="muted small-line">{LINE[t]}</span>
          </button>
        ))}
      </div>
      {!DARK_ONLY_SKINS.includes(look.theme) && (
        <div className="setting">
          <span className="setting-name">Light or dark</span>
          <Segmented label="Light or dark" value={mode} onChange={(a) => save(look.theme, a)} options={modes} />
        </div>
      )}
      {look.theme === "modern" && (
        <div className="setting">
          <span className="setting-name">My colour</span>
          <div className="accent-row" role="radiogroup" aria-label="My colour">
            {ACCENTS.map((a) => (
              <button key={a} type="button" role="radio" aria-checked={look.accent === a} className={`accent-dot accent-${a}`} onClick={() => save(look.theme, look.appearance, a)}>
                <span className="accent-swatch" aria-hidden="true" />
                {ACCENT_NAMES[a]}
              </button>
            ))}
          </div>
        </div>
      )}
      {error && (
        <div className="message" role="alert">
          {error}
        </div>
      )}
    </section>
  );
}
