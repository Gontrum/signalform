# @signalform/backend

Backend package for the Signalform project (Lyrion Music Server Web Client).

## Overview

Node.js/TypeScript backend using Fastify framework with functional programming patterns. Serves as the Backend-for-Frontend (BFF) layer between the Vue.js frontend and LMS server.

## Tech Stack

- **Framework:** Fastify v5.x (performance-optimized, TypeScript-first)
- **WebSocket:** Socket.IO v4.x (real-time player updates)
- **Logging:** Winston v3.x (structured JSON logging)
- **Validation:** Zod v4.x (runtime type checking)
- **Testing:** Vitest v4.x (unit and integration tests)
- **Dev Server:** tsx (fast TypeScript execution with watch mode)

## Architecture Compliance

This package follows strict functional programming patterns:

- ✅ **No Classes** - Only functions (factory functions for DI)
- ✅ **Immutability** - Only `const`, no `let` (enforced by ESLint)
- ✅ **Result Types** - Using Result<T, E> for error handling (Story 1.4)
- ✅ **Feature-Based Structure** - NOT layer-based (no controllers/, services/, models/)
- ✅ **TypeScript Strict Mode** - All safety flags enabled

## Project Structure

```
packages/backend/
├── src/
│   ├── features/          # Feature modules (Functional Core)
│   │   ├── config/
│   │   ├── enrichment/
│   │   ├── health/
│   │   ├── library/
│   │   ├── metadata/
│   │   ├── playback/
│   │   ├── queue/
│   │   ├── radio-mode/
│   │   ├── search/
│   │   ├── setup/
│   │   ├── source-hierarchy/
│   │   ├── tidal-albums/
│   │   └── tidal-artists/
│   ├── adapters/          # External system adapters (Imperative Shell)
│   │   ├── fanart-client/
│   │   ├── lastfm-client/
│   │   └── lms-client/
│   ├── shared/            # Backend-specific utilities
│   │   ├── config/
│   │   ├── lms-registry.ts
│   │   ├── logger.ts      # Winston logger configuration
│   │   ├── normalizeArtist.ts
│   │   ├── types.test.ts
│   │   └── websocket/
│   ├── server.ts          # Fastify server factory
│   └── index.ts           # Application entry point
├── package.json
├── tsconfig.json          # TypeScript strict mode config
├── vitest.config.ts       # Vitest test runner config
└── .eslintrc.cjs          # ESLint functional rules
```

## Development

### Scripts

```bash
# Start development server with watch mode
pnpm dev

# Build production bundle
pnpm build

# Run tests
pnpm test

# Run tests once (CI mode)
pnpm test:unit

# Type check without emitting files
pnpm type-check
```

### Development Server

The backend runs on:

- **Port:** 3001 (default, overridable via PORT env var)
- **Host:** 0.0.0.0 (accessible from local network)
- **Health Check:** http://localhost:3001/health

### Winston Logger Integration

The backend uses Winston for structured logging, integrated with Fastify:

```typescript
import { createLogger } from "./shared/logger.js";

const logger = createLogger();
logger.info("Application started");
logger.error("Error occurred", { error });
```

Winston is configured with:

- JSON structured logging
- Timestamp inclusion
- Error stack trace support
- Console transport for development

## Testing

Tests use Vitest with Node environment:

```bash
# Watch mode (development)
pnpm test

# Run once (CI)
pnpm test:unit
```

### Test Coverage

- **Target:** >70% for business logic
- **Co-located tests:** service.ts + service.test.ts in same folder
- **Test types:** Unit, Integration, Acceptance (E2E)

## Package Dependencies

**Production:**

- fastify: ^5.2.0
- @fastify/websocket: ^11.0.1
- socket.io: ^4.8.1
- winston: ^3.17.0
- zod: ^4.3.6

**Development:**

- typescript: ^5.9.3
- vitest: ^4.0.18
- tsx: ^4.19.2
- @types/node: ^25.2.2
- ESLint + plugins (functional programming rules)

## Version History

- **v1.0.0** - Initial backend setup with Fastify, Winston, Socket.IO, Zod, Vitest

## Related Packages

- [frontend](../frontend) - Vue.js 3 SPA
- [@signalform/shared](../shared) - Shared types and utilities (Story 1.4)

## License

Private project - not licensed for external use
