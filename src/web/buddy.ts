// What the quiz buddy says and does. Voice: a sporty coach (picked by our first tester).
// Short, upbeat, specific: it talks about goals, effort and real numbers, never empty praise.
import type { BuddyMode, PupilStats, Tier } from "../shared/types";
import type { Mood } from "./components/Mascot";

export type Move = "nod" | "hop" | "bigjump" | "sway" | "bob" | "wave";
export interface Reaction {
  mood: Mood;
  move: Move;
  /** null = just the animation, no words. */
  text: string | null;
}

type Moment =
  | "easy"
  | "correct"
  | "big"
  | "rare"
  | "beatTrap"
  | "quick"
  | "streak3"
  | "streak5"
  | "streak10"
  | "wrong"
  | "wrongTrap"
  | "wrongLong"
  | "skip"
  | "stuck"
  | "endGreat"
  | "endGood"
  | "endOk"
  | "endTough";

export const LINES: Record<Moment, string[]> = {
  easy: [
    "Nice.",
    "Easy points.",
    "Banked.",
    "Smooth.",
    "Got it.",
    "Clean.",
    "Next!",
    "Locked in.",
    "Yep.",
    "Tidy.",
    "Too easy.",
    "Quick win.",
  ],
  correct: [
    "Good read on that one.",
    "That's how it's done.",
    "Solid. Keep the rhythm.",
    "Nice work — level {level} cleared.",
    "Sharp thinking!",
    "Points on the board!",
    "You made that look easy.",
    "Right on target.",
    "Steady and accurate. Love it.",
    "That's a strong answer.",

    "Exactly right. Next play!",
    "Great focus there.",
    "That's the technique.",
    "Smart work — that's level {level} handled.",
    "You're in the zone.",
    "Textbook answer.",
  ],
  big: [
    "YES! A level {level} — that's a championship move!",
    "Level {level} down! That's big-game maths.",
    "Huge! That one separates the pros.",
    "What a finish! Level {level} cleared.",
    "That's a personal-best kind of answer!",
    "Massive. Challenge question: done.",
    "Top-tier play right there!",
    "That's the hard stuff — and you nailed it.",

    "Champion stuff! Level {level} handled.",
    "Boom! That's a hard one done.",
    "That's an elite answer!",
    "Pro level. Seriously.",
  ],
  rare: [
    "Only {right}% of pupils got that. You're one of them!",
    "{right}% of real pupils got this. Elite company!",
    "Most pupils missed that one. Not you!",
    "Only {right}% got it right in the real contest. Huge!",

    "Only {right}% of pupils cracked it. Superb!",
    "Rare skill: {right}% got this one.",
  ],
  beatTrap: [
    "{pct}% of pupils fell for {trap}. You didn't. Respect!",
    "Dodged the {trap} trap! {pct}% of pupils didn't.",
    "Smart — {trap} was the trap, and you saw it.",

    "Not fooled by {trap}! Most pupils were.",
    "Saw through {trap}. Sharp!",
  ],
  quick: [
    "Fast! Just make sure it's not a lucky guess.",
    "Quick one! Next time, double-check before you lock it in.",
    "Speedy! Speed is great when the working is solid.",

    "Lightning fast! Double-check next time.",
    "Fast hands! Make sure the working backs it up.",
  ],
  streak3: [
    "3 in a row — you're warming up!",
    "Hat-trick! Keep it rolling.",
    "Three straight. Momentum!",
    "Three for three. Let's go!",
    "Triple! Keep the streak alive.",
  ],
  streak5: [
    "5 in a row! You're on fire!",
    "Five straight — that's a winning streak!",
    "High five! 5 in a row.",
    "5 straight! Champion form.",
    "Five-streak! Keep that energy.",
  ],
  streak10: [
    "10 IN A ROW! Unstoppable!",
    "Ten straight! That's a record-run feeling.",
    "Double digits! What a streak!",
    "10 straight! Legendary.",
    "A perfect ten in a row!",
  ],
  wrong: [
    "Shake it off. Tough ones build strength.",
    "Not this time — check the steps and go again.",
    "Missed one. Every pro does. Next!",
    "Good try. The steps show the trick.",
    "That's training. Learn it, then crush the next one.",
    "No stress — that's what practice is for.",
    "Reset, refocus, next question.",
    "Close! Look where it turns in the steps.",

    "Next one's yours.",
    "One miss doesn't change the game.",
    "Stay in it — the next one counts.",
    "That one's tricky. Now you know it.",
    "Every athlete misses. Keep going.",
    "Learn the move, use it next time.",
  ],
  wrongTrap: [
    "Classic trap: {pct}% of pupils picked {trap} too.",
    "{trap} fooled {pct}% of real pupils. Now you know the trick!",
    "That's the trap answer — {pct}% fell for it. You won't next time.",

    "{trap} catches lots of people — {pct}% of pupils too.",
    "Tricky! {pct}% of pupils also went for {trap}.",
  ],
  wrongLong: [
    "Good fight on that one. The steps will make it click.",
    "You battled hard there. Check the steps and it'll land.",
    "Long rally! Read the steps — you were nearly there.",

    "You didn't give up. That's the right attitude.",
    "Big effort! The steps show the shortcut.",
  ],
  skip: [
    "Smart skip. Here's how it works.",
    "Skipping is strategy. Have a look at the steps.",
    "Saved time there — now learn it for next time.",
    "Good call — move on and come back stronger.",
    "Skip noted. Check the steps for next time.",
  ],
  stuck: [
    "Need a boost? Try the hint.",
    "Stuck? A hint is a good play here.",
    "Take a breath. The hint can get you moving.",
    "Stuck is normal. A hint might help.",
    "Time for a game plan? Check the hint.",
    "Want a tip? The hint's right there.",
  ],
  endGreat: [
    "Strong session! {score} — that's a champion run.",
    "What a game! {score}. You're in top form.",
    "Brilliant! {score}. Keep this up and you're contest-ready.",
    "Top performance! {score}.",
    "{score} — that's medal territory!",
    "Outstanding! {score}. Coach is proud.",
  ],
  endGood: [
    "Strong session! {score}.",
    "Good game! {score} — solid progress.",
    "Nice work! {score}. Keep stacking these.",
    "Good session! {score}. On the way up.",
    "{score} — that's real progress.",
    "Well played! {score}.",
  ],
  endOk: [
    "Good effort! {score}. Every session counts.",
    "{score} — building up nicely.",
    "Training done: {score}. Next one's yours.",
    "{score}. Practice is how champions are made.",
    "Decent session: {score}. Keep showing up.",
    "{score} — next time, a few more points.",
  ],
  endTough: [
    "Tough one, but you showed up. That's how you get better.",
    "Hard session — those make you stronger.",
    "Not your best, but you finished it. That counts.",
    "Tough game. Come back stronger.",
    "Hard ones today — good training.",
    "Rest, then go again. That's how it works.",
  ],
};

