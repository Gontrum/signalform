# Test Templates

Copy-paste templates for the three test types used in Signalform.
All templates follow the actual conventions used in this codebase.

See [TESTING.md](TESTING.md) for the full rationale behind these conventions.

---

## Table of Contents

- [Unit Test Template](#unit-test-template)
- [Integration Test Template](#integration-test-template)
- [Acceptance Test Template](#acceptance-test-template)

---

## Unit Test Template

**Location**: `src/features/{feature}/core/service.test.ts`
**File suffix**: `.test.ts`
**Imports**: No `await`, no framework imports, no mocks

Unit tests cover pure functions in `core/`. They use optional `given`/`when`/`then`
helper functions for readability, but standard Arrange-Act-Assert is equally valid.

```typescript
/**
 * {Feature} Core Unit Tests
 *
 * Tests for pure business logic functions in core/service.ts.
 * No I/O, no mocks, no framework imports.
 */

import { describe, it, expect } from "vitest";
import { myFunction, anotherFunction } from "./service.js";

// ─── Optional BDD helpers (use when they improve readability) ────────────────

const givenInput = (value: string) => value;

const whenProcessing = (input: string) => myFunction(input);

const thenResultIs = (
  result: ReturnType<typeof myFunction>,
  expected: string,
): void => {
  expect(result.ok).toBe(true);
  if (result.ok) {
    expect(result.value).toBe(expected);
  }
};

const thenResultIsError = (
  result: ReturnType<typeof myFunction>,
  errorType: string,
): void => {
  expect(result.ok).toBe(false);
  if (!result.ok) {
    expect(result.error.type).toBe(errorType);
  }
};

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("myFunction", () => {
  it("returns ok when input is valid", () => {
    const input = givenInput("valid-input");

    const result = whenProcessing(input);

    thenResultIs(result, "expected-output");
  });

  it("returns INVALID_INPUT error when input is empty", () => {
    const input = givenInput("");

    const result = whenProcessing(input);

    thenResultIsError(result, "INVALID_INPUT");
  });

  it("returns INVALID_INPUT error when input is whitespace-only", () => {
    const result = myFunction("   ");

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.type).toBe("INVALID_INPUT");
    }
  });
});

describe("anotherFunction", () => {
  it("handles edge case correctly", () => {
    const result = anotherFunction([]);

    expect(result).toHaveLength(0);
  });
});
```

**Rules:**

- No `import ... from "fastify"`, `from "vitest" → vi`, or any I/O import
- No `async`/`await` in test bodies
- No `vi.mock()`
- Errors as values: always use `Result<T, E>`, never `throw`

---

## Integration Test Template

**Location**: `src/features/{feature}/shell/route.integration.test.ts`
**File suffix**: `.integration.test.ts`
**Pattern**: `beforeEach` creates server + mocks, `afterEach` closes server

Integration tests cover Fastify routes in `shell/`. All external dependencies
(LMS, last.fm, etc.) are mocked. The Fastify instance is real.

```typescript
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";
import { ok, err } from "@signalform/shared";
import { create{Feature}Route } from "./route.js";
import {
  createLmsClient,
  type LmsClient,
  type LmsConfig,
} from "../../../adapters/lms-client/index.js";

// ─── Config ──────────────────────────────────────────────────────────────────

const defaultConfig: LmsConfig = {
  host: "localhost",
  port: 9000,
  playerId: "00:00:00:00:00:00",
  timeout: 5000,
};

// ─── Mock types ──────────────────────────────────────────────────────────────

type MockLmsClient = LmsClient & {
  readonly getSomething: ReturnType<typeof vi.fn<LmsClient["getSomething"]>>;
};

const createMockLmsClient = (): MockLmsClient => ({
  ...createLmsClient(defaultConfig),
  getSomething: vi
    .fn<LmsClient["getSomething"]>()
    .mockResolvedValue(ok({ items: [], count: 0 })),
});

// ─── Response parsers (type-safe, no casting) ────────────────────────────────

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const parseCodeBody = (body: string): { readonly code: string } => {
  const parsed: unknown = JSON.parse(body);
  const code =
    isRecord(parsed) && typeof parsed["code"] === "string"
      ? parsed["code"]
      : null;
  expect(code).not.toBeNull();
  return { code: code ?? "" };
};

const parseItemsBody = (
  body: string,
): { readonly items: readonly unknown[]; readonly totalCount: number } => {
  const parsed: unknown = JSON.parse(body);
  const items =
    isRecord(parsed) && Array.isArray(parsed["items"])
      ? parsed["items"]
      : null;
  const totalCount =
    isRecord(parsed) && typeof parsed["totalCount"] === "number"
      ? parsed["totalCount"]
      : null;
  expect(items).not.toBeNull();
  expect(totalCount).not.toBeNull();
  return { items: items ?? [], totalCount: totalCount ?? 0 };
};

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("GET /api/{feature}", () => {
  let server: FastifyInstance;
  let mockLmsClient: MockLmsClient;

  beforeEach(async () => {
    mockLmsClient = createMockLmsClient();
    server = Fastify({ logger: false });
    create{Feature}Route(server, mockLmsClient, defaultConfig);
    await server.ready();
  });

  afterEach(() => {
    void server.close();
  });

  it("returns 200 with items on success", async () => {
    mockLmsClient.getSomething.mockResolvedValue(
      ok({ items: [{ id: 1, name: "Test" }], count: 1 }),
    );

    const response = await server.inject({
      method: "GET",
      url: "/api/{feature}",
    });

    expect(response.statusCode).toBe(200);
    const body = parseItemsBody(response.body);
    expect(body.items).toHaveLength(1);
    expect(body.totalCount).toBe(1);
  });

  it("returns 503 when LMS is unreachable", async () => {
    mockLmsClient.getSomething.mockResolvedValue(
      err({ type: "NetworkError", message: "Connection refused" }),
    );

    const response = await server.inject({
      method: "GET",
      url: "/api/{feature}",
    });

    expect(response.statusCode).toBe(503);
    const body = parseCodeBody(response.body);
    expect(body.code).toBe("LMS_UNREACHABLE");
  });

  it("returns 400 when required param is missing", async () => {
    const response = await server.inject({
      method: "GET",
      url: "/api/{feature}?invalid=true",
    });

    expect(response.statusCode).toBe(400);
    const body = parseCodeBody(response.body);
    expect(body.code).toBe("INVALID_INPUT");
  });

  it("returns empty list with 0 totalCount when source returns nothing", async () => {
    mockLmsClient.getSomething.mockResolvedValue(
      ok({ items: [], count: 0 }),
    );

    const response = await server.inject({
      method: "GET",
      url: "/api/{feature}",
    });

    expect(response.statusCode).toBe(200);
    const body = parseItemsBody(response.body);
    expect(body.items).toHaveLength(0);
    expect(body.totalCount).toBe(0);
  });
});
```

**Rules:**

- `let server` and `let mockLmsClient` at `describe` level — **never** inside a test body
- `afterEach(() => { void server.close(); })` — `void` because we don't need to await it
- Never call `afterEach(...)` inside a test body (Vitest anti-pattern)
- Response parsers use runtime type guards — no `as` casting
- Each `describe` block gets its own `beforeEach`/`afterEach` pair

---

## Acceptance Test Template

**Location**: `src/features/{feature}/acceptance.test.ts`
**File suffix**: `.acceptance.test.ts`
**Pattern**: Fluent Given/When/Then helpers, `test()` not `it()`

Acceptance tests cover a full feature scenario from the user's perspective.
They call into `core/` functions directly (or via a thin adapter) and use
BDD-style helpers to make scenarios read like specifications.

```typescript
/**
 * {Feature} Acceptance Tests (Story X.Y)
 *
 * BDD-style tests covering user-facing scenarios.
 * Fluent Given/When/Then API.
 */

import { describe, test, expect } from "vitest";
import type { SomeType } from "../../adapters/some-client/index.js";
import { featureFunction } from "./core/service.js";

// ─── BDD helpers ─────────────────────────────────────────────────────────────

const givenItemsFromSources = (
  name: string,
  sources: ReadonlyArray<"local" | "tidal">,
): readonly SomeType[] =>
  sources.map((source) => ({
    id: `${source}-${name}`,
    name,
    source,
    url: `${source}://items/${name.toLowerCase()}`,
  }));

