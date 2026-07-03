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

## Tests

- Core: pure Vitest unit tests, no DOM, no Vue Test Utils.
- Shell/UI: Vue Test Utils or Playwright for component behaviour.
