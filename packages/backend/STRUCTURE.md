# packages/backend — Source Structure

Developer reference for the layout of `packages/backend/src/`. Describes the role of each directory and the architectural patterns in use.

---

## Architectural Pattern: Functional Core / Imperative Shell

The codebase follows the **FC/IS** split throughout:

- **Functional Core** — pure functions with no side effects, no I/O, easily unit-tested. Lives in `service.ts` files inside each feature, and in `diversity-service.ts` / `service.ts` inside `radio-mode/`.
- **Imperative Shell** — all I/O, side effects, and external system calls. Lives in `adapters/`, `route.ts` files, `radio-service.ts`, `radio-state.ts`, and the top-level entry points.

---

## Top-Level Entry Points

```
src/
  index.ts    — Process entry point: creates the Fastify server, binds the port,
                registers the unhandled-rejection handler.
  server.ts   — Fastify factory: wires all feature routes, registers the WebSocket
                server, connects adapters, and sets up the radio-mode event loop.
```

---

## adapters/

External system clients — all Imperative Shell. Each adapter directory exports a typed client factory and its associated types.

```
src/adapters/
  fanart-client/      — Fanart.tv HTTP client for album + artist artwork
  lastfm-client/      — last.fm API client (client.ts) + circuit-breaker wrapper
                        (circuit-breaker-client.ts) that gates calls on failure rate
  lms-client/         — LMS JSON-RPC client, split into:
    client.ts         —   Thin assembler: composes domain modules into one LmsClient
    execute.ts        —   Core executeCommand / executeCommandWithRetry infrastructure
    helpers.ts        —   Shared parsing utilities (audio quality, Tidal IDs, etc.)
    types.ts          —   LmsCommand, LmsError, SearchResult, and related types
    retry.ts          —   Retry policy with exponential back-off
    playback.ts       —   Playback control domain methods
    queue.ts          —   Queue inspection + manipulation domain methods
    search.ts         —   Local + Tidal parallel search with per-source timeouts
    library.ts        —   Library browse domain methods
    tidal-albums.ts   —   Tidal album browse domain methods
    tidal-search.ts   —   Tidal artist search domain methods
```

---

## features/

One directory per business domain. Each follows the standard pattern:

| File         | Role                                                        |
| ------------ | ----------------------------------------------------------- |
| `service.ts` | Functional Core — pure domain logic, no I/O                 |
| `route.ts`   | Imperative Shell — Fastify plugin, calls service + adapters |
| `types.ts`   | Domain types                                                |
| `index.ts`   | Public re-exports                                           |

Feature directories:

```
src/features/
  config/           — App configuration CRUD (read/write via shared/config)
  enrichment/       — Track metadata enrichment (artwork, last.fm artist bio)
  health/           — Health-check endpoint
  library/          — LMS local library browsing
  metadata/         — Album metadata aggregation (Tidal tracks → album grouping)
  playback/         — Playback controls (play, pause, next, volume, seek)
  queue/            — Queue inspection and manipulation
  radio-mode/       — Radio / continuous-play mode (see below)
  search/           — Local + Tidal unified search with autocomplete
  setup/            — First-run LMS discovery (no service.ts; logic in discovery.ts)
  source-hierarchy/ — Source priority ordering (no route.ts; pure library used by
                      other features)
  tidal-albums/     — Tidal album browse and detail
  tidal-artists/    — Tidal artist search
```

### radio-mode/ — non-standard structure

`radio-mode/` has no `route.ts`. It is orchestrated directly from `server.ts` via WebSocket events. The FC/IS split is more granular:

```
src/features/radio-mode/
  service.ts           — Functional Core: track selection + queue-fill logic
  diversity-service.ts — Functional Core: Artist Diversity Filter pure functions
                         (isArtistInWindow, filterByDiversity, addToSlidingWindow)
  radio-service.ts     — Imperative Shell: wires service + diversity + LMS client,
                         drives the sliding-window state machine
  radio-state.ts       — Module-level state: persists radioBoundaryIndex across
                         server.ts route-handler invocations
  types.ts             — CandidateTrack, RadioConfig, and related types
  index.ts             — Public re-exports
```

---

## shared/

Backend-internal cross-feature utilities. **Not** the same as `packages/shared/` (the `@signalform/shared` workspace library that exports cross-package types like `Result`, `Track`, and `AudioQuality`). Everything in `src/shared/` is private to the backend package.

```
src/shared/
  config/
    service.ts          — AppConfig load/save: JSON file with env-var fallback,
                          atomic writes via temp-file rename
  websocket/
    server.ts           — Socket.IO server setup and namespace registration
    status-poller.ts    — Periodic LMS status polling → broadcasts player state
    handlers.ts         — Inbound WebSocket event handlers
    events.ts           — Event name constants (Domain.Action pattern)
    index.ts            — Public re-exports
  lms-registry.ts       — Module-level singleton: holds the active LmsClient +
                          AppConfig; reload() hot-swaps client on settings change
                          without a server restart
  logger.ts             — Winston logger factory (structured JSON in production,
                          pretty-print in development)
  normalizeArtist.ts    — NFD-normalized lowercase artist name for deduplication
  frontend-delivery.ts  — Fastify static-file plugin serving the Vue SPA dist/
                          directory with HTML5 fallback routing for client-side nav
```

---

## Quick Reference

```
packages/backend/
  src/
    index.ts            — process entry
    server.ts           — Fastify factory + wiring
    adapters/           — external clients (Imperative Shell)
    features/           — domain modules (FC + IS per feature)
    shared/             — backend-internal utilities (NOT @signalform/shared)
  STRUCTURE.md          — this file
```
