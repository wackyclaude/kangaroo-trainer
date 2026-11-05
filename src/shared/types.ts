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
  /** Contests turned on for this profile (the parent always has both). */
  contests: Contest[];
  /** The question levels this student may get in short Olympiad quizzes. */
  olympiad: OlympiadSettings;
  /** The look this profile picked. */
  theme: Skin;
  appearance: Appearance;
}

// ---------- themes (M9) ----------

export const SKINS = ["classic", "space", "modern"] as const;
export type Skin = (typeof SKINS)[number];
export const SKIN_NAMES: Record<Skin, string> = { classic: "Exercise book", space: "Space", modern: "Modern" };
export const APPEARANCES = ["auto", "light", "dark"] as const;
/** auto = follow the device (Modern: dark unless set to light). */
export type Appearance = (typeof APPEARANCES)[number];

// ---------- contests (M8) ----------

export const CONTESTS = ["kangaroo", "olympiad"] as const;
export type Contest = (typeof CONTESTS)[number];
export const CONTEST_NAMES: Record<Contest, string> = { kangaroo: "Kangaroo", olympiad: "Olympiad" };

/** Olympiad difficulty for a klas-1 student, from the share of klas 1 that got it right. */
export const OLY_LEVELS = [1, 2, 3, 4, 5] as const;
export type OlyLevel = (typeof OLY_LEVELS)[number];
export const OLY_LEVEL_TEXT: Record<OlyLevel, string> = {
  1: "half or more of klas 1 got it right",
  2: "35–49% of klas 1",
  3: "20–34% of klas 1",
  4: "10–19% of klas 1",
  5: "under 10% of klas 1",
};
export const OLY_PAPER_MINUTES = 120;
export const OLY_MAX_SCORE = 36;
export const OLY_PARTS = ["A", "B"] as const;
export type OlyPart = (typeof OLY_PARTS)[number];

export interface OlympiadSettings {
  /** Lowest and highest level allowed in focus quizzes, Smart mix and Fix my mistakes. */
  minLevel: OlyLevel;
  maxLevel: OlyLevel;
  /** Smart mix adds one question from the level above the range. */
  stretch: boolean;
  /** The school's round-1 day (YYYY-MM-DD) or null = the first day of the window. */
  date: string | null;
  /** Points above (or below) each paper's cutoff that count as 100% on the score part. */
  targetShift: number;
}
export const DEFAULT_OLYMPIAD: OlympiadSettings = { minLevel: 1, maxLevel: 4, stretch: false, date: null, targetShift: 0 };

/** Share right per class in that year's report (klas 4 and 5 = vwo). */
export interface ClassStats {
  klas1: number;
  klas2: number;
  klas3: number;
  klas4: number;
  klas5: number;
}

/** How a B-answer is checked. Values are exact expressions such as "24/5", "2+2√2" or "6π". */
export type AnswerSpec =
  | { kind: "number"; value: string }
  | { kind: "text"; value: string }
  | { kind: "tuple"; values: (string | AnswerSpec)[] }
  | { kind: "set"; values: (string | AnswerSpec)[] }
  | { kind: "any"; options: AnswerSpec[] };

/** Short-quiz marks worked out from the reports (all in points). */
export interface PaceMarks {
  questions: number;
  points: number;
  maxPoints: number;
  /** The klas-1 average for exactly these questions. */
  klas1: number;
  /** Roughly what a student who just reaches the cutoff scores on these questions. */
  pace: number;
  /** points ÷ pace (1 = on cutoff pace). */
  relative: number;
  /** relative × the median cutoff, as a score out of 36. */
  fullPaper: number;
  rough: boolean;
}

export interface CutoffResult {
  year: number;
  cutoff: number;
  /** Her score minus the cutoff. */
  diff: number;
  /** Share of klas 1–3 students she scored more than (0–100). */
  betterThan: number;
  target: number;
}

