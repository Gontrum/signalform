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
// Known blind spots, in the order worth fixing: `title`/placeholder
// attributes, non-literal English (a string built from a
// `Record<string, string>` map), and the two shapes rule 4 documents at its
// own header. Upgrade path: parse SFCs with `@vue/compiler-sfc` and walk the
// expression AST, then the literal scanner and the "two letters in a row"
// heuristic both disappear.
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

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
const SUBSTITUTION_HELPERS = ["buildDecadeScopeMessage", "buildCountLabel"];

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

// Rule 4 — user-facing prose written in TypeScript, where rule 1 cannot look.
// Rule 1 only reads `.vue`, so a sentence that is *built* in a `.ts` file and
// only *interpolated* by the template escapes it entirely. That is not
// hypothetical: `Now playing: ${title} by ${artist}` reached an aria-live
// region, and `'Cannot connect to music server'` reached a banner, while
// check:i18n reported a fully translated surface.
//
// The hard part is the boundary, not the scan. A `.ts` file is full of
// English that no user ever sees — thrown errors, `console` lines, the
// `message` of an error object, API fallbacks, enum-ish state values. A guard
// that reports those gets switched off, so rule 4 only looks at the two
// shapes where the *destination* is provably the screen, both anchored on a
// Vue reactivity primitive:
//
//   (a) a literal assigned straight to reactive state: `x.value = 'Some text'`
//   (b) a literal a `computed()` renders — written in the computed itself, or
//       returned by the function that computed calls (one hop, same file or
//       through the import that brought the name in)
//
// Deliberately outside the boundary, in descending order of how much it hurts:
//   - a literal passed as an *argument* (`mapQueueMutationError(error, 'Failed
//     to remove track')`). Locally undecidable: the callee may well translate
//     the fallback it is handed, and the guard cannot see which.
//   - a `return` of prose from any function that no computed calls
//     (`mapPlaybackErrorMessage`, `validateSeekPosition`). Measured on this
//     tree: 18 such returns, of which 1 is user-facing — a rule with that
//     ratio is a rule nobody keeps.
//   - `.vue` script blocks. Measured: the Tailwind class-list computeds in
//     Banner.vue, QualityBadge.vue and friends are indistinguishable from
//     prose to a literal scanner, and there are 17 of them.
//   - a sentence whose interpolations leave no static chunk with two words in
//     it (`Scanning ${step} now`). Joining the chunks would catch it and would
//     also start reading `${w}px ${h}px` as a sentence.
//
// Single words are out too: 'loading', 'error', 'local', 'grid' are state
// values, not sentences, and every one of them appears as `x.value = '…'`.
// Prose therefore means two words that each carry letters, after the
// placeholders and the proper nouns are removed.
const STATE_ASSIGNMENT = /(?<![\w$.])([A-Za-z_$][\w$]*)\.value\s*=(?!=)\s*/g;
const COMPUTED_CALL = /(?<![\w$.])computed\s*\(/g;
const CALLEE = /(?<![\w$.])([A-Za-z_$][\w$]*)\s*\(/g;
const NAMED_IMPORT = /import\s*(?:type\s*)?\{([^}]*)\}\s*from\s*'([^']+)'/g;
const CALLEE_SKIPLIST = new Set(["computed", "t", "if", "for", "return"]);

const isProse = (literal) =>
  !literal.isKey &&
  !MESSAGE_KEY_SHAPE.test(literal.text.trim()) &&
  stripKnownWords(literal.text)
    .split(/\s+/)
    .filter((word) => TWO_LETTERS.test(word)).length > 1;

