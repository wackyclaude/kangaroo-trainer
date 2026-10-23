// Fails if anything that looks like contest material is tracked by git.
// The past papers are © Stichting Wiskunde Kangoeroe and must never be committed.
import { execFileSync } from "node:child_process";
import { readFileSync, statSync } from "node:fs";

const files = execFileSync("git", ["ls-files", "-z"], { encoding: "utf8" }).split("\0").filter(Boolean);
const FIXTURES = "tests/fixtures/content/";
const problems = [];
const bad = (f, why) => problems.push(`${f}: ${why}`);

for (const f of files) {
  const lower = f.toLowerCase();
  let size = 0;
  try {
    size = statSync(f).size;
  } catch {
    continue; // deleted in the working tree
  }
  if (/(^|\/)(bank|raw|content_en|solutions_nl)\//.test(lower)) bad(f, "question-bank folder");
  if (lower.endsWith(".pdf")) bad(f, "PDF files are not allowed");
  if (/(^|\/)(en|nl)_\d{4}\.json$/.test(lower) || /(^|\/)(review\.html|questions\.csv)$/.test(lower)) bad(f, "question-bank file");
  if (/\.(png|jpe?g|gif|webp|avif)$/.test(lower)) {
    const icon = f.startsWith("src/web/public/");
    const fixture = f.startsWith(`${FIXTURES}img/`) && size <= 1024;
    if (!icon && !fixture) bad(f, "pictures are only allowed as app icons or tiny test placeholders");
  }
  if (lower.endsWith("questions.json") && !(f.startsWith(FIXTURES) && size <= 20_000)) bad(f, "questions.json is only allowed as the small test fixture");
  if (lower.endsWith(".json") && !f.startsWith(FIXTURES) && f !== "package-lock.json" && size < 5_000_000) {
    const text = readFileSync(f, "utf8");
    if (/"(hint_en|solution_steps_en|solution_en|answer_official_key)"\s*:\s*["[]/.test(text)) bad(f, "looks like question content");
  }
  if (size > 1_000_000 && f !== "package-lock.json") bad(f, `large file (${Math.round(size / 1024)} KB)`);
}

if (problems.length) {
  console.error("Contest material check failed:\n  " + problems.join("\n  "));
  process.exit(1);
}
console.log(`Contest material check passed (${files.length} files).`);
