// The "accepts" cases carry the weight here. Both rules match comment text
// with regexes, and a comment scanner that fires on prose gets switched off
// after its first false alarm — so every shape that looks like a violation
// without being one is pinned down next to the defect it resembles.
import assert from "node:assert/strict";
import test from "node:test";

import {
  findBannerViolations,
  findCommentedOutCodeViolations,
} from "./check-comments.mjs";

const lines = (...entries) => `${entries.join("\n")}\n`;

test("rule 1 flags a separator line and reports where it sits", () => {
  const content = lines(
    "const first = 1",
    "// -----------------------------------------------------------------",
    "const second = 2",
  );

  const violations = findBannerViolations("queue-sorter.ts", content);

  assert.equal(violations.length, 1);
  assert.equal(violations[0].file, "queue-sorter.ts");
  assert.equal(violations[0].line, 2);
  assert.equal(violations[0].expression, `// ${"-".repeat(65)}`);
});

test("rule 1 flags every box-drawing character, and the block-comment form", () => {
  const content = lines(
    "// =====",
    "// *****",
    "// _____",
    "/**",
    " * ---------------",
    " */",
  );

  const violations = findBannerViolations("Banner.vue", content);

  assert.deepEqual(
    violations.map(({ line, expression }) => [line, expression]),
    [
      [1, "// ====="],
      [2, "// *****"],
      [3, "// _____"],
      [5, "* ---------------"],
    ],
  );
});

// The threshold is 5 repeats, checked from both sides: four is the longest
// run the rule must stay silent about, five the shortest it must catch.
test("rule 1 draws the line at five repeats", () => {
  assert.deepEqual(
    findBannerViolations("a.ts", lines("// ----", "// ===")),
    [],
  );

  assert.deepEqual(
    findBannerViolations("a.ts", lines("// -----", "// ====="))
      .map(({ expression }) => expression)
      .sort(),
    ["// -----", "// ====="],
  );
});

test("rule 1 leaves a short dash and an em-dash aside alone", () => {
  const content = lines(
    "// --",
    "// the cap is a guess -- LMS never reports the real one",
    "// two spaces and a dash: - - -",
  );

  assert.deepEqual(findBannerViolations("useQueue.ts", content), []);
});

// A URL keeps its `--`/`==` in the middle of a line; only a comment that is
// nothing but the repeated character is a separator.
test("rule 1 leaves a URL carrying -- or == alone", () => {
  const content = lines(
    "// see https://tidal.com/browse?filter=a--b for the id format",
    "// docs: https://example.com/q?a==b&c==d",
    "// https://example.com/a--b",
  );

  assert.deepEqual(findBannerViolations("tidal-client.ts", content), []);
});

// The plain separator only matches a line that is *nothing but* repeats, so a
// heading between two runs used to walk straight through the rule.
test("rule 1 flags a heading framed by two separator runs", () => {
  const content = lines(
    "// ----- Helpers -----",
    "// === WHEN ===",
    "/**",
    " * --- Fixtures ---------------------------------",
    " */",
  );

  const violations = findBannerViolations("radio-service.test.ts", content);

  assert.deepEqual(
    violations.map(({ line, expression }) => [line, expression]),
    [
      [1, "// ----- Helpers -----"],
      [2, "// === WHEN ==="],
      [4, `* --- Fixtures ${"-".repeat(33)}`],
    ],
  );
});

// The reason the plain separator demands "nothing but repeats": an ASCII table
// carries column text between its runs too. The column break — `|` or `+` — is
// what tells the two apart, so both spellings have to stay silent.
test("rule 1 leaves an ASCII table alone", () => {
  const content = lines(
    "/**",
    " * | id               | title                            |",
    " * |------------------|----------------------------------|",
    " * +------------------+----------------------------------+",
    " * ------- id --------|------- title --------",
    " */",
  );

  assert.deepEqual(findBannerViolations("tidalUtils.ts", content), []);
});

test("rule 1 leaves prose and code carrying a run of dashes alone", () => {
  const content = lines(
    "// At exact expiry: Date.now() === expireAt → NOT < expireAt → expired",
    "// the fallback is a guess --- LMS never reports the real one",
    "// v-if=\"album.source === 'tidal'\" — empty string is falsy → no button",
  );

  assert.deepEqual(findBannerViolations("status-poller.ts", content), []);
});

// The framed form needs a run on *both* sides; two repeats are the longest the
// rule stays silent about, three the shortest it catches.
test("rule 1 draws the framed line at three repeats on each side", () => {
  assert.deepEqual(
    findBannerViolations(
      "a.ts",
      lines("// -- Helpers --", "// --- Helpers", "// Helpers ---"),
    ),
    [],
  );

  assert.deepEqual(
    findBannerViolations("a.ts", lines("// --- Helpers ---")).map(
      ({ expression }) => expression,
    ),
    ["// --- Helpers ---"],
  );
});

