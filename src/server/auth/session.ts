import crypto from "node:crypto";
import { eq, lt } from "drizzle-orm";
import type { Db } from "../db/client.js";
import { loginSession, profile } from "../db/schema.js";
import type { Role } from "../../shared/types.js";

export const COOKIE_NAME = "kt_session";

/** Students: 8 hours from sign-in. Parent: 30 minutes idle, at most 8 hours. */
export const SESSION_LIMITS = {
  student: { absoluteMs: 8 * 3600_000, idleMs: 8 * 3600_000 },
  parent: { absoluteMs: 8 * 3600_000, idleMs: 30 * 60_000 },
} as const;

const sha256 = (s: string) => crypto.createHash("sha256").update(s).digest("hex");

export function createSession(db: Db, profileId: number, role: Role, now = Date.now()): string {
  const token = crypto.randomBytes(32).toString("base64url");
  db.insert(loginSession)
    .values({
      tokenHash: sha256(token),
      profileId,
      createdAt: now,
      lastSeenAt: now,
      expiresAt: now + SESSION_LIMITS[role].absoluteMs,
    })
    .run();
  return token;
}

export interface SessionUser {
  id: number;
  role: Role;
  nickname: string;
  avatar: string;
  grade: string | null;
  birthYear: number | null;
}

/** Returns the signed-in profile for a cookie token, or null. Expired or idle sessions are removed. */
export function readSession(db: Db, token: string | undefined, now = Date.now()): SessionUser | null {
  if (!token || token.length > 100) return null;
  const tokenHash = sha256(token);
  const row = db
    .select({ s: loginSession, p: profile })
    .from(loginSession)
    .innerJoin(profile, eq(profile.id, loginSession.profileId))
    .where(eq(loginSession.tokenHash, tokenHash))
    .get();
  if (!row) return null;
  const role = row.p.role;
  if (now > row.s.expiresAt || now - row.s.lastSeenAt > SESSION_LIMITS[role].idleMs) {
    db.delete(loginSession).where(eq(loginSession.tokenHash, tokenHash)).run();
    return null;
  }
  // Only write when it matters, to keep requests cheap.
  if (now - row.s.lastSeenAt > 60_000) {
    db.update(loginSession).set({ lastSeenAt: now }).where(eq(loginSession.tokenHash, tokenHash)).run();
  }
  return {
    id: row.p.id,
    role,
    nickname: row.p.nickname,
    avatar: row.p.avatar,
    grade: row.p.grade,
    birthYear: row.p.birthYear,
  };
}

export function endSession(db: Db, token: string | undefined): void {
  if (!token) return;
  db.delete(loginSession).where(eq(loginSession.tokenHash, sha256(token))).run();
}

export function endAllSessionsFor(db: Db, profileId: number): void {
  db.delete(loginSession).where(eq(loginSession.profileId, profileId)).run();
}

export function purgeExpired(db: Db, now = Date.now()): void {
  db.delete(loginSession).where(lt(loginSession.expiresAt, now)).run();
}