// The whole `const <name> = …` declaration, ending at the next line that
// starts in column 0 — prettier (enforced by `format:check`) indents every
// continuation line, so that boundary is the end of the declaration. Unlike
// `findDefinition`, this keeps the body of a plain arrow function, whose first
// bracket is the parameter list and would otherwise close after `)`.
const findDeclaration = (content, name) => {
  const match = new RegExp(`\\bconst\\s+${name}\\s*=`).exec(content);
  if (!match) return undefined;
  const firstLineEnd = content.indexOf("\n", match.index);
  if (firstLineEnd === -1) {
    return { text: content.slice(match.index), index: match.index };
  }
  const rest = content.slice(firstLineEnd);
  const nextTopLevel = rest.search(/\n\S/);
  const end =
    nextTopLevel === -1 ? content.length : firstLineEnd + nextTopLevel + 1;
  return { text: content.slice(match.index, end), index: match.index };
};

// Shape (a). Only a literal that *is* the whole right-hand side counts; see
// the argument case in the header for why.
export const findStateTextViolations = (file, content) => {
  const violations = [];
  for (const match of content.matchAll(STATE_ASSIGNMENT)) {
    const start = match.index + match[0].length;
    const quote = content[start];
    if (quote !== "'" && quote !== '"' && quote !== "`") continue;
    const end =
      quote === "`"
        ? endOfTemplate(content, start)
        : skipQuoted(content, start);
    const offenders = collectLiterals(content.slice(start, end), start).filter(
      isProse,
    );
    if (offenders.length === 0) continue;
    violations.push({
      file,
      line: lineOf(content, match.index),
      expression: `${match[1]}.value = ${content.slice(start, end).trim()}`,
    });
  }
  return violations;
};

// Shape (b). `readModule(specifier)` returns `{ file, content }` for an
// import of `file`, or undefined for anything outside the frontend source —
// injected so the rule stays testable without a filesystem.
export const findRenderedTextViolations = (file, content, readModule) => {
  const imports = new Map();
  for (const match of content.matchAll(NAMED_IMPORT)) {
    for (const specifier of match[1].split(",")) {
      const name = specifier
        .trim()
        .split(/\s+as\s+/)
        .pop()
        ?.trim();
      if (name) imports.set(name, match[2]);
    }
  }

  const violations = [];
  const seen = new Set();
  const report = (violation) => {
    const key = `${violation.file}:${violation.line}`;
    if (seen.has(key)) return;
    seen.add(key);
    violations.push(violation);
  };

  for (const match of content.matchAll(COMPUTED_CALL)) {
    const open = match.index + match[0].length - 1;
    const bodyStart = open;
    const body = content.slice(bodyStart, endOfBracketed(content, open));

    for (const literal of collectLiterals(body, bodyStart).filter(isProse)) {
      report({
        file,
        line: lineOf(content, literal.index),
        expression: `${JSON.stringify(literal.text)} (inside a computed)`,
      });
    }

    for (const call of body.matchAll(CALLEE)) {
      const name = call[1];
      if (CALLEE_SKIPLIST.has(name)) continue;
      const source = imports.has(name)
        ? readModule(imports.get(name))
        : { file, content };
      if (!source) continue;
      const declaration = findDeclaration(source.content, name);
      if (!declaration) continue;
      for (const literal of collectLiterals(
        declaration.text,
        declaration.index,
      ).filter(isProse)) {
        report({
          file: source.file,
          line: lineOf(source.content, literal.index),
          expression: `${JSON.stringify(literal.text)} in ${name}() — rendered by a computed in ${file}`,
        });
      }
    }
  }
  return violations;
};

