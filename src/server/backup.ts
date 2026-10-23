import fs from "node:fs";
import path from "node:path";
import type Database from "better-sqlite3";

const KEEP_DAYS = 14;

function stamp(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** Writes today's backup (if missing) and removes all but the newest 14. */
export async function backupNow(sqlite: Database.Database, dir: string, now = new Date()): Promise<string | null> {
  fs.mkdirSync(dir, { recursive: true });
  const target = path.join(dir, `kt-${stamp(now)}.db`);
  let made: string | null = null;
  if (!fs.existsSync(target)) {
    await sqlite.backup(target);
    made = target;
  }
  const files = fs
    .readdirSync(dir)
    .filter((f) => /^kt-\d{4}-\d{2}-\d{2}\.db$/.test(f))
    .sort()
    .reverse();
  for (const old of files.slice(KEEP_DAYS)) fs.rmSync(path.join(dir, old));
  return made;
}

/** Checks every hour; makes at most one backup per day. */
export function scheduleBackups(sqlite: Database.Database, dir: string, log: (msg: string) => void): NodeJS.Timeout {
  const run = () =>
    backupNow(sqlite, dir)
      .then((f) => f && log(`backup written: ${path.basename(f)}`))
      .catch((e: unknown) => log(`backup failed: ${String(e)}`));
  void run();
  const t = setInterval(run, 3600_000);
  t.unref();
  return t;
}
