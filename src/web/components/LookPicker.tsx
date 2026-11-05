import { useState } from "react";
import { SKIN_NAMES, SKINS, type Appearance, type Skin } from "../../shared/types";
import { api, messageOf } from "../api";
import { useLook } from "../skin";
import { Segmented } from "./Segmented";

const LINE: Record<Skin, string> = {
  classic: "Squared paper, stickers and Roo the kangaroo.",
  space: "Stars, planets and Nova the alien astronaut.",
  modern: "Clean and dark. No cartoons.",
};

/** The student picks her own theme. It is saved to her profile, so every device shows it. */
export function LookPicker() {
  const { look, setLook } = useLook();
  const [error, setError] = useState("");

  const save = async (theme: Skin, appearance: Appearance) => {
    const before = look;
    setLook({ theme, appearance }); // show it straight away
    setError("");
    try {
      await api.put("/api/me/look", { theme, appearance });
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
          <button key={t} type="button" role="radio" aria-checked={look.theme === t} className="look-card" onClick={() => save(t, look.theme === "modern" || t === "modern" ? "auto" : look.appearance)}>
            <span className={`look-swatch ${t}`} aria-hidden="true">
              <span className="sw-a" />
              <span className="sw-b" />
            </span>
            <span className="look-name">{SKIN_NAMES[t]}</span>
            <span className="muted small-line">{LINE[t]}</span>
          </button>
        ))}
      </div>
      <div className="setting">
        <span className="setting-name">Light or dark</span>
        <Segmented label="Light or dark" value={mode} onChange={(a) => save(look.theme, a)} options={modes} />
      </div>
      {error && (
        <div className="message" role="alert">
          {error}
        </div>
      )}
    </section>
  );
}