// Rule 5 — English written straight into the template, where rule 1 cannot
// look: rule 1 reads attributes, and a text node between two tags is invisible
// to it. `Now playing: {{ track.title }} by {{ track.artist }}` sat in the
// aria-live region of SearchResultsList.vue through the whole translation pass
// — the very sentence the Now Playing panel already spoke in German, from a
// core builder, two files away.
//
// A template is full of text that is no translatable sentence, so this rule
// reads only the containers whose entire purpose is to be spoken: an element
// carrying `aria-live`, and one carrying the `sr-only` class. Inside those the
// bar is a single English word, not two as in rule 4: nothing there is ever
// displayed, so a word that is neither an interpolation nor a proper noun is a
// word a screen reader reads out in the wrong language.
//
// Measured before it was written: 37 `.vue` files, 24 such regions, one
// report — the defect above. Every other region already holds `{{ t('…') }}`
// or nothing but interpolations, at either threshold.
//
// Outside the boundary on purpose: what an interpolation *evaluates to*.
// `{{ playbackStore.error }}` speaks an English sentence out of the store and
// the template cannot show that; it is rule 4's territory, and behind it a
// declared blind spot of that rule (`mapPlaybackErrorMessage`).
const TAG_NAME = /^<\/?([A-Za-z][\w.-]*)/;
const TAG_NAME_LIMIT = 40;
// The lookbehind keeps Tailwind's `not-sr-only`, which *shows* an element, from
// being read as a region that only a screen reader ever reaches.
const LIVE_REGION_ATTR =
  /\saria-live\s*=|\s:?class\s*=\s*(?:"[^"]*|'[^']*)(?<![\w-])sr-only\b/;
const ENTITY = /&[a-zA-Z]+;/g;

// Index just past the `>` ending the tag opened at `open`. Attribute values are
// skipped, so the `>` in `@click="() => close()"` does not end it early.
const endOfTag = (source, open) => {
  let index = open + 1;
  while (index < source.length) {
    const char = source[index];
    if (char === "'" || char === '"') {
      index = skipQuoted(source, index);
      continue;
    }
    if (char === ">") return index + 1;
    index += 1;
  }
  return source.length;
};

// A void element closes itself with or without a trailing `/>`, so counting
// tag names would never find its match and the region would run to the end of
// the file — rule 5 reporting visible text as spoken, rule 6 blanking the same
// span and going silent for everything after it. Lower case on purpose: `<Input>`
// is a Vue component and may well have children.
const VOID_ELEMENTS = new Set([
  "area",
  "base",
  "br",
  "col",
  "embed",
  "hr",
  "img",
  "input",
  "link",
  "meta",
  "source",
  "track",
  "wbr",
]);

// Index where the children of the element opened at `open` end, found by
// counting its own tag name up and down. A self-closing tag has none.
const endOfChildren = (source, open, name) => {
  if (VOID_ELEMENTS.has(name)) return endOfTag(source, open);

  let depth = 0;
  let index = open;
  while (index < source.length) {
    if (source.startsWith("<!--", index)) {
      const end = source.indexOf("-->", index);
      index = end === -1 ? source.length : end + 3;
      continue;
    }
    if (source[index] !== "<") {
      index += 1;
      continue;
    }
    const tag = TAG_NAME.exec(source.slice(index, index + TAG_NAME_LIMIT));
    if (!tag) {
      index += 1;
      continue;
    }
    const tagEnd = endOfTag(source, index);
    if (tag[0][1] === "/") {
      if (tag[1] === name && (depth -= 1) === 0) return index;
    } else if (tag[1] === name) {
      if (source.slice(index, tagEnd).trimEnd().endsWith("/>")) {
        if (depth === 0) return tagEnd;
      } else {
        depth += 1;
      }
    }
    index = tagEnd;
  }
  return source.length;
};

// What is left for a screen reader once tags, comments and interpolations are
// gone: one entry per run of literal text, with its index in `content`.
const collectTextNodes = (source, offset) => {
  const nodes = [];
  let start = 0;
  let index = 0;
  // Reported at the first word, not at the `>` the run starts behind: the two
  // sit on different lines whenever the text is indented under its own tag.
  const take = (end) => {
    const text = source.slice(start, end).trimStart();
    if (text.trim() === "") return;
    nodes.push({ text, index: offset + end - text.length });
  };
  while (index < source.length) {
    if (source.startsWith("<!--", index)) {
      take(index);
      const end = source.indexOf("-->", index);
      index = end === -1 ? source.length : end + 3;
    } else if (source.startsWith("{{", index)) {
      take(index);
      const end = source.indexOf("}}", index);
      index = end === -1 ? source.length : end + 2;
    } else if (source[index] === "<") {
      take(index);
      index = endOfTag(source, index);
    } else {
      index += 1;
      continue;
    }
    start = index;
  }
  take(source.length);
  return nodes;
};

