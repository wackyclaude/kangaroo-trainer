import type { FastifyReply, FastifyRequest } from "fastify";
import type { SessionUser } from "../auth/session.js";

declare module "fastify" {
  interface FastifyRequest {
    user: SessionUser | null;
  }
}

export function requireUser(req: FastifyRequest, reply: FastifyReply): SessionUser | undefined {
  if (!req.user) {
    void reply.code(401).send({ error: "signed_out", message: "Please sign in again." });
    return undefined;
  }
  return req.user;
}

export function requireParent(req: FastifyRequest, reply: FastifyReply): SessionUser | undefined {
  const u = requireUser(req, reply);
  if (!u) return undefined;
  if (u.role !== "parent") {
    void reply.code(403).send({ error: "parent_only", message: "Only the parent can do this." });
    return undefined;
  }
  return u;
}
