/**
 * Search Route - Imperative Shell
 *
 * Handles HTTP layer, validation, and side effects.
 * Delegates business logic to service layer.
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { z } from "zod";
import { err, ok, type Result } from "@signalform/shared";
import type { LmsClient } from "../../../adapters/lms-client/index.js";
import { isRecord } from "../../../adapters/lms-client/execute.js";
import {
  searchTracks,
  getAutocompleteSuggestions,
  transformToFullResults,
} from "../core/service.js";
import { getCachedResults, setCachedResults } from "./cache.js";
import type { SearchResultsResponse, TagSearchMatch } from "../core/types.js";
import type { SearchResult as LmsSearchResult } from "../../../adapters/lms-client/index.js";
import type { DiscogsClient } from "../../../adapters/discogs-client/index.js";
import {
  getTagCandidates,
  type TagLookupError,
} from "../../album-tags/shell/tag-lookup.js";

const SearchRequestSchema = z.object({
  query: z
    .string()
    .min(2, "Query must be at least 2 characters")
    .max(100, "Query must not exceed 100 characters")
    .refine((val) => val.trim().length > 0, {
      message: "Query cannot be empty",
    }),
  full: z.boolean().optional().default(false),
});

const AutocompleteQuerySchema = z.object({
  q: z
    .string()
    .min(2, "Query must be at least 2 characters")
    .max(100, "Query must not exceed 100 characters")
    .refine((val) => val.trim().length > 0, {
      message: "Query cannot be empty",
    }),
});

const isBasicSearchResponse = (
  value: unknown,
): value is {
  readonly results: readonly LmsSearchResult[];
  readonly query: string;
  readonly totalCount: number;
} => {
  if (!isRecord(value)) {
    return false;
  }

  return (
    Array.isArray(value["results"]) &&
    typeof value["query"] === "string" &&
    typeof value["totalCount"] === "number"
  );
};

const isSearchResultsResponse = (
  value: unknown,
): value is SearchResultsResponse => {
  if (!isRecord(value)) {
    return false;
  }

  return (
    Array.isArray(value["tracks"]) &&
    Array.isArray(value["albums"]) &&
    Array.isArray(value["artists"]) &&
    Array.isArray(value["tags"]) &&
    typeof value["query"] === "string" &&
    typeof value["totalResults"] === "number"
  );
};

/**
 * Sends the shared "LMS not reachable" 503 response after logging the
 * upstream failure. Shared by the full-search and autocomplete routes,
 * which only differ in their log message.
 */
const sendLmsSearchUnavailable = (
  request: FastifyRequest,
  reply: FastifyReply,
  context: {
    readonly query: string;
    readonly error: { readonly type: string; readonly message: string };
    readonly startTime: number;
    readonly logMessage: string;
  },
): FastifyReply => {
  request.log.error(
    {
      query: context.query,
      error: context.error.type,
      message: context.error.message,
      duration: Date.now() - context.startTime,
    },
    context.logMessage,
  );

  return reply.code(503).send({
    message: "LMS not reachable",
    code: "LMS_UNREACHABLE",
  });
};

const isCachedSearchResponse = (
  value: unknown,
): value is
  | SearchResultsResponse
  | {
      readonly results: readonly LmsSearchResult[];
      readonly query: string;
      readonly totalCount: number;
    } => {
  return isSearchResultsResponse(value) || isBasicSearchResponse(value);
};

const TAG_PREFIX = "tag:";

/**
 * `tag:<text>` routes a full search to a global Discogs tag lookup instead
 * of the normal local/Tidal search. Returns undefined when the query carries
 * no `tag:` prefix so callers can fall through to the normal search path
 * with zero extra work.
 */
const parseTagQuery = (query: string): string | undefined => {
  const trimmed = query.trim();
  return trimmed.toLowerCase().startsWith(TAG_PREFIX)
    ? trimmed.slice(TAG_PREFIX.length).trim()
    : undefined;
};

/**
 * Resolves a `tag:` search against the shared, cached Discogs candidate list.
 * Tags are a secondary feature — a Discogs failure must never break the
 * primary search feature, so the caller still answers 200 with an empty tag
 * list. The failure stays visible in the Result so that degraded answer is
 * not written to the search cache: caching it would keep showing "no
 * results" for the full TTL after Discogs recovered.
 */
