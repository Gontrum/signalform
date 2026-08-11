// The "accepts" cases carry the weight here. Both rules match comment text
// with regexes, and a comment scanner that fires on prose gets switched off
// after its first false alarm — so every shape that looks like a violation
// without being one is pinned down next to the defect it resembles.
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { join, relative as relativePath } from "node:path";
import test from "node:test";

import {
  REPO_ROOT,
  findBannerViolations,
  findCommentedOutCodeViolations,
  trackedFiles,
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

// A heading has no minimum length. Spelling the corner guards as characters
// rather than lookarounds costs two of them, and then the shortest headings —
// exactly the ones a banner uses — are the ones that walk through.
test("rule 1 flags a framed heading of one and two characters", () => {
  const content = lines("// ---a---", "// ===IT===", "// ── x ──");

  const violations = findBannerViolations("a.ts", content);

  assert.deepEqual(
    violations.map(({ line }) => line),
    [1, 2, 3],
  );
});

// Box-drawing gets a lower threshold than `-=*_`, and the reason is the whole
// point of splitting the two: `─` has no second job in a comment, so two of
// them already mean "separator", whereas `--` still has to prove it. Of the 98
// banners this commit removes from inside the old walk's own scope, the gate
// reported zero — 96 because the character class was ASCII-only and the repo
// draws with `─`, the last 2 through the `+`-in-heading defect.
test("rule 1 flags a box-drawing separator", () => {
  const content = lines(
    `// ${"─".repeat(60)}`,
    `// ${"━".repeat(20)}`,
    `// ${"═".repeat(20)}`,
    "/**",
    ` * ${"─".repeat(30)}`,
    " */",
  );

  const violations = findBannerViolations("library.test.ts", content);

  assert.deepEqual(
    violations.map(({ line }) => line),
    [1, 2, 3, 5],
  );
});

test("rule 1 flags a heading framed by box-drawing, from two repeats up", () => {
  const content = lines(
    "// ── State ──────────────────────────",
    "// ─── getLibraryAlbums ───",
    "// ━━ WHEN ━━",
  );

  const violations = findBannerViolations("usePlaybackStore.ts", content);

  assert.deepEqual(
    violations.map(({ line }) => line),
    [1, 2, 3],
  );
});

// One repeat on either side is a dash pair around a word, which is prose.
test("rule 1 leaves a single box-drawing character on each side alone", () => {
  assert.deepEqual(
    findBannerViolations("a.ts", lines("// ─ State ─", "// the ─ marks a gap")),
    [],
  );
});

// The Unicode counterpart of the ASCII table, and what actually holds it out:
// `BOX_RULE` is the three horizontal characters only. Widen it to the whole box
// set and every corner and junction becomes rule material, so `┌──┬──┐` reads
// as two runs framing a heading and the table starts failing the gate.
test("rule 1 leaves a box-drawing table alone", () => {
  const content = lines(
    "/**",
    " * ┌──────────────────┬──────────────────┐",
    " * │ id               │ title            │",
    " * ├──────────────────┼──────────────────┤",
    " * └──────────────────┴──────────────────┘",
    " */",
  );

  assert.deepEqual(findBannerViolations("tidalUtils.ts", content), []);
});

// `+` next to the runs is a table corner; `+` inside the heading is prose. The
// old rule barred it everywhere between them, so a heading that named two
// things walked through untouched.
test("rule 1 flags a framed heading that contains a plus", () => {
  const violations = findBannerViolations(
    "search.ts",
    lines("// --- Artist-match validation + URL deduplication ---"),
  );

  assert.deepEqual(
    violations.map(({ expression }) => expression),
    ["// --- Artist-match validation + URL deduplication ---"],
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

// The gate's real defect was never a regex: it was the file list. Three `src`
// roots were named by hand, and 76 banners collected where that list did not
// reach. A rule that only runs on part of the repo reads as green over the part
// it cannot see, so each shape that broke it is pinned: a directory that is a
// sibling of `src`, one that is not under `packages` at all, and a config file
// at a package root, in an extension the old walk never opened.
test("the file list reaches past the src trees", () => {
  const scanned = trackedFiles().map((path) => relativePath(REPO_ROOT, path));

  const missing = [
    "packages/frontend/e2e/journeys/a11y.spec.ts",
    "docs/contributing/test-templates.md",
    "packages/frontend/eslint.config.js",
  ].filter((file) => !scanned.includes(file));

  assert.deepEqual(missing, []);
});

// The obvious way to scan every directory is `readdirSync` from the repo root,
// and it is wrong: it descends into `node_modules` and the build output, where
// third-party banners would bury every real finding. `git ls-files` gets the
// exclusion for free, because none of that is tracked. This pins it against the
// readdir shortcut, and only means something while `node_modules` is on disk —
// hence the guard. Paths are relativised first, or a checkout that itself sits
// under a directory named `dist` fails on its own location.
test("the file list skips untracked build output", () => {
  assert.ok(
    existsSync(join(REPO_ROOT, "node_modules")),
    "node_modules is not installed — the exclusion would pass vacuously",
  );

  const stray = trackedFiles()
    .map((path) => relativePath(REPO_ROOT, path))
    .filter((path) =>
      /(^|\/)(node_modules|dist|dev-dist|coverage|playwright-report)\//.test(
        path,
      ),
    );

  assert.deepEqual(stray, []);
});

// Markdown is scanned for the templates under docs/contributing, which are
// copied into new specs — a banner surviving in one of them writes more of
// itself. Prose is the risk that buys, and most of it is safe: `---` under a
// heading is Markdown's own horizontal rule, and the violation shapes start at
// a `//` or `*` lead. A bullet is that lead, so `  * ------` does flag; it
// reads as a banner to a human too, and no tracked `.md` carries one.
test("markdown prose is not mistaken for a comment", () => {
  const content = lines(
    "# Heading",
    "---",
    "===",
    "***",
    "Some **bold** prose and a --- dash run.",
    "",
    "```ts",
    "// ─── Helpers ─────────────────────────",
    "```",
  );

  assert.deepEqual(
    findBannerViolations("guide.md", content).map(({ line }) => line),
    [8],
  );
});

// The collateral the gate knowingly accepts, and it is one fact rather than a
// list: `*` is the lead a block comment continuation uses, so wherever Markdown
// spends one as the first non-whitespace character, the gate reads the rest of
// the line as comment text. Bullets are only the common case — `*---text---*`
// is emphasis, not a list item, and flags all the same. Enumerating shapes
// instead of the cause is how this comment was wrong twice, so the silent half
// is pinned beside the flagging half: the boundary is what leads the line, not
// whether Markdown calls it a bullet.
test("a leading asterisk is read as a comment lead, and that is documented", () => {
  const flagged = lines(
    "* ----------",
    "      * ----------",
    "\t* ----------",
    "  * === Note ===",
    "* ***Important***",
    "* ___emphasis___",
    "*---text---*",
    "**--------**",
    "****text****",
    "******",
  );

  assert.deepEqual(
    findBannerViolations("guide.md", flagged).map(({ line }) => line),
    [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
  );

  const silent = lines(
    "- ***Important***",
    "***bold italic***",
    "*****",
    "* **Note** and text",
    "* *italic*",
    "*__init__*",
  );

  assert.deepEqual(findBannerViolations("guide.md", silent), []);
});

// The second lead, and the one easy to forget because Markdown has no use for
// it: a prose line that opens with `//` is read as a comment outright, asterisk
// or not. Rare enough that no tracked `.md` has ever carried one, which is
// exactly why it needs pinning rather than remembering.
test("a leading slash-slash is read as a comment lead in markdown too", () => {
  const content = lines(
    "// ----------",
    "  // --- Note ---",
    "https://example.com/a--b",
  );

  assert.deepEqual(
    findBannerViolations("guide.md", content).map(({ line }) => line),
    [1, 2],
  );
});
