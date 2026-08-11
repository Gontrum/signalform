#!/usr/bin/env node
// Structural guard for two entries of the "Never" list in AGENTS.md, section
// "Comments": banner separators and commented-out code. Both were prose-only
// rules until now, and the banners proved what that is worth — 269 separator
// lines across 40 files survived lint, review and every agent delegation,
// because nothing ever failed on them.
//
// Deliberately *not* checked: "JSDoc that repeats the signature", the third
// entry of that list. Not one JSDoc block in this repo consists purely of
// @param/@returns tags, so the cheap structural version of that rule would
// find nothing; the real question — whether the prose restates the signature —
// is semantic, and a scanner that guessed at it would either flag every
// documented function or none. Leaving it out is the honest position, not an
// oversight: it belongs in review, not in a grep.
//
// ponytail: line-based regexes, no AST and no JS/TS parser. A "banner" is any
// comment line that is nothing but repeats of -, =, *, _ or box-drawing, or a
// heading framed by two such runs; a "commented-out code" line is matched
// against an explicit list of statement shapes. Known blind spots, in the order
// worth fixing: a commented-out block whose lines are all fragments too short
// to match a shape (`//   title,`), and the same defects inside `/* … */`
// blocks, which are only seen through their ` * ` continuation lines. Upgrade
// path: feed each comment's text to a real parser (`@babel/parser` in
// errorRecovery mode) and flag it when it yields statements rather than an
// error — then the shape list disappears.
//
// The shape list replaces the obvious "ends with ; { }" heuristic on purpose.
// Seven comments in packages/*/src end a *wrapped English sentence* with a
// semicolon ("…as soon as the years counted so far prove it;"), so that
// heuristic starts life with seven false positives and would be switched off
// within a week.
import { execSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

export const REPO_ROOT = join(import.meta.dirname, "..");

// Two alphabets draw a separator, and they need different thresholds. `-=*_`
// carry meaning elsewhere — a URL keeps its `--`, an ASCII table its `+` — so
// they only count in longer runs. Box-drawing (`─`, `━`, `═`) has no other
// use in a comment; two of them in a row are already a rule, never prose.
const ASCII_RULE = String.raw`-=*_`;
const BOX_RULE = String.raw`─━═`;
const ANY_RULE = ASCII_RULE + BOX_RULE;

// The three comment leads this repo writes. `#` covers shell and YAML, and it
// costs nothing in the other file types: `#` opens a private field in JS and an
// ATX heading in Markdown, and neither is followed by a run of rule characters.
const LEAD = String.raw`(?:\/\/|\*|#)`;

// Nothing but repeats. A URL keeps its `--`/`==` only in the middle of a line,
// never as the whole comment, so it never matches; the same holds for an ASCII
// table, whose rows carry column text.
const BANNER = new RegExp(
  `^\\s*${LEAD}\\s*[${ANY_RULE}]{5,}\\s*[${ANY_RULE}]*\\s*$`,
);

// The same separator with a heading wedged into it (`// ----- Helpers -----`).
// Fewer repeats are enough than the bare line needs, because the heading framed
// by them carries the evidence the bare line lacks. An ASCII table row breaks
// its runs with `|`, so barring that from the heading keeps every table row
// out; the corner guards keep a row spelled with `+` out too, and are
// lookarounds rather than characters so that a one-letter heading
// (`// ---AC---`) still has to pass them instead of being too short to match.
// Being zero-width, they let a `+` sit just inside the heading, so
// `// ----+a+----` is a violation — a real table row always carries a `|` or an
// outer corner, and both still block.
const titledBanner = (rule, repeats) =>
  `[${rule}]{${repeats},}(?!\\+)[^|]*\\w[^|]*(?<!\\+)[${rule}]{${repeats},}`;
const TITLED_BANNER = new RegExp(
  `^\\s*${LEAD}\\s*(?:${titledBanner(ASCII_RULE, 3)}|${titledBanner(BOX_RULE, 2)})\\s*$`,
);

// One entry per statement shape that a commented-out line can take. Each is
// anchored and demands the punctuation the shape needs — `if` requires its
// parenthesis, so the sentence "// if the client stops agreeing with the cap"
// stays prose, and `switch (not \`border-${variant}/30\`) so every class` in
// Banner.vue stays prose because it never closes into a block.
const CODE_SHAPES = [
  /^(?:const|let|var)\s+[A-Za-z_$[{][\w$]*\s*[=:]/,
  /^return\b.*[;)]$/,
  /^return$/,
  /^(?:if|for|while|switch|catch)\s*\(.*\)\s*\{?$/,
  /^(?:await|yield)\s+[\w$.]+\s*\(/,
  /^(?:async\s+)?function\s+[\w$]*\s*\(/,
  /^import\s+(?:[\w${}*,\s]+\s+from\s+)?['"]/,
  /^export\s+(?:const|let|default|async|function|type|interface|class|\{|\*)/,
  /^[\w$.]+(?:\?\.)?[\w$.]*\s*=\s*[^=].*;$/,
  /^[\w$.]+\([^;]*\);$/,
  /^[)\]}]+[;,]?$/,
];

// The one convention this repo uses to *quote* code inside an explanation. It
// has to stay legal: the rule exists to delete dead code, not to stop a
// comment from naming the correct form it is arguing for.
//   // Correct form:
//   //   const t = (key: MessageKey): string => store.t(key)
// Indentation on its own is a one-keystroke way out of the rule, so it only
// excuses a line together with the lead-in above it, never by itself.
const QUOTED_BY_INDENT = /^ {2,}\S/;
const LEAD_IN = /^\s*\/\/.*:\s*$/;
const COMMENT = /^\s*\/\/(.*)$/;

// The lead-in only precedes the *first* quoted line, so a multi-line quote is
// traced back through its own indented lines before the lead-in is demanded.
const opensUnderLeadIn = (lines, index) => {
  for (let cursor = index - 1; cursor >= 0; cursor -= 1) {
    const match = COMMENT.exec(lines[cursor]);
    if (!match) return false;
    if (LEAD_IN.test(lines[cursor])) return true;
    if (!QUOTED_BY_INDENT.test(match[1])) return false;
  }
  return false;
};

// The gate's real defect was never a regex: it was the file list. Three `src`
// roots were named by hand, and 76 banners collected where that list did not
// reach — 66 in `packages/frontend/e2e`, 8 in `docs`, 2 in an
// `eslint.config.js` at a package root. `git ls-files` needs no such list and
// cannot grow a directory-shaped blind spot: nothing untracked (`dist`,
// `node_modules`) is ever scanned, and no tracked directory is ever missed.
// `existsSync` covers the one gap that leaves — a tracked file deleted in the
// worktree but not yet staged.
//
// The extension list is the other half of the same lesson. It first covered
// only what JS and TS are written in, and 95 further banners sat in the four
// `#`-commented files that left out — install.sh alone held 60. `.sh`, `.yml`
// and the `#` lead were added rather than the files named, so the next shell
// script is covered on the day it is written.
//
// Markdown is scanned for its fenced code blocks, not its prose, and the rules
// do reach the prose. Both leads they accept — `*` and `//` — occur in prose as
// themselves, and every false positive follows from that. `//` is the rarer
// one: a line of Markdown that opens with it is read as a comment outright.
// `*` is the common one, because it is the lead a block comment continuation
// uses and Markdown spends it on bullets and emphasis alike. Neither lead cares
// about indentation — the match starts at the first non-whitespace character,
// so a nested list item is no safer than a flush one. That covers a bullet
// whose item is a rule or a framed heading (`  * ------`, `  * --- Note ---`),
// a bullet carrying a bold-italic run (`* ***Important***`), and emphasis with
// no bullet at all (`*---text---*`, `**--------**`) — plus any asterisk run
// long enough to survive the lead being eaten, so `******` flags where `*****`
// does not. A `-` bullet, a bare `---`/`***`/`===`, and a `**bold**` run inside
// a sentence never reach the rules. No flagging shape occurs in any tracked
// `.md`, and each reads as a banner to a human too.
export const trackedFiles = () =>
  execSync("git ls-files -z", { cwd: REPO_ROOT, encoding: "utf-8" })
    .split("\0")
    .filter((file) => /\.(ts|vue|md|mjs|js|cjs|sh|yml|yaml)$/.test(file))
    .map((file) => join(REPO_ROOT, file))
    .filter(existsSync);

// Rule 1 — a separator line. AGENTS.md lists banners under "Never" because they
// are nearly always noise: of the 174 removed when this gate landed, 168 framed
// a heading, and those headings were section labels, step narration or a
// restated identifier. The few that carried a fact kept the fact — rewritten as
// the prose sentence it should have been.
export const findBannerViolations = (file, content) => {
  const violations = [];
  content.split("\n").forEach((line, index) => {
    if (!BANNER.test(line) && !TITLED_BANNER.test(line)) return;
    violations.push({ file, line: index + 1, expression: line.trim() });
  });
  return violations;
};

// Rule 2 — a statement that was commented out instead of deleted. Git keeps
// the old version; a commented-out line only tells the next reader that
// somebody was unsure, and it silently rots out of sync with the code around
// it.
export const findCommentedOutCodeViolations = (file, content) => {
  const lines = content.split("\n");
  const violations = [];
  lines.forEach((line, index) => {
    const match = COMMENT.exec(line);
    if (!match) return;
    if (QUOTED_BY_INDENT.test(match[1]) && opensUnderLeadIn(lines, index))
      return;
    const text = match[1].trim();
    if (!CODE_SHAPES.some((shape) => shape.test(text))) return;
    violations.push({ file, line: index + 1, expression: text });
  });
  return violations;
};

const RULES = [
  {
    title: "banner comment — a decorative separator line",
    hint: "Delete the separator. If the section heading under it — or framed by it — only restates the next identifier, delete that too.",
    find: findBannerViolations,
  },
  {
    title: "commented-out code — a statement disabled instead of deleted",
    hint: "Delete it; git has the old version. To quote code inside an explanation, indent it by two spaces under a lead-in line ending in ':' — indentation without that lead-in is not enough.",
    find: findCommentedOutCodeViolations,
  },
];

const main = () => {
  const files = trackedFiles();
  const results = RULES.map((rule) => ({
    rule,
    violations: files.flatMap((file) =>
      rule.find(file, readFileSync(file, "utf-8")),
    ),
  }));
  const total = results.reduce(
    (sum, result) => sum + result.violations.length,
    0,
  );

  if (total === 0) {
    console.log("check:comments — no violations");
    return;
  }

  for (const { rule, violations } of results) {
    if (violations.length === 0) continue;
    console.error(`${rule.title}:\n`);
    for (const { file, line, expression } of violations) {
      console.error(`  ${file}:${line}\n    ${expression}\n`);
    }
    console.error(`${rule.hint}\n`);
  }
  process.exit(1);
};

if (import.meta.main) main();
