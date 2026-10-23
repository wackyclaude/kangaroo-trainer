// Types shared by the server and the web app.

export const FOCUS_AREAS = {
  NUM: "Number & arithmetic",
  ALG: "Patterns & algebra",
  GEO: "Geometry & measurement",
  SPA: "Spatial & visual reasoning",
  LOG: "Logic & deduction",
  CMB: "Counting & combinatorics",
} as const;
export type FocusArea = keyof typeof FOCUS_AREAS;

export const TIERS = ["warm-up", "core", "challenge"] as const;
export type Tier = (typeof TIERS)[number];

export const AVATARS = ["🦘", "🦊", "🦉", "🐼", "🐸", "🐧", "🐯", "🐙", "🦄", "🐢"] as const;
export type Avatar = (typeof AVATARS)[number];

export const MAX_STUDENTS = 5;

export type Role = "student" | "parent";

export interface ProfileCard {
  id: number;
  nickname: string;
  avatar: string;
  role: Role;
  locked: boolean;
}

export interface Me {
  id: number;
  nickname: string;
  avatar: string;
  role: Role;
  grade: string | null;
  birthYear: number | null;
}

export interface QuestionSummary {
  id: string;
  year: number;
  number: number;
  tier: Tier;
  focusPrimary: FocusArea;
  focusSecondary: FocusArea | null;
}

export interface QuestionDetail extends QuestionSummary {
  imageUrl: string;
  text: string;
  voidNote: string | null;
}

export interface ApiError {
  error: string;
  message: string;
  retryAfterSeconds?: number;
}

// ---------- practice (M3) ----------

export const HELP_LEVELS = ["test", "practice", "learn"] as const;
export type HelpLevel = (typeof HELP_LEVELS)[number];
export const CHOICES = ["A", "B", "C", "D", "E"] as const;
export type Choice = (typeof CHOICES)[number];
export type PracticeMode = "paper" | "focus" | "mistakes" | "smart";

/** Current W4Kangoeroe rules: 5 points for a correct answer, 1 for a blank, 0 for a wrong one. */
export const SCORING = { correct: 5, blank: 1, wrong: 0 } as const;
export const PAPER_MINUTES = 50;

export type Delivery = "app" | "paper";

export interface SessionSettings {
  help: HelpLevel;
  timerMinutes: number | null;
  /** "paper" = printed and done on paper; answers are typed in afterwards, without timing. */
  delivery?: Delivery;
  focus?: FocusArea[];
  tiers?: Tier[];
  years?: number[];
  count?: number;
  excludeRecentDays?: number;
}

export interface SessionQuestion {
  position: number;
  id: string;
  year: number;
  number: number;
  tier: Tier;
  focusPrimary: FocusArea;
  focusSecondary: FocusArea | null;
  imageUrl: string;
  text: string;
  hasHint: boolean;
  hasSolution: boolean;
  voidNote: string | null;
}

export interface SavedAnswer {
  position: number;
  choice: Choice | null;
  flagged: boolean;
  /** Only filled in practice/learn mode, or after the session has finished. */
  correct?: boolean;
  answer?: Choice;
  steps?: string[] | null;
}

export interface SessionState {
  id: number;
  mode: PracticeMode;
  paperYear: number | null;
  settings: SessionSettings;
  startedAt: number;
  endsAt: number | null;
  endedAt: number | null;
  serverNow: number;
  questions: SessionQuestion[];
  answers: SavedAnswer[];
}

export interface AnswerFeedback {
  saved: true;
  correct?: boolean;
  answer?: Choice;
  steps?: string[] | null;
}

export interface ResultRow {
  position: number;
  id: string;
  year: number;
  number: number;
  tier: Tier;
  focusPrimary: FocusArea;
  focusSecondary: FocusArea | null;
  imageUrl: string;
  choice: Choice | null;
  answer: Choice;
  correct: boolean;
  voided: boolean;
  timeMs: number;
  hintUsed: boolean;
  hint: string | null;
  steps: string[] | null;
}

