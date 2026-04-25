# Package Dependencies

Shows the three monorepo packages and the internal layer structure of each.

## Package-level dependencies

```mermaid
graph TD
  subgraph monorepo["Signalform Monorepo"]
    shared["@signalform/shared\npure types · Result&lt;T,E&gt;\nZod schemas · constants"]
    backend["packages/backend\nFastify API · LMS integration\nLast.fm · Fanart.tv"]
    frontend["packages/frontend\nVue 3 PWA · domains · stores"]
  end

  backend -->|imports| shared
  frontend -->|imports| shared

  style shared fill:#e8f4e8,stroke:#4a9a4a
  style backend fill:#e8eef8,stroke:#4a6aa8
  style frontend fill:#f8ede8,stroke:#a86a4a
```

Backend and frontend **never import from each other**.
`packages/shared` has zero imports from either.

---

## Backend internal layers

```mermaid
graph TD
  server["server.ts\nFastify entry point"]

  subgraph infra["infrastructure/"]
    config["config/\nI/O · parsing"]
    ws["websocket/\nSocket.IO server\nstatus poller"]
    logger["logger.ts"]
    registry["lms-registry.ts"]
    httpErr["http-errors.ts\nsendLmsError"]
  end

  subgraph adapters["adapters/"]
    lms["lms-client/\nexecute · retry\nplayback · queue\nsearch · tidal"]
    lastfm["lastfm-client/\ncircuit breaker"]
    fanart["fanart-client/"]
  end

  subgraph feature["features/{feature}/"]
    core["core/\npure functions\nResult&lt;T,E&gt;"]
    shell["shell/\nroute handlers\norchestration"]
  end

  shared_pkg["@signalform/shared"]

  server --> infra
  server --> feature
  shell --> core
  shell --> adapters
  shell --> infra
  core --> shared_pkg
  adapters --> infra
  adapters --> shared_pkg

  style core fill:#e8f4e8,stroke:#4a9a4a
  style shared_pkg fill:#e8f4e8,stroke:#4a9a4a
  style shell fill:#e8eef8,stroke:#4a6aa8
  style infra fill:#f0f0f0,stroke:#888
  style adapters fill:#f0f0f0,stroke:#888
```

**Enforced constraint:** `core/` may not import from `shell/`, `adapters/`,
or `infrastructure/websocket/**`. Violations fail ESLint (`eslint-plugin-boundaries`).

---

## Frontend internal layers

```mermaid
graph TD
  app["app/\nbootstrap · router\nWebSocket setup"]

  subgraph platform["platform/api/"]
    apiHelpers["apiHelpers.ts\nBaseApiError · mapApiThrownError"]
    commonSchemas["commonSchemas.ts\nAudioQualitySchema"]
    domainApis["playbackApi · queueApi\nsearchApi · albumApi · …"]
  end

  subgraph domains["domains/{domain}/"]
    domCore["core/\npure types · mappers\nno Vue · no I/O"]
    domShell["shell/\ncomposables · stores\nAPI calls"]
    domUi["ui/\nVue components"]
  end

  subgraph sharedCore["domains/shared/core/"]
    apiErrors["api-errors.ts\nBaseApiError\nNotFoundError\nValidationError"]
  end

  shared_pkg["@signalform/shared"]

  app --> domains
  app --> platform
  domShell --> domCore
  domShell --> platform
  domUi --> domShell
  domUi --> domCore
  domCore --> apiErrors
  domCore --> shared_pkg
  platform --> apiErrors
  platform --> shared_pkg

  style domCore fill:#e8f4e8,stroke:#4a9a4a
  style apiErrors fill:#e8f4e8,stroke:#4a9a4a
  style shared_pkg fill:#e8f4e8,stroke:#4a9a4a
  style domShell fill:#f8ede8,stroke:#a86a4a
  style domUi fill:#f8ede8,stroke:#a86a4a
  style platform fill:#e8eef8,stroke:#4a6aa8
```

**Enforced constraint:** `domain core` may not import from `platform/api`,
Vue, Pinia, or any shell module. Violations fail ESLint.

---

## FCIS in one picture

```mermaid
graph LR
  subgraph fc["Functional Core (green)"]
    pure["Pure functions\nResult&lt;T,E&gt;\nNo I/O\nNo framework"]
  end

  subgraph is["Imperative Shell (blue)"]
    io["HTTP handlers\nComposables\nStores\nWebSocket"]
  end

  io -->|calls| pure
  pure -->|returns Result| io
  io -->|sends HTTP response\nor updates reactive state| user["Browser / LMS"]

  style fc fill:#e8f4e8,stroke:#4a9a4a
  style is fill:#e8eef8,stroke:#4a6aa8
```

The shell translates between the messy outside world (HTTP, WebSockets,
reactive state) and the clean inside world (pure functions, typed errors).
