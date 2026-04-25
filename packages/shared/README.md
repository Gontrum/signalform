# @signalform/shared

Shared TypeScript types and utilities for the signalform monorepo.

## Overview

This package provides type-safe communication between the Vue.js frontend and Fastify backend through TypeScript Project References. It includes domain types for tracks, player state, queue management, and a functional Result<T, E> type for error handling.

## Features

- **TypeScript Project References**: Incremental builds with `composite: true`
- **Result<T, E> Type**: Functional error handling (no exceptions in business logic)
- **Immutable Types**: All properties use `readonly` for safety
- **Minimal Dependencies**: Type definitions plus runtime validation with Zod
- **ESM Module System**: Full ES2022 support

## Installation

This package is part of the pnpm workspace and linked via workspace protocol:

```json
{
  "dependencies": {
    "@signalform/shared": "workspace:*"
  }
}
```

Run `pnpm install` from the workspace root to link all packages.

## Usage

### Result Type

Functional error handling inspired by Rust's Result<T, E>:

```typescript
import { ok, err, isOk, map, type Result } from "@signalform/shared";

// Create Results
const success: Result<number, string> = ok(42);
const failure: Result<number, string> = err("Something went wrong");

// Type guards
if (isOk(success)) {
  console.log(success.value); // 42
}

// Functional helpers
const doubled = map(success, (x) => x * 2); // ok(84)
```

Available helpers: `ok()`, `err()`, `isOk()`, `isErr()`, `map()`, `flatMap()`, `mapErr()`, `unwrap()`, `unwrapOr()`

### Domain Types

Import shared types for tracks, player state, and queue management:

```typescript
import type { Track, PlayerStatus, QueueState } from "@signalform/shared";

const track: Track = {
  id: "1",
  title: "Song Title",
  artist: "Artist Name",
  album: "Album Name",
  duration: 180,
  sources: [],
};
```

Available types:

- **Track Types**: `Track`, `TrackSource`, `AudioQuality`, `SourceType`
- **Player Types**: `PlayerStatus`, `PlaybackState`, `RepeatMode`
- **Queue Types**: `QueueState`, `QueueItem`
- **Source Types**: `SourceHierarchy`, `DEFAULT_SOURCE_HIERARCHY`

## Development

```bash
# Build the package
pnpm build

# Watch mode (incremental compilation)
pnpm dev

# Run tests
pnpm test

# Type check without emitting files
pnpm type-check
```

## TypeScript Project References

This package uses TypeScript Project References for incremental builds. The frontend and backend packages reference this shared package in their `tsconfig.json`:

```json
{
  "references": [{ "path": "../shared" }]
}
```

When you build from the workspace root with `pnpm -r build`, TypeScript automatically builds the shared package first, then frontend and backend in parallel.

## Architecture Compliance

- **Runtime utilities**: Includes formatting, validation, result types, and Tidal utilities alongside type definitions
- **Production dependency**: zod (schema validation)
- **Immutable types**: All properties are `readonly`
- **ESM only**: Uses `"type": "module"` for ES2022 modules
- **Strict TypeScript**: Full strict mode with all safety flags enabled

## License

Private package - part of signalform monorepo.