const spokenWords = (text) =>
  stripKnownWords(text.replace(ENTITY, " "))
    .split(/\s+/)
    .filter((word) => TWO_LETTERS.test(word) && !MESSAGE_KEY_SHAPE.test(word));

// The SFC's own `<template>` block, with the offset that turns an index in it
// back into an index in the file. Everything outside is script or style.
const templateOf = (content) => {
  const start = content.search(/^<template>/m);
  if (start === -1) return undefined;
  return {
    text: content.slice(start, content.lastIndexOf("</template>")),
    start,
  };
};

export const findLiveRegionViolations = (file, content) => {
  const block = templateOf(content);
  if (block === undefined) return [];
  const { text: template, start: templateStart } = block;

  const violations = [];
  let index = 0;
  while (index < template.length) {
    if (template.startsWith("<!--", index)) {
      const end = template.indexOf("-->", index);
      index = end === -1 ? template.length : end + 3;
      continue;
    }
    if (template[index] !== "<") {
      index += 1;
      continue;
    }
    const tag = TAG_NAME.exec(template.slice(index, index + TAG_NAME_LIMIT));
    if (!tag) {
      index += 1;
      continue;
    }
    if (tag[0][1] === "/") {
      index = endOfTag(template, index);
      continue;
    }
    const tagEnd = endOfTag(template, index);
    if (!LIVE_REGION_ATTR.test(template.slice(index, tagEnd))) {
      index = tagEnd;
      continue;
    }
    const childrenEnd = endOfChildren(template, index, tag[1]);
    const spoken = collectTextNodes(
      template.slice(tagEnd, childrenEnd),
      templateStart + tagEnd,
    ).flatMap((node) =>
      spokenWords(node.text).map((word) => ({ word, index: node.index })),
    );
    if (spoken.length > 0) {
      violations.push({
        file,
        line: lineOf(content, spoken[0].index),
        expression: `${JSON.stringify(spoken.map((entry) => entry.word).join(" "))} (spoken by a screen reader)`,
      });
    }
    // Past the whole region: its text nodes already cover every region nested
    // inside it, and rescanning those would report the same words twice.
    index = childrenEnd;
  }
  return violations;
};

// Rule 6 — English written straight into visible markup, the half of the
// template rule 5 was built not to look at. Rule 5 reads the containers whose
// purpose is to be spoken; everything a sighted user reads stayed uncovered,
// and after the translation pass had already been through those files seven
// such strings were still there: `{{ n }} tracks`, `listeners ·`, `+ Queue`,
// `✓ configured`, `online`, `Signalform is connected to …`.
//
// Same scanner, same heuristic, one word as the bar — a visible word that is
// neither an interpolation nor a proper noun is a word the user reads in the
// wrong language. That the bar can be this low is measured, not assumed: over
// the whole tree the separators, glyphs and version numbers people feared
// (`·`, `+`, `✓`, `×`, digits, `Signalform v{{ version }}`) never carry two
// letters in a row and never reach the report.
//
// Blind spots, both already declared elsewhere: text *built* in a computed
// (rule 4's territory, and behind it rule 4's own boundary) and whatever an
// interpolation *evaluates to* — `{{ saveError }}` may well render an English
// sentence and the template cannot show that.
// Only the static attribute: a `:href` holds an identifier, and `download` in
// `<a :href="downloadLink">download</a>` is a word, not an address.
const HREF_ATTR = /(?<![\w:-])href\s*=\s*"([^"]*)"/;