export interface QuestionSummary {
  id: string;
  contest: Contest;
  /** "7" for Kangaroo, "A3" or "B2" for the Olympiad. */
  label: string;
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
  /** Missing on sessions from before M8 = Kangaroo. */
  contest?: Contest;
  /** Olympiad: the levels picked for this quiz (inside the student's range), and A/B parts. */
  levels?: OlyLevel[];
  parts?: OlyPart[];
  stretch?: boolean;
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
  label: string;
  /** Olympiad: A = multiple choice, B = type the exact answer. */
  part: OlyPart | null;
  points: number;
  /** For B-answers like "100°" or "30 minutes". */
  unit: string | null;
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
  /** A–E, or the typed B-answer. */
  choice: string | null;
  flagged: boolean;
  /** Only filled in practice/learn mode, or after the session has finished. */
  correct?: boolean;
  answer?: string;
  steps?: string[] | null;
  reveal?: Reveal;
}

/** Shown once an Olympiad question is graded. */
export interface Reveal {
  /** "Simplify next time" and similar. */
  note: string | null;
  officialUrl: string | null;
  stats: ClassStats | null;
  level: OlyLevel | null;
}

export interface SessionState {
  id: number;
  contest: Contest;
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
  answer?: string;
  steps?: string[] | null;
  reveal?: Reveal;
}

export interface ResultRow {
  position: number;
  id: string;
  label: string;
  part: OlyPart | null;
  points: number;
  earned: number;
  year: number;
  number: number;
  tier: Tier;
  focusPrimary: FocusArea;
  focusSecondary: FocusArea | null;
  imageUrl: string;
  choice: string | null;
  answer: string;
  note: string | null;
  officialUrl: string | null;
  stats: ClassStats | null;
  level: OlyLevel | null;
  correct: boolean;
  voided: boolean;
  timeMs: number;
  hintUsed: boolean;
  hint: string | null;
  steps: string[] | null;
}

export interface SessionResults {
  id: number;
  contest: Contest;
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
  /** Olympiad full paper: compared with that year's cutoff. */
  cutoff?: CutoffResult | null;
  /** Olympiad short quiz (6 or more questions): klas-1 average and cutoff pace. */
  pace?: PaceMarks | null;
  /** Stars and badges from this quiz (only on the results screen, for students). */
  rewards?: SessionRewards | null;
}

export interface SessionListItem {
  id: number;
  contest: Contest;
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
  contest: Contest;
  /** Olympiad only. */
  olympiad?: OlympiadInsights;
}

export interface OlympiadInsights {
  /** Running cutoff pace over the last 60 answered questions (null under 6). */
  pace: PaceMarks | null;
  papers: { sessionId: number; year: number; score: number; cutoff: number; at: number }[];
  /** Share right per level (last 20 answers at each level). */
  levels: { level: OlyLevel; answers: number; right: number }[];
  /** Set when she is ready for a wider range (70%+ of her top level over the last 20 there). */
  suggestWiden: { to: OlyLevel; right: number; of: number } | null;
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
  label: string;
  year: number;
  number: number;
  answer: string;
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
  { id: "first-paper", name: "Full paper", description: "Finish a whole Kangaroo past paper.", need: 1 },
  { id: "no-skip", name: "No skips", description: "Answer every question of a full paper.", need: 1 },
  { id: "score-80", name: "80 club", description: "Score 80 or more out of 120 on a full Kangaroo paper.", need: 80 },
  { id: "score-100", name: "100 club", description: "Score 100 or more out of 120 on a full Kangaroo paper.", need: 100 },
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
  { id: "oly-first-paper", name: "Olympian", description: "Finish a whole Olympiad paper.", need: 1 },
  { id: "oly-first-b", name: "Exactly right", description: "Get an Olympiad B-problem right.", need: 1 },
  { id: "oly-cutoff", name: "Over the line", description: "Reach that year's cutoff on a full Olympiad paper.", need: 1 },
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
  /** Best full Kangaroo paper score so far (out of 120). */
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
  /** Which contest this is for. */
  kind: Contest;
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
    /** Olympiad: the round-2 day, when known. */
    nextRound?: string | null;
  };
  target: number;
  percent: number;
  parts: { skill: ReadinessPart; score: ReadinessPart; practice: ReadinessPart };
  /** One line on what would raise readiness most. */
  tip: string;
  /** Olympiad: ready for a wider level range (shown in the parent corner). */
  suggestWiden?: OlympiadInsights["suggestWiden"];
}
