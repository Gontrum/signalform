---
name: new-tidal-feature
description: Scaffolds a complete new Tidal API feature across all five layers of the backend architecture.
when_to_use: Use when the user asks to add a new Tidal endpoint, a new Tidal API route, or extend the Tidal integration with a new resource type (e.g. "add endpoint for Tidal artist top tracks", "expose Tidal playlist details", "new Tidal route for similar artists").
user-invocable: false
---

## Reference implementation

The canonical template is the `/api/tidal/albums/:albumId/tracks` endpoint:

- LMS client: `packages/backend/src/adapters/lms-client/tidal-albums.ts`
- Raw types: `packages/backend/src/adapters/lms-client/types.ts`
- Core mapping: `packages/backend/src/features/tidal-albums/core/`
- Shell route: `packages/backend/src/features/tidal-albums/shell/`
- Server wiring: `packages/backend/src/server.ts`

Read these files first to understand the exact pattern before starting.

## Five layers — implement in this order

### Layer 1 — LMS client method (edit directly)

File: `packages/backend/src/adapters/lms-client/tidal-albums.ts`
Add the new LMS method and its type to `TidalAlbumsMethods`.

### Layer 2 — Raw types (edit directly)

File: `packages/backend/src/adapters/lms-client/types.ts`
Add the raw API response type (e.g. `TidalArtistTopTrackRaw`).

### Layer 3 — Core mapping function (delegate to `core-dev`)

File: `packages/backend/src/features/<feature-name>/core/service.ts`
Provide the raw type and target domain type as context.
Pure Raw→Domain mapping — no I/O, no framework imports.

### Layer 4 — Shell route handler (delegate to `shell-dev`)

File: `packages/backend/src/features/<feature-name>/shell/route.ts`
Provide the core function signature as context.
Fastify handler: Zod params, `Promise.all` where applicable, call core, return response.

### Layer 5 — Server proxy wiring (edit directly)

File: `packages/backend/src/server.ts`
Wire the new LMS method via `forwardLmsCall`.

## After all layers

Run `pnpm type-check` to verify the full chain compiles.
