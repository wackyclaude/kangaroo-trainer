import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { profile } from "../src/server/db/schema.js";
import { addStudent, cookieFrom, makeApp, setupParent } from "./helpers.js";

describe("themes", () => {
  it("starts on the exercise-book look and follows the device", async () => {
    const { app } = await makeApp();
    const parent = await setupParent(app);
    const me = (await app.inject({ url: "/api/me", headers: { cookie: parent } })).json();
    expect(me).toMatchObject({ theme: "classic", appearance: "auto", accent: "violet" });
  });

  it("lets a student pick her own look, and only that", async () => {
    const { app, db } = await makeApp();
    const parent = await setupParent(app);
    const id = (await addStudent(app, parent, "Mira", "1234")).json().id;
    const mira = cookieFrom(await app.inject({ method: "POST", url: "/api/auth/login", payload: { profileId: id, pin: "1234" } }));
    const put = (payload: unknown) => app.inject({ method: "PUT", url: "/api/me/look", headers: { cookie: mira }, payload });
    expect((await put({ theme: "space", appearance: "dark" })).statusCode).toBe(200);
    expect((await app.inject({ url: "/api/me", headers: { cookie: mira } })).json()).toMatchObject({ theme: "space", appearance: "dark" });
    expect((await put({ theme: "modern", appearance: "auto", accent: "mint" })).statusCode).toBe(200);
    expect((await app.inject({ url: "/api/me", headers: { cookie: mira } })).json()).toMatchObject({ theme: "modern", accent: "mint" });
    expect((await put({ theme: "modern", appearance: "auto", accent: "gold" })).statusCode).toBe(400);
    expect((await put({ theme: "neon", appearance: "dark" })).statusCode).toBe(400);
    expect((await put({ theme: "modern", appearance: "auto", nickname: "Hacker" })).statusCode).toBe(400);
    expect((await app.inject({ method: "PUT", url: "/api/me/look", payload: { theme: "modern", appearance: "auto" } })).statusCode).toBe(401);
    // The parent's look is separate.
    expect((await app.inject({ url: "/api/me", headers: { cookie: parent } })).json().theme).toBe("classic");
    // An odd stored value falls back safely.
    db.update(profile).set({ theme: "<script>", appearance: "sideways", accent: "rainbow" }).where(eq(profile.id, id)).run();
    expect((await app.inject({ url: "/api/me", headers: { cookie: mira } })).json()).toMatchObject({ theme: "classic", appearance: "auto", accent: "violet" });
  });
});