test("rule 2 flags a declaration that was commented out instead of deleted", () => {
  const content = lines("const limit = 50", "// const old = 2", "return limit");

  const violations = findCommentedOutCodeViolations("album-scorer.ts", content);

  assert.equal(violations.length, 1);
  assert.equal(violations[0].file, "album-scorer.ts");
  assert.equal(violations[0].line, 2);
  assert.equal(violations[0].expression, "const old = 2");
});

test("rule 2 flags the statement shapes a disabled block leaves behind", () => {
  const content = lines(
    "// import { logger } from './logger'",
    "// export const DEFAULT_LIMIT = 50",
    "// if (!result.ok) {",
    "// await store.loadQueue()",
    "// return fallback;",
    "// logger.warn('queue empty');",
    "// })",
  );

  const violations = findCommentedOutCodeViolations("queue-route.ts", content);

  assert.deepEqual(
    violations.map(({ line, expression }) => [line, expression]),
    [
      [1, "import { logger } from './logger'"],
      [2, "export const DEFAULT_LIMIT = 50"],
      [3, "if (!result.ok) {"],
      [4, "await store.loadQueue()"],
      [5, "return fallback;"],
      [6, "logger.warn('queue empty');"],
      [7, "})"],
    ],
  );
});

// The case that decides whether this rule survives contact with the repo:
// English prose routinely opens with a keyword, and none of it is code.
test("rule 2 leaves prose that opens with a keyword alone", () => {
  const content = lines(
    "// return values are cached for an hour",
    "// if the client stops agreeing with the cap, widen it here",
    "// for every album we keep the release year, never the full date",
    "// while the request is in flight the list keeps its old order",
    "// switch to the compact layout below 480px",
    "// import order matters: the polyfill has to run first",
    "// export the helper so the route test can reach it",
    "// let the caller decide how to render the error",
    "// await is deliberate here — the banner must not flash",
    "// function names in this file are verbs on purpose",
    "// catch blocks are banned in core; errors are values",
  );

  assert.deepEqual(
    findCommentedOutCodeViolations("useLibrary.ts", content),
    [],
  );
});

// Quoting code to explain a why is the point of a comment, not a violation.
test("rule 2 leaves a comment that quotes code inside an explanation alone", () => {
  const content = lines(
    "// ohne den ?? 0 wirft LMS hier",
    "// the ?? 0 is load-bearing: LMS omits duration for radio streams",
    "// keep the trailing / — the proxy 301s without it",
  );

  assert.deepEqual(
    findCommentedOutCodeViolations("lms-client.ts", content),
    [],
  );
});

// The documented escape hatch, and the only one: a lead-in line ending in ':'
// followed by the indented quote, so a comment can name the shape it is
// arguing for. The lead-in precedes the first quoted line only, so a quote of
// several lines has to stay legal down to its last line.
test("rule 2 leaves an indented quote under a lead-in line alone", () => {
  const content = lines(
    "// Correct form:",
    "//   const t = (key: MessageKey): string => store.t(key)",
    "//   return t('queue.empty');",
    "",
    "// The shape the route used to have:",
    "//   if (!result.ok) {",
  );

  assert.deepEqual(findCommentedOutCodeViolations("useI18n.ts", content), []);
});

// Indentation on its own used to be a second, undocumented way out — two
// spaces and any statement was excused, no lead-in needed anywhere.
test("rule 2 flags an indented statement with no lead-in above it", () => {
  const content = lines(
    "const limit = 50",
    "//   const old = 2",
    "// the cap comes from LMS",
    "//   await store.loadQueue()",
    "",
    "//   return fallback;",
  );

  const violations = findCommentedOutCodeViolations("useQueue.ts", content);

  assert.deepEqual(
    violations.map(({ line, expression }) => [line, expression]),
    [
      [2, "const old = 2"],
      [4, "await store.loadQueue()"],
      [6, "return fallback;"],
    ],
  );
});

// The other half of the same conjunction: the lead-in excuses the *indented*
// quote under it, not an unindented statement that merely follows a colon.
test("rule 2 flags an unindented statement under a lead-in line", () => {
  const content = lines(
    "// Correct form:",
    "// const t = (key: MessageKey): string => store.t(key)",
  );

  const violations = findCommentedOutCodeViolations("useI18n.ts", content);

  assert.deepEqual(
    violations.map(({ line, expression }) => [line, expression]),
    [[2, "const t = (key: MessageKey): string => store.t(key)"]],
  );
});

test("rule 2 leaves an empty file and a file without comments alone", () => {
  assert.deepEqual(findCommentedOutCodeViolations("empty.ts", ""), []);
  assert.deepEqual(
    findCommentedOutCodeViolations("plain.ts", lines("const x = 1", "")),
    [],
  );
});
