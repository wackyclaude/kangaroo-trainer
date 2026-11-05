import { sqliteTable, text, integer, real, primaryKey, index, uniqueIndex } from "drizzle-orm/sqlite-core";

export const profile = sqliteTable(
  "profile",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    nickname: text("nickname").notNull(),
    avatar: text("avatar").notNull(),
    role: text("role", { enum: ["student", "parent"] }).notNull(),
    grade: text("grade"),
    birthYear: integer("birth_year"),
    pinHash: text("pin_hash").notNull(),
    failedAttempts: integer("failed_attempts").notNull().default(0),
    lockedUntil: integer("locked_until"), // epoch ms
    // The school's contest day (YYYY-MM-DD), set by the parent; null = the first day of the contest window.
    contestDate: text("contest_date"),
    // What "100% ready" means: a projected score out of 120, set by the parent; null = 100.
    targetScore: integer("target_score"),
    // Contests turned on for this student; null = Kangaroo only.
    contests: text("contests", { mode: "json" }).$type<string[] | null>(),
    // Olympiad level range, stretch question, school day and target (see OlympiadSettings); null = defaults.
    olympiad: text("olympiad", { mode: "json" }).$type<Record<string, unknown> | null>(),
    // The look the student picked (classic, space, modern) and light/dark; null = classic, follow the device.
    theme: text("theme"),
    appearance: text("appearance"),
    createdAt: integer("created_at").notNull(),
  },
  (t) => [uniqueIndex("profile_nickname_uq").on(t.nickname)],
);

// Sign-in sessions. Only a SHA-256 hash of the cookie token is stored.
export const loginSession = sqliteTable(
  "login_session",
  {
    tokenHash: text("token_hash").primaryKey(),
    profileId: integer("profile_id").notNull().references(() => profile.id, { onDelete: "cascade" }),
    createdAt: integer("created_at").notNull(),
    lastSeenAt: integer("last_seen_at").notNull(),
    expiresAt: integer("expires_at").notNull(),
  },
  (t) => [index("login_session_profile_idx").on(t.profileId)],
);

export const question = sqliteTable(
  "question",
  {
    id: text("id").primaryKey(), // e.g. wizSMART-2026-07 or dmo-2026-B2
    contest: text("contest", { enum: ["kangaroo", "olympiad"] }).notNull().default("kangaroo"),
    level: text("level").notNull(),
    year: integer("year").notNull(),
    number: integer("number").notNull(),
    questionsInPaper: integer("questions_in_paper").notNull(),
    tier: text("tier", { enum: ["warm-up", "core", "challenge"] }).notNull(),
    focusPrimary: text("focus_primary").notNull(),
    focusSecondary: text("focus_secondary"),
    answer: text("answer").notNull(),
    imagePath: text("image_path").notNull(),
    text: text("text").notNull(),
    hintEn: text("hint_en"),
    solutionEn: text("solution_en"),
    solutionSteps: text("solution_steps", { mode: "json" }).$type<string[] | null>(),
    voidNote: text("void_note"),
    // Olympiad: part A (choice) or B (exact answer), points, how the answer is checked, class stats, level 1–5.
    part: text("part", { enum: ["A", "B"] }),
    points: integer("points"),
    answerType: text("answer_type").notNull().default("choice"),
    answerSpec: text("answer_spec", { mode: "json" }).$type<import("../../shared/types.js").AnswerSpec | null>(),
    answerUnit: text("answer_unit"),
    stats: text("stats", { mode: "json" }).$type<import("../../shared/types.js").ClassStats | null>(),
    difficulty: integer("difficulty"),
    officialPath: text("official_path"),
    updatedAt: integer("updated_at").notNull(),
  },
  (t) => [index("question_year_idx").on(t.level, t.year, t.number), index("question_focus_idx").on(t.focusPrimary), index("question_contest_idx").on(t.contest, t.year)],
);