const whenProcessing = (items: readonly SomeType[]) => featureFunction(items);

const thenResultCount = (
  results: ReturnType<typeof featureFunction>,
  expected: number,
): void => {
  expect(results).toHaveLength(expected);
};

const thenResultHasSource = (
  results: ReturnType<typeof featureFunction>,
  index: number,
  expected: string,
): void => {
  expect(results[index]?.source).toBe(expected);
};

// ─── Acceptance scenarios ────────────────────────────────────────────────────

describe("Story X.Y: {Feature Description}", () => {
  test("User sees deduplicated results when same item exists in multiple sources", () => {
    const items = givenItemsFromSources("Nevermind", ["local", "tidal"]);

    const results = whenProcessing(items);

    thenResultCount(results, 1);
    thenResultHasSource(results, 0, "local");
  });

  test("User sees all items when no duplicates exist", () => {
    const items = [
      ...givenItemsFromSources("Nevermind", ["local"]),
      ...givenItemsFromSources("In Utero", ["tidal"]),
    ];

    const results = whenProcessing(items);

    thenResultCount(results, 2);
  });

  test("User gets empty list when source returns nothing", () => {
    const results = whenProcessing([]);

    thenResultCount(results, 0);
  });
});
```

**Rules:**

- Use `test()` instead of `it()` for acceptance tests (reads better as specifications)
- Test names describe the user scenario, not the implementation
- `given*` helpers build input data
- `when*` helpers call the function under test
- `then*` helpers make assertions
- Acceptance tests call `core/` functions directly — they do **not** spin up HTTP servers
- If you need an HTTP-level acceptance test, use `.integration.test.ts` instead

---

## Quick Reference

|                       | Unit           | Integration            | Acceptance            |
| --------------------- | -------------- | ---------------------- | --------------------- |
| **Suffix**            | `.test.ts`     | `.integration.test.ts` | `.acceptance.test.ts` |
| **Location**          | `core/`        | `shell/`               | feature root          |
| **Uses `await`**      | No             | Yes                    | No                    |
| **Uses `beforeEach`** | Rarely         | Always                 | Rarely                |
| **Mocks**             | None           | External deps          | None                  |
| **Calls**             | Pure functions | HTTP routes            | Core functions        |
| **Uses `test()`**     | No (`it`)      | No (`it`)              | Yes                   |
| **Speed**             | < 1ms          | < 100ms                | < 10ms                |
