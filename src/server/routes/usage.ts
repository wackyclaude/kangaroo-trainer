// Usage stats: counts and averages only, kept on the family's own server, never sent anywhere else.
// - Feature counters per student per day (no content, no time of day).
// - Device and browser families per day (never the full browser string or IP address).
// - Time per question, picks, hints and scratch-pad use come from the answers already saved.
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { and, eq, gte, lt, sql } from "drizzle-orm";
import type { Db } from "../db/client.js";
import { attempt, profile, question, usageCount, usageDevice } from "../db/schema.js";
import { TIERS, USAGE_DEVICES, USAGE_KEEP_DAYS, USAGE_KEYS, USAGE_LABEL, type UsageReport } from "../../shared/types.js";
import { HOME_TIME_ZONE } from "../rewards/store.js";
import { browserFamily, osFamily } from "../usage/device.js";
import { requireParent, requireUser } from "./guards.js";

const DAY_MS = 86_400_000;
const dayOf = (t: number) => new Intl.DateTimeFormat("en-CA", { timeZone: HOME_TIME_ZONE }).format(new Date(t));

const UsageBody = z
  .object({
    counts: z.partialRecord(z.enum(USAGE_KEYS), z.number().int().min(1).max(500)).default({}),
    visit: z.object({ device: z.enum(USAGE_DEVICES), touch: z.boolean() }).strict().optional(),
  })
  .strict();

const median = (xs: number[]) => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
};
const share = (n: number, of: number) => (of ? Math.round((n / of) * 100) : 0);
const secs = (ms: number | null) => (ms === null ? null : Math.round(ms / 1000));

/** Deletes usage counters older than the keep period. */
export function pruneUsage(db: Db, now = Date.now()) {
  const cutoff = dayOf(now - USAGE_KEEP_DAYS * DAY_MS);
  db.delete(usageCount).where(lt(usageCount.day, cutoff)).run();
  db.delete(usageDevice).where(lt(usageDevice.day, cutoff)).run();
}

export function buildUsage(db: Db, profileId: number, days: number, now = Date.now()): UsageReport {
  const from = now - days * DAY_MS;
  const rows = db
    .select({ a: attempt, tier: question.tier })
    .from(attempt)
    .innerJoin(question, eq(question.id, attempt.questionId))
    .where(and(eq(attempt.profileId, profileId), gte(attempt.answeredAt, from), eq(attempt.source, "app")))
    .orderBy(attempt.answeredAt)
    .all();
  // The last answer per question in each quiz (test mode allows changing an answer).
  const last = new Map<string, (typeof rows)[number]>();
  for (const r of rows) last.set(`${r.a.sessionId}:${r.a.questionId}`, r);
  const answers = [...last.values()];
  const timed = answers.filter((r) => (r.a.timeMs ?? 0) > 0);
  const ms = timed.map((r) => r.a.timeMs!);

  const pickCounts = new Map<string, number>();
  for (const r of answers) {
    const c = r.a.choice;
    const k = c === null || c === "" ? "Skipped" : /^[A-E]$/.test(c) ? c : "Typed";
    pickCounts.set(k, (pickCounts.get(k) ?? 0) + 1);
  }
  const changed = answers.filter((r) => r.a.pickChanges > 0);

  const cutoff = dayOf(from);
  const features = db
    .select({ key: usageCount.key, n: sql<number>`sum(${usageCount.n})` })
    .from(usageCount)
    .where(and(eq(usageCount.profileId, profileId), gte(usageCount.day, cutoff)))
    .groupBy(usageCount.key)
    .all();
  const devices = db
    .select({ browser: usageDevice.browser, os: usageDevice.os, device: usageDevice.device, visits: sql<number>`sum(${usageDevice.visits})` })
    .from(usageDevice)
    .where(and(eq(usageDevice.profileId, profileId), gte(usageDevice.day, cutoff)))
    .groupBy(usageDevice.browser, usageDevice.os, usageDevice.device)
    .all()
    .sort((a, b) => b.visits - a.visits);
  const activeDays = new Set([...answers.map((r) => dayOf(r.a.answeredAt)), ...db
    .select({ day: usageDevice.day })
    .from(usageDevice)
    .where(and(eq(usageDevice.profileId, profileId), gte(usageDevice.day, cutoff)))
    .all()
    .map((d) => d.day)]).size;

  return {
    days,
    activeDays,
    answers: answers.length,
    medianSeconds: secs(median(ms)),
    byTier: TIERS.map((tier) => {
      const t = answers.filter((r) => r.tier === tier);
      return {
        tier,
        answers: t.length,
        medianSeconds: secs(median(t.filter((r) => (r.a.timeMs ?? 0) > 0).map((r) => r.a.timeMs!))),
        right: share(t.filter((r) => r.a.correct).length, t.length),
      };
    }),
    quick: share(ms.filter((x) => x < 15_000).length, ms.length),
    slow: share(ms.filter((x) => x > 300_000).length, ms.length),
    picks: ["A", "B", "C", "D", "E", "Typed", "Skipped"]
      .filter((k) => pickCounts.has(k))
      .map((option) => ({ option, share: share(pickCounts.get(option)!, answers.length) })),
    changed: { share: share(changed.length, answers.length), right: changed.length ? share(changed.filter((r) => r.a.correct).length, changed.length) : null },
    hintShare: share(answers.filter((r) => r.a.hintUsed).length, answers.length),
    scratchShare: share(answers.filter((r) => r.a.scratchUsed).length, answers.length),
    features: USAGE_KEYS.map((key) => ({ key, label: USAGE_LABEL[key], count: Number(features.find((f) => f.key === key)?.n ?? 0) })),
    devices: devices.map((d) => ({ ...d, visits: Number(d.visits) })),
  };
}

