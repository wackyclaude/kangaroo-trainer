import fs from "node:fs";
import path from "node:path";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { and, asc, count, eq, or, type SQL } from "drizzle-orm";
import type { Db } from "../db/client.js";
import { question } from "../db/schema.js";
import { FOCUS_AREAS, TIERS, type FocusArea, type QuestionDetail, type QuestionSummary, type Tier } from "../../shared/types.js";
import { requireUser } from "./guards.js";

const focusKeys = Object.keys(FOCUS_AREAS) as [FocusArea, ...FocusArea[]];

function summary(q: typeof question.$inferSelect): QuestionSummary {
  return {
    id: q.id,
    year: q.year,
    number: q.number,
    tier: q.tier as Tier,
    focusPrimary: q.focusPrimary as FocusArea,
    focusSecondary: (q.focusSecondary as FocusArea | null) ?? null,
  };
}

export async function questionRoutes(app: FastifyInstance, deps: { db: Db; contentDir: string }): Promise<void> {
  const { db } = deps;
  const imgDir = path.join(deps.contentDir, "img");

  app.get("/api/questions/overview", async (req, reply) => {
    if (!requireUser(req, reply)) return;
    const years = db
      .select({ year: question.year, n: count() })
      .from(question)
      .groupBy(question.year)
      .orderBy(asc(question.year))
      .all();
    const total = years.reduce((s, y) => s + y.n, 0);
    return { total, years };
  });

  // Lists questions without answers, filtered by year, focus area and tier.
  app.get("/api/questions", async (req, reply) => {
    if (!requireUser(req, reply)) return;
    const q = z
      .object({
        year: z.coerce.number().int().optional(),
        focus: z.enum(focusKeys).optional(),
        tier: z.enum(TIERS).optional(),
      })
      .safeParse(req.query);
    if (!q.success) return reply.code(400).send({ error: "invalid", message: "Unknown filter." });
    const where: SQL[] = [];
    if (q.data.year) where.push(eq(question.year, q.data.year));
    if (q.data.tier) where.push(eq(question.tier, q.data.tier));
    if (q.data.focus) {
      const f = or(eq(question.focusPrimary, q.data.focus), eq(question.focusSecondary, q.data.focus));
      if (f) where.push(f);
    }
    return db
      .select()
      .from(question)
      .where(where.length ? and(...where) : undefined)
      .orderBy(asc(question.year), asc(question.number))
      .all()
      .map(summary);
  });

  app.get("/api/questions/:id", async (req, reply) => {
    if (!requireUser(req, reply)) return;
    const p = z.object({ id: z.string().max(40) }).safeParse(req.params);
    if (!p.success) return reply.code(400).send({ error: "invalid", message: "Unknown question." });
    const row = db.select().from(question).where(eq(question.id, p.data.id)).get();
    if (!row) return reply.code(404).send({ error: "not_found", message: "That question isn't in the bank." });
    const detail: QuestionDetail = {
      ...summary(row),
      imageUrl: `/content/${row.imagePath}`,
      text: row.text,
      voidNote: row.voidNote,
    };
    return detail;
  });

  // Question pictures are only served to signed-in profiles.
  app.get("/content/img/:file", async (req, reply) => {
    if (!requireUser(req, reply)) return;
    const p = z.object({ file: z.string().regex(/^[\w-]+\.png$/) }).safeParse(req.params);
    if (!p.success) return reply.code(404).send({ error: "not_found", message: "No such picture." });
    const full = path.join(imgDir, p.data.file);
    if (!full.startsWith(imgDir + path.sep) || !fs.existsSync(full)) {
      return reply.code(404).send({ error: "not_found", message: "No such picture." });
    }
    reply.header("Cache-Control", "private, max-age=86400");
    return reply.type("image/png").send(fs.createReadStream(full));
  });
}
