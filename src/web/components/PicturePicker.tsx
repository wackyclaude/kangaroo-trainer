import { track } from "../usage";
import { useRef, useState } from "react";
import type { Me } from "../../shared/types";
import { api, messageOf } from "../api";
import { AvatarPicker } from "./AvatarPicker";
import { Face } from "./Face";

const SIZE = 256;

/** Crops the middle square of an image file and returns a 256×256 PNG data URL. */
async function squarePng(file: File): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    const side = Math.min(img.naturalWidth, img.naturalHeight);
    if (!side) throw new Error("empty");
    const canvas = document.createElement("canvas");
    canvas.width = SIZE;
    canvas.height = SIZE;
    const ctx = canvas.getContext("2d")!;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(img, (img.naturalWidth - side) / 2, (img.naturalHeight - side) / 2, side, side, 0, 0, SIZE, SIZE);
    return canvas.toDataURL("image/png");
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** The student's own profile picture: pick an emoji or upload a picture. */
export function PicturePicker({ me, onChange }: { me: Me; onChange: (p: { avatar?: string; photo: string | null }) => void }) {
  const [open, setOpen] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const file = useRef<HTMLInputElement>(null);

  const pickEmoji = async (avatar: string) => {
    setBusy(true);
    setMsg(null);
    try {
      await api.put("/api/me/avatar", { avatar });
      onChange({ avatar, photo: null });
      track("picture_change");
    } catch (e) {
      setMsg({ ok: false, text: messageOf(e) });
    } finally {
      setBusy(false);
    }
  };

  const choose = async (f: File | undefined) => {
    if (!f) return;
    setMsg(null);
    if (!f.type.startsWith("image/")) return setMsg({ ok: false, text: "That isn't a picture. Try a JPG or PNG." });
    if (f.size > 15 * 1024 * 1024) return setMsg({ ok: false, text: "That file is too big (over 15 MB)." });
    try {
      setPreview(await squarePng(f));
    } catch {
      setMsg({ ok: false, text: "That picture couldn't be opened here. Try a JPG or PNG." });
    }
  };

  const upload = async () => {
    if (!preview) return;
    setBusy(true);
    try {
      const { photo } = await api.put<{ photo: string }>("/api/me/photo", { image: preview });
      onChange({ photo });
      track("picture_change");
      setPreview(null);
      setMsg({ ok: true, text: "New picture saved." });
    } catch (e) {
      setMsg({ ok: false, text: messageOf(e) });
    } finally {
      setBusy(false);
    }
  };

  const removePhoto = async () => {
    setBusy(true);
    try {
      await api.del("/api/me/photo");
      onChange({ photo: null });
    } catch (e) {
      setMsg({ ok: false, text: messageOf(e) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="panel stack">
      <div className="pic-head">
        <h2>My picture</h2>
        <button type="button" className="btn" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
          {open ? "Done" : "Change"}
        </button>
      </div>
      {open && (
        <>
          <div className="pic-upload stack">
            <h3>Use your own picture</h3>
            <p className="muted">A drawing, your pet or something you like works great. Only you and the admin can see it.</p>
            {preview ? (
              <div className="row">
                <img className="face-photo pic-preview" src={preview} alt="Preview of your new picture" />
                <button type="button" className="btn primary" disabled={busy} onClick={() => void upload()}>
                  Use this picture
                </button>
                <button type="button" className="btn quiet" onClick={() => setPreview(null)}>
                  Cancel
                </button>
              </div>
            ) : (
              <div className="row">
                <button type="button" className="btn" disabled={busy} onClick={() => file.current?.click()}>
                  Upload a picture
                </button>
                {me.photo && (
                  <button type="button" className="btn quiet" disabled={busy} onClick={() => void removePhoto()}>
                    Remove my picture
                  </button>
                )}
              </div>
            )}
            <input
              ref={file}
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif"
              hidden
              onChange={(e) => {
                void choose(e.target.files?.[0]);
                e.target.value = "";
              }}
            />
          </div>
          <div className="stack">
            <h3>Or pick an avatar</h3>
            <AvatarPicker value={me.photo ? "" : me.avatar} onChange={(a) => void pickEmoji(a)} />
          </div>
        </>
      )}
      {msg && (
        <p className={`message${msg.ok ? " ok" : ""}`} role="status">
          {msg.text}
        </p>
      )}
      {!open && (
        <div className="row">
          <Face avatar={me.avatar} photo={me.photo} className="pic-current" />
          <span className="muted">{me.photo ? "Your own picture" : "Your avatar"}</span>
        </div>
      )}
    </section>
  );
}