const last = new Map<Moment, string>();

/** Picks a line for a moment, never the same one twice in a row, and fills in {placeholders}. */
export function say(
  moment: Moment,
  vars: Record<string, string | number> = {},
  rand = Math.random,
): string {
  const options = LINES[moment];
  const fresh =
    options.length > 1
      ? options.filter((l) => l !== last.get(moment))
      : options;
  const line = fresh[Math.floor(rand() * fresh.length)]!;
  last.set(moment, line);
  return line.replace(/\{(\w+)\}/g, (_, k: string) => String(vars[k] ?? ""));
}

export interface AnswerFacts {
  correct: boolean;
  choice: string | null;
  level: number | null;
  tier: Tier;
  pupils: PupilStats | null | undefined;
  timeMs: number;
  /** Right answers in a row, including this one. */
  streak: number;
  /** Right answers so far in this quiz, including this one. */
  rightSoFar: number;
}

/** How the buddy reacts to one checked answer (lively mode only). */
export function react(f: AnswerFacts, rand = Math.random): Reaction {
  if (f.choice === null)
    return { mood: "comfort", move: "sway", text: say("skip", {}, rand) };
  if (!f.correct) {
    const trap = f.pupils?.trap;
    if (trap && trap.choice === f.choice)
      return {
        mood: "comfort",
        move: "sway",
        text: say("wrongTrap", { pct: trap.pct, trap: trap.choice }, rand),
      };
    if (f.timeMs > 180_000)
      return {
        mood: "comfort",
        move: "sway",
        text: say("wrongLong", {}, rand),
      };
    return { mood: "comfort", move: "sway", text: say("wrong", {}, rand) };
  }
  if (f.streak === 10)
    return { mood: "cheer", move: "bigjump", text: say("streak10", {}, rand) };
  if (f.streak === 5)
    return { mood: "cheer", move: "bigjump", text: say("streak5", {}, rand) };
  const level = f.level ?? 3;
  const hard = level >= 4 || f.tier === "challenge";
  // Don't cheer a probable guess on a harder question.
  if (level >= 3 && f.timeMs > 0 && f.timeMs < 8_000)
    return { mood: "nod", move: "nod", text: say("quick", {}, rand) };
  if (hard) {
    const trap = f.pupils?.trap;
    if (trap && rand() < 0.5)
      return {
        mood: "cheer",
        move: "bigjump",
        text: say("beatTrap", { pct: trap.pct, trap: trap.choice }, rand),
      };
    if (f.pupils && f.pupils.right <= 30)
      return {
        mood: "cheer",
        move: "bigjump",
        text: say("rare", { right: f.pupils.right }, rand),
      };
    return {
      mood: "cheer",
      move: "bigjump",
      text: say("big", { level }, rand),
    };
  }
  if (f.streak === 3)
    return { mood: "cheer", move: "hop", text: say("streak3", {}, rand) };
  if (level === 3)
    return {
      mood: "cheer",
      move: "hop",
      text: say("correct", { level }, rand),
    };
  // Easy ones: a nod, and fewer words once she's used to the buddy.
  return {
    mood: "nod",
    move: "nod",
    text: f.rightSoFar <= 20 && rand() < 0.6 ? say("easy", {}, rand) : null,
  };
}

/** The end-of-quiz line, with one specific thing to be proud of when there is one. */
export function endLine(
  right: number,
  total: number,
  extra: { challengeRight?: number; bestStreak?: number } = {},
  rand = Math.random,
): { mood: Mood; text: string } {
  const pct = total ? right / total : 0;
  const score = `${right} out of ${total}`;
  const head =
    pct >= 0.85
      ? say("endGreat", { score }, rand)
      : pct >= 0.65
        ? say("endGood", { score }, rand)
        : pct >= 0.4
          ? say("endOk", { score }, rand)
          : say("endTough", {}, rand);
  const bits: string[] = [];
  if (extra.challengeRight && extra.challengeRight >= 2)
    bits.push(`${extra.challengeRight} challenge questions right — big plays.`);
  else if (extra.bestStreak && extra.bestStreak >= 4)
    bits.push(`Best streak: ${extra.bestStreak} in a row.`);
  return {
    mood: pct >= 0.65 ? "cheer" : pct >= 0.4 ? "wave" : "comfort",
    text: bits.length ? `${head} ${bits[0]}` : head,
  };
}

/** Which moments the buddy joins in each mode. */
export const buddyDoes = (mode: BuddyMode) => ({
  react: mode === "lively",
  hint: mode !== "off",
  nudge: mode !== "off",
  end: mode !== "off",
});
