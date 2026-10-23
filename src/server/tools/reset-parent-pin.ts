// Usage (on the Mac, in the kt folder):
//   docker compose exec app /nodejs/bin/node dist/server/server/tools/reset-parent-pin.js 13579246
// Sets a new parent PIN, unlocks the parent profile and signs it out everywhere.
import path from "node:path";
import { eq } from "drizzle-orm";
import { loadConfig } from "../config.js";
import { openDb } from "../db/client.js";
import { profile } from "../db/schema.js";
import { hashPin, isValidPin } from "../auth/pin.js";
import { endAllSessionsFor } from "../auth/session.js";

const pin = process.argv[2] ?? "";
if (!isValidPin("parent", pin)) {
  console.error("Give the new parent PIN (6 to 12 digits) after the command.");
  process.exit(1);
}
const config = loadConfig();
const { db, sqlite } = openDb(path.join(config.dataDir, "kt.db"), process.env.MIGRATIONS_DIR);
const parent = db.select().from(profile).where(eq(profile.role, "parent")).get();
if (!parent) {
  console.error("There is no parent profile yet. Use the first-time setup screen instead.");
  process.exit(1);
}
db.update(profile).set({ pinHash: await hashPin(pin), failedAttempts: 0, lockedUntil: null }).where(eq(profile.id, parent.id)).run();
endAllSessionsFor(db, parent.id);
sqlite.close();
console.log(`New PIN set for ${parent.nickname}.`);
