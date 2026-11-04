// Checks typed answers to Olympiad B-problems. Shared by the server (marking) and the web app (live preview).
// Answers are exact: whole numbers, fractions, mixed numbers, roots, π, several numbers, a word or a time.
import type { AnswerSpec } from "./types.js";

export interface Checked {
  correct: boolean;
  /** False when the answer can't be read as a number (the student is asked to fix it, nothing is saved). */
  readable: boolean;
  /** A friendly extra line, e.g. "simplify next time". */
  note: string | null;
}

const VULGAR: Record<string, string> = { "½": "1/2", "⅓": "1/3", "⅔": "2/3", "¼": "1/4", "¾": "3/4", "⅕": "1/5", "⅖": "2/5", "⅗": "3/5", "⅘": "4/5", "⅙": "1/6", "⅚": "5/6", "⅛": "1/8", "⅜": "3/8", "⅝": "5/8", "⅞": "7/8" };

/** Same symbols whatever keyboard typed them. */
export function normalise(input: string): string {
  // Fraction characters first: NFKC would turn 4½ into "41⁄2". 4½ means 4 + 1/2.
  const fractions = /[½⅓⅔¼¾⅕⅖⅗⅘⅙⅚⅛⅜⅝⅞]/g;
  return input
    .replace(/(\d)\s*([½⅓⅔¼¾⅕⅖⅗⅘⅙⅚⅛⅜⅝⅞])/g, (_, d: string, v: string) => `(${d}+${VULGAR[v]})`)
    .replace(fractions, (v) => `(${VULGAR[v]})`)
    .normalize("NFKC")
    .replace(/[−–—]/g, "-")
    .replace(/[×·⋅∙]/g, "*")
    .replace(/÷|⁄/g, "/")
    .replace(/\bsqrt\b/gi, "√")
    .replace(/\bpi\b/gi, "π")
    .replace(/\s+/g, " ")
    .trim();
}

/** Drops a unit the student typed after the number (100°, 30 minutes, 25 times). */
function stripUnit(s: string, unit: string | null | undefined): string {
  let out = s.replace(/\s*(°|degrees?|deg)\s*$/i, "");
  if (unit && unit !== "°") {
    const u = unit.toLowerCase();
    const forms = [u, u.replace(/s$/, ""), u.slice(0, 3)].filter((x) => x.length > 0);
    for (const f of forms) {
      const re = new RegExp(`\\s*${f.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\.?\\s*$`, "i");
      if (re.test(out)) {
        out = out.replace(re, "");
        break;
      }
    }
  }
  return out.trim();
}

const gcd = (a: number, b: number): number => (b === 0 ? Math.abs(a) : gcd(b, a % b));

function squareFactor(n: number): boolean {
  if (!Number.isInteger(n) || n < 1) return false;
  for (let k = 2; k * k <= n; k++) if (n % (k * k) === 0) return true;
  return n === 1;
}

interface Parsed {
  value: number;
  /** False when a fraction or root could be simpler (10/4, 8/1, √8). */
  simplified: boolean;
}

