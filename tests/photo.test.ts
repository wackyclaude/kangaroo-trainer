import { describe, expect, it } from "vitest";
import { PNG } from "pngjs";
import { cleanPhoto, PhotoError } from "../src/server/auth/photo.js";
import { addStudent, cookieFrom, makeApp, setupParent } from "./helpers.js";

/** A square PNG with a hidden text chunk (like camera data) before the image data. */
function pngWithSecret(size = 256): Buffer {
  const img = new PNG({ width: size, height: size });
  img.data.fill(200);
  const png = PNG.sync.write(img);
  const text = Buffer.from("GPS\0 52.2215N 6.5631E");
  const chunk = Buffer.alloc(12 + text.length);
  chunk.writeUInt32BE(text.length, 0);
  chunk.write("tEXt", 4, "latin1");
  text.copy(chunk, 8);
  return Buffer.concat([png.subarray(0, 33), chunk, png.subarray(33)]); // after IHDR
}
const dataUrl = (b: Buffer) => `data:image/png;base64,${b.toString("base64")}`;

describe("cleanPhoto", () => {
  it("keeps the picture and drops hidden data", () => {
    const dirty = pngWithSecret();
    expect(dirty.includes("GPS")).toBe(true);
    const clean = cleanPhoto(dataUrl(dirty));
    expect(clean.includes("GPS")).toBe(false);
    expect(PNG.sync.read(clean)).toMatchObject({ width: 256, height: 256 });
  });

  it("refuses other sizes before decoding, and non-PNGs", () => {
    expect(() => cleanPhoto(dataUrl(pngWithSecret(300)))).toThrow(PhotoError);
    // A header claiming a huge picture is refused without decoding it.
    const huge = pngWithSecret();
    huge.writeUInt32BE(60000, 16);
    huge.writeUInt32BE(60000, 20);
    expect(() => cleanPhoto(dataUrl(huge))).toThrow(/256/);
    expect(() => cleanPhoto(Buffer.from("GIF89a....").toString("base64"))).toThrow(PhotoError);
    expect(() => cleanPhoto("not base64 !!")).toThrow(PhotoError);
  });
});

describe("profile pictures", () => {
  async function world() {
    const ctx = await makeApp();
    const parent = await setupParent(ctx.app);
    const miraId: number = (await addStudent(ctx.app, parent, "Mira", "1234")).json().id;
    const samId: number = (await addStudent(ctx.app, parent, "Sam", "5678")).json().id;
    const login = async (profileId: number, pin: string) => cookieFrom(await ctx.app.inject({ method: "POST", url: "/api/auth/login", payload: { profileId, pin } }));
    return { ...ctx, parent, miraId, samId, mira: await login(miraId, "1234"), sam: await login(samId, "5678") };
  }

  it("lets a student pick from the new avatars", async () => {
    const { app, mira } = await world();
    const res = await app.inject({ method: "PUT", url: "/api/me/avatar", headers: { cookie: mira }, payload: { avatar: "♟️" } });
    expect(res.json()).toEqual({ avatar: "♟️", photo: null });
    expect((await app.inject({ url: "/api/me", headers: { cookie: mira } })).json()).toMatchObject({ avatar: "♟️", photo: null });
    expect((await app.inject({ method: "PUT", url: "/api/me/avatar", headers: { cookie: mira }, payload: { avatar: "💩" } })).statusCode).toBe(400);
  });

  it("uploads, shows only to herself and the parent, and stays off the sign-in screen", async () => {
    const { app, mira, sam, parent, miraId } = await world();
    const up = await app.inject({ method: "PUT", url: "/api/me/photo", headers: { cookie: mira }, payload: { image: dataUrl(pngWithSecret()) } });
    expect(up.statusCode).toBe(200);
    const url: string = up.json().photo;
    expect(url).toMatch(new RegExp(`^/api/profiles/${miraId}/photo\\?v=\\d+$`));
    expect((await app.inject({ url: "/api/me", headers: { cookie: mira } })).json().photo).toBe(url);

    const own = await app.inject({ url, headers: { cookie: mira } });
    expect(own.statusCode).toBe(200);
    expect(own.headers["content-type"]).toBe("image/png");
    expect(own.rawPayload.includes("GPS")).toBe(false);
    expect((await app.inject({ url, headers: { cookie: parent } })).statusCode).toBe(200);
    expect((await app.inject({ url, headers: { cookie: sam } })).statusCode).toBe(403);
    expect((await app.inject({ url })).statusCode).toBe(401);
    // The public profile list (sign-in screen) never carries the picture.
    expect(JSON.stringify((await app.inject({ url: "/api/profiles" })).json())).not.toContain("photo");
    expect((await app.inject({ url: "/api/admin/profiles", headers: { cookie: parent } })).json().find((p: { id: number }) => p.id === miraId).photo).toBe(url);
  });

  it("refuses bad pictures and lets the parent remove one", async () => {
    const { app, mira, parent, miraId } = await world();
    const bad = await app.inject({ method: "PUT", url: "/api/me/photo", headers: { cookie: mira }, payload: { image: dataUrl(pngWithSecret(64)) } });
    expect(bad.statusCode).toBe(400);
    await app.inject({ method: "PUT", url: "/api/me/photo", headers: { cookie: mira }, payload: { image: dataUrl(pngWithSecret()) } });
    expect((await app.inject({ method: "DELETE", url: `/api/profiles/${miraId}/photo`, headers: { cookie: mira } })).statusCode).toBe(403);
    expect((await app.inject({ method: "DELETE", url: `/api/profiles/${miraId}/photo`, headers: { cookie: parent } })).statusCode).toBe(200);
    expect((await app.inject({ url: "/api/me", headers: { cookie: mira } })).json().photo).toBeNull();
    expect((await app.inject({ url: `/api/profiles/${miraId}/photo?v=1`, headers: { cookie: mira } })).statusCode).toBe(404);
  });
});
