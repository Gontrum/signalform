// Rule 7 in its own file: check-i18n.test.mjs is already 29 KB, and every one
// of these cases is a line out of packages/frontend/src/i18n/index.ts — the
// one defect that shipped, and the sixteen identical pairs that are correct
// and must never be reported, or the rule gets switched off within a week.
import assert from "node:assert/strict";
import test from "node:test";

import { findIdenticalTranslationViolations } from "./check-i18n.mjs";

const block = (name, entries) => [
  `  ${name}: {`,
  ...entries.map(([key, value]) => `    '${key}': '${value}',`),
  "  },",
];

const i18n = (en, de) =>
  [
    "export const messages: Record<Language, Record<MessageKey, string>> = {",
    ...block("en", en),
    ...block("de", de),
    "}",
  ].join("\n");

const keysOf = (violations) =>
  violations.map((violation) => violation.expression);

test("rule 7 flags a German sentence copied from the English block", () => {
  const violations = findIdenticalTranslationViolations(
    "i18n/index.ts",
    i18n(
      [
        [
          "settings.lastfmPlaceholderEmpty",
          "Optional — enables artist enrichment",
        ],
      ],
      [
        [
          "settings.lastfmPlaceholderEmpty",
          "Optional — enables artist enrichment",
        ],
      ],
    ),
  );

  assert.deepEqual(keysOf(violations), [
    `'settings.lastfmPlaceholderEmpty': "Optional — enables artist enrichment" (identical in en and de)`,
  ]);
});

// The German entry is the one a translator has to open, so that is the line
// the report has to name — the English original above it reads correctly.
test("rule 7 reports the line of the German entry", () => {
  const violations = findIdenticalTranslationViolations(
    "i18n/index.ts",
    i18n(
      [
        ["settings.discoverButton", "Discover"],
        [
          "settings.lastfmPlaceholderEmpty",
          "Optional — enables artist enrichment",
        ],
      ],
      [
        ["settings.discoverButton", "Server suchen"],
        [
          "settings.lastfmPlaceholderEmpty",
          "Optional — enables artist enrichment",
        ],
      ],
    ),
  );

  assert.equal(violations.length, 1);
  assert.equal(violations[0].line, 8);
  assert.equal(violations[0].file, "i18n/index.ts");
});

test("rule 7 accepts a one-word term that reads the same in both languages", () => {
  const identical = [
    ["settings.portLabel", "Port"],
    ["nowPlaying.pause", "Pause"],
    ["source.streaming", "Streaming"],
    ["playlists.title", "Playlists"],
    ["setup.playerOnline", "online"],
    ["album.titleFallback", "Album"],
  ];

  assert.deepEqual(
    findIdenticalTranslationViolations(
      "i18n/index.ts",
      i18n(identical, identical),
    ),
    [],
  );
});

test("rule 7 accepts a label built from proper nouns and acronyms", () => {
  const identical = [
    ["settings.lastFm", "Last.fm"],
    ["source.tidal", "Tidal"],
    ["settings.hostLabel", "LMS Host"],
    ["settings.playerIdLabel", "Player ID"],
    ["settings.lmsMac", "LMS MAC"],
  ];

  assert.deepEqual(
    findIdenticalTranslationViolations(
      "i18n/index.ts",
      i18n(identical, identical),
    ),
    [],
  );
});

// The range is a glyph pair, not a word: "A–Z" carries no two letters in a row.
test("rule 7 accepts a sort label whose second half is a range", () => {
  const identical = [
    ["library.sort.titleAz", "Album A–Z"],
    ["artist.sort.title", "A-Z"],
  ];

  assert.deepEqual(
    findIdenticalTranslationViolations(
      "i18n/index.ts",
      i18n(identical, identical),
    ),
    [],
  );
});

test("rule 7 accepts a value that was actually translated", () => {
  assert.deepEqual(
    findIdenticalTranslationViolations(
      "i18n/index.ts",
      i18n(
        [
          ["settings.discoverNone", "No LMS servers found on the network."],
          ["settings.saveButton", "Save settings"],
        ],
        [
          ["settings.discoverNone", "Keine LMS-Server im Netzwerk gefunden."],
          ["settings.saveButton", "Einstellungen speichern"],
        ],
      ),
    ),
    [],
  );
});

// A key in one block only is a type error in i18n/index.ts long before it is an
// i18n defect; rule 7 must not turn that into a second, misleading report.
test("rule 7 stays silent about a key only one language declares", () => {
  assert.deepEqual(
    findIdenticalTranslationViolations(
      "i18n/index.ts",
      i18n(
        [
          ["settings.saveButton", "Save settings"],
          ["settings.onlyEnglish", "Rescan the whole library"],
        ],
        [["settings.saveButton", "Einstellungen speichern"]],
      ),
    ),
    [],
  );
});

test("rule 7 stays silent when a language block is missing entirely", () => {
  const source = [
    "export const messages = {",
    ...block("en", [["settings.saveButton", "Save settings"]]),
    "}",
  ].join("\n");

  assert.deepEqual(
    findIdenticalTranslationViolations("i18n/index.ts", source),
    [],
  );
});

// Placeholders name a value, not a word — a key made of nothing else is the
// same string in both languages by definition.
test("rule 7 accepts a value whose words are all placeholders", () => {
  const identical = [["nowPlaying.separator", "{title} — {name}"]];

  assert.deepEqual(
    findIdenticalTranslationViolations(
      "i18n/index.ts",
      i18n(identical, identical),
    ),
    [],
  );
});
