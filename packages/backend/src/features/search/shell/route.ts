/**
 * Search Route - Imperative Shell
 *
 * Handles HTTP layer, validation, and side effects.
 * Delegates business logic to service layer.
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { z } from "zod";
import type { LmsClient } from "../../../adapters/lms-client/index.js";
import {
  searchTracks,
  getAutocompleteSuggestions,
  transformToFullResults,
} from "../core/service.js";
import { getCachedResults, setCachedResults } from "./cache.js";
import type { SearchResultsResponse } from "../core/types.js";
import type { SearchResult as LmsSearchResult } from "../../../adapters/lms-client/index.js";

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

const isRecord = (
  value: unknown,
): value is Readonly<Record<string, unknown>> => {
  return typeof value === "object" && value !== null && !Array.isArray(value);
};

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
    typeof value["query"] === "string" &&
    typeof value["totalResults"] === "number"
  );
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

/**
 * Factory function to create search route.
 *
 * @param fastify - Fastify server instance
 * @param lmsClient - LMS client dependency
 */
export const createSearchRoute = (
  fastify: FastifyInstance,
  lmsClient: LmsClient,
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

      // 2. Check cache (NFR4: < 300ms performance)
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

      // 3. Call LMS adapter (Imperative Shell) - only if not cached
      const lmsResult = await lmsClient.search(query);

      // 4. Handle LMS errors
      if (!lmsResult.ok) {
        request.log.error(
          {
            query,
            error: lmsResult.error.type,
            message: lmsResult.error.message,
            duration: Date.now() - startTime,
          },
          "LMS search failed",
        );

        return reply.code(503).send({
          message: "LMS not reachable",
          code: "LMS_UNREACHABLE",
        });
      }

      // 5. Process with business logic (Functional Core)
      // Choose between full results or basic search based on 'full' flag
      if (full) {
        const fullResultsResult = transformToFullResults(
          query,
          lmsResult.value,
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

        // 7a. Cache and return full results
        const responseData = fullResultsResult.value;
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
      const searchResult = searchTracks(query, lmsResult.value);

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
        request.log.error(
          {
            query,
            error: lmsResult.error.type,
            message: lmsResult.error.message,
            duration: Date.now() - startTime,
          },
          "LMS autocomplete search failed",
        );

        return reply.code(503).send({
          message: "LMS not reachable",
          code: "LMS_UNREACHABLE",
        });
      }

      // 4. Process with autocomplete logic (Functional Core)
      const autocompleteResult = getAutocompleteSuggestions(
        query,
        lmsResult.value,
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
      });
    },
  );
};
