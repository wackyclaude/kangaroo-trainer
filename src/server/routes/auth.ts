import crypto from "node:crypto";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { count, eq } from "drizzle-orm";
import type { Db } from "../db/client.js";
import { profile } from "../db/schema.js";
import { hashPin, isValidPin, LOCKOUT, verifyPin } from "../auth/pin.js";
import { COOKIE_NAME, createSession, endSession, SESSION_LIMITS } from "../auth/session.js";
import { AVATARS, type ProfileCard } from "../../shared/types.js";
import { requireUser } from "./guards.js";

const Nickname = z.string().trim().min(1).max(20).regex(/^[\p{L}\p{N} _'-]+$/u, "Letters, numbers and spaces only");
const AvatarZ = z.enum(AVATARS);

export interface AuthDeps {
  db: Db;
  cookieSecure: boolean;
  setupCode: string;
}

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && crypto.timingSafeEqual(ab, bb);
}

export async function authRoutes(app: FastifyInstance, deps: AuthDeps): Promise<void> {
  const { db } = deps;
  const parentCount = () => db.select({ n: count() }).from(profile).where(eq(profile.role, "parent")).get()?.n ?? 0;

  const setCookie = (reply: import("fastify").FastifyReply, token: string, role: "student" | "parent") =>
    reply.setCookie(COOKIE_NAME, token, {
      httpOnly: true,
      secure: deps.cookieSecure,
      sameSite: "strict",
      path: "/",
      maxAge: Math.floor(SESSION_LIMITS[role].absoluteMs / 1000),
    });

  app.get("/api/setup/status", async () => ({ needsSetup: parentCount() === 0 }));

  // First run only: creates the parent profile. Needs the one-time setup code from the server log.
  app.post("/api/setup", { config: { rateLimit: { max: 10, timeWindow: "1 minute" } } }, async (req, reply) => {
    const body = z
      .object({ setupCode: z.string().max(64), nickname: Nickname, avatar: AvatarZ, pin: z.string() })
      .safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: "invalid", message: "Please check the form." });
    if (parentCount() > 0) return reply.code(409).send({ error: "already_set_up", message: "The parent profile already exists." });
    if (!safeEqual(body.data.setupCode.trim(), deps.setupCode)) {
      return reply.code(403).send({ error: "bad_setup_code", message: "That setup code doesn't match the one in the server log." });
    }
    if (!isValidPin("parent", body.data.pin)) {
      return reply.code(400).send({ error: "weak_pin", message: "The parent PIN needs 6 to 12 digits." });
    }
    const row = db
      .insert(profile)
      .values({
        nickname: body.data.nickname,
        avatar: body.data.avatar,
        role: "parent",
        pinHash: await hashPin(body.data.pin),
        createdAt: Date.now(),
      })
      .returning({ id: profile.id })
      .get();
    setCookie(reply, createSession(db, row.id, "parent"), "parent");
    return { ok: true };
  });

  app.get("/api/profiles", async (): Promise<ProfileCard[]> => {
    const now = Date.now();
    return db
      .select()
      .from(profile)
      .orderBy(profile.role, profile.id)
      .all()
      .map((p) => ({ id: p.id, nickname: p.nickname, avatar: p.avatar, role: p.role, locked: (p.lockedUntil ?? 0) > now }));
  });

  app.post("/api/auth/login", { config: { rateLimit: { max: 20, timeWindow: "1 minute" } } }, async (req, reply) => {
    const body = z.object({ profileId: z.number().int().positive(), pin: z.string().max(12) }).safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: "invalid", message: "Please pick a profile and type the PIN." });
    const p = db.select().from(profile).where(eq(profile.id, body.data.profileId)).get();
    if (!p) return reply.code(404).send({ error: "no_profile", message: "That profile doesn't exist any more." });

    const now = Date.now();
    if ((p.lockedUntil ?? 0) > now) {
      const retryAfterSeconds = Math.ceil(((p.lockedUntil ?? 0) - now) / 1000);
      return reply.code(423).send({ error: "locked", message: "Too many wrong PINs. Take a short break.", retryAfterSeconds });
    }
    const ok = await verifyPin(p.pinHash, body.data.pin);
    if (!ok) {
      const rule = LOCKOUT[p.role];
      const failures = p.failedAttempts + 1;
      if (failures >= rule.maxFailures) {
        db.update(profile).set({ failedAttempts: 0, lockedUntil: now + rule.lockMs }).where(eq(profile.id, p.id)).run();
        return reply.code(423).send({
          error: "locked",
          message: "Too many wrong PINs. Take a short break.",
          retryAfterSeconds: Math.ceil(rule.lockMs / 1000),
        });
      }
      db.update(profile).set({ failedAttempts: failures }).where(eq(profile.id, p.id)).run();
      return reply.code(401).send({ error: "wrong_pin", message: "That PIN isn't right. Try again." });
    }
    db.update(profile).set({ failedAttempts: 0, lockedUntil: null }).where(eq(profile.id, p.id)).run();
    setCookie(reply, createSession(db, p.id, p.role), p.role);
    return { ok: true };
  });

  app.post("/api/auth/logout", async (req, reply) => {
    endSession(db, req.cookies[COOKIE_NAME]);
    reply.clearCookie(COOKIE_NAME, { path: "/" });
    return { ok: true };
  });

  app.get("/api/me", async (req, reply) => {
    const u = requireUser(req, reply);
    if (!u) return;
    return u;
  });
}
