#!/usr/bin/env node
// Structural guard for the three i18n defects that shipped in the 2026-08
// translation pass. Roughly 50 hardcoded English labels and two leaked
// placeholders survived tests, lint, knip *and* review — they were only ever
// found by hand-grepping, and every round of that missed a different spelling.
// Each rule below encodes one of those real failures; see the rule headers.
// The prose version lives in packages/frontend/CLAUDE.md ("User-facing text").
//
// ponytail: grep + a hand-rolled string-literal scanner, not an AST or the
// Vue template compiler. It sees literals inside `aria-label`/`alt` bindings,
// one level of same-file `const` behind a bare binding, and the defaults of
// `alt`/`ariaLabel`/`title` props — nothing else.
// Known blind spots, in the order worth fixing: labels assembled in a
// *composable* (cross-file resolution), `title`/placeholder attributes and
// visible text nodes, and non-literal English (a string built from a
// `Record<string, string>` map). Upgrade path: parse
// SFCs with `@vue/compiler-sfc` and walk the expression AST, then the literal
// scanner and the "two letters in a row" heuristic both disappear.
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const SRC_DIR = join(import.meta.dirname, "..", "packages", "frontend", "src");
const I18N_FILE = join(SRC_DIR, "i18n", "index.ts");

// Brand names stay untranslated inside a sentence, so a label made of nothing
// but a proper noun is fine. "Tidal albums" still trips: only the noun is
// removed before the letter test, the rest of the label remains.
const PROPER_NOUNS = [
  "Signalform",
  "Tidal",
  "Qobuz",
  "Last.fm",
  "LMS",
  "MAC",
  "FLAC",
];

// FCIS puts the substitution in a pure core function often enough that a
// window without `.replace(` is not automatically a leak. Exhaustive and
// explicit on purpose: a new helper has to be declared here, which is a
// visible act, rather than the rule quietly accepting any wrapping call.
const SUBSTITUTION_HELPERS = ["buildDecadeScopeMessage"];

// `alt` is an accessible name like `aria-label` is, and it broke the same way.
// The lookbehind keeps `data-alt` and friends out; `aria-labelledby` never
// matches because the attribute must be followed by `="`.
const ACCESSIBLE_NAME_ATTR = /(?<![\w-])(:?)(?:aria-label|alt)="([\s\S]*?)"/g;
// The same names as props, where a default value reaches the attribute without
// ever passing an `="…"` binding the rule above could see.
const ACCESSIBLE_NAME_PROP =
  /(?<![\w$.])(alt|ariaLabel|title)\s*[:=](?![=>])\s*/g;
const PLACEHOLDER = /\{[a-zA-Z][a-zA-Z0-9]*\}/g;
const MESSAGE_ENTRY =
  /'([\w.]+)':\s*(?:'((?:[^'\\]|\\.)*)'|"((?:[^"\\]|\\.)*)")/g;
const TWO_LETTERS = /[A-Za-z]{2}/;
// 'home.playTrack' is a key, not a label: dotted, no spaces, no punctuation.
const MESSAGE_KEY_SHAPE = /^[a-z][A-Za-z0-9]*(\.[A-Za-z0-9]+)+$/;
const BOUND_IDENTIFIER = /^([A-Za-z_$][\w$]*)(?:\.value)?\s*(?:\(|$)/;
// A translator read straight off the store, e.g. `const t = i18nStore.t`.
// `const { t } = storeToRefs(store)` is the other correct form and must not
// match — storeToRefs hands out a ref that keeps tracking the language.
const FROZEN_TRANSLATOR =
  /const\s+t\s*=\s*[A-Za-z_$][\w$]*(?:\.[\w$]+)*\.t\s*(?![(.\w])/g;

const walk = (dir, extensions) =>
  readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return walk(path, extensions);
    if (/\.(test|spec)\.[cm]?tsx?$/.test(entry.name)) return [];
    return extensions.some((extension) => entry.name.endsWith(extension))
      ? [path]
      : [];
  });

const lineOf = (content, index) => content.slice(0, index).split("\n").length;

const skipQuoted = (source, start) => {
  const quote = source[start];
  let index = start + 1;
  while (index < source.length && source[index] !== quote) {
    index += source[index] === "\\" ? 2 : 1;
  }
  return index + 1;
};

