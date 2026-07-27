#!/usr/bin/env node
// Structural guard for docs/review/05-a11y-coverage.md finding #3: a
// group-hover:opacity-* element that's invisible on keyboard focus because
// it has no group-focus-within:opacity-* (or focus:opacity-*) counterpart.
// Neither axe nor a testid-bound Playwright test can catch a *new*
// occurrence of this pattern in a not-yet-written component — see the
// report's "Ehrliche Antwort" section — so this is the only guard for it.
//
// ponytail: grep-based, not an AST/Tailwind-class parser. Flags any `class`/
// `:class` attribute containing `group-hover:opacity-` without a
// `group-focus-within:opacity-`/`focus:opacity-`/`focus-within:opacity-`
// substring in the same attribute. Upgrade path: swap for a real class-list
// parser if this starts producing false positives on bindings the regex
// can't see into (e.g. classes composed via a JS array pushed from a
// computed, rather than written inline in the template).
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const SRC_DIR = join(import.meta.dirname, "..", "packages", "frontend", "src");
const CLASS_ATTR = /:?class="([\s\S]*?)"/g;
const COUNTERPARTS = [
  "group-focus-within:opacity-",
  "focus:opacity-",
  "focus-within:opacity-",
];

const walk = (dir) =>
  readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return walk(path);
    return entry.name.endsWith(".vue") ? [path] : [];
  });

const findViolations = (file) => {
  const content = readFileSync(file, "utf-8");
  const violations = [];
  for (const match of content.matchAll(CLASS_ATTR)) {
    const classValue = match[1];
    if (!classValue.includes("group-hover:opacity-")) continue;
    if (COUNTERPARTS.some((counterpart) => classValue.includes(counterpart)))
      continue;
    const line = content.slice(0, match.index).split("\n").length;
    violations.push({ file, line, classValue });
  }
  return violations;
};

const violations = walk(SRC_DIR).flatMap(findViolations);

if (violations.length > 0) {
  console.error(
    "group-hover:opacity-* without a focus counterpart (invisible to keyboard users):\n",
  );
  for (const { file, line, classValue } of violations) {
    console.error(`  ${file}:${line}\n    ${classValue.trim()}\n`);
  }
  console.error(
    "Add a group-focus-within:opacity-*/focus:opacity-* class alongside group-hover:opacity-* so the element stays visible on keyboard focus.",
  );
  process.exit(1);
}

console.log("check:hover-focus-opacity — no violations");