/** Parses one exact value. Returns null when it isn't a value. */
export function parseValue(raw: string): Parsed | null {
  let s = normalise(raw);
  if (!s) return null;
  // Mixed numbers: 4 1/2 means 4 + 1/2 (4½ was handled in normalise).
  let mixed = false;
  s = s.replace(/^(-?)(\d+) (\d+)\/(\d+)$/, (_, sign: string, w: string, n: string, d: string) => {
    mixed = true;
    return `${sign}(${w}+${n}/${d})`;
  });
  s = s.replace(/ /g, "");
  if (!/^[\d.+\-*/()√π]+$/.test(s)) return null;

  let i = 0;
  let simplified = true;
  const peek = () => s[i];

  const number = (): number | null => {
    const m = /^\d+(\.\d+)?|^\.\d+/.exec(s.slice(i));
    if (!m) return null;
    i += m[0].length;
    return Number(m[0]);
  };

  // primary := number | π | √primary | (expr)
  const primary = (): number | null => {
    const c = peek();
    if (c === undefined) return null;
    if (c === "π") {
      i++;
      return Math.PI;
    }
    if (c === "√") {
      i++;
      const start = i;
      const v = primary();
      if (v === null || v < 0) return null;
      const lit = s.slice(start, i);
      if (/^\d+$/.test(lit) && squareFactor(Number(lit))) simplified = false;
      return Math.sqrt(v);
    }
    if (c === "(") {
      i++;
      const v = expr();
      if (v === null || peek() !== ")") return null;
      i++;
      return v;
    }
    return number();
  };

  // factor := -factor | primary (implicit × before π, √ and brackets)
  const factor = (): number | null => {
    if (peek() === "-") {
      i++;
      const v = factor();
      return v === null ? null : -v;
    }
    if (peek() === "+") {
      i++;
      return factor();
    }
    let v = primary();
    if (v === null) return null;
    while (peek() === "π" || peek() === "√" || peek() === "(") {
      const w = primary();
      if (w === null) return null;
      v *= w;
    }
    return v;
  };

  const term = (): number | null => {
    const start = i;
    let v = factor();
    if (v === null) return null;
    while (peek() === "*" || peek() === "/") {
      const op = s[i++];
      const before = s.slice(start, i - 1);
      const at = i;
      const w = factor();
      if (w === null) return null;
      if (op === "/") {
        if (w === 0) return null;
        const num = before;
        const den = s.slice(at, i);
        if (/^-?\d+$/.test(num) && /^\d+$/.test(den)) {
          const n = Math.abs(Number(num));
          const d = Number(den);
          if (d === 1 || gcd(n, d) > 1 || (n >= d && !mixed && n % d === 0)) simplified = false;
        }
        v /= w;
      } else v *= w;
    }
    return v;
  };

  function expr(): number | null {
    let v = term();
    if (v === null) return null;
    while (peek() === "+" || peek() === "-") {
      const op = s[i++];
      const w = term();
      if (w === null) return null;
      v = op === "+" ? v + w : v - w;
    }
    return v;
  }

  const v = expr();
  if (v === null || i !== s.length || !Number.isFinite(v)) return null;
  return { value: v, simplified };
}

const same = (a: number, b: number) => Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(b));

/** Splits "1, 2 and 3" or "(1,2), (3,4)" at the top level, outside brackets. */
export function splitItems(raw: string): string[] {
  const s = normalise(raw).replace(/\s+(and|en|&)\s+/gi, ",");
  const out: string[] = [];
  let depth = 0;
  let cur = "";
  for (const ch of s) {
    if ("({[".includes(ch)) depth++;
    if (")}]".includes(ch)) depth--;
    if ((ch === "," || ch === ";") && depth === 0) {
      out.push(cur.trim());
      cur = "";
    } else cur += ch;
  }
  out.push(cur.trim());
  return out.filter((x) => x.length > 0);
}

/** Removes one pair of brackets around a whole item: (1, 2) → 1, 2. */
function unwrap(s: string): string {
  const t = s.trim();
  const pairs: Record<string, string> = { "(": ")", "{": "}", "[": "]" };
  const close = pairs[t[0] ?? ""];
  if (close && t.endsWith(close)) {
    let depth = 0;
    for (let k = 0; k < t.length; k++) {
      if ("({[".includes(t[k]!)) depth++;
      if (")}]".includes(t[k]!)) depth--;
      if (depth === 0 && k < t.length - 1) return t; // the brackets don't wrap the whole item
    }
    return t.slice(1, -1).trim();
  }
  return t;
}

const textKey = (s: string) => {
  const t = normalise(s).toLowerCase().replace(/\s+/g, "");
  return /^\d{1,2}[:.h]\d{2}([:.m]\d{2})?s?$/.test(t) ? t.replace(/[.hm]/g, ":").replace(/s$/, "") : t;
};

interface Match {
  ok: boolean;
  readable: boolean;
  simplified: boolean;
}

/** One expected item (a value string or a nested spec) against one typed item. */
function matchItem(expected: string | AnswerSpec, typed: string): Match {
  if (typeof expected !== "string") return match(expected, typed);
  const want = parseValue(expected);
  if (want === null) return { ok: textKey(expected) === textKey(typed), readable: true, simplified: true };
  const got = parseValue(typed);
  if (got === null) return { ok: false, readable: false, simplified: true };
  return { ok: same(got.value, want.value), readable: true, simplified: got.simplified };
}

