/**
 * WebSocket Module Exports
 */

export { setupWebSocket } from "./server.js";
export type { TypedSocketIOServer, TypedSocket } from "./server.js";

export { startStatusPolling } from "./status-poller.js";

export {
  PLAYER_STATUS_CHANGED,
  PLAYER_TRACK_CHANGED,
  PLAYER_VOLUME_CHANGED,
  SYSTEM_LMS_DISCONNECTED,
  SYSTEM_LMS_RECONNECTED,
  PLAYER_SUBSCRIBE,
  PLAYER_UNSUBSCRIBE,
  PLAYER_UPDATES_ROOM,
  PLAYER_QUEUE_UPDATED,
  PLAYER_RADIO_STARTED,
  PLAYER_RADIO_UNAVAILABLE,
} from "./events.js";

export {
  createPlayerStatusPayload,
  createPlayerTrackChangedPayload,
  createPlayerVolumeChangedPayload,
  createSystemEventPayload,
  hasQueueContextChanged,
  hasStatusChanged,
} from "./handlers.js";

export type { LmsPlayerStatus, HandlerError } from "./handlers.js";
