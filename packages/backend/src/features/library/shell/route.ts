import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { z } from "zod";
import type {
  LmsClient,
  LmsConfig,
} from "../../../adapters/lms-client/index.js";
import { getLibraryAlbums } from "./service.js";

const LibraryQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(999).default(250),
  offset: z.coerce.number().int().min(0).default(0),
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

      const { limit, offset } = validation.data;
      const result = await getLibraryAlbums(offset, limit, lmsClient, config);

      if (!result.ok) {
        return reply
          .code(503)
          .send({ message: "LMS not reachable", code: "LMS_UNREACHABLE" });
      }

      return reply.code(200).send(result.value);
    },
  );

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
