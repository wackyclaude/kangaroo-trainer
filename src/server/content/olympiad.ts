// The Dutch Mathematical Olympiad (round 1) bank: content/olympiad/questions.json, its pictures in
// content/olympiad/img and, when present, the official solution crops in content/olympiad/sol.
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import { count, eq } from "drizzle-orm";
import type { Db } from "../db/client.js";
import { appMeta, contestPaper, question } from "../db/schema.js";
import { FOCUS_AREAS, type AnswerSpec, type Tier } from "../../shared/types.js";
import { checkAnswer } from "../../shared/answers.js";
import type { ImportResult } from "./import.js";

const focus = z.enum(Object.keys(FOCUS_AREAS) as [keyof typeof FOCUS_AREAS, ...(keyof typeof FOCUS_AREAS)[]]);
const pctNum = z.number().min(0).max(100);

const Spec: z.ZodType<AnswerSpec> = z.lazy(() =>
  z.union([
    z.object({ kind: z.literal("number"), value: z.string().min(1).max(40) }),
    z.object({ kind: z.literal("text"), value: z.string().min(1).max(40) }),
    z.object({ kind: z.literal("tuple"), values: z.array(z.union([z.string().min(1).max(40), Spec])).min(1).max(10) }),
    z.object({ kind: z.literal("set"), values: z.array(z.union([z.string().min(1).max(40), Spec])).min(1).max(10) }),
    z.object({ kind: z.literal("any"), options: z.array(Spec).min(1).max(12) }),
  ]),
);

const OlyQuestion = z
  .object({
    id: z.string().regex(/^dmo-\d{4}-[AB][1-8]$/),
    contest: z.literal("olympiad"),
    level_name: z.string().min(1).max(20),
    year: z.number().int().min(2000).max(2100),
    part: z.enum(["A", "B"]),
    number: z.number().int().min(1).max(8),
    position: z.number().int().min(1).max(20),
    points: z.number().int().min(1).max(10),
    image: z.string().regex(/^img\/[\w-]+\.png$/),
    text: z.string(),
    stats: z.object({ klas1: pctNum, klas2: pctNum, klas3: pctNum, klas4: pctNum, klas5: pctNum }),
    difficulty: z.number().int().min(1).max(5),
    focus_primary: focus,
    focus_secondary: focus.nullable(),
    hint_en: z.string().nullable(),
    solution_steps_en: z.array(z.string().min(1)).min(1).nullable().optional(),
    answer: z.string().min(1).max(200),
    answer_type: z.enum(["choice", "number", "set", "any", "text", "tuple"]),
    answer_spec: Spec.optional(),
    answer_unit: z.string().max(20).nullable().optional(),
  })
  .superRefine((q, ctx) => {
    if (q.part === "A" && !/^[A-E]$/.test(q.answer)) ctx.addIssue({ code: "custom", message: `${q.id}: an A-answer is a letter` });
    if (q.part === "B" && !q.answer_spec) ctx.addIssue({ code: "custom", message: `${q.id}: a B-question needs answer_spec` });
  });

const Paper = z.object({
  year: z.number().int(),
  max_score: z.number().int().min(1).max(200),
  minutes: z.number().int().min(1).max(300),
  cutoff: z.record(z.string(), z.number()).nullable(),
  klas1_3_scores: z.record(z.string(), z.number().int().min(0)).nullable(),
});

const OlyBank = z.object({
  meta: z.object({ count: z.number().int() }).passthrough(),
  papers: z.union([z.array(Paper), z.record(z.string(), Paper)]),
  questions: z.array(OlyQuestion).min(1),
});

/** Levels 1–2 feel like warm-ups for a klas-1 student, 3 is core, 4–5 are challenges. */
export const tierForLevel = (level: number): Tier => (level <= 2 ? "warm-up" : level === 3 ? "core" : "challenge");

