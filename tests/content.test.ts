import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import Database from "better-sqlite3";
import { openDb } from "../src/server/db/client.js";
import { importQuestions } from "../src/server/content/import.js";
import { backupNow } from "../src/server/backup.js";
import { CONTENT, makeApp, setupParent } from "./helpers.js";

describe("question import", () => {
  it("imports once and skips an unchanged file", () => {
    const { db } = openDb(":memory:");
    // 3 wizSMART + 30 wizBRAIN (content/brain/).
    expect(importQuestions(db, CONTENT)).toEqual({ status: "imported", count: 33 });
    expect(importQuestions(db, CONTENT)).toEqual({ status: "unchanged", count: 33 });
  });

  it("refuses a bank that points at missing pictures", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "kt-"));
    fs.copyFileSync(path.join(CONTENT, "questions.json"), path.join(dir, "questions.json"));
    const { db } = openDb(":memory:");
    expect(() => importQuestions(db, dir)).toThrow(/missing image/);
  });

  it("works without a wizBRAIN bank, and refuses a wrong level in it", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "kt-"));
    fs.cpSync(path.join(CONTENT, "img"), path.join(dir, "img"), { recursive: true });
    fs.copyFileSync(path.join(CONTENT, "questions.json"), path.join(dir, "questions.json"));
    expect(importQuestions(openDb(":memory:").db, dir)).toEqual({ status: "imported", count: 3 });
    fs.cpSync(path.join(CONTENT, "brain"), path.join(dir, "brain"), { recursive: true });
    const file = path.join(dir, "brain", "questions.json");
    const bank = JSON.parse(fs.readFileSync(file, "utf8"));
    bank.questions[0].level = "wizSMART";
    fs.writeFileSync(file, JSON.stringify(bank));
    expect(() => importQuestions(openDb(":memory:").db, dir)).toThrow(/expected wizBRAIN/);
  });
});

describe("questions and pictures", () => {
  it("are only available when signed in, and never include the answer", async () => {
    const { app } = await makeApp();
    expect((await app.inject("/api/questions")).statusCode).toBe(401);
    expect((await app.inject("/content/img/2026-01.png")).statusCode).toBe(401);

    const cookie = await setupParent(app);
    const list = await app.inject({ url: "/api/questions?focus=SPA", headers: { cookie } });
    expect(list.json()).toHaveLength(1);
    const one = await app.inject({ url: "/api/questions/wizSMART-2026-01", headers: { cookie } });
    expect(one.json().imageUrl).toBe("/content/img/2026-01.png");
    expect(JSON.stringify(one.json())).not.toContain("answer");
    const img = await app.inject({ url: "/content/img/2026-01.png", headers: { cookie } });
    expect(img.statusCode).toBe(200);
    expect(img.headers["content-type"]).toBe("image/png");
  });

  it("blocks path tricks on picture URLs", async () => {
    const { app } = await makeApp();
    const cookie = await setupParent(app);
    for (const url of ["/content/img/..%2Fquestions.json", "/content/img/%2e%2e%2fquestions.json", "/content/img/x.json"]) {
      expect((await app.inject({ url, headers: { cookie } })).statusCode).toBe(404);
    }
  });
});

describe("backups", () => {
  it("writes one backup per day and keeps 14", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "kt-bak-"));
    for (let d = 1; d <= 20; d++) fs.writeFileSync(path.join(dir, `kt-2026-01-${String(d).padStart(2, "0")}.db`), "");
    const db = new Database(":memory:");
    const made = await backupNow(db, dir, new Date(2026, 9, 18));
    expect(made).toMatch(/kt-2026-10-18\.db$/);
    expect(await backupNow(db, dir, new Date(2026, 9, 18))).toBeNull();
    expect(fs.readdirSync(dir)).toHaveLength(14);
  });
});

describe("rate limits", () => {
  it("limit the API but not pictures (a printable paper loads many at once)", async () => {
    const { makeApp } = await import("./helpers.js");
    const { app } = await makeApp();
    let pictures429 = 0;
    for (let i = 0; i < 320; i++) if ((await app.inject({ url: "/content/img/2026-01.png" })).statusCode === 429) pictures429++;
    expect(pictures429).toBe(0);
    let api429 = 0;
    for (let i = 0; i < 320; i++) if ((await app.inject({ url: "/api/health" })).statusCode === 429) api429++;
    expect(api429).toBeGreaterThan(0);
  });
});

describe("app files and the service worker", () => {
  it("serve the service worker uncached, built files for good, and never cache API answers", async () => {
    const web = fs.mkdtempSync(path.join(os.tmpdir(), "kt-web-"));
    fs.mkdirSync(path.join(web, "assets"));
    fs.writeFileSync(path.join(web, "index.html"), "<!doctype html><title>t</title>");
    fs.writeFileSync(path.join(web, "sw.js"), "self.addEventListener('fetch', () => {});");
    fs.writeFileSync(path.join(web, "assets", "index-abc123.js"), "console.log(1)");
    const { buildApp } = await import("../src/server/app.js");
    const { CONTENT } = await import("./helpers.js");
    const app = await buildApp({ db: openDb(":memory:").db, contentDir: CONTENT, webDir: web, cookieSecure: true, setupCode: "123456", logLevel: "silent" });
    const sw = await app.inject({ url: "/sw.js" });
    expect(sw.statusCode).toBe(200);
    expect(sw.headers["content-type"]).toMatch(/javascript/);
    expect(sw.headers["cache-control"]).toBe("no-cache");
    const asset = await app.inject({ url: "/assets/index-abc123.js" });
    expect(asset.headers["cache-control"]).toContain("immutable");
    const page = await app.inject({ url: "/progress" });
    expect(page.statusCode).toBe(200);
    expect(page.headers["cache-control"]).toBe("no-cache");
    fs.rmSync(web, { recursive: true, force: true });
  });
});
