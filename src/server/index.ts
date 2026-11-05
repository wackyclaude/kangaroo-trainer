import crypto from "node:crypto";
import path from "node:path";
import { count, eq } from "drizzle-orm";
import { loadConfig } from "./config.js";
import { openDb } from "./db/client.js";
import { profile } from "./db/schema.js";
import { importQuestions } from "./content/import.js";
import { importOlympiad } from "./content/olympiad.js";
import { scheduleBackups } from "./backup.js";
import { purgeExpired } from "./auth/session.js";
import { buildApp } from "./app.js";
import { backfillInsights } from "./insights/store.js";

const config = loadConfig();
const { db, sqlite } = openDb(path.join(config.dataDir, "kt.db"), process.env.MIGRATIONS_DIR);

const imported = importQuestions(db, config.contentDir);
const olympiad = importOlympiad(db, config.contentDir);
// Mistake memory and maturity trends are rebuilt from the answer log (this also covers practice done before M4).
const backfilled = backfillInsights(db);

// First run: without a parent profile, a one-time setup code is needed to create one.
const hasParent = (db.select({ n: count() }).from(profile).where(eq(profile.role, "parent")).get()?.n ?? 0) > 0;
const setupCode = config.setupCode ?? crypto.randomInt(100000, 999999).toString();

const app = await buildApp({
  db,
  contentDir: config.contentDir,
  webDir: config.webDir,
  cookieSecure: config.cookieSecure,
  setupCode,
  logLevel: config.logLevel,
  publicHosts: config.publicHosts,
});

app.log.info({ questions: imported, olympiad, insightsBackfilled: backfilled }, "question bank");
if (!hasParent) {
  app.log.warn(`FIRST-TIME SETUP: open the app and enter this setup code to create the parent profile: ${setupCode}`);
}
scheduleBackups(sqlite, config.backupDir, (m) => app.log.info(m));
setInterval(() => purgeExpired(db), 3600_000).unref();

const shutdown = async () => {
  await app.close();
  sqlite.close();
  process.exit(0);
};
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);

await app.listen({ port: config.port, host: config.host });