// Every element `select` accepts, as the span its children occupy. A
// self-closing tag yields an empty span, since `endOfChildren` stops at its
// own `/>`.
const collectElementSpans = (template, select) => {
  const spans = [];
  let index = 0;
  while (index < template.length) {
    if (template.startsWith("<!--", index)) {
      const end = template.indexOf("-->", index);
      index = end === -1 ? template.length : end + 3;
      continue;
    }
    if (template[index] !== "<") {
      index += 1;
      continue;
    }
    const tag = TAG_NAME.exec(template.slice(index, index + TAG_NAME_LIMIT));
    if (!tag) {
      index += 1;
      continue;
    }
    const tagEnd = endOfTag(template, index);
    if (tag[0][1] !== "/") {
      const value = select(tag[1], template.slice(index, tagEnd));
      if (value !== undefined) {
        spans.push({
          start: tagEnd,
          end: endOfChildren(template, index, tag[1]),
          value,
        });
      }
    }
    index = tagEnd;
  }
  return spans;
};

// The spans blanked out, keeping every index and line break where it was so a
// violation still reports its own position in the file.
const blankSpans = (template, spans) =>
  spans.reduce(
    (text, span) =>
      text.slice(0, span.start) +
      text.slice(span.start, span.end).replace(/[^\n]/g, " ") +
      text.slice(span.end),
    template,
  );

export const findVisibleTextViolations = (file, content) => {
  const block = templateOf(content);
  if (block === undefined) return [];
  const { text: template, start: templateStart } = block;

  const spoken = collectElementSpans(template, (_name, tag) =>
    LIVE_REGION_ATTR.test(tag) ? true : undefined,
  );
  const anchors = collectElementSpans(template, (name, tag) =>
    name === "a" ? (HREF_ATTR.exec(tag)?.[1] ?? "") : undefined,
  );
  const visible = blankSpans(template, spoken);

  // A link labelled with its own URL is not prose — it is the address the
  // reader is about to visit, and it reads the same in every language.
  const isOwnHref = (node) => {
    const text = node.text.trim();
    return anchors.some(
      (anchor) =>
        node.index >= anchor.start &&
        node.index < anchor.end &&
        anchor.value.includes(text),
    );
  };

  const violations = [];
  for (const node of collectTextNodes(visible, 0)) {
    if (isOwnHref(node)) continue;
    const words = spokenWords(node.text);
    if (words.length === 0) continue;
    violations.push({
      file,
      line: lineOf(content, templateStart + node.index),
      expression: `${JSON.stringify(words.join(" "))} (visible text in the template)`,
    });
  }
  return violations;
};

