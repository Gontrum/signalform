# System Context

Shows what Signalform is, who uses it, and which external systems it talks to.

```mermaid
graph TD
  user["Music Listener\n(Browser)"]

  subgraph signalform["Signalform"]
    sf["Fastify backend + Vue 3 frontend\nSingle container, port 3001"]
  end

  lms["Lyrion Music Server (LMS)\nJSON-RPC API\nLibrary, playback, streaming plugins"]
  tidal["Tidal\n(via LMS plugin)"]
  qobuz["Qobuz\n(via LMS plugin)"]
  lastfm["Last.fm API\nBiographies, similar artists, top tracks"]
  fanart["Fanart.tv API\nArtist images, album artwork"]

  user -->|"HTTP + WebSocket"| sf
  sf -->|"HTTP JSON-RPC"| lms
  lms -->|"Tidal plugin"| tidal
  lms -->|"Qobuz plugin"| qobuz
  sf -->|"HTTPS REST"| lastfm
  sf -->|"HTTPS REST"| fanart

  style signalform fill:#e8eef8,stroke:#4a6aa8
  style lms fill:#f0f0f0,stroke:#888
  style tidal fill:#f0f0f0,stroke:#888
  style qobuz fill:#f0f0f0,stroke:#888
  style lastfm fill:#f0f0f0,stroke:#888
  style fanart fill:#f0f0f0,stroke:#888
```

## Key decisions

**Signalform does not replace LMS.** LMS handles all audio output, library
scanning, and streaming-service authentication. Signalform is a UI layer
on top of LMS's JSON-RPC API.

**No direct Tidal/Qobuz API calls.** Signalform talks to LMS, which uses
its own plugins to communicate with the streaming services. This means
Signalform does not need streaming-service credentials.

**Single deployable unit.** The Fastify backend serves the compiled Vue
frontend as static files. One container, one port (`3001`).
