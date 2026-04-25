# Testing Guide

## Philosophy

Signalform follows **Outside-In TDD**: start with acceptance criteria,
write a failing test, implement the minimum code, refactor, repeat.

## Test types

| Type        | Suffix                 | Location     | Speed   | Mocks         | Purpose                 |
| ----------- | ---------------------- | ------------ | ------- | ------------- | ----------------------- |
| Unit        | `.test.ts`             | `core/`      | < 1ms   | None          | Pure functions          |
| Integration | `.integration.test.ts` | `shell/`     | < 100ms | External deps | HTTP routes, stores     |
| Acceptance  | `.acceptance.test.ts`  | Feature root | < 10ms  | None          | Feature scenarios (BDD) |
| E2E         | `.spec.ts`             | `e2e/`       | Seconds | None          | Browser user journeys   |

### When to use which

- **Unit**: Pure functions in `core/` -- mappers, validators, business logic
- **Integration**: Fastify routes, Pinia stores, WebSocket handlers
- **Acceptance**: Full feature scenarios calling `core/` directly with
  Given/When/Then helpers
- **E2E**: Critical user flows only (Playwright)

## File placement

Tests are co-located with source files:

```
features/{feature}/
├── core/
│   ├── service.ts
│   └── service.test.ts              # Unit test
├── shell/
│   ├── route.ts
│   └── route.integration.test.ts    # Integration test
└── acceptance.test.ts               # Acceptance test
```

## Coverage

**Minimum**: >= 70% across all packages (enforced pre-commit).

| Layer         | Target  |
| ------------- | ------- |
| Core logic    | 90-100% |
| Shell logic   | 70-80%  |
| UI components | 60-70%  |

```bash
pnpm test:coverage
open packages/backend/coverage/index.html   # HTML report
```

## Running tests

```bash
pnpm test                    # All tests, all packages
pnpm test:coverage           # With coverage enforcement
pnpm --filter @signalform/backend test   # Single package
pnpm test service.test.ts    # Single file

# Playwright (frontend E2E)
cd packages/frontend
pnpm test:e2e                # Headless
pnpm test:e2e --headed       # With browser
pnpm test:e2e --debug        # Step-through
```

## Debugging tests

**Console**: `console.log()` output appears in test output.

**VS Code**: Set breakpoint, run "Debug Current Test File".

**Node inspector**: `node --inspect-brk ./node_modules/.bin/vitest run file.test.ts`

**Playwright Inspector**: Add `await page.pause()` in a test.

## Key conventions

- **Arrange-Act-Assert** pattern in all tests
- **`let` is allowed** at `describe` level for `beforeEach`/`afterEach` setup --
  never inside test bodies
- **No mocks in core tests** -- pure functions don't need them
- **`afterEach` cleanup** -- always close Fastify instances
- **`test()` for acceptance**, `it()` for unit and integration tests
- Test behavior, not implementation

## Templates

See [TEST-TEMPLATES.md](TEST-TEMPLATES.md) for copy-paste templates for all
three test types.
