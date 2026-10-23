import { hash, verify } from "@node-rs/argon2";
import type { Role } from "../../shared/types.js";

// Argon2id with the OWASP-recommended baseline (19 MiB, 2 passes).
const OPTS = { memoryCost: 19456, timeCost: 2, parallelism: 1 } as const;

export function pinRule(role: Role): RegExp {
  return role === "parent" ? /^\d{6,12}$/ : /^\d{4}$/;
}

export function isValidPin(role: Role, pin: string): boolean {
  return pinRule(role).test(pin);
}

export function hashPin(pin: string): Promise<string> {
  return hash(pin, OPTS);
}

export async function verifyPin(pinHash: string, pin: string): Promise<boolean> {
  try {
    return await verify(pinHash, pin);
  } catch {
    return false;
  }
}

/** How many wrong PINs are allowed before a lock, and for how long. */
export const LOCKOUT = {
  student: { maxFailures: 5, lockMs: 5 * 60_000 },
  parent: { maxFailures: 5, lockMs: 15 * 60_000 },
} as const;
