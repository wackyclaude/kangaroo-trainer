import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { and, count, eq } from "drizzle-orm";
import type { Db } from "../db/client.js";
import { profile } from "../db/schema.js";
import { hashPin, isValidPin } from "../auth/pin.js";
import { endAllSessionsFor } from "../auth/session.js";
import { AVATARS, MAX_STUDENTS } from "../../shared/types.js";
import { requireParent } from "./guards.js";

const Nickname = z.string().trim().min(1).max(20).regex(/^[\p{L}\p{N} _'-]+$/u);
const thisYear = new Date().getFullYear();
const Details = z.object({
  nickname: Nickname,
  avatar: z.enum(AVATARS),
  grade: z.string().trim().max(20).nullable(),
  birthYear: z.number().int().min(thisYear - 25).max(thisYear - 3).nullable(),
});

const isUniqueViolation = (e: unknown) => String((e as { code?: string })?.code ?? e).includes("SQLITE_CONSTRAINT");

export async function profileRoutes(app: FastifyInstance, deps: { db: Db }): Promise<void> {
  const { db } = deps;
  const idParam = z.object({ id: z.coerce.number().int().positive() });

  // Parent creates a student profile.
  app.post("/api/profiles", async (req, reply) => {
    if (!requireParent(req, reply)) return;
    const body = Details.extend({ pin: z.string() }).safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: "invalid", message: "Please check the nickname, avatar and details." });
    if (!isValidPin("student", body.data.pin)) {
      return reply.code(400).send({ error: "weak_pin", message: "A student PIN is exactly 4 digits." });
    }
    const students = db.select({ n: count() }).from(profile).where(eq(profile.role, "student")).get()?.n ?? 0;
    if (students >= MAX_STUDENTS) {
      return reply.code(409).send({ error: "limit", message: `There can be at most ${MAX_STUDENTS} student profiles.` });
    }
    try {
      const row = db
        .insert(profile)
        .values({
          nickname: body.data.nickname,
          avatar: body.data.avatar,
          grade: body.data.grade,
          birthYear: body.data.birthYear,
          role: "student",
          pinHash: await hashPin(body.data.pin),
          createdAt: Date.now(),
        })
        .returning({ id: profile.id })
        .get();
      return reply.code(201).send({ id: row.id });
    } catch (e) {
      if (isUniqueViolation(e)) return reply.code(409).send({ error: "taken", message: "That nickname is already used." });
      throw e;
    }
  });

  // Parent edits a profile's details (including their own).
  app.patch("/api/profiles/:id", async (req, reply) => {
    if (!requireParent(req, reply)) return;
    const params = idParam.safeParse(req.params);
    const body = Details.partial().safeParse(req.body);
    if (!params.success || !body.success) return reply.code(400).send({ error: "invalid", message: "Please check the details." });
    try {
      const res = db.update(profile).set(body.data).where(eq(profile.id, params.data.id)).run();
      if (res.changes === 0) return reply.code(404).send({ error: "no_profile", message: "That profile doesn't exist." });
      return { ok: true };
    } catch (e) {
      if (isUniqueViolation(e)) return reply.code(409).send({ error: "taken", message: "That nickname is already used." });
      throw e;
    }
  });

  // Parent sets a new PIN for a profile. Also unlocks it and signs it out everywhere.
  app.post("/api/profiles/:id/pin", { config: { rateLimit: { max: 20, timeWindow: "1 minute" } } }, async (req, reply) => {
    if (!requireParent(req, reply)) return;
    const params = idParam.safeParse(req.params);
    const body = z.object({ pin: z.string() }).safeParse(req.body);
    if (!params.success || !body.success) return reply.code(400).send({ error: "invalid", message: "Please type a PIN." });
    const p = db.select().from(profile).where(eq(profile.id, params.data.id)).get();
    if (!p) return reply.code(404).send({ error: "no_profile", message: "That profile doesn't exist." });
    if (!isValidPin(p.role, body.data.pin)) {
      const rule = p.role === "parent" ? "6 to 12 digits" : "exactly 4 digits";
      return reply.code(400).send({ error: "weak_pin", message: `This PIN needs ${rule}.` });
    }
    db.update(profile)
      .set({ pinHash: await hashPin(body.data.pin), failedAttempts: 0, lockedUntil: null })
      .where(eq(profile.id, p.id))
      .run();
    if (p.id !== req.user?.id) endAllSessionsFor(db, p.id);
    return { ok: true };
  });

  // Parent deletes a student profile and all its practice data.
  app.delete("/api/profiles/:id", async (req, reply) => {
    if (!requireParent(req, reply)) return;
    const params = idParam.safeParse(req.params);
    if (!params.success) return reply.code(400).send({ error: "invalid", message: "Unknown profile." });
    const res = db
      .delete(profile)
      .where(and(eq(profile.id, params.data.id), eq(profile.role, "student")))
      .run();
    if (res.changes === 0) return reply.code(404).send({ error: "no_profile", message: "No student profile with that id." });
    return { ok: true };
  });

  // Parent view: full details for every profile.
  app.get("/api/admin/profiles", async (req, reply) => {
    if (!requireParent(req, reply)) return;
    const now = Date.now();
    return db
      .select()
      .from(profile)
      .orderBy(profile.role, profile.id)
      .all()
      .map((p) => ({
        id: p.id,
        nickname: p.nickname,
        avatar: p.avatar,
        role: p.role,
        grade: p.grade,
        birthYear: p.birthYear,
        locked: (p.lockedUntil ?? 0) > now,
      }));
  });
}
