import { describe, expect, it } from "vitest";
import { contestFor, contestWindow, readiness } from "../src/server/readiness/model.js";
import { FOCUS_AREAS, type FocusArea } from "../src/shared/types.js";
import { addStudent, cookieFrom, makeApp, setupParent } from "./helpers.js";

const AREAS = Object.keys(FOCUS_AREAS) as FocusArea[];

describe("contest window", () => {
  it("starts on the third Thursday of March and ends on 31 March", () => {
    expect(contestWindow(2027)).toEqual({ start: "2027-03-18", end: "2027-03-31" });
    expect(contestWindow(2026).start).toBe("2026-03-19");
    expect(contestWindow(2029).start).toBe("2029-03-15"); // 1 March 2029 is a Thursday
    expect(contestWindow(2028).start).toBe("2028-03-16");
  });
});

describe("which contest to count down to", () => {
  it("counts down to the first day by default", () => {
    expect(contestFor("2026-10-19", null)).toMatchObject({ date: "2027-03-18", chosen: false, daysLeft: 150, phase: "countdown" });
  });
  it("uses the parent's day when it is inside the window", () => {
    expect(contestFor("2026-10-19", "2027-03-25")).toMatchObject({ date: "2027-03-25", chosen: true, phase: "countdown" });
  });
  it("ignores a day from an earlier year or outside the window", () => {
    expect(contestFor("2026-10-19", "2026-03-19")).toMatchObject({ date: "2027-03-18", chosen: false });
    expect(contestFor("2026-10-19", "2027-03-02")).toMatchObject({ date: "2027-03-18", chosen: false });
  });
  it("knows contest day, the open window and after", () => {
    expect(contestFor("2027-03-18", null)).toMatchObject({ phase: "today", daysLeft: 0 });
    expect(contestFor("2027-03-22", null)).toMatchObject({ phase: "open", daysLeft: 0 });
    expect(contestFor("2027-03-26", "2027-03-25")).toMatchObject({ phase: "done" });
  });
  it("rolls on to next year after 31 March", () => {
    expect(contestFor("2027-04-01", "2027-03-25")).toMatchObject({ date: "2028-03-16", chosen: false, phase: "countdown" });
  });
});

describe("readiness", () => {
  const areas = (acc: number | null, attempts: number) => AREAS.map((focus) => ({ focus, weightedAccuracy: acc, attempts }));

  it("is 0 with nothing done, and points to a full paper", () => {
    const r = readiness({ areas: areas(null, 0), estimate: null, papers: 0, distinctQuestions: 0, target: 100 });
    expect(r.percent).toBe(0);
    expect(r.tip).toMatch(/full past paper/);
  });

  it("is 100 when every part is full", () => {
    const r = readiness({ areas: areas(0.9, 20), estimate: 110, papers: 9, distinctQuestions: 400, target: 100 });
    expect(r.percent).toBe(100);
    expect(r.parts.skill.detail).toMatch(/6 of 6 areas are there/);
    expect(r.tip).toMatch(/Ready/);
  });

  it("blends 40/40/20", () => {
    // skill: 0.4/0.8 = 0.5 per area, full attempts → 0.5; score 60/100 = 0.6; practice 0.5*4/8 + 0.5*150/300 = 0.5
    const r = readiness({ areas: areas(0.4, 10), estimate: 60, papers: 4, distinctQuestions: 150, target: 100 });
    expect(r.parts).toMatchObject({ skill: { percent: 50 }, score: { percent: 60 }, practice: { percent: 50 } });
    expect(r.percent).toBe(Math.round(0.4 * 50 + 0.4 * 60 + 0.2 * 50));
  });

  it("does not count an area as ready on a handful of answers", () => {
    const r = readiness({ areas: areas(1, 5), estimate: null, papers: 0, distinctQuestions: 30, target: 100 });
    expect(r.parts.skill.percent).toBe(50);
  });

  it("measures the score against the parent's target", () => {
    const at = (target: number) => readiness({ areas: areas(null, 0), estimate: 75, papers: 1, distinctQuestions: 24, target }).parts.score.percent;
    expect(at(100)).toBe(75);
    expect(at(75)).toBe(100);
  });
});

describe("readiness API", () => {
  async function world() {
    const ctx = await makeApp();
    const parent = await setupParent(ctx.app);
    const mira = (await addStudent(ctx.app, parent, "Mira", "1234")).json().id as number;
    const tom = (await addStudent(ctx.app, parent, "Tom", "5678")).json().id as number;
    const login = async (id: number, pin: string) => cookieFrom(await ctx.app.inject({ method: "POST", url: "/api/auth/login", payload: { profileId: id, pin } }));
    return { ...ctx, parent, mira, tom, miraC: await login(mira, "1234"), tomC: await login(tom, "5678") };
  }

  it("shows a student their own, and the parent anyone's, but not another student's", async () => {
    const w = await world();
    const own = await w.app.inject({ url: "/api/readiness", headers: { cookie: w.miraC } });
    expect(own.statusCode).toBe(200);
    expect(own.json()).toMatchObject({ percent: 0, target: 100, contest: { chosen: false } });
    expect((await w.app.inject({ url: `/api/readiness/${w.mira}`, headers: { cookie: w.parent } })).statusCode).toBe(200);
    expect((await w.app.inject({ url: `/api/readiness/${w.mira}`, headers: { cookie: w.tomC } })).statusCode).toBe(404);
    expect((await w.app.inject({ url: "/api/readiness" })).statusCode).toBe(401);
  });

  it("lets only the parent set the contest day and target, with checks", async () => {
    const w = await world();
    const put = (cookie: string, payload: unknown, id = w.mira) => w.app.inject({ method: "PUT", url: `/api/profiles/${id}/contest`, headers: { cookie }, payload });
    expect((await put(w.miraC, { contestDate: null, targetScore: 60 })).statusCode).toBe(403);
    expect((await put(w.parent, { contestDate: "2027-02-30", targetScore: null })).statusCode).toBe(400);
    expect((await put(w.parent, { contestDate: "2027-04-02", targetScore: null })).statusCode).toBe(400);
    expect((await put(w.parent, { contestDate: null, targetScore: 130 })).statusCode).toBe(400);
    expect((await put(w.parent, { contestDate: null, targetScore: 80 }, 1)).statusCode).toBe(404); // the parent profile
    const ok = await put(w.parent, { contestDate: null, targetScore: 80 });
    expect(ok.statusCode).toBe(200);
    expect(ok.json().target).toBe(80);
    // Tom keeps the default.
    expect((await w.app.inject({ url: "/api/readiness", headers: { cookie: w.tomC } })).json().target).toBe(100);
  });
});