// Rule 7 — a German value that is character-for-character the English one.
// Rules 1–6 all ask the same question: does this string reach `t()`. This one
// is the first that reads what `t()` hands back, because
// `settings.lastfmPlaceholderEmpty` reached the release as "Optional —
// enables artist enrichment" in *both* blocks. The key above it was
// translated, that one was skipped, and no test, lint or review step could see
// the difference between a translation and a copy.
//
// Most identical pairs are correct and must stay silent — measured here, 17 of
// 321 keys are identical and 16 of them are right: "Port", "Playlists",
// "Pause", "Streaming", "Tidal", "LMS Host", "Player ID", "Album A–Z". What
// separates them from the defect is not which key they are but how much
// language is in them, so the bar is rule 4's word count over the same
// `stripKnownWords`: a value left with at most one word carrying two letters
// in a row is a term, and a term reads the same in every language. Acronyms
// drop out with the proper nouns here, since that is what they are — the
// PROPER_NOUNS list already spells "MAC" and "FLAC" out one at a time, and
// "Player ID" is the same case one letter shorter. Only rule 7 generalises
// them; rules 1 and 6 keep reporting a bare "OK" as they do today.
//
// Blind by construction: an all-caps sentence, which strips to nothing, and
// prose "translated" into different English, which is not an equality at all.
const ACRONYM = /^[A-Z][A-Z0-9]*$/;
// The two blocks of `messages`. `Record<Language, …>` keeps that object
// exhaustive, so a third language is a type error until it is added here too.
const TRANSLATION_BLOCK = /(?<![\w$.])(en|de)\s*:\s*\{/g;

const translatableWords = (value) =>
  stripKnownWords(value)
    .split(/\s+/)
    .filter((word) => TWO_LETTERS.test(word) && !ACRONYM.test(word));

const findTranslationBlocks = (i18nSource) => {
  const blocks = new Map();
  for (const match of i18nSource.matchAll(TRANSLATION_BLOCK)) {
    if (blocks.has(match[1])) continue;
    const open = match.index + match[0].length - 1;
    blocks.set(match[1], {
      text: i18nSource.slice(open, endOfBracketed(i18nSource, open)),
      index: open,
    });
  }
  return blocks;
};

const collectMessages = (block) => {
  const messages = new Map();
  for (const match of block.text.matchAll(MESSAGE_ENTRY)) {
    messages.set(match[1], {
      value: match[2] ?? match[3] ?? "",
      index: block.index + match.index,
    });
  }
  return messages;
};

export const findIdenticalTranslationViolations = (file, i18nSource) => {
  const blocks = findTranslationBlocks(i18nSource);
  const english = blocks.get("en");
  const german = blocks.get("de");
  if (english === undefined || german === undefined) return [];

  const englishMessages = collectMessages(english);
  const violations = [];
  for (const [key, entry] of collectMessages(german)) {
    if (englishMessages.get(key)?.value !== entry.value) continue;
    if (translatableWords(entry.value).length < 2) continue;
    violations.push({
      file,
      line: lineOf(i18nSource, entry.index),
      expression: `'${key}': ${JSON.stringify(entry.value)} (identical in en and de)`,
    });
  }
  return violations;
};

const moduleCache = new Map();

const readFrontendModule = (fromFile) => (specifier) => {
  const base = specifier.startsWith("@/")
    ? join(SRC_DIR, specifier.slice(2))
    : specifier.startsWith(".")
      ? resolve(dirname(fromFile), specifier)
      : undefined;
  if (base === undefined) return undefined;
  const file = [`${base}.ts`, join(base, "index.ts")].find((candidate) =>
    existsSync(candidate),
  );
  if (file === undefined) return undefined;
  if (!moduleCache.has(file)) {
    moduleCache.set(file, { file, content: readFileSync(file, "utf-8") });
  }
  return moduleCache.get(file);
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
  {
    title: "untranslated prose built in TypeScript and rendered as-is",
    hint: "Add a key to src/i18n/index.ts; take a translator as a parameter where the text is built.",
    collect: (files) =>
      files
        .filter((file) => file.endsWith(".ts"))
        .flatMap((file) => {
          const content = readFileSync(file, "utf-8");
          return [
            ...findStateTextViolations(file, content),
            ...findRenderedTextViolations(
              file,
              content,
              readFrontendModule(file),
            ),
          ];
        }),
  },
  {
    title: "untranslated text inside a region a screen reader reads out",
    hint: "Add a key to src/i18n/index.ts and render {{ t('…') }} inside the aria-live or sr-only element.",
    collect: (files) =>
      files
        .filter((file) => file.endsWith(".vue"))
        .flatMap((file) =>
          findLiveRegionViolations(file, readFileSync(file, "utf-8")),
        ),
  },
  {
    title: "untranslated text a user reads straight off the screen",
    hint: "Add a key to src/i18n/index.ts and render {{ t('…') }} in place of the words.",
    collect: (files) =>
      files
        .filter((file) => file.endsWith(".vue"))
        .flatMap((file) =>
          findVisibleTextViolations(file, readFileSync(file, "utf-8")),
        ),
  },
  {
    title: "untranslated value — the German string is the English one verbatim",
    hint: "Translate the value in the de block of src/i18n/index.ts.",
    collect: () =>
      findIdenticalTranslationViolations(
        I18N_FILE,
        readFileSync(I18N_FILE, "utf-8"),
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
