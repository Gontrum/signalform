/**
 * Search Feature - Public API
 *
 * Exports for use by server and other modules.
 */

export { createSearchRoute } from "./shell/route.js";
export { searchTracks } from "./core/service.js";
export type {
  SearchRequest,
  SearchResponse,
  SearchError,
} from "./core/types.js";