/** Pairs typed items with expected ones in any order (the lists are short). */
function matchUnordered(expected: (string | AnswerSpec)[], typed: string[]): Match & { found: number } {
  const n = expected.length;
  const res = typed.map((t) => expected.map((e) => matchItem(e, t)));
  const readable = res.every((row) => row.some((m) => m.readable));
  let best = 0;
  let bestSimplified = true;
  const used = new Array<boolean>(n).fill(false);
  const go = (k: number, found: number, simp: boolean) => {
    if (k === typed.length) {
      if (found > best || (found === best && simp && !bestSimplified)) {
        best = found;
        bestSimplified = simp;
      }
      return;
    }
    let paired = false;
    for (let j = 0; j < n; j++) {
      const m = res[k]![j]!;
      if (!used[j] && m.ok) {
        paired = true;
        used[j] = true;
        go(k + 1, found + 1, simp && m.simplified);
        used[j] = false;
      }
    }
    if (!paired) go(k + 1, found, simp);
  };
  go(0, 0, true);
  return { ok: best === n && typed.length === n, readable, simplified: bestSimplified, found: best };
}

function match(spec: AnswerSpec, typed: string): Match {
  switch (spec.kind) {
    case "number": {
      if (parseValue(spec.value) === null) return { ok: false, readable: true, simplified: true }; // a broken bank value never matches
      const items = splitItems(typed);
      if (items.length !== 1) {
        // "4,5" may be a Dutch decimal comma.
        const dec = /^-?\d+,\d+$/.test(normalise(typed)) ? matchItem(spec.value, normalise(typed).replace(",", ".")) : null;
        if (dec?.ok) return dec;
        return { ok: false, readable: items.every((x) => parseValue(x) !== null), simplified: true };
      }
      return matchItem(spec.value, items[0]!);
    }
    case "text":
      return { ok: textKey(spec.value) === textKey(unwrap(typed)), readable: true, simplified: true };
    case "tuple": {
      const items = splitItems(unwrap(typed));
      const ms = spec.values.map((v, k) => (items[k] === undefined ? { ok: false, readable: true, simplified: true } : matchItem(v, items[k]!)));
      return { ok: items.length === spec.values.length && ms.every((m) => m.ok), readable: ms.every((m) => m.readable), simplified: ms.every((m) => m.simplified) };
    }
    case "set": {
      const m = matchUnordered(spec.values, splitItems(unwrap(typed)));
      return { ok: m.ok, readable: m.readable, simplified: m.simplified };
    }
    case "any": {
      const ms = spec.options.map((o) => match(o, typed));
      const hit = ms.find((m) => m.ok);
      return hit ?? { ok: false, readable: ms.some((m) => m.readable), simplified: true };
    }
  }
}

/** Marks a typed B-answer. */
export function checkAnswer(spec: AnswerSpec, input: string, unit?: string | null): Checked {
  const typed = stripUnit(normalise(input), unit);
  if (!typed) return { correct: false, readable: false, note: null };
  const m = match(spec, typed);
  if (m.ok) return { correct: true, readable: true, note: m.simplified ? null : "In the contest, write it as simply as you can (9/2, not 18/4)." };
  if (spec.kind === "set") {
    const part = matchUnordered(spec.values, splitItems(unwrap(typed)));
    if (part.found > 0 && part.found < spec.values.length) return { correct: false, readable: m.readable, note: `You found ${part.found} of the ${spec.values.length} answers.` };
    if (part.found === spec.values.length) return { correct: false, readable: m.readable, note: "All the right answers are there, but there's an extra one too." };
  }
  return { correct: false, readable: m.readable, note: null };
}

/** True for answers that need several values, so the keypad can show how to write them. */
export function needsList(spec: AnswerSpec): boolean {
  if (spec.kind === "any") return spec.options.some(needsList);
  return spec.kind === "set" || spec.kind === "tuple";
}

/** True for answers with letters (a name, a word, a code of letters). */
export function needsLetters(spec: AnswerSpec): boolean {
  if (spec.kind === "any") return spec.options.some(needsLetters);
  if (spec.kind === "text") return !/^[\d:.\s]+$/.test(spec.value);
  if (spec.kind === "number") return false;
  return spec.values.some((v) => (typeof v === "string" ? parseValue(v) === null : needsLetters(v)));
}

/** True for a time such as 23:57:33. */
export function needsColon(spec: AnswerSpec): boolean {
  if (spec.kind === "any") return spec.options.some(needsColon);
  return spec.kind === "text" && /:/.test(spec.value);
}
