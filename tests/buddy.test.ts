import { describe, expect, it } from "vitest";
import { buddyOf, buddyModeOf } from "../src/shared/types.js";
import { endLine, LINES, react } from "../src/web/buddy.js";
import { addStudent, cookieFrom, makeApp, setupParent } from "./helpers.js";

const base = { correct: true, choice: "C", level: 2, tier: "warm-up" as const, pupils: null, timeMs: 60_000, streak: 1, rightSoFar: 1 };
const first = () => 0; // always the first fresh line

describe("buddy reactions (coach voice)", () => {
  it("nods at easy ones and goes quiet once she's used to it", () => {
    expect(react(base, first)).toMatchObject({ mood: "nod", move: "nod" });
    expect(react({ ...base, rightSoFar: 25 }, first).text).toBeNull();
  });
  it("celebrates hard questions bigger, with real numbers when there are some", () => {
    expect(react({ ...base, level: 3 }, first)).toMatchObject({ move: "hop" });
    expect(react({ ...base, level: 5, tier: "challenge" }, first)).toMatchObject({ mood: "cheer", move: "bigjump" });
    const rare = react({ ...base, level: 5, pupils: { year: 2026, right: 14, blank: 20, trap: null } }, () => 0.9);
    expect(rare.text).toContain("14%");
  });
  it("doesn't cheer a probable guess", () => {
    expect(react({ ...base, level: 4, timeMs: 4_000 }, first)).toMatchObject({ move: "nod" });
    expect(react({ ...base, level: 4, timeMs: 4_000 }, first).text).toMatch(/guess|check|working/i);
  });
  it("comforts, names a trap she fell for, and marks streaks", () => {
    const trap = react({ ...base, correct: false, choice: "D", pupils: { year: 2026, right: 30, blank: 5, trap: { choice: "D", pct: 58 } } }, first);
    expect(trap).toMatchObject({ mood: "comfort", move: "sway" });
    expect(trap.text).toContain("58%");
    expect(react({ ...base, correct: false, choice: null }, first).mood).toBe("comfort");
    expect(react({ ...base, streak: 5 }, first)).toMatchObject({ move: "bigjump" });
    expect(react({ ...base, streak: 3 }, first)).toMatchObject({ move: "hop" });
  });
  it("ends with the score and one specific thing", () => {
    expect(endLine(18, 24, { challengeRight: 3 }, first).text).toMatch(/18 out of 24.*3 challenge questions/);
    expect(endLine(4, 24, {}, first).mood).toBe("comfort");
  });
  it("has plenty of lines, all short", () => {
    const all = Object.values(LINES).flat();
    expect(all.length).toBeGreaterThanOrEqual(120);
    for (const l of all) expect(l.length, l).toBeLessThanOrEqual(80);
  });
});

describe("buddy settings", () => {
  it("defaults by theme until the student picks", () => {
    expect([buddyOf(null, "classic"), buddyOf(null, "space"), buddyOf(null, "arcade"), buddyOf("kit", "arcade")]).toEqual(["roo", "nova", "none", "kit"]);
    expect([buddyModeOf(null), buddyModeOf("quiet"), buddyModeOf("loud")]).toEqual(["lively", "quiet", "lively"]);
  });
  it("lets each student pick their own", async () => {
    const { app } = await makeApp();
    const parent = await setupParent(app);
    const id: number = (await addStudent(app, parent, "Mira", "1234")).json().id;
    const mira = cookieFrom(await app.inject({ method: "POST", url: "/api/auth/login", payload: { profileId: id, pin: "1234" } }));
    expect((await app.inject({ url: "/api/me", headers: { cookie: mira } })).json()).toMatchObject({ buddy: "roo", buddyMode: "lively" });
    const put = await app.inject({ method: "PUT", url: "/api/me/buddy", headers: { cookie: mira }, payload: { buddy: "pixel", buddyMode: "quiet" } });
    expect(put.statusCode).toBe(200);
    expect((await app.inject({ url: "/api/me", headers: { cookie: mira } })).json()).toMatchObject({ buddy: "pixel", buddyMode: "quiet" });
    expect((await app.inject({ method: "PUT", url: "/api/me/buddy", headers: { cookie: mira }, payload: { buddy: "dragon", buddyMode: "quiet" } })).statusCode).toBe(400);
  });
});
