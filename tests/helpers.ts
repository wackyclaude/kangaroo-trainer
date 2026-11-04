import path from "node:path";
import { openDb } from "../src/server/db/client.js";
import { importQuestions } from "../src/server/content/import.js";
import { importOlympiad } from "../src/server/content/olympiad.js";
import { buildApp } from "../src/server/app.js";

export const CONTENT = path.resolve("tests/fixtures/content");
export const SETUP_CODE = "123456";

export async function makeApp() {
  const handle = openDb(":memory:");
  importQuestions(handle.db, CONTENT);
  importOlympiad(handle.db, CONTENT);
  const app = await buildApp({
    db: handle.db,
    contentDir: CONTENT,
    webDir: path.resolve("tests/fixtures/no-web"),
    cookieSecure: true,
    setupCode: SETUP_CODE,
    logLevel: "silent",
  });
  return { app, ...handle };
}

export function cookieFrom(res: { headers: Record<string, unknown> }): string {
  const raw = res.headers["set-cookie"];
  const first = Array.isArray(raw) ? raw[0] : String(raw ?? "");
  return String(first).split(";")[0] ?? "";
}

type App = Awaited<ReturnType<typeof makeApp>>["app"];

export async function setupParent(app: App, pin = "246810"): Promise<string> {
  const res = await app.inject({
    method: "POST",
    url: "/api/setup",
    payload: { setupCode: SETUP_CODE, nickname: "Papa", avatar: "🦉", pin },
  });
  if (res.statusCode !== 200) throw new Error(`setup failed: ${res.body}`);
  return cookieFrom(res);
}

export async function addStudent(app: App, parentCookie: string, nickname = "Mira", pin = "1234") {
  const res = await app.inject({
    method: "POST",
    url: "/api/profiles",
    headers: { cookie: parentCookie },
    payload: { nickname, avatar: "🦘", grade: "Grade 6", birthYear: 2015, pin },
  });
  return res;
}
