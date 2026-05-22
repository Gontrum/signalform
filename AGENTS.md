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

## Backend: Tidal feature anatomy

For any new Tidal endpoint, three files are involved — use the existing
`/api/tidal/albums/:albumId/tracks` endpoint as a complete template:

| Layer        | File                                                         | Role                                                    |
| ------------ | ------------------------------------------------------------ | ------------------------------------------------------- |
| LMS Client   | `packages/backend/src/adapters/lms-client/tidal-albums.ts`   | Add new LMS method + type to `TidalAlbumsMethods`       |
| Raw types    | `packages/backend/src/adapters/lms-client/types.ts`          | `TidalAlbumRaw`, `TidalArtistAlbumRaw`, `TidalTrackRaw` |
| Core mapping | `packages/backend/src/features/tidal-albums/core/service.ts` | Pure Raw→Domain mapping function                        |
| Shell route  | `packages/backend/src/features/tidal-albums/shell/route.ts`  | Fastify handler: Zod params, `Promise.all`, call core   |
| Server proxy | `packages/backend/src/server.ts`                             | Wire new LMS method via `forwardLmsCall`                |

## TODO Tracking

If a `TODO.md` exists in the project root:

- Read it at the start of every session to find the first unchecked item
- Mark each item `[x]` immediately after completing it — do not batch
- Fill in Decision Log sections as decisions are made
- Follow the commit strategy defined in the file