// Index just past the `}` that closes a `${` interpolation opened at `start`
// (the index of the `{`). Quoted spans are skipped so a `'}'` inside the
// expression does not close it early.
const endOfInterpolation = (source, start) => {
  let index = start + 1;
  let depth = 1;
  while (index < source.length && depth > 0) {
    const char = source[index];
    if (char === "'" || char === '"' || char === "`") {
      index =
        char === "`" ? endOfTemplate(source, index) : skipQuoted(source, index);
      continue;
    }
    if (char === "{") depth += 1;
    if (char === "}") depth -= 1;
    index += 1;
  }
  return index;
};

const CLOSERS = { "(": ")", "{": "}", "[": "]" };

// Index just past the bracket closing the one opened at `open`. Quoted and
// template spans are skipped so a bracket inside a string cannot unbalance it.
const endOfBracketed = (source, open) => {
  const stack = [];
  let index = open;
  while (index < source.length) {
    const char = source[index];
    if (char === "'" || char === '"') {
      index = skipQuoted(source, index);
      continue;
    }
    if (char === "`") {
      index = endOfTemplate(source, index);
      continue;
    }
    if (CLOSERS[char]) stack.push(CLOSERS[char]);
    else if (char === stack.at(-1)) {
      stack.pop();
      if (stack.length === 0) return index + 1;
    }
    index += 1;
  }
  return source.length;
};

const endOfTemplate = (source, start) => {
  let index = start + 1;
  while (index < source.length && source[index] !== "`") {
    if (source[index] === "\\") {
      index += 2;
      continue;
    }
    if (source[index] === "$" && source[index + 1] === "{") {
      index = endOfInterpolation(source, index + 1);
      continue;
    }
    index += 1;
  }
  return index + 1;
};

