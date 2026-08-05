#!/usr/bin/env node
// Structural guard for two entries of the "Never" list in AGENTS.md, section
// "Comments": banner separators and commented-out code. Both were prose-only
// rules until now, and the banners proved what that is worth — 284 separator
// lines across 32 files survived lint, review and every agent delegation,
// because nothing ever failed on them.
//
// Deliberately *not* checked: "JSDoc that repeats the signature", the third
// entry of that list. This repo has 623 JSDoc blocks and not one of them
// consists purely of @param/@returns tags, so the cheap structural version of
// that rule would find nothing; the real question — whether the prose restates
// the signature — is semantic, and a scanner that guessed at it would either
// flag every documented function or none. Leaving it out is the honest
// position, not an oversight: it belongs in review, not in a grep.
//
// ponytail: line-based regexes, no AST and no JS/TS parser. A "banner" is any
// comment line that is nothing but 5+ repeats of -, =, * or _, or a heading
// framed by two such runs; a "commented-out code" line is matched against an
// explicit list of statement shapes. Known blind spots, in the order worth fixing: a commented-out block
// whose lines are all fragments too short to match a shape (`//   title,`),
// and the same defects inside `/* … */` blocks, which are only seen through
// their ` * ` continuation lines. Upgrade path: feed each comment's text to a
// real parser (`@babel/parser` in errorRecovery mode) and flag it when it
// yields statements rather than an error — then the shape list disappears.
//
// The shape list replaces the obvious "ends with ; { }" heuristic on purpose.
// Seven comments in packages/*/src end a *wrapped English sentence* with a
// semicolon ("…as soon as the years counted so far prove it;"), so that
// heuristic starts life with seven false positives and would be switched off
// within a week.
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const PACKAGES = ["shared", "backend", "frontend"];
const SRC_DIRS = PACKAGES.map((name) =>
  join(import.meta.dirname, "..", "packages", name, "src"),
);

// Nothing but repeats of a box-drawing character. A URL keeps its `--`/`==`
// only in the middle of a line, never as the whole comment, so it never
// matches; the same holds for an ASCII table, whose rows carry column text.
const BANNER = /^\s*(?:\/\/|\*)\s*[-=*_]{5,}\s*[-=*_]*\s*$/;

// The same separator with a heading wedged into it (`// ----- Helpers -----`).
// Three repeats are enough where the bare line needs five, because the heading
// framed by them carries the evidence the bare line lacks. An ASCII table row
// breaks its runs with `|` or `+`, so barring those two characters from the
// heading keeps every table row out.
const TITLED_BANNER =
  /^\s*(?:\/\/|\*)\s*[-=*_]{3,}[^|+]*\w[^|+]*[-=*_]{3,}\s*$/;

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

const walk = (dir) =>
  readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return walk(path);
    return /\.(ts|vue)$/.test(entry.name) ? [path] : [];
  });

// Rule 1 — a separator line. AGENTS.md lists banners under "Never" because
// they are pure noise: every one of the 284 removed in 2026-08 sat above a
// heading that either restated the next identifier or said "Helpers".
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
  const files = SRC_DIRS.flatMap(walk);
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
