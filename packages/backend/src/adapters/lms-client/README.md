# LMS Client

Type-safe wrapper for Lyrion Music Server (LMS) JSON-RPC 2.0 protocol.

## Overview

This adapter provides a functional, type-safe interface to communicate with LMS. All operations return `Result<T, E>` types for explicit error handling - no exceptions are thrown for business errors.

## Installation

The LMS client is part of the backend package. Import it:

```typescript
import { createLmsClient, type LmsConfig } from "@/adapters/lms-client";
```

## Usage

### Create Client Instance

```typescript
import { createLmsClient } from "@/adapters/lms-client";

const lmsClient = createLmsClient({
  host: "localhost",
  port: 9000,
  playerId: "00:00:00:00:00:00", // MAC address of your player
  timeout: 5000, // Request timeout in milliseconds
});
```

### Search for Tracks

```typescript
const result = await lmsClient.search("Pink Floyd");

if (result.ok) {
  console.log("Found tracks:", result.value);
  // result.value is SearchResult[]
} else {
  console.error("Search failed:", result.error);
  // result.error is LmsError
}
```

### Play a Track

```typescript
const result = await lmsClient.play("file:///music/track.flac");

if (result.ok) {
  console.log("Playback started");
} else {
  console.error("Play failed:", result.error);
}
```

### Pause Playback

```typescript
const result = await lmsClient.pause();

if (result.ok) {
  console.log("Playback paused");
} else {
  console.error("Pause failed:", result.error);
}
```

### Get Player Status

```typescript
const result = await lmsClient.getStatus();

if (result.ok) {
  const status = result.value;
  console.log("Mode:", status.mode); // 'play' | 'pause' | 'stop'
  console.log("Time:", status.time); // Current position in seconds
  console.log("Volume:", status.volume); // 0-100

  if (status.currentTrack) {
    console.log("Now playing:", status.currentTrack.title);
  }
} else {
  console.error("Status query failed:", result.error);
}
```

## Configuration

### LmsConfig

```typescript
type LmsConfig = {
  readonly host: string; // LMS server hostname/IP
  readonly port: number; // LMS server port (default: 9000)
  readonly playerId: string; // Player MAC address (e.g., "00:00:00:00:00:00")
  readonly timeout: number; // Request timeout in milliseconds (recommended: 5000)
};
```

**Finding Your Player ID:**

1. Open LMS web interface: `http://localhost:9000`
2. Go to Settings → Players
3. Copy the MAC address of your player

## Error Handling

All methods return `Result<T, LmsError>` from `@signalform/shared`. Never throws exceptions for business errors.

### Error Types

```typescript
type LmsError =
  | { type: "NetworkError"; message: string } // Connection issues
  | { type: "TimeoutError"; message: string } // Request timeout (5s)
  | { type: "JsonParseError"; message: string } // Invalid JSON response
  | { type: "LmsApiError"; code: number; message: string } // LMS returned error
  | { type: "EmptyQueryError"; message: string }; // Empty search query
```

### Handling Different Error Types

```typescript
const result = await lmsClient.search("query");

if (!result.ok) {
  switch (result.error.type) {
    case "NetworkError":
      console.error("LMS is unreachable:", result.error.message);
      break;
    case "TimeoutError":
      console.error("Request timed out after 5 seconds");
      break;
    case "JsonParseError":
      console.error("LMS returned invalid response");
      break;
    case "LmsApiError":
      console.error(`LMS error ${result.error.code}:`, result.error.message);
      break;
    case "EmptyQueryError":
      console.error("Search query cannot be empty");
      break;
  }
}
```

## Types

### SearchResult

```typescript
type SearchResult = {
  readonly id: string;
  readonly title: string;
  readonly artist: string;
  readonly album: string;
  readonly url: string;
  readonly source: "local" | "qobuz" | "tidal" | "unknown";
};
```

**Source Detection:**

- `local`: File URLs (`file://`)
- `qobuz`: Qobuz URLs (`qobuz://`)
- `tidal`: Tidal URLs (`tidal://`)
- `unknown`: Other protocols (http://, spotify://, etc.)

### PlayerStatus

```typescript
type PlayerStatus = {
  readonly mode: "play" | "pause" | "stop";
  readonly time: number; // Current position in seconds
  readonly duration: number; // Track duration in seconds
  readonly volume: number; // Volume level (0-100)
  readonly currentTrack: SearchResult | null; // null if stopped
};
```

## Architecture Notes

### Functional Programming

- **Factory pattern:** `createLmsClient()` returns client object
- **No classes:** Pure functions only
- **Immutability:** All types are `readonly`
- **No `let`:** Only `const` declarations
- **Result types:** Explicit error handling, no exceptions

### JSON-RPC 2.0 Protocol

LMS uses JSON-RPC 2.0 with method `slim.request`:

```json
{
  "method": "slim.request",
  "params": ["<playerId>", ["<command>", ...params]],
  "id": 1
}
```

**Example Search Request:**

```json
{
  "method": "slim.request",
  "params": [
    "00:00:00:00:00:00",
    ["search", "items", 0, 999, "term:Pink Floyd"]
  ],
  "id": 1
}
```

**Example Response:**

```json
{
  "result": {
    "search_loop": [...tracks],
    "count": 10
  },
  "id": 1,
  "error": null
}
```

### Timeout Behavior

- Connection timeout: **exactly 5000ms**
- Uses `AbortController` to cancel requests
- Timeout error message: `"LMS connection timeout (5s)"`

### Query Validation

Empty queries are validated **client-side** before sending to LMS (fail fast):

```typescript
await lmsClient.search(""); // EmptyQueryError
await lmsClient.search("   "); // EmptyQueryError (whitespace trimmed)
await lmsClient.search("query"); // Sent to LMS
```

### Lenient Parsing

The client uses lenient JSON-RPC parsing:

- Optional fields (like `id`) are not required
- Missing `search_loop` field returns empty array (not error)
- Only strict requirement: check for `error` field in response

## Testing

Run tests:

```bash
pnpm test lms-client
```

Run with coverage:

```bash
pnpm test:coverage lms-client
```

## References

- [LMS JSON-RPC CLI Documentation](http://localhost:9000/html/docs/cli-api.html)
- [JSON-RPC 2.0 Specification](https://www.jsonrpc.org/specification)
- [Result Type Pattern](../../shared/README.md#result-type)