const isTranslatorArgument = (source, quoteIndex) =>
  /(^|[^\w$])t\(\s*$/.test(source.slice(0, quoteIndex));

// Every piece of literal text in a JS-ish expression: quoted strings plus the
// static chunks of template literals. Interpolations are scanned recursively,
// so `${cond ? t('a') : 'Play'}` still surfaces the 'Play'.
const collectLiterals = (source, offset = 0) => {
  const literals = [];
  let index = 0;
  while (index < source.length) {
    const char = source[index];
    if (char === "'" || char === '"') {
      const end = skipQuoted(source, index);
      literals.push({
        text: source.slice(index + 1, end - 1),
        index: offset + index,
        isKey: isTranslatorArgument(source, index),
      });
      index = end;
      continue;
    }
    if (char === "`") {
      const end = endOfTemplate(source, index);
      let chunkStart = index + 1;
      let inner = chunkStart;
      while (inner < end - 1) {
        if (source[inner] === "\\") {
          inner += 2;
          continue;
        }
        if (source[inner] === "$" && source[inner + 1] === "{") {
          literals.push({
            text: source.slice(chunkStart, inner),
            index: offset + chunkStart,
            isKey: false,
          });
          const interpolationEnd = endOfInterpolation(source, inner + 1);
          literals.push(
            ...collectLiterals(
              source.slice(inner + 2, interpolationEnd - 1),
              offset + inner + 2,
            ),
          );
          inner = interpolationEnd;
          chunkStart = inner;
          continue;
        }
        inner += 1;
      }
      literals.push({
        text: source.slice(chunkStart, end - 1),
        index: offset + chunkStart,
        isKey: false,
      });
      index = end;
      continue;
    }
    index += 1;
  }
  return literals;
};

const stripKnownWords = (text) =>
  PROPER_NOUNS.reduce(
    (rest, noun) => rest.split(noun).join(" "),
    text.replace(PLACEHOLDER, " "),
  );

const isEnglishWording = (literal) =>
  !literal.isKey &&
  !MESSAGE_KEY_SHAPE.test(literal.text.trim()) &&
  TWO_LETTERS.test(stripKnownWords(literal.text));

// The `const <name> = …` body in the same file, so a label routed through a
// named computed is judged by what that computed actually builds.
const findDefinition = (content, name) => {
  const declaration = new RegExp(`\\bconst\\s+${name}\\s*=`, "g");
  const match = declaration.exec(content);
  if (!match) return undefined;
  const start = match.index + match[0].length;
  const lineEnd = content.indexOf("\n", start);
  const opener = content.slice(start, lineEnd === -1 ? undefined : lineEnd);
  const openerIndex = opener.search(/[({[]/);
  if (openerIndex === -1) {
    return { text: opener, index: start };
  }
  const end = endOfBracketed(content, start + openerIndex);
  return { text: content.slice(start, end), index: start };
};

// The one place a prop default can live in each spelling this repo may use:
// the trailing object of `withDefaults(defineProps<P>(), { … })`, and the
// binding pattern of the 3.5 form `const { … } = defineProps<P>()`. Both are
// returned as plain `{ … }` source so the same literal scanner reads them.
const findPropDefaultRegions = (content) => {
  const regions = [];
  for (const match of content.matchAll(/withDefaults\s*\(/g)) {
    const callEnd = endOfBracketed(content, match.index + match[0].length - 1);
    let index = match.index + match[0].length;
    // The last brace at argument level is the defaults object; an earlier one
    // is the inline type literal of `defineProps<{ … }>()`, which declares no
    // values and must not be read as if it did.
    let defaults;
    while (index < callEnd) {
      const char = content[index];
      if (char === "'" || char === '"') {
        index = skipQuoted(content, index);
        continue;
      }
      if (char === "`") {
        index = endOfTemplate(content, index);
        continue;
      }
      if (CLOSERS[char]) {
        const end = endOfBracketed(content, index);
        if (char === "{") defaults = { text: content.slice(index, end), index };
        index = end;
        continue;
      }
      index += 1;
    }
    if (defaults) regions.push(defaults);
  }
  for (const match of content.matchAll(/(?:const|let)\s+\{/g)) {
    const open = match.index + match[0].length - 1;
    const end = endOfBracketed(content, open);
    if (!/^\s*=\s*defineProps\b/.test(content.slice(end))) continue;
    regions.push({ text: content.slice(open, end), index: open });
  }
  return regions;
};

// The value expression of every `alt`/`ariaLabel`/`title` default in `region`,
// cut at the comma or brace that ends the property.
const findAccessibleNameDefaults = (region) => {
  const values = [];
  for (const match of region.text.matchAll(ACCESSIBLE_NAME_PROP)) {
    const start = match.index + match[0].length;
    let index = start;
    while (index < region.text.length) {
      const char = region.text[index];
      if (char === "'" || char === '"') {
        index = skipQuoted(region.text, index);
        continue;
      }
      if (char === "`") {
        index = endOfTemplate(region.text, index);
        continue;
      }
      if (CLOSERS[char]) {
        index = endOfBracketed(region.text, index);
        continue;
      }
      if (char === "," || char === "}") break;
      index += 1;
    }
    values.push({
      text: region.text.slice(start, index),
      index: region.index + start,
    });
  }
  return values;
};

// Rule 1 — an English word in an accessible name that never sees `t(`.
// Real failures: `aria-label="Queue tracks"`, `:aria-label="'Skip to previous
// track'"`, ``:aria-label="`Play ${track.title}`"``,
// `:aria-label="cond ? 'Pause' : 'Play'"` and ``:alt="`${album.title} by
// ${album.artist}`"``. All shipped; none was caught by a test, because the
// tests asserted the English string the bug produced. `alt` is checked with
// the same scanner: it names an image for a screen reader exactly as
// `aria-label` names a control. A decorative image takes `alt=""`, which the
// rule accepts — no words, nothing to translate.
//
// The prop default `{ alt: 'Album cover' }` is the same defect one step back:
// it never appears in a binding, so the attribute scan above cannot see it,
// and it only reaches a screen reader once some consumer omits the prop.
// Found by hand in AlbumCover.vue, where exactly that consumer would have
// resurrected an English name the whole translation pass had removed. Same
// literal scanner, so `alt: ''` and `alt: t('…')` stay accepted.
export const findLabelViolations = (file, content) => {
  const violations = [];
  for (const match of content.matchAll(ACCESSIBLE_NAME_ATTR)) {
    const [attribute, binding, value] = match;
    const valueIndex = match.index + attribute.indexOf(value);
    if (binding !== ":") {
      if (TWO_LETTERS.test(stripKnownWords(value))) {
        violations.push({
          file,
          line: lineOf(content, match.index),
          expression: attribute,
        });
      }
      continue;
    }
    const literals = collectLiterals(value, valueIndex);
    const offenders = literals.filter(isEnglishWording);
    if (offenders.length > 0) {
      violations.push({
        file,
        line: lineOf(content, offenders[0].index),
        expression: attribute.trim(),
      });
      continue;
    }
    if (literals.length > 0) continue;
    const identifier = BOUND_IDENTIFIER.exec(value.trim());
    if (!identifier) continue;
    const definition = findDefinition(content, identifier[1]);
    if (!definition) continue;
    const indirect = collectLiterals(definition.text, definition.index).filter(
      isEnglishWording,
    );
    if (indirect.length > 0) {
      violations.push({
        file,
        line: lineOf(content, indirect[0].index),
        expression: `${identifier[1]} (bound to ${attribute.trim()})`,
      });
    }
  }
  for (const region of findPropDefaultRegions(content)) {
    for (const value of findAccessibleNameDefaults(region)) {
      const offenders = collectLiterals(value.text, value.index).filter(
        isEnglishWording,
      );
      if (offenders.length === 0) continue;
      violations.push({
        file,
        line: lineOf(content, offenders[0].index),
        expression: `${value.text.trim()} (prop default)`,
      });
    }
  }
  return violations;
};

export const collectPlaceholderKeys = (i18nSource) => {
  const keys = new Set();
  for (const match of i18nSource.matchAll(MESSAGE_ENTRY)) {
    const value = match[2] ?? match[3] ?? "";
    if (PLACEHOLDER.test(value)) keys.add(match[1]);
    PLACEHOLDER.lastIndex = 0;
  }
  return keys;
};

// Rule 2 — a key carrying `{title}`/`{name}` used without `.replace(…)`.
// Real failures, both read aloud to a screen reader with the placeholder
// still in it:
//   `${t('home.addAlbumToQueue')} ${props.albumTitle}`
//     → "Add album {title} to queue The Wall"
//   t('home.viewArtist') + ' ' + artist.name
//     → "View artist {name} Massive Attack"
// The `.replace(` may sit up to two lines below: chained calls and ternary
// keys (`t(cond ? 'a' : 'b')`) are both written that way in this repo.
export const findPlaceholderViolations = (file, content, placeholderKeys) => {
  const lines = content.split("\n");
  const violations = [];
  for (const match of content.matchAll(/'([\w.]+)'/g)) {
    if (!placeholderKeys.has(match[1])) continue;
    const line = lineOf(content, match.index);
    const window = lines.slice(line - 1, line + 2).join("\n");
    const isFilled =
      window.includes(".replace(") ||
      SUBSTITUTION_HELPERS.some((helper) => window.includes(`${helper}(`));
    if (isFilled) continue;
    violations.push({ file, line, expression: lines[line - 1].trim() });
  }
  return violations;
};

// Rule 3 — `const t = store.t` snapshots the translator at mount, so every
// computed built on it keeps rendering the language that was active back
// then. Happened twice in one session. Pinia is explicit about it: reading a
// getter off the store object detaches it; only `storeToRefs` (or calling
// through) stays reactive. Correct form:
//   const t = (key: MessageKey): string => store.t(key)
export const findFrozenTranslatorViolations = (file, content) => {
  const violations = [];
  for (const match of content.matchAll(FROZEN_TRANSLATOR)) {
    violations.push({
      file,
      line: lineOf(content, match.index),
      expression: match[0].trim(),
    });
  }
  return violations;
};

const RULES = [
  {
    title: "untranslated label — English literal that never reaches t()",
    hint: "Add a key to src/i18n/index.ts and render it through t('…').",
    collect: (files) =>
      files
        .filter((file) => file.endsWith(".vue"))
        .flatMap((file) =>
          findLabelViolations(file, readFileSync(file, "utf-8")),
        ),
  },
  {
    title: "unfilled placeholder — a key with {…} used without .replace()",
    hint: "Use t('key').replace('{title}', value) instead of concatenating the value.",
    collect: (files) => {
      const placeholderKeys = collectPlaceholderKeys(
        readFileSync(I18N_FILE, "utf-8"),
      );
      return files
        .filter((file) => file !== I18N_FILE)
        .flatMap((file) =>
          findPlaceholderViolations(
            file,
            readFileSync(file, "utf-8"),
            placeholderKeys,
          ),
        );
    },
  },
  {
    title: "frozen translator — captured t() ignores a language switch",
    hint: "Write const t = (key: MessageKey): string => store.t(key).",
    collect: (files) =>
      files.flatMap((file) =>
        findFrozenTranslatorViolations(file, readFileSync(file, "utf-8")),
      ),
  },
];

const main = () => {
  const files = walk(SRC_DIR, [".vue", ".ts"]);
  const results = RULES.map((rule) => ({
    rule,
    violations: rule.collect(files),
  }));
  const total = results.reduce(
    (sum, result) => sum + result.violations.length,
    0,
  );

  if (total === 0) {
    console.log("check:i18n — no violations");
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
