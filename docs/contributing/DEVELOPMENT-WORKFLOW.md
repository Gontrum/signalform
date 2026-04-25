# Development Workflow

Day-to-day commands, debugging, and configuration for Signalform development.
For initial setup, see [CONTRIBUTING.md](../../CONTRIBUTING.md).

---

## Commands

### Root (all packages)

```bash
pnpm dev              # Start all packages in dev mode (parallel)
pnpm test             # Run all tests
pnpm test:coverage    # Tests + coverage (>= 70% enforced)
pnpm type-check       # TypeScript strict check
pnpm lint             # ESLint
pnpm lint:fix         # ESLint auto-fix
pnpm format           # Prettier
pnpm build            # Production build (sequential)
pnpm precommit        # All quality gates
```

### Per package

```bash
# Backend
pnpm --filter @signalform/backend test
pnpm --filter @signalform/backend dev

# Frontend
pnpm --filter @signalform/frontend test
pnpm --filter @signalform/frontend test:e2e   # Playwright

# Shared
pnpm --filter @signalform/shared test
```

### Workspace operations

```bash
pnpm --filter @signalform/backend add lodash-es    # Add dependency
pnpm add -D -w eslint-plugin-new                    # Add root dev dependency
pnpm -r run build                                   # Build all packages
pnpm up -i                                           # Interactive update
```

---

## Hot reload

| Package  | Mechanism                 | Notes                                                                 |
| -------- | ------------------------- | --------------------------------------------------------------------- |
| Frontend | Vite HMR (port 5173)      | Component state preserved, proxies `/api` and `/socket.io` to backend |
| Backend  | `tsx --watch` (port 3001) | Auto-restarts on save, WebSocket clients auto-reconnect               |
| Shared   | `tsc --watch`             | Changes auto-picked up by backend and frontend                        |

---

## Debugging

### Backend (Node.js)

**VS Code**: Add to `.vscode/launch.json`:

```json
{
  "name": "Debug Backend",
  "type": "node",
  "request": "launch",
  "cwd": "${workspaceFolder}/packages/backend",
  "runtimeExecutable": "pnpm",
  "runtimeArgs": ["dev"],
  "console": "integratedTerminal",
  "skipFiles": ["<node_internals>/**"]
}
```

**Chrome DevTools**: `node --inspect-brk ./node_modules/.bin/tsx src/index.ts`,
then open `chrome://inspect`.

**Logs**: Pino logger, level controlled via `LOG_LEVEL` env var (default: `info`).

### Frontend (Vue)

- [Vue DevTools](https://devtools.vuejs.org/) browser extension for
  component tree, Pinia stores, and event tracking.
- Browser DevTools Sources tab for breakpoints in `.vue` files.

### Tests

See [TESTING.md](TESTING.md#debugging-tests).

---

## Environment configuration

### Backend

Configuration comes from `config.json` (created by the setup wizard on first
launch). Environment variables override `config.json` values:

| Variable         | Required | Default       | Description                       |
| ---------------- | -------- | ------------- | --------------------------------- |
| `LMS_HOST`       | Yes      | -             | LMS server hostname or IP         |
| `LMS_PORT`       | Yes      | `9000`        | LMS server port                   |
| `LMS_PLAYER_ID`  | Yes      | -             | MAC address of player to control  |
| `LASTFM_API_KEY` | No       | -             | Last.fm API key                   |
| `FANART_API_KEY` | No       | -             | Fanart.tv API key                 |
| `PORT`           | No       | `3001`        | Backend server port               |
| `NODE_ENV`       | No       | `development` | Environment                       |
| `LOG_LEVEL`      | No       | `info`        | Log level (error/warn/info/debug) |

### Frontend

No configuration needed in development. Vite proxies `/api` and `/socket.io`
to the backend automatically.

### Production

Configuration lives in `/app/config/config.json`:

```json
{
  "lms": {
    "host": "192.168.1.10",
    "port": 9000,
    "playerId": "aa:bb:cc:dd:ee:ff"
  },
  "apiKeys": { "lastfm": "...", "fanart": "..." },
  "server": { "port": 3001 }
}
```

---

## Cleaning up

```bash
rm -rf packages/*/dist packages/*/coverage   # Build artifacts
rm -rf node_modules packages/*/node_modules   # Fresh install
pnpm install
```