export function importOlympiad(db: Db, contentDir: string, now = Date.now()): ImportResult {
  const dir = path.join(contentDir, "olympiad");
  const file = path.join(dir, "questions.json");
  if (!fs.existsSync(file)) return { status: "missing", count: 0 };
  const raw = fs.readFileSync(file);
  const solDir = path.join(dir, "sol");
  const sols = fs.existsSync(solDir) ? fs.readdirSync(solDir).filter((f) => f.endsWith(".png")) : [];
  // The solution crops can arrive later than the bank, so they are part of what "changed" means.
  const digest = crypto.createHash("sha256").update(raw).update(sols.sort().join(",")).digest("hex");
  const prev = db.select().from(appMeta).where(eq(appMeta.key, "olympiad_sha256")).get();
  const existing = db.select({ n: count() }).from(question).where(eq(question.contest, "olympiad")).get()?.n ?? 0;
  if (prev?.value === digest && existing > 0) return { status: "unchanged", count: existing };

  const bank = OlyBank.parse(JSON.parse(raw.toString("utf8")));
  const missing = bank.questions.filter((q) => !fs.existsSync(path.join(dir, q.image)));
  if (missing.length > 0) throw new Error(`olympiad/questions.json refers to ${missing.length} missing image(s), e.g. ${missing[0]?.image}`);
  // Every B-answer must mark its own official value as right, or the checker and the bank disagree.
  for (const q of bank.questions) {
    if (q.part !== "B" || !q.answer_spec) continue;
    const self = flatten(q.answer_spec);
    if (!checkAnswer(q.answer_spec, self, q.answer_unit).correct) throw new Error(`${q.id}: the answer checker does not accept "${self}"`);
  }
  const papers = Array.isArray(bank.papers) ? bank.papers : Object.values(bank.papers);
  const perPaper = new Map<number, number>();
  for (const q of bank.questions) perPaper.set(q.year, (perPaper.get(q.year) ?? 0) + 1);
  const solSet = new Set(sols);

  db.transaction((tx) => {
    for (const q of bank.questions) {
      const crop = `${q.year}-${q.part}${q.number}.png`;
      const values = {
        id: q.id,
        contest: "olympiad" as const,
        level: q.level_name,
        year: q.year,
        number: q.position,
        questionsInPaper: perPaper.get(q.year) ?? 12,
        tier: tierForLevel(q.difficulty),
        focusPrimary: q.focus_primary,
        focusSecondary: q.focus_secondary,
        answer: q.answer,
        imagePath: `olympiad/${q.image}`,
        text: q.text,
        hintEn: q.hint_en,
        solutionEn: null,
        solutionSteps: q.solution_steps_en ?? null,
        voidNote: null,
        part: q.part,
        points: q.points,
        answerType: q.answer_type,
        answerSpec: q.part === "B" ? (q.answer_spec ?? null) : null,
        answerUnit: q.answer_unit ?? null,
        stats: q.stats,
        difficulty: q.difficulty,
        officialPath: solSet.has(crop) ? `olympiad/sol/${crop}` : null,
        updatedAt: now,
      };
      tx.insert(question).values(values).onConflictDoUpdate({ target: question.id, set: values }).run();
    }
    for (const p of papers) {
      const values = { contest: "olympiad" as const, year: p.year, maxScore: p.max_score, minutes: p.minutes, cutoff: p.cutoff, scores: p.klas1_3_scores };
      tx.insert(contestPaper)
        .values(values)
        .onConflictDoUpdate({ target: [contestPaper.contest, contestPaper.year], set: values })
        .run();
    }
    tx.insert(appMeta)
      .values({ key: "olympiad_sha256", value: digest })
      .onConflictDoUpdate({ target: appMeta.key, set: { value: digest } })
      .run();
  });
  paperCache = null;
  return { status: "imported", count: bank.questions.length };
}

/** The first official form of an answer, typed out (used to check the bank against the checker). */
export function flatten(spec: AnswerSpec): string {
  if (spec.kind === "number" || spec.kind === "text") return spec.value;
  if (spec.kind === "any") return flatten(spec.options[0]!);
  return spec.values.map((v) => (typeof v === "string" ? v : `(${flatten(v)})`)).join(", ");
}

