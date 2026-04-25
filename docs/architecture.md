# Signalform Architecture

## Purpose

Signalform uses an explicit `functional core / imperative shell` architecture.
This document defines the structure, import boundaries, and allowed
exceptions for the monorepo. It is the canonical reference for new features
and automated architecture checks.

## Core Principles

- Use functions instead of classes.
- Prefer immutable data and `const`.
- Use `Result` types for business-flow failures instead of exception-driven control flow.
- Keep framework and I/O concerns out of `core`.
- Make architectural roles visible in paths and enforce them through lint rules.

## Allowed Exception Policy

Exceptions are permitted only at explicit boundary seams:

- process entrypoints and shutdown paths
- hard safety guards that must stop execution immediately
- framework-required glue code in shell/infrastructure layers
- unavoidable third-party integration seams where APIs throw or mutate

Every exception must be local, explicitly commented, and must not silently
weaken architecture rules for neighboring code.

## Package Layout

The monorepo has three packages. Import direction is strictly one-way:

```
packages/shared      ← domain types, Result<T,E>, pure utilities
      ↑                 no framework, no I/O, no side effects
packages/backend     ← Fastify API, LMS integration, enrichment
packages/frontend    ← Vue 3 PWA, domain UI
```

`packages/shared` is imported by both backend and frontend. Backend and
frontend never import from each other.

## Shared Package

`packages/shared` (`@signalform/shared`) is pure TypeScript with zero
runtime side effects. No framework imports, no I/O.

```
packages/shared/src/
├── result/          Result<T, E> type and helpers (ok, err, map, ...)
├── types/           Track, PlayerStatus, QueueState, SourceType, WebSocket events
├── validation/      Zod schemas for WebSocket payloads
├── formatting/      formatSeconds, formatProgress
├── tidalUtils.ts    isTidalAlbumId pure helper
└── index.ts         single barrel export
```

Rules: no `await`, no `fetch`, no `fs`, no framework imports, named exports only,
all properties `readonly`.

## Backend Structure

```
packages/backend/src/
├── adapters/              external system clients (LMS, Last.fm, Fanart.tv)
├── features/              feature modules, each with core/ and shell/
│   └── {feature}/
│       ├── core/          pure logic: no await, no Fastify, no I/O
│       └── shell/         Fastify routes, websocket emission, orchestration
├── infrastructure/        backend-internal technical helpers
│   ├── config/            config file I/O and parsing
│   ├── websocket/         Socket.IO server, event handlers, status poller
│   ├── logger.ts          Pino logger setup
│   ├── lms-registry.ts    runtime LMS client registry
│   ├── normalizeArtist.ts artist name normalisation utility
│   ├── frontend-delivery.ts static file serving helper
│   └── http-errors.ts     shared sendLmsError helper for route handlers
└── test-utils/            test safety guards and Vitest setup
```

`infrastructure/` contains backend-wide technical helpers that are not
feature-specific and are not part of the domain model. It is distinct from
`packages/shared` (the monorepo-level package) — `infrastructure/` is only
accessible within the backend and may perform I/O.

### Backend Dependency Rules

- `features/*/core` may import only:
  - same-feature `core`
  - `packages/shared` (pure types and utilities)
  - `infrastructure/config` and other pure infrastructure helpers
- `features/*/core` may not import:
  - Fastify
  - websocket runtime/server code (`infrastructure/websocket/**`)
  - adapter clients
  - same-feature `shell`
- `features/*/shell` may import:
  - same-feature `core`
  - `adapters`
  - `infrastructure`
- `adapters` may not import feature `shell`
- `infrastructure` must not depend on feature-local business rules

## Frontend Structure

```
packages/frontend/src/
├── app/                   bootstrap, router wiring, top-level assembly
├── platform/api/          HTTP/API clients (shell layer)
├── ui/                    generic reusable UI components
├── domains/
│   ├── shared/core/       cross-domain pure types (api-errors.ts, etc.)
│   └── {domain}/
│       ├── core/          pure logic: no Vue imports, no I/O
│       ├── shell/         composables, stores, API calls
│       └── ui/            domain-specific Vue components
├── router/                Vue Router setup
├── i18n/                  internationalisation
└── utils/                 shared pure utilities
```

`domains/shared/core/` holds cross-domain pure types (e.g. `BaseApiError`,
`NotFoundError`) that domain cores import instead of repeating the same
union literals. It is not a Shell layer — no Vue imports, no I/O.

### Frontend Dependency Rules

- `domains/*/core` may not import:
  - Vue runtime
  - Pinia
  - router
  - `platform/api`
- `domains/shared/core` follows the same rules as any other domain core
- `domains/*/shell` may import:
  - same-domain `core`
  - `domains/shared/core`
  - `platform/api`
  - generic `ui`
- `domains/*/ui` may import:
  - same-domain `core`
  - same-domain `shell`
  - generic `ui`
- generic `ui/**` may not import:
  - `platform/api`
  - domain stores directly
- `app/**` may assemble domains but should not contain business logic

## Enforcement Strategy

Architecture is enforced by three layers:

- TypeScript strictness
  - type-safety and null-safety invariants
- `eslint-plugin-functional`
  - functional style and immutability constraints
- `eslint-plugin-boundaries`
  - path-based import and layering rules

All architecture rules are enforced at `error` level. Violations fail lint
and CI. The ESLint boundary rules use glob patterns so new features and
domains are covered automatically without manual config updates.

## Conventions (not enforced by lint)

- **Naming**: camelCase for variables/functions, PascalCase for types,
  kebab-case for files and directories.
- **Booleans**: prefix with `is`, `has`, `can`, `should`.
- **Import order**: external libs, then `@signalform/shared`, then absolute
  (`@/...`), then relative.
- **Vue components**: always `<script setup lang="ts">`. Use `data-testid`
  attributes for test selectors.
- **Comments**: explain "why", not "what". Use JSDoc for public API functions.

## Development Guidelines

When adding new features or modifying existing code:

- Follow the established `core` / `shell` structure for your feature or domain.
- Keep changes small and independently committable.
- Ensure the repository stays buildable and testable after every change.
- Preserve runtime behavior unless explicitly changing functionality.
- See `docs/diagrams/architecture/` for visual overviews of the package
  structure and data flow.
