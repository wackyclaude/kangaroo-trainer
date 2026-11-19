import { describe, expect, it } from "vitest";
import { usageCount, usageDevice } from "../src/server/db/schema.js";
import { browserFamily, osFamily } from "../src/server/usage/device.js";
import { pruneUsage } from "../src/server/routes/usage.js";
import { addStudent, cookieFrom, makeApp, setupParent } from "./helpers.js";

const MAC_CHROME = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36";
const IPAD_SAFARI = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15";

describe("device families", () => {
  it("keeps only the family", () => {
    expect([browserFamily(MAC_CHROME), osFamily(MAC_CHROME, false)]).toEqual(["Chrome", "macOS"]);
    expect([browserFamily(IPAD_SAFARI), osFamily(IPAD_SAFARI, true)]).toEqual(["Safari", "iPadOS"]);
    expect(browserFamily("Mozilla/5.0 (Windows NT 10.0) Chrome/142.0 Safari/537.36 Edg/142.0")).toBe("Edge");
    expect(osFamily("Mozilla/5.0 (Linux; Android 15; Pixel 9)", true)).toBe("Android");
  });
});

describe("usage stats", () => {
  async function world() {
    const ctx = await makeApp();
    const parent = await setupParent(ctx.app);
    const miraId: number = (await addStudent(ctx.app, parent, "Mira", "1234")).json().id;
    const mira = cookieFrom(await ctx.app.inject({ method: "POST", url: "/api/auth/login", payload: { profileId: miraId, pin: "1234" } }));
    return { ...ctx, parent, miraId, mira };
  }

  it("counts features and devices for students, as families only", async () => {
    const { app, db, mira, parent, miraId } = await world();
    const post = (cookie: string, payload: unknown, ua = MAC_CHROME) => app.inject({ method: "POST", url: "/api/usage", headers: { cookie, "user-agent": ua }, payload });
    expect((await post(mira, { counts: { scratch_open: 2, hint: 1 }, visit: { device: "computer", touch: false } })).statusCode).toBe(204);
    await post(mira, { counts: { scratch_open: 1 }, visit: { device: "computer", touch: false } });
    expect((await post(mira, { counts: { keylogger: 1 } })).statusCode).toBe(400);
    expect((await post(mira, { counts: {}, visit: { device: "computer", touch: false }, ua: "x" })).statusCode).toBe(400);
    // The parent isn't counted.
    expect((await post(parent, { counts: { hint: 5 } })).statusCode).toBe(204);
    expect(db.select().from(usageCount).all().every((r) => r.profileId === miraId)).toBe(true);
    const devices = db.select().from(usageDevice).all();
    expect(devices).toEqual([expect.objectContaining({ browser: "Chrome", os: "macOS", device: "computer", visits: 2 })]);
    expect(JSON.stringify(devices)).not.toContain("Mozilla");

    const report = (await app.inject({ url: `/api/usage/${miraId}?days=30`, headers: { cookie: parent } })).json();
    expect(report.features.find((f: { key: string }) => f.key === "scratch_open").count).toBe(3);
    expect(report.devices).toEqual([{ browser: "Chrome", os: "macOS", device: "computer", visits: 2 }]);
    expect((await app.inject({ url: `/api/usage/${miraId}`, headers: { cookie: mira } })).statusCode).toBe(403);
    expect((await app.inject({ url: `/api/usage/${miraId}?days=5`, headers: { cookie: parent } })).statusCode).toBe(400);
  });

  it("reports time, picks, changes, hints and scratch pad from answers", async () => {
    const { app, mira, parent, miraId } = await world();
    await app.inject({ method: "PUT", url: `/api/profiles/${miraId}/olympiad`, headers: { cookie: parent }, payload: { contests: ["kangaroo", "brain"] } });
    const s = (await app.inject({ method: "POST", url: "/api/sessions", headers: { cookie: mira }, payload: { mode: "paper", paperYear: 2026, help: "practice", contest: "brain" } })).json();
    const answer = (position: number, choice: string | null, extra: object) =>
      app.inject({ method: "POST", url: `/api/sessions/${s.id}/answers`, headers: { cookie: mira }, payload: { position, choice, timeMs: 60_000, ...extra } });
    expect((await answer(1, "C", { scratchUsed: true, pickChanges: 2 })).statusCode).toBe(200);
    await answer(2, "A", { hintUsed: true, timeMs: 10_000 });
    await answer(3, null, {});
    await answer(4, "C", {});
    const u = (await app.inject({ url: `/api/usage/${miraId}?days=7`, headers: { cookie: parent } })).json();
    expect(u).toMatchObject({ answers: 4, medianSeconds: 60, quick: 25, hintShare: 25, scratchShare: 25, changed: { share: 25, right: 100 } });
    expect(u.picks).toEqual([
      { option: "A", share: 25 },
      { option: "C", share: 50 },
      { option: "Skipped", share: 25 },
    ]);
    expect(u.byTier[0]).toMatchObject({ tier: "warm-up", answers: 4, right: 50 });
    expect(u.activeDays).toBe(1);
  });

  it("deletes old days", async () => {
    const { db, miraId } = await world();
    db.insert(usageCount).values([{ profileId: miraId, day: "2020-01-01", key: "hint", n: 1 }, { profileId: miraId, day: "2099-01-01", key: "hint", n: 1 }]).run();
    pruneUsage(db);
    expect(db.select().from(usageCount).all().map((r) => r.day)).toEqual(["2099-01-01"]);
  });
});
