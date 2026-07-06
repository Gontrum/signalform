/**
 * WebSocket Module Exports
 */

export { setupWebSocket } from "./server.js";
export type { TypedSocketIOServer } from "./server.js";

export { startStatusPolling } from "./status-poller.js";

export {
  PLAYER_STATUS_CHANGED,
  SYSTEM_LMS_DISCONNECTED,
  SYSTEM_LMS_RECONNECTED,
  PLAYER_UPDATES_ROOM,
  PLAYER_QUEUE_UPDATED,
  PLAYER_RADIO_STARTED,
  PLAYER_RADIO_UNAVAILABLE,
} from "./events.js";

export {
  createPlayerStatusPayload,
  createSystemEventPayload,
  hasQueueContextChanged,
  hasStatusChanged,
} from "./handlers.js";
