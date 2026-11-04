import { describe, expect, it } from "vitest";
import { checkAnswer, needsColon, needsLetters, needsList, parseValue } from "../src/shared/answers.js";
import type { AnswerSpec } from "../src/shared/types.js";

const num = (value: string): AnswerSpec => ({ kind: "number", value });
const ok = (spec: AnswerSpec, input: string, unit?: string) => checkAnswer(spec, input, unit).correct;

describe("parseValue", () => {
  it("reads whole numbers, fractions, mixed numbers, roots and π", () => {
    expect(parseValue("5201")?.value).toBe(5201);
    expect(parseValue("24/5")?.value).toBeCloseTo(4.8);
    expect(parseValue("4½")?.value).toBeCloseTo(4.5);
    expect(parseValue("4 1/2")?.value).toBeCloseTo(4.5);
    expect(parseValue("3⅕")?.value).toBeCloseTo(3.2);
    expect(parseValue("2+2√2")?.value).toBeCloseTo(2 + 2 * Math.SQRT2);
    expect(parseValue("6π")?.value).toBeCloseTo(6 * Math.PI);
    expect(parseValue("−21/16")?.value).toBeCloseTo(-21 / 16);
    expect(parseValue("√(8)")?.value).toBeCloseTo(Math.sqrt(8));
    expect(parseValue("2(3+1)")?.value).toBe(8);
  });

  it("rejects things that aren't values", () => {
    for (const s of ["", "abc", "4/", "√", "1/0", "(2", "2)", "3..4"]) expect(parseValue(s)).toBeNull();
  });

  it("notices answers that could be simpler", () => {
    expect(parseValue("9/2")?.simplified).toBe(true);
    expect(parseValue("18/4")?.simplified).toBe(false);
    expect(parseValue("8/1")?.simplified).toBe(false);
    expect(parseValue("√8")?.simplified).toBe(false);
    expect(parseValue("2√2")?.simplified).toBe(true);
  });
});

describe("checkAnswer", () => {
  it("accepts equal exact values in any form", () => {
    expect(ok(num("9/2"), "4½")).toBe(true);
    expect(ok(num("9/2"), "4 1/2")).toBe(true);
    expect(ok(num("9/2"), "4.5")).toBe(true);
    expect(ok(num("9/2"), "4,5")).toBe(true); // Dutch decimal comma
    expect(ok(num("16/5"), "3⅕")).toBe(true);
    expect(ok(num("2+2√2"), "2√2+2")).toBe(true);
    expect(ok(num("6π"), "6 pi")).toBe(true);
    expect(ok(num("-1"), "−1")).toBe(true);
    expect(ok(num("5201"), "5200")).toBe(false);
    expect(ok(num("1/2"), "0.5000001")).toBe(false);
  });

  it("is right but says to simplify", () => {
    const r = checkAnswer(num("9/2"), "18/4");
    expect(r.correct).toBe(true);
    expect(r.note).toMatch(/simply/);
    expect(checkAnswer(num("9/2"), "9/2").note).toBeNull();
  });

  it("drops units", () => {
    expect(ok(num("100"), "100°", "°")).toBe(true);
    expect(ok(num("100"), "100 degrees", "°")).toBe(true);
    expect(ok(num("30"), "30 minutes", "minutes")).toBe(true);
    expect(ok(num("30"), "30 min", "minutes")).toBe(true);
    expect(ok(num("25"), "25 times", "times")).toBe(true);
  });

  it("marks unreadable answers so they can be fixed first", () => {
    expect(checkAnswer(num("12"), "twelve").readable).toBe(false);
    expect(checkAnswer(num("12"), "12").readable).toBe(true);
    expect(checkAnswer(num("12"), "").readable).toBe(false);
  });

  it("checks sets in any order, and says how many were found", () => {
    const s: AnswerSpec = { kind: "set", values: ["48", "60"] };
    expect(ok(s, "60, 48")).toBe(true);
    expect(ok(s, "48 and 60")).toBe(true);
    expect(ok(s, "48")).toBe(false);
    expect(checkAnswer(s, "48").note).toBe("You found 1 of the 2 answers.");
    expect(checkAnswer(s, "48, 60, 72").note).toMatch(/extra/);
    expect(ok({ kind: "set", values: ["-6", "-21/16"] }, "-21/16, -6")).toBe(true);
  });

  it("checks sets of tuples and sets of sets", () => {
    const triples: AnswerSpec = { kind: "set", values: [{ kind: "tuple", values: ["13", "2", "8"] }, { kind: "tuple", values: ["5", "6", "4"] }] };
    expect(ok(triples, "(5,6,4), (13,2,8)")).toBe(true);
    expect(ok(triples, "(6,5,4), (13,2,8)")).toBe(false); // order inside a triple matters
    const pairs: AnswerSpec = { kind: "set", values: [{ kind: "set", values: ["14", "19"] }, { kind: "set", values: ["15", "18"] }, { kind: "set", values: ["16", "17"] }] };
    expect(ok(pairs, "{19,14}, {15,18}, {17,16}")).toBe(true);
    expect(ok(pairs, "(14,19),(15,18)")).toBe(false);
  });

  it("checks 'any of' answers, tuples, words and times", () => {
    const abc: AnswerSpec = { kind: "any", options: [{ kind: "tuple", values: ["-12", "6", "24"] }, { kind: "tuple", values: ["-12", "24", "6"] }] };
    expect(ok(abc, "(-12, 24, 6)")).toBe(true);
    expect(ok(abc, "-12, 6, 24")).toBe(true);
    expect(ok(abc, "6, -12, 24")).toBe(false);
    const code: AnswerSpec = { kind: "any", options: [{ kind: "text", value: "AAOOOOAA" }, { kind: "text", value: "OOAAAAOO" }] };
    expect(ok(code, "ooaaaaoo")).toBe(true);
    expect(ok({ kind: "text", value: "Denise" }, " denise ")).toBe(true);
    expect(ok({ kind: "text", value: "23:57:33" }, "23.57.33")).toBe(true);
    expect(ok({ kind: "text", value: "23:57:33" }, "23:57:34")).toBe(false);
    const seq: AnswerSpec = { kind: "any", options: [{ kind: "tuple", values: ["4", "5", "8", "6"] }, { kind: "tuple", values: ["9", "6", "8", "4"] }] };
    expect(ok(seq, "9,6,8,4")).toBe(true);
  });

  it("tells the keypad which keys an answer needs", () => {
    expect(needsList(num("3"))).toBe(false);
    expect(needsList({ kind: "set", values: ["1", "2"] })).toBe(true);
    expect(needsLetters({ kind: "text", value: "Denise" })).toBe(true);
    expect(needsLetters({ kind: "text", value: "23:57:33" })).toBe(false);
    expect(needsColon({ kind: "text", value: "23:57:33" })).toBe(true);
  });
});
