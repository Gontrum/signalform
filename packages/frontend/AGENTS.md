# Frontend package (Vue 3)

FCIS rules, structure, and import boundaries: see root `AGENTS.md` and
`docs/architecture.md` (canonical). This file lists only frontend deltas.

- Structure: `src/domains/{domain}/core`, `.../shell` (composables, stores,
  API calls), and `.../ui` (domain Vue components).
- Frontend litmus test: does it import from `'vue'`? → Shell (or ui).
- No fetch or async I/O directly inside `<script setup>` — composables call
  core functions and go through `platform/api`.
- Before implementing any Vue API or composable: fetch current Vue docs via
  context7.

## User-facing text

- Ships `en` and `de`. Every string a user reads or a screen reader speaks
  goes through `t()` — visible text, `aria-label`, `alt`, `title`. Enforced
  by `pnpm check:i18n`, which explains each rule at the rule.
- Fill placeholders, never append: `t('key').replace('{title}', value)`.
  `{title}` for track/album titles, `{name}` for artist and playlist names.
- Wrap the translator: `const t = (key: MessageKey): string => store.t(key)`.
  What actually freezes is storing its **result** — `const label = store.t(key)`
  at setup, or a `computed` built over a cached string. Assigning `store.t`
  itself is inert today, because it yields a closure that reads the language
  per call; the wrapper is insurance against that shape changing.
- Image whose caption sits beside it: `alt=""`, not a key.
- Assert both languages and compare the full string — English alone is what
  a broken implementation returns anyway.

## Tests

- Core: pure Vitest unit tests, no DOM, no Vue Test Utils.
- Shell/UI: Vue Test Utils or Playwright for component behaviour.
