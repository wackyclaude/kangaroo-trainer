import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import { count, eq } from "drizzle-orm";
import type { Db } from "../db/client.js";
import { appMeta, question } from "../db/schema.js";
import { FOCUS_AREAS, TIERS } from "../../shared/types.js";
import { kangarooDifficulty, positionMedians, PUPIL_STATS_VERSION } from "./pupils.js";

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

/** The Kangaroo banks: wizSMART in content/, wizBRAIN in content/brain/ (each with its own img/). */
const BANKS = [
  { file: "questions.json", prefix: "", level: "wizSMART" },
  { file: "brain/questions.json", prefix: "brain/", level: "wizBRAIN" },
] as const;

/**
 * Loads content/questions.json (wizSMART) and content/brain/questions.json (wizBRAIN, optional) into the question table.
 * Skips the work when nothing has changed since the last import.
 */
export function importQuestions(db: Db, contentDir: string, now = Date.now()): ImportResult {
  const found = BANKS.map((b) => ({ ...b, path: path.join(contentDir, b.file) })).filter((b) => fs.existsSync(b.path));
  if (found.length === 0) return { status: "missing", count: 0 };
  const raws = found.map((b) => ({ ...b, raw: fs.readFileSync(b.path) }));
  // The pupil numbers are part of the code, so a change there also re-imports.
  const hash = crypto.createHash("sha256");
  for (const b of raws) hash.update(b.file).update(b.raw);
  const digest = hash.update(`pupils:${PUPIL_STATS_VERSION}`).digest("hex");
  const prev = db.select().from(appMeta).where(eq(appMeta.key, "content_sha256")).get();
  const existing = db.select({ n: count() }).from(question).where(eq(question.contest, "kangaroo")).get()?.n ?? 0;
  if (prev?.value === digest && existing > 0) return { status: "unchanged", count: existing };

  const all: (z.infer<typeof QuestionIn> & { image: string })[] = [];
  for (const b of raws) {
    const bank = BankIn.parse(JSON.parse(b.raw.toString("utf8")));
    const wrong = bank.questions.find((q) => q.level !== b.level);
    if (wrong) throw new Error(`${b.file}: ${wrong.id} is ${wrong.level}, expected ${b.level}`);
    for (const q of bank.questions) all.push({ ...q, image: `${b.prefix}${q.image}` });
  }
  const missingImages = all.filter((q) => !fs.existsSync(path.join(contentDir, q.image)));
  if (missingImages.length > 0) {
    throw new Error(`The question bank refers to ${missingImages.length} missing image(s), e.g. ${missingImages[0]?.image}`);
  }

  const asPaper = (q: (typeof all)[number]) => ({ level: q.level, year: q.year, number: q.number, questionsInPaper: q.questions_in_paper, answer: q.answer });
  const medians = new Map(BANKS.map((b) => [b.level as string, positionMedians(all.filter((q) => q.level === b.level).map(asPaper), b.level)]));

  db.transaction((tx) => {
    for (const q of all) {
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
        // Level 1–5 from how real pupils did (estimated from the position for years without a report).
        difficulty: medians.has(q.level) ? kangarooDifficulty(asPaper(q), medians.get(q.level)!).level : null,
        updatedAt: now,
      };
      tx.insert(question).values(values).onConflictDoUpdate({ target: question.id, set: values }).run();
    }
    tx.insert(appMeta)
      .values({ key: "content_sha256", value: digest })
      .onConflictDoUpdate({ target: appMeta.key, set: { value: digest } })
      .run();
  });
  return { status: "imported", count: all.length };
}
