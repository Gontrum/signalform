/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE_URL?: string
  readonly VITE_WEBSOCKET_URL?: string
}

// Injected at build time via Vite `define` from packages/frontend/package.json.
declare const __APP_VERSION__: string
