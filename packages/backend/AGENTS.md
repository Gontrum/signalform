# Backend package (Fastify)

FCIS rules, structure, and import boundaries: see root `AGENTS.md` and
`docs/architecture.md` (canonical). This file lists only backend deltas.

- Structure: `src/features/{feature}/core` and `src/features/{feature}/shell`.
  Both zone directories are optional — shell-only and core-only features exist.
- Backend litmus test: does it use `await`? → Shell.
- Handlers stay thin: validate input → call core → send response.
- Before implementing any Fastify API: fetch current Fastify docs via context7.

## Tests

- Core: pure unit tests, no mocks, no DB.
- Shell: integration tests with a real Fastify instance
  (`shell/route.integration.test.ts`).
