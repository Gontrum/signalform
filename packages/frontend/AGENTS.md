# Frontend package (Vue 3)

## FCIS boundary

Structure: `src/domains/{domain}/core` and `src/domains/{domain}/shell`

Core (`*/core/`): pure state transformations, calculations, filter logic.
Plain TypeScript objects only. No imports from `'vue'`.

Shell (`*/shell/`): composables with lifecycle hooks, fetch calls, and
reactive wrappers around core logic. Components live here too if present.
Composables call core functions.
No fetch or async I/O directly inside `<script setup>`.

## Before implementing any Vue API or composable

Use context7 to check current Vue documentation.

## Tests

Core: pure Vitest unit tests, no DOM, no Vue Test Utils.
Shell: Vue Test Utils or Playwright for component behaviour.