export async function usageRoutes(app: FastifyInstance, deps: { db: Db }): Promise<void> {
  const { db } = deps;
  pruneUsage(db);

  // The app sends small batches of counters. Only students are counted.
  app.post("/api/usage", { config: { rateLimit: { max: 30, timeWindow: "1 minute" } } }, async (req, reply) => {
    const u = requireUser(req, reply);
    if (!u) return;
    const body = UsageBody.safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: "invalid", message: "Unknown usage data." });
    if (u.role !== "student") return reply.code(204).send();
    const day = dayOf(Date.now());
    db.transaction((tx) => {
      for (const [key, n] of Object.entries(body.data.counts)) {
        tx.insert(usageCount)
          .values({ profileId: u.id, day, key, n: n! })
          .onConflictDoUpdate({ target: [usageCount.profileId, usageCount.day, usageCount.key], set: { n: sql`${usageCount.n} + ${n}` } })
          .run();
      }
      const v = body.data.visit;
      if (v) {
        const ua = String(req.headers["user-agent"] ?? "").slice(0, 512);
        const row = { browser: browserFamily(ua), os: osFamily(ua, v.touch), device: v.device };
        tx.insert(usageDevice)
          .values({ profileId: u.id, day, ...row, visits: 1 })
          .onConflictDoUpdate({
            target: [usageDevice.profileId, usageDevice.day, usageDevice.browser, usageDevice.os, usageDevice.device],
            set: { visits: sql`${usageDevice.visits} + 1` },
          })
          .run();
      }
    });
    return reply.code(204).send();
  });

  // Parent view: one student's usage over the last 7, 30 or 90 days.
  app.get("/api/usage/:profileId", async (req, reply) => {
    if (!requireParent(req, reply)) return;
    const p = z.object({ profileId: z.coerce.number().int().positive() }).safeParse(req.params);
    const q = z.object({ days: z.coerce.number().int().refine((d) => [7, 30, 90].includes(d)).default(30) }).safeParse(req.query);
    if (!p.success || !q.success) return reply.code(400).send({ error: "invalid", message: "Unknown student or period." });
    const who = db.select({ role: profile.role }).from(profile).where(eq(profile.id, p.data.profileId)).get();
    if (who?.role !== "student") return reply.code(404).send({ error: "no_profile", message: "No student profile with that id." });
    return buildUsage(db, p.data.profileId, q.data.days);
  });
}
