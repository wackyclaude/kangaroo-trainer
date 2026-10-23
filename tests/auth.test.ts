import { describe, expect, it } from "vitest";
import { addStudent, cookieFrom, makeApp, setupParent, SETUP_CODE } from "./helpers.js";
import { readSession, createSession } from "../src/server/auth/session.js";

describe("first-time setup", () => {
  it("needs the setup code and a strong parent PIN, and only works once", async () => {
    const { app } = await makeApp();
    expect((await app.inject("/api/setup/status")).json()).toEqual({ needsSetup: true });

    const wrong = await app.inject({ method: "POST", url: "/api/setup", payload: { setupCode: "000000", nickname: "P", avatar: "🦉", pin: "246810" } });
    expect(wrong.statusCode).toBe(403);
    const weak = await app.inject({ method: "POST", url: "/api/setup", payload: { setupCode: SETUP_CODE, nickname: "P", avatar: "🦉", pin: "1234" } });
    expect(weak.statusCode).toBe(400);

    const cookie = await setupParent(app);
    expect(cookie).toMatch(/^kt_session=/);
    const again = await app.inject({ method: "POST", url: "/api/setup", payload: { setupCode: SETUP_CODE, nickname: "X", avatar: "🦉", pin: "135791" } });
    expect(again.statusCode).toBe(409);
    expect((await app.inject("/api/setup/status")).json()).toEqual({ needsSetup: false });
  });

  it("sets a hardened session cookie", async () => {
    const { app } = await makeApp();
    const res = await app.inject({ method: "POST", url: "/api/setup", payload: { setupCode: SETUP_CODE, nickname: "Papa", avatar: "🦉", pin: "246810" } });
    const raw = String(res.headers["set-cookie"]);
    expect(raw).toContain("HttpOnly");
    expect(raw).toContain("Secure");
    expect(raw).toContain("SameSite=Strict");
  });
});

describe("profiles", () => {
  it("lets only the parent add students, with 4-digit PINs and unique nicknames, up to 5", async () => {
    const { app } = await makeApp();
    const parent = await setupParent(app);
    expect((await addStudent(app, parent, "Mira", "123")).statusCode).toBe(400);
    expect((await addStudent(app, parent, "Mira")).statusCode).toBe(201);
    expect((await addStudent(app, parent, "Mira")).statusCode).toBe(409);
    for (const n of ["A", "B", "C", "D"]) expect((await addStudent(app, parent, n)).statusCode).toBe(201);
    expect((await addStudent(app, parent, "F")).statusCode).toBe(409);

    const list = (await app.inject("/api/profiles")).json();
    expect(list).toHaveLength(6);
    expect(JSON.stringify(list)).not.toContain("pin");
  });

  it("refuses profile changes from a student", async () => {
    const { app } = await makeApp();
    const parent = await setupParent(app);
    const id = (await addStudent(app, parent)).json().id;
    const login = await app.inject({ method: "POST", url: "/api/auth/login", payload: { profileId: id, pin: "1234" } });
    const student = cookieFrom(login);
    const res = await app.inject({ method: "POST", url: "/api/profiles", headers: { cookie: student }, payload: { nickname: "Z", avatar: "🦊", grade: null, birthYear: null, pin: "1111" } });
    expect(res.statusCode).toBe(403);
    expect((await app.inject({ method: "DELETE", url: `/api/profiles/${id}`, headers: { cookie: student } })).statusCode).toBe(403);
  });
});

describe("sign-in", () => {
  it("locks a profile for 5 minutes after 5 wrong PINs", async () => {
    const { app } = await makeApp();
    const parent = await setupParent(app);
    const id = (await addStudent(app, parent)).json().id;
    const tryPin = (pin: string) => app.inject({ method: "POST", url: "/api/auth/login", payload: { profileId: id, pin } });
    for (let i = 0; i < 4; i++) expect((await tryPin("0000")).statusCode).toBe(401);
    const fifth = await tryPin("0000");
    expect(fifth.statusCode).toBe(423);
    expect(fifth.json().retryAfterSeconds).toBe(300);
    expect((await tryPin("1234")).statusCode).toBe(423); // right PIN, still locked

    // Parent resets the PIN, which also unlocks.
    const reset = await app.inject({ method: "POST", url: `/api/profiles/${id}/pin`, headers: { cookie: parent }, payload: { pin: "4321" } });
    expect(reset.statusCode).toBe(200);
    expect((await tryPin("4321")).statusCode).toBe(200);
  });

  it("signs out and forgets the session", async () => {
    const { app } = await makeApp();
    const parent = await setupParent(app);
    expect((await app.inject({ url: "/api/me", headers: { cookie: parent } })).statusCode).toBe(200);
    await app.inject({ method: "POST", url: "/api/auth/logout", headers: { cookie: parent } });
    expect((await app.inject({ url: "/api/me", headers: { cookie: parent } })).statusCode).toBe(401);
  });

  it("ends a parent session after 30 idle minutes", async () => {
    const { app, db } = await makeApp();
    await setupParent(app);
    const t0 = Date.now();
    const token = createSession(db, 1, "parent", t0);
    expect(readSession(db, token, t0 + 29 * 60_000)?.role).toBe("parent");
    expect(readSession(db, token, t0 + 29 * 60_000 + 31 * 60_000)).toBeNull();
  });
});

describe("request safety", () => {
  it("rejects state-changing requests from another site", async () => {
    const { app } = await makeApp();
    const res = await app.inject({
      method: "POST",
      url: "/api/setup",
      headers: { origin: "https://evil.example", host: "kangaroo.local" },
      payload: { setupCode: SETUP_CODE, nickname: "P", avatar: "🦉", pin: "246810" },
    });
    expect(res.statusCode).toBe(403);
  });

  it("sends a strict Content-Security-Policy", async () => {
    const { app } = await makeApp();
    const res = await app.inject("/api/health");
    expect(res.headers["content-security-policy"]).toContain("default-src 'self'");
    expect(res.headers["content-security-policy"]).toContain("frame-ancestors 'none'");
  });
});
