import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import { count, eq } from "drizzle-orm";
import type { Db } from "../db/client.js";
import { appMeta, question } from "../db/schema.js";
import { FOCUS_AREAS, TIERS } from "../../shared/types.js";

const focus = z.enum(Object.keys(FOCUS_AREAS) as [keyof typeof FOCUS_AREAS, ...(keyof typeof FOCUS_AREAS)[]]);

const QuestionIn = z.object({
  id: z.string().regex(/^wiz[A-Z]+-\d{4}-\d{2}$/),
  level: z.string().min(1),
  year: z.number().int().min(2000).max(2100),
  number: z.number().int().min(1).max(40),
  questions_in_paper: z.number().int().min(1).max(40),
  tier: z.enum(TIERS),
  focus_primary: focus,
  focus_secondary: focus.nullable(),
  answer: z.enum(["A", "B", "C", "D", "E"]),
  image: z.string().regex(/^img\/[\w-]+\.png$/),
  text: z.string(),
  void_note: z.string().nullable(),
  hint_en: z.string().nullable(),
  solution_en: z.string().nullable(),
  solution_steps_en: z.array(z.string().min(1)).min(1).nullable().optional(),
});

const BankIn = z.object({
  meta: z.object({ count: z.number().int() }).passthrough(),
  questions: z.array(QuestionIn).min(1),
});

export interface ImportResult {
  status: "imported" | "unchanged" | "missing";
  count: number;
}

/**
 * Loads content/questions.json into the question table.
 * Skips the work when the file hasn't changed since the last import.
 */
export function importQuestions(db: Db, contentDir: string, now = Date.now()): ImportResult {
  const file = path.join(contentDir, "questions.json");
  if (!fs.existsSync(file)) return { status: "missing", count: 0 };
  const raw = fs.readFileSync(file);
  const digest = crypto.createHash("sha256").update(raw).digest("hex");
  const prev = db.select().from(appMeta).where(eq(appMeta.key, "content_sha256")).get();
  const existing = db.select({ n: count() }).from(question).where(eq(question.contest, "kangaroo")).get()?.n ?? 0;
  if (prev?.value === digest && existing > 0) return { status: "unchanged", count: existing };

  const bank = BankIn.parse(JSON.parse(raw.toString("utf8")));
  const missingImages = bank.questions.filter((q) => !fs.existsSync(path.join(contentDir, q.image)));
  if (missingImages.length > 0) {
    throw new Error(`questions.json refers to ${missingImages.length} missing image(s), e.g. ${missingImages[0]?.image}`);
  }

  db.transaction((tx) => {
    for (const q of bank.questions) {
      const values = {
        id: q.id,
        level: q.level,
        year: q.year,
        number: q.number,
        questionsInPaper: q.questions_in_paper,
        tier: q.tier,
        focusPrimary: q.focus_primary,
        focusSecondary: q.focus_secondary,
        answer: q.answer,
        imagePath: q.image,
        text: q.text,
        hintEn: q.hint_en,
        solutionEn: q.solution_en,
        solutionSteps: q.solution_steps_en ?? null,
        voidNote: q.void_note,
        updatedAt: now,
      };
      tx.insert(question).values(values).onConflictDoUpdate({ target: question.id, set: values }).run();
    }
    tx.insert(appMeta)
      .values({ key: "content_sha256", value: digest })
      .onConflictDoUpdate({ target: appMeta.key, set: { value: digest } })
      .run();
  });
  return { status: "imported", count: bank.questions.length };
}