export const practiceSession = sqliteTable(
  "practice_session",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    profileId: integer("profile_id").notNull().references(() => profile.id, { onDelete: "cascade" }),
    mode: text("mode", { enum: ["paper", "focus", "mistakes", "smart"] }).notNull(),
    contest: text("contest", { enum: ["kangaroo", "olympiad"] }).notNull().default("kangaroo"),
    settings: text("settings", { mode: "json" }).notNull(),
    paperYear: integer("paper_year"),
    startedAt: integer("started_at").notNull(),
    endedAt: integer("ended_at"),
    score: real("score"),
    maxScore: real("max_score"),
  },
  (t) => [index("practice_session_profile_idx").on(t.profileId, t.startedAt)],
);

export const sessionQuestion = sqliteTable(
  "session_question",
  {
    sessionId: integer("session_id").notNull().references(() => practiceSession.id, { onDelete: "cascade" }),
    position: integer("position").notNull(),
    questionId: text("question_id").notNull().references(() => question.id),
  },
  (t) => [primaryKey({ columns: [t.sessionId, t.position] })],
);

// One row per submitted answer. Rows are only ever added, never changed.
export const attempt = sqliteTable(
  "attempt",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    sessionId: integer("session_id").references(() => practiceSession.id, { onDelete: "cascade" }),
    profileId: integer("profile_id").notNull().references(() => profile.id, { onDelete: "cascade" }),
    questionId: text("question_id").notNull().references(() => question.id),
    choice: text("choice"), // A–E, or null for "don't know"
    correct: integer("correct", { mode: "boolean" }).notNull(),
    timeMs: integer("time_ms"),
    hintUsed: integer("hint_used", { mode: "boolean" }).notNull().default(false),
    flagged: integer("flagged", { mode: "boolean" }).notNull().default(false),
    source: text("source", { enum: ["app", "paper"] }).notNull().default("app"),
    answeredAt: integer("answered_at").notNull(),
  },
  (t) => [index("attempt_profile_idx").on(t.profileId, t.answeredAt), index("attempt_question_idx").on(t.questionId)],
);

export const reviewItem = sqliteTable(
  "review_item",
  {
    profileId: integer("profile_id").notNull().references(() => profile.id, { onDelete: "cascade" }),
    questionId: text("question_id").notNull().references(() => question.id),
    box: integer("box").notNull(),
    dueAt: integer("due_at").notNull(),
    streak: integer("streak").notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.profileId, t.questionId] })],
);

export const masterySnapshot = sqliteTable(
  "mastery_snapshot",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    profileId: integer("profile_id").notNull().references(() => profile.id, { onDelete: "cascade" }),
    focusArea: text("focus_area").notNull(),
    contest: text("contest", { enum: ["kangaroo", "olympiad"] }).notNull().default("kangaroo"),
    level: text("level", { enum: ["starter", "developing", "solid", "competition-ready"] }).notNull(),
    weightedAccuracy: real("weighted_accuracy").notNull(),
    attempts: integer("attempts").notNull(),
    computedAt: integer("computed_at").notNull(),
  },
  (t) => [index("mastery_profile_idx").on(t.profileId, t.computedAt)],
);

// One row per contest paper: cutoffs and how many klas 1–3 students got each score (Olympiad reports).
export const contestPaper = sqliteTable(
  "contest_paper",
  {
    contest: text("contest", { enum: ["kangaroo", "olympiad"] }).notNull(),
    year: integer("year").notNull(),
    maxScore: integer("max_score").notNull(),
    minutes: integer("minutes").notNull(),
    cutoff: text("cutoff", { mode: "json" }).$type<Record<string, number> | null>(),
    scores: text("scores", { mode: "json" }).$type<Record<string, number> | null>(),
  },
  (t) => [primaryKey({ columns: [t.contest, t.year] })],
);

export const appMeta = sqliteTable("app_meta", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
});