const resolveTagSearch = async (
  discogsClient: DiscogsClient,
  tagQuery: string,
  request: FastifyRequest,
): Promise<Result<readonly TagSearchMatch[], TagLookupError>> => {
  if (tagQuery === "") {
    return ok([]);
  }

  const candidatesResult = await getTagCandidates(discogsClient, tagQuery);
  if (!candidatesResult.ok) {
    request.log.warn(
      {
        error: candidatesResult.error.type,
        message: candidatesResult.error.message,
      },
      "Discogs unavailable during tag search — continuing with an empty tag list",
    );
    return err(candidatesResult.error);
  }

  return ok(
    candidatesResult.value.length > 0
      ? [
          {
            query: tagQuery,
            displayName: tagQuery,
            albumCount: candidatesResult.value.length,
          },
        ]
      : [],
  );
};

/**
 * Factory function to create search route.
 *
 * @param fastify - Fastify server instance
 * @param lmsClient - LMS client dependency
 * @param discogsClient - Discogs client dependency, used for `tag:` searches
 */
export const createSearchRoute = (
  fastify: FastifyInstance,
  lmsClient: LmsClient,
  discogsClient: DiscogsClient,
): void => {
  // POST /api/search - Full search endpoint
  fastify.post<{ readonly Body: unknown }>(
    "/api/search",
    async (
      request: FastifyRequest<{ readonly Body: unknown }>,
      reply: FastifyReply,
    ) => {
      const startTime = Date.now();

      // 1. Validate request
      const validation = SearchRequestSchema.safeParse(request.body);
      if (!validation.success) {
        request.log.warn(
          { errors: validation.error.issues },
          "Invalid search request",
        );
        return reply.code(400).send({
          message: "Invalid request format",
          code: "INVALID_INPUT",
          details: validation.error.issues,
        });
      }

      const { query, full } = validation.data;

      request.log.debug(
        { endpoint: "/api/search", method: "POST", query, full },
        "Search request received",
      );

      // 2. Check cache
      const cacheKey = `${query}:${full ? "full" : "basic"}`;
      const cached = getCachedResults(cacheKey, isCachedSearchResponse);

      if (cached) {
        request.log.info(
          {
            query,
            full,
            cached: true,
            duration: Date.now() - startTime,
          },
          "Returned cached search results",
        );
        return reply.code(200).send(cached);
      }

      // 3. `tag:` search short-circuits to a Discogs tag lookup, skipping the
      // LMS/Tidal search entirely — only relevant for full-results requests.
      if (full) {
        const tagQuery = parseTagQuery(query);
        if (tagQuery !== undefined) {
          const tagsResult = await resolveTagSearch(
            discogsClient,
            tagQuery,
            request,
          );
          const tags = tagsResult.ok ? tagsResult.value : [];
          const responseData: SearchResultsResponse = {
            tracks: [],
            albums: [],
            artists: [],
            tags,
            query,
            totalResults: 0,
          };
          if (tagsResult.ok) {
            setCachedResults(cacheKey, responseData);
          }

          request.log.info(
            {
              query,
              tagCount: tags.length,
              duration: Date.now() - startTime,
            },
            "Tag search completed successfully",
          );

          return reply.code(200).send(responseData);
        }
      }

      // 4. Call LMS adapter (Imperative Shell) - only if not cached
      const lmsResult = await lmsClient.search(query);

      // 5. Handle LMS errors
      if (!lmsResult.ok) {
        return sendLmsSearchUnavailable(request, reply, {
          query,
          error: lmsResult.error,
          startTime,
          logMessage: "LMS search failed",
        });
      }

      // 6. Process with business logic (Functional Core)
      // Choose between full results or basic search based on 'full' flag
      if (full) {
        const fullResultsResult = transformToFullResults(
          query,
          lmsResult.value.tracks,
        );

        // 6a. Handle business logic errors (full results mode)
        /* istanbul ignore next - Defensive check */
        if (!fullResultsResult.ok) {
          const statusCode =
            fullResultsResult.error.code === "EMPTY_QUERY" ? 400 : 500;
          request.log.warn(
            {
              query,
              error: fullResultsResult.error.code,
              duration: Date.now() - startTime,
            },
            "Full results transformation failed",
          );

          return reply.code(statusCode).send({
            message: fullResultsResult.error.message,
            code: fullResultsResult.error.code,
          });
        }

        // 7a. Cache and return full results — a plain (non-`tag:`) query
        // never carries tag matches.
        const responseData = {
          ...fullResultsResult.value,
          tags: [] as const,
          tidalAvailable: lmsResult.value.tidalAvailable,
        };
        setCachedResults(cacheKey, responseData);

        request.log.info(
          {
            query,
            trackCount: responseData.tracks.length,
            albumCount: responseData.albums.length,
            duration: Date.now() - startTime,
          },
          "Full search completed successfully",
        );

        return reply.code(200).send(responseData);
      }

      // Basic search mode (existing behavior)
      const searchResult = searchTracks(query, lmsResult.value.tracks);

      // 6b. Handle business logic errors (basic mode)
      /* istanbul ignore next - Defensive check: Zod validation already prevents
         empty queries from reaching this point, but we keep this for defense in depth */
      if (!searchResult.ok) {
        const statusCode =
          searchResult.error.code === "EMPTY_QUERY" ? 400 : 500;
        request.log.warn(
          {
            query,
            error: searchResult.error.code,
            duration: Date.now() - startTime,
          },
          "Search validation failed",
        );

        return reply.code(statusCode).send({
          message: searchResult.error.message,
          code: searchResult.error.code,
        });
      }

      // 7b. Cache and return basic results
      const responseData = {
        results: searchResult.value,
        query,
        totalCount: searchResult.value.length,
        tidalAvailable: lmsResult.value.tidalAvailable,
      };
      setCachedResults(cacheKey, responseData);

      request.log.info(
        {
          query,
          resultCount: searchResult.value.length,
          duration: Date.now() - startTime,
        },
        "Search completed successfully",
      );

      return reply.code(200).send(responseData);
    },
  );

  // GET /api/search/autocomplete - Autocomplete suggestions endpoint
  fastify.get<{ readonly Querystring: unknown }>(
    "/api/search/autocomplete",
    async (
      request: FastifyRequest<{ readonly Querystring: unknown }>,
      reply: FastifyReply,
    ) => {
      const startTime = Date.now();

      // 1. Validate query parameter
      const validation = AutocompleteQuerySchema.safeParse(request.query);
      if (!validation.success) {
        request.log.warn(
          { errors: validation.error.issues },
          "Invalid autocomplete request",
        );
        return reply.code(400).send({
          message: "Invalid request format",
          code: "INVALID_INPUT",
          details: validation.error.issues,
        });
      }

      const { q: query } = validation.data;

      request.log.debug(
        { endpoint: "/api/search/autocomplete", method: "GET", query },
        "Autocomplete request received",
      );

      // 2. Call LMS adapter (Imperative Shell)
      const lmsResult = await lmsClient.search(query);

      // 3. Handle LMS errors
      if (!lmsResult.ok) {
        return sendLmsSearchUnavailable(request, reply, {
          query,
          error: lmsResult.error,
          startTime,
          logMessage: "LMS autocomplete search failed",
        });
      }

      // 4. Process with autocomplete logic (Functional Core)
      const autocompleteResult = getAutocompleteSuggestions(
        query,
        lmsResult.value.tracks,
      );

      // 5. Handle business logic errors
      /* istanbul ignore next - Defensive check: Zod validation already prevents
         empty queries from reaching this point, but we keep this for defense in depth */
      if (!autocompleteResult.ok) {
        const statusCode =
          autocompleteResult.error.code === "EMPTY_QUERY" ? 400 : 500;
        request.log.warn(
          {
            query,
            error: autocompleteResult.error.code,
            duration: Date.now() - startTime,
          },
          "Autocomplete validation failed",
        );

        return reply.code(statusCode).send({
          message: autocompleteResult.error.message,
          code: autocompleteResult.error.code,
        });
      }

      // 6. Log success and return
      request.log.info(
        {
          query,
          suggestionCount: autocompleteResult.value.length,
          duration: Date.now() - startTime,
        },
        "Autocomplete completed successfully",
      );

      return reply.code(200).send({
        suggestions: autocompleteResult.value,
        query,
        tidalAvailable: lmsResult.value.tidalAvailable,
      });
    },
  );
};