export interface SessionResults {
  id: number;
  mode: PracticeMode;
  paperYear: number | null;
  help: HelpLevel;
  delivery: Delivery;
  startedAt: number;
  endedAt: number;
  score: number;
  maxScore: number;
  correct: number;
  wrong: number;
  blank: number;
  totalTimeMs: number;
  rows: ResultRow[];
  practiseNext: { focus: FocusArea; missed: number; of: number }[];
  /** Stars and badges from this quiz (only on the results screen, for students). */
  rewards?: SessionRewards | null;
}

export interface SessionListItem {
  id: number;
  mode: PracticeMode;
  paperYear: number | null;
  help: HelpLevel;
  delivery: Delivery;
  startedAt: number;
  endedAt: number | null;
  score: number | null;
  maxScore: number | null;
  questions: number;
}

// ---------- insights (M4) ----------

export const LEVELS = ["starter", "developing", "solid", "competition-ready"] as const;
export type Level = (typeof LEVELS)[number];
export const LEVEL_NAMES: Record<Level, string> = {
  starter: "Starter",
  developing: "Developing",
  solid: "Solid",
  "competition-ready": "Competition-ready",
};

/** Mistake memory: a missed question comes back after these many days (box 1–4); box 5 = mastered. */
export const REVIEW_DAYS = [1, 3, 7, 21] as const;
export const MASTERED_BOX = 5;

export interface TrendPoint {
  at: number;
  accuracy: number;
  level: Level;
}

export interface AreaInsight {
  focus: FocusArea;
  level: Level;
  /** 0–1, or null before the first answer in this area. */
  weightedAccuracy: number | null;
  /** Answers counted (the last 30 in this area). */
  attempts: number;
  coreCorrect: number;
  challengeCorrect: number;
  medianTimeMs: number | null;
  nextStep: string;
  trend: TrendPoint[];
}

export interface WeakArea {
  focus: FocusArea;
  reason: "low" | "new";
}

export interface SpeedFlag {
  questionId: string;
  year: number;
  number: number;
  tier: Tier;
  focus: FocusArea;
  timeMs: number;
  at: number;
}

export interface Insights {
  profileId: number;
  nickname: string;
  avatar: string;
  areas: AreaInsight[];
  weakAreas: WeakArea[];
  mistakes: { due: number; waiting: number; mastered: number; nextDueAt: number | null };
  speed: {
    byTier: { tier: Tier; medianMs: number | null; answers: number }[];
    byArea: { focus: FocusArea; medianMs: number | null; answers: number }[];
    guesses: SpeedFlag[];
    slow: SpeedFlag[];
  };
  /** Projected score out of 120, from the last 3 full papers. */
  estimate: { score: number; low: number; high: number; papers: number } | null;
  totals: { answers: number; sessions: number; papers: number };
  tierTarget: Tier;
}

export interface BenchmarkProfile {
  id: number;
  nickname: string;
  avatar: string;
  answers: number;
  areas: Partial<Record<FocusArea, { accuracy: number | null; level: Level }>>;
  medianTimeMs: number | null;
  estimate: number | null;
}

export interface Benchmarks {
  ageBand: string;
  profiles: BenchmarkProfile[];
  papers: { year: number; scores: { profileId: number; best: number; max: number }[] }[];
  /** Only filled in when 3 or more profiles have data. */
  group: { areas: Partial<Record<FocusArea, number>>; medianTimeMs: number | null; estimate: number | null; profiles: number } | null;
}

export interface PaperKeyRow {
  position: number;
  year: number;
  number: number;
  answer: Choice;
  voided: boolean;
}

// ---------- rewards (M5) ----------

export const AREA_BADGE_NAMES: Record<FocusArea, string> = {
  NUM: "Number cruncher",
  ALG: "Pattern spotter",
  GEO: "Shape shifter",
  SPA: "Cube wizard",
  LOG: "Detective",
  CMB: "Counting champ",
};

