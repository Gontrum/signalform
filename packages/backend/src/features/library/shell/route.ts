import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { z } from "zod";
import type { DecadeFilter, SortOption } from "@signalform/shared";
import type {
  LmsClient,
  LmsConfig,
} from "../../../adapters/lms-client/index.js";
import { getLibraryAlbums, getLibraryGenres } from "./service.js";

const SORT_OPTIONS = [
  "artist-az",
  "title-az",
  "year-newest",
  "recently-added",
] as const satisfies readonly SortOption[];

const DECADE_FILTERS = [
  "all",
  "2020s",
  "2010s",
  "2000s",
  "1990s",
  "older",
] as const satisfies readonly DecadeFilter[];

const LibraryQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(999).default(250),
  offset: z.coerce.number().int().min(0).default(0),
  sort: z.enum(SORT_OPTIONS).default("artist-az"),
  decade: z.enum(DECADE_FILTERS).default("all"),
  genreId: z.coerce.number().int().min(0).optional(),
  search: z.string().optional(),
});

export const createLibraryRoute = (
  fastify: FastifyInstance,
  lmsClient: LmsClient,
  config: LmsConfig,
): void => {
  fastify.get<{ readonly Querystring: unknown }>(
    "/api/library/albums",
    async (
      request: FastifyRequest<{ readonly Querystring: unknown }>,
      reply: FastifyReply,
    ) => {
      const validation = LibraryQuerySchema.safeParse(request.query);
      if (!validation.success) {
        return reply
          .code(400)
          .send({ message: "Invalid query parameters", code: "INVALID_INPUT" });
      }

      const { limit, offset, sort, decade, genreId, search } = validation.data;
      const result = await getLibraryAlbums(offset, limit, lmsClient, config, {
        sort,
        decade,
        genreId,
        search,
      });

      if (!result.ok) {
        return result.error.type === "InvalidFilter"
          ? reply
              .code(400)
              .send({ message: result.error.message, code: "INVALID_INPUT" })
          : reply
              .code(503)
              .send({ message: "LMS not reachable", code: "LMS_UNREACHABLE" });
      }

      return reply.code(200).send(result.value);
    },
  );

  // GET /api/library/genres — genre list, with album counts once they are warm
  fastify.get("/api/library/genres", async (_request, reply) => {
    const result = await getLibraryGenres(lmsClient);

    if (!result.ok) {
      return reply
        .code(503)
        .send({ message: "LMS not reachable", code: "LMS_UNREACHABLE" });
    }

    return reply.code(200).send({ genres: result.value });
  });

  // POST /api/library/rescan — trigger LMS library rescan
  fastify.post("/api/library/rescan", async (_request, reply) => {
    const result = await lmsClient.rescanLibrary();
    if (!result.ok) {
      return reply
        .code(503)
        .send({ message: "LMS not reachable", code: "LMS_UNREACHABLE" });
    }
    return reply.code(202).send({ message: "Library rescan started" });
  });

  // GET /api/library/rescan/status — get rescan progress
  fastify.get("/api/library/rescan/status", async (_request, reply) => {
    const result = await lmsClient.getRescanProgress();
    if (!result.ok) {
      return reply
        .code(503)
        .send({ message: "LMS not reachable", code: "LMS_UNREACHABLE" });
    }
    return reply.code(200).send(result.value);
  });
};
