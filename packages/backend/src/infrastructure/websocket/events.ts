/**
 * WebSocket Event Name Constants
 * Naming convention: SCREAMING_SNAKE_CASE for constants
 * Event names use Domain.Action pattern (e.g., "player.statusChanged")
 */

/**
 * Server to Client Events (Backend emits these)
 */
export const PLAYER_STATUS_CHANGED = "player.statusChanged" as const;
export const PLAYER_TRACK_CHANGED = "player.trackChanged" as const;
export const PLAYER_VOLUME_CHANGED = "player.volumeChanged" as const;
export const SYSTEM_LMS_DISCONNECTED = "system.lmsDisconnected" as const;
export const SYSTEM_LMS_RECONNECTED = "system.lmsReconnected" as const;
export const PLAYER_QUEUE_UPDATED = "player.queue.updated" as const;
export const PLAYER_RADIO_STARTED = "player.radio.started" as const;
export const PLAYER_RADIO_UNAVAILABLE = "player.radio.unavailable" as const;

/**
 * Client to Server Events (Frontend subscribes/unsubscribes)
 */
export const PLAYER_SUBSCRIBE = "player.subscribe" as const;
export const PLAYER_UNSUBSCRIBE = "player.unsubscribe" as const;

/**
 * WebSocket Room Names
 */
export const PLAYER_UPDATES_ROOM = "player-updates" as const;