/** Every badge, in the order they are shown. Earned or not is worked out from the answer log. */
export const BADGES = [
  { id: "first-quiz", name: "First hop", description: "Finish your first quiz or paper.", need: 1 },
  { id: "first-paper", name: "Full paper", description: "Finish a whole past paper.", need: 1 },
  { id: "no-skip", name: "No skips", description: "Answer every question of a full paper.", need: 1 },
  { id: "score-80", name: "80 club", description: "Score 80 or more out of 120 on a full paper.", need: 80 },
  { id: "score-100", name: "100 club", description: "Score 100 or more out of 120 on a full paper.", need: 100 },
  { id: "on-a-roll", name: "On a roll", description: "Get 10 right in a row in one quiz.", need: 10 },
  { id: "fixer", name: "Mistake fixer", description: "Fix 10 past mistakes for good.", need: 10 },
  { id: "streak-3", name: "3-day streak", description: "Practise 3 days in a row.", need: 3 },
  { id: "streak-7", name: "7-day streak", description: "Practise 7 days in a row.", need: 7 },
  { id: "challenge-5", name: "Challenge accepted", description: "Get 5 different challenge questions right.", need: 5 },
  { id: "time-traveller", name: "Time traveller", description: "Answer questions from 10 different years.", need: 10 },
  { id: "area-NUM", name: AREA_BADGE_NAMES.NUM, description: "Get 10 different number & arithmetic questions right without a hint.", need: 10 },
  { id: "area-ALG", name: AREA_BADGE_NAMES.ALG, description: "Get 10 different patterns & algebra questions right without a hint.", need: 10 },
  { id: "area-GEO", name: AREA_BADGE_NAMES.GEO, description: "Get 10 different geometry & measurement questions right without a hint.", need: 10 },
  { id: "area-SPA", name: AREA_BADGE_NAMES.SPA, description: "Get 10 different spatial & visual reasoning questions right without a hint.", need: 10 },
  { id: "area-LOG", name: AREA_BADGE_NAMES.LOG, description: "Get 10 different logic & deduction questions right without a hint.", need: 10 },
  { id: "area-CMB", name: AREA_BADGE_NAMES.CMB, description: "Get 10 different counting & combinatorics questions right without a hint.", need: 10 },
  { id: "ready", name: "Contest ready", description: "Reach Competition-ready in any focus area.", need: 1 },
] as const;
export type BadgeId = (typeof BADGES)[number]["id"];

export interface Badge {
  id: BadgeId;
  name: string;
  description: string;
  earnedAt: number | null;
  /** The quiz or paper in which it was earned. */
  sessionId: number | null;
  have: number;
  need: number;
}

export interface WeekDay {
  date: string; // YYYY-MM-DD, home time zone
  practised: boolean;
  today: boolean;
}

export interface Rewards {
  stars: { total: number; thisWeek: number };
  streak: { current: number; best: number; practisedToday: boolean };
  week: { goal: number; practisedDays: number; days: WeekDay[] };
  badges: Badge[];
  /** Best full-paper score so far (out of 120). */
  bestPaper: number | null;
}

export interface SessionRewards {
  stars: number;
  /** Past mistakes fixed for good in this session (2 stars extra each). */
  fixed: number;
  newBadges: Badge[];
  personalBest: { score: number; previous: number } | null;
}

// ---------- contest countdown and readiness (M5 add-on) ----------

export const DEFAULT_TARGET_SCORE = 100;

export interface ReadinessPart {
  /** 0–100: how far along this part is. */
  percent: number;
  /** Share of the total (40, 40 or 20). */
  weight: number;
  label: string;
  detail: string;
}

export interface Readiness {
  contest: {
    /** The day counted down to (YYYY-MM-DD, home time zone). */
    date: string;
    /** True when the parent set the school's day; false = first day of the window. */
    chosen: boolean;
    windowStart: string;
    windowEnd: string;
    daysLeft: number;
    /** countdown = before the day; today; open = window open, school day not set and passed;
     *  done = the chosen day has passed (results come in mid-May). */
    phase: "countdown" | "today" | "open" | "done";
  };
  target: number;
  percent: number;
  parts: { skill: ReadinessPart; score: ReadinessPart; practice: ReadinessPart };
  /** One line on what would raise readiness most. */
  tip: string;
}
