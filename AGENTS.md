# Signalform

Music player application. Monorepo with three packages: frontend (Vue 3),
backend (Fastify), shared (domain types and pure utilities).

## Commands

Verify the exact script names in each package.json before running.

- Test: `pnpm test`
- Type check: `pnpm type-check`
- Lint: `pnpm lint`

Before finishing any task, all three must pass.

## Architecture: Functional Core, Imperative Shell (FCIS)

`docs/architecture.md` is the canonical architecture reference (structure,
import boundaries, allowed exceptions). This section is the operative summary
for day-to-day work — if the two ever disagree, `docs/architecture.md` wins.

Every package has two zones. The boundary is strict.

**Functional Core** (in `core/` subdirectories):

- Pure functions only. No side effects, no I/O.
- No framework imports of any kind.
- Errors as values using `Result<T, E>` from shared – never `throw`.
- All data immutable: `readonly` arrays and objects throughout.
- No `class`, no `this`, no mutation.

**Imperative Shell** (in `shell/` subdirectories):

- All I/O, network calls, and framework code.
- Calls into core, handles `Result<T, E>`.
- Keep as thin as possible.

**Structure**:

- Frontend: `src/domains/{domain}/core` and `src/domains/{domain}/shell`
- Backend: `src/features/{feature}/core` and `src/features/{feature}/shell`
- Shared: entirely core (no shell exists)

The fastest test for which zone code belongs in:

- Backend: does it use `await`? → Shell.
- Frontend: does it import from `'vue'`? → Shell.
- Shared: does it have any runtime side effect? → Does not belong in shared.

## Testing

If the target test file already exceeds roughly 20 KB, split new cases into
a sibling file (`*.<scenario>.test.ts`) instead of appending to the
monolith — appending forces every future session touching this feature to
load the entire file into context just to add one case.

Every new feature and every bug fix must include tests. This is not optional and is
part of the definition of done — not a follow-up step.

- **Backend shell**: add integration test cases to the feature's
  `shell/route.integration.test.ts`. Cover: happy path, upstream/LMS error (503),
  validation errors (400), and any documented fallback behaviour of the route
  (e.g. the queue routes fall back to 204 when `getQueue` fails after a mutation).
- **Backend core**: pure unit tests next to the core module — no mocks, no I/O.
- **Frontend store**: add cases to the domain's store test (e.g. `useQueueStore.test.ts`)
  for every new action and computed.
- **Frontend API**: add cases to the matching `*Api.test.ts` for every new API function.
- **Frontend UI**: add cases to the relevant `*.test.ts` component test for every new
  interactive element.

**Sort, scoring, and merge logic**: never assert only the resulting order or
length — assert the computed values themselves, or a consequence that only the
correct value can produce (e.g. which item survives a `limit` cutoff). Build
the test fixtures so insertion order does **not** already match the expected
output order. If insertion order and correct output order coincide, a broken
or entirely missing sort/merge passes anyway — the test is green but proves
nothing. This is measured, not theoretical: a 2026-07 mutation-testing run on
`artist-scorer.ts` killed 24/30 mutants, and 5 of the 6 survivors were exactly
this pattern — order-only assertions over coincidentally pre-sorted fixtures.

Tests must be written in the same agent delegation as the code they cover. When
delegating to `@core-dev` or `@shell-dev`, always include explicit test requirements
in the prompt. Never consider a task complete until `pnpm test` passes with new coverage
for the new behaviour.

## Code rules (all packages)

- No `any`, ever.
- Named exports only, no default exports.
- `readonly` on all array and object types.
- Prefer `T | undefined` via optional fields (`?`) over `null`. Use `null` only
  where an explicit absence must be distinguished from a missing value (e.g. a
  field that the server returns as `null` to signal "cleared").
- In pure core functions with three or more sequential synchronous
  transformations, prefer composing small named functions over a single large
  imperative block. Async shell code uses early-return (`if (!result.ok) return
result`) — that is correct and intentional, not a style violation.

See package-level AGENTS.md for package-specific rules.

## Comments

Default: no comment. Prose that only restates the code is noise — rename
instead. Write one line only for a non-obvious _why_, a workaround and its
cause, or an invariant a reader would break. Never: banners, changelog notes,
commented-out code, JSDoc that repeats the signature.

## Commits

Trunk-based: commit to `main`. Never create a branch unless the user explicitly
asks for one — enforced by the `.claude/hooks/no-branch.sh` PreToolUse hook.

Conventional Commits: `type(scope): subject`, imperative, lower case, max 72
chars ("add sleep timer", not "added sleep timer"). One logical change per
commit — a subject needing an "and" is two commits. Body only for a _why_ the
subject cannot carry. Enforced by the `.husky/commit-msg` hook.

## Backend: Tidal feature anatomy

See `.claude/skills/new-tidal-feature/SKILL.md` — same content, kept in one
place so the two don't drift.

## Agent Routing

For AI tools with subagent support (Claude Code, OpenCode):

- Files under `*/core/**` must only be modified by the `core-dev` agent.
- Files under `*/shell/**` must only be modified by the `shell-dev` agent.
- The orchestrating agent must delegate to the appropriate specialized agent and must **never** edit these files directly.

When a task requires changes in both zones, split the work: delegate the core/ changes to `core-dev` first, then the shell/ changes to `shell-dev`.

Single-agent tools (e.g. Codex) cannot delegate — they may edit zone files
directly but must apply the zone constraints themselves (core: pure, no
`await`, no framework imports, `Result<T, E>`; shell: thin handlers, no
business logic). In Claude Code the routing is additionally enforced by the
`.claude/hooks/enforce-zones.sh` PreToolUse hook.