// ---------- paper facts used for scoring ----------

export interface PaperFacts {
  year: number;
  cutoff: number | null;
  /** klas 1–3 score → number of students. */
  scores: Map<number, number>;
  /** Points a typical klas-1 student scores on the whole paper. */
  klas1Avg: number;
  /** cutoff ÷ klas-1 average: scales a question's klas-1 rate to "cutoff pace". */
  factor: number | null;
}

let paperCache: { facts: Map<number, PaperFacts>; medianCutoff: number } | null = null;

/** Facts per Olympiad year, worked out once from the bank. */
export function olympiadPapers(db: Db): { facts: Map<number, PaperFacts>; medianCutoff: number } {
  if (paperCache) return paperCache;
  const rows = db.select().from(contestPaper).where(eq(contestPaper.contest, "olympiad")).all();
  const qs = db.select({ year: question.year, points: question.points, stats: question.stats }).from(question).where(eq(question.contest, "olympiad")).all();
  const facts = new Map<number, PaperFacts>();
  for (const r of rows) {
    const mine = qs.filter((q) => q.year === r.year);
    const klas1Avg = mine.reduce((t, q) => t + (q.points ?? 0) * ((q.stats?.klas1 ?? 0) / 100), 0);
    const cutoff = r.cutoff?.klas1_3 ?? null;
    const scores = new Map<number, number>(Object.entries(r.scores ?? {}).map(([k, v]) => [Number(k), v]));
    facts.set(r.year, { year: r.year, cutoff, scores, klas1Avg, factor: cutoff !== null && klas1Avg > 0 ? cutoff / klas1Avg : null });
  }
  const cutoffs = [...facts.values()].map((f) => f.cutoff).filter((c): c is number => c !== null).sort((a, b) => a - b);
  const mid = Math.floor(cutoffs.length / 2);
  const medianCutoff = cutoffs.length === 0 ? 15 : cutoffs.length % 2 ? cutoffs[mid]! : (cutoffs[mid - 1]! + cutoffs[mid]!) / 2;
  paperCache = { facts, medianCutoff };
  return paperCache;
}

/** The typical factor, for a year without a report. */
function typicalFactor(facts: Map<number, PaperFacts>): number {
  const fs_ = [...facts.values()].map((f) => f.factor).filter((f): f is number => f !== null).sort((a, b) => a - b);
  return fs_.length ? fs_[Math.floor(fs_.length / 2)]! : 2.3;
}

export interface PaceQuestion {
  year: number;
  points: number;
  klas1: number; // 0–100
}

/** Klas-1 average and cutoff pace for a set of questions, and how her points compare. */
export function paceMarks(db: Db, qs: PaceQuestion[], earned: number) {
  const { facts, medianCutoff } = olympiadPapers(db);
  const fallback = typicalFactor(facts);
  let klas1 = 0;
  let pace = 0;
  let max = 0;
  for (const q of qs) {
    const p = q.klas1 / 100;
    const factor = facts.get(q.year)?.factor ?? fallback;
    klas1 += q.points * p;
    pace += q.points * Math.min(1, p * factor);
    max += q.points;
  }
  const relative = pace > 0 ? earned / pace : 0;
  return {
    questions: qs.length,
    points: earned,
    maxPoints: max,
    klas1: Math.round(klas1 * 10) / 10,
    pace: Math.round(pace * 10) / 10,
    relative: Math.round(relative * 100) / 100,
    fullPaper: Math.round(Math.min(36, relative * medianCutoff)),
    rough: qs.length < 12,
  };
}

/** Share of klas 1–3 students who scored less than this. */
export function betterThan(scores: Map<number, number>, score: number): number {
  let below = 0;
  let total = 0;
  for (const [s, n] of scores) {
    total += n;
    if (s < score) below += n;
  }
  return total === 0 ? 0 : Math.floor((below / total) * 100);
}

export const hasOlympiad = (db: Db) => (db.select({ n: count() }).from(question).where(eq(question.contest, "olympiad")).get()?.n ?? 0) > 0;
