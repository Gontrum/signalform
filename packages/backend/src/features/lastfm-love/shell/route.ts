import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import type { Result } from "@signalform/shared";
import { loadConfig } from "../../../infrastructure/config/index.js";
import type {
  AppConfig,
  UserProfile,
} from "../../../infrastructure/config/index.js";
import type { LastFmClient } from "../../../adapters/lastfm-client/index.js";
import { resolveRequestUser } from "../../users/index.js";

const LoveBodySchema = z.object({
  artist: z.string().min(1),
  track: z.string().min(1),
});

const resolveHeaderUser = (
  config: AppConfig,
  request: FastifyRequest,
): UserProfile | undefined => {
  const headerValue = request.headers["x-signalform-user"];
  return resolveRequestUser(
    config.users,
    typeof headerValue === "string" ? headerValue : undefined,
  );
};

type LoveRequestContext = {
  readonly artist: string;
  readonly track: string;
  readonly sessionKey: string;
  readonly sharedSecret: string;
};

/**
 * Validates the request body and resolves the requesting user's Last.fm
 * session. Sends the appropriate error response itself and returns
 * `undefined` when any step fails — shared by the love/unlove routes below.
 */
const resolveLoveRequestContext = (
  request: FastifyRequest<{ readonly Body: unknown }>,
  reply: FastifyReply,
): LoveRequestContext | undefined => {
  const validation = LoveBodySchema.safeParse(request.body);
  if (!validation.success) {
    reply.code(400).send({ error: "Invalid request body" });
    return undefined;
  }

  const configResult = loadConfig();
  if (!configResult.ok) {
    reply.code(500).send({ error: "Failed to load configuration" });
    return undefined;
  }

  const config = configResult.value;
  const user = resolveHeaderUser(config, request);
  if (user === undefined) {
    reply.code(400).send({ error: "No user resolvable for request" });
    return undefined;
  }
  if (
    user.lastFmSessionKey === undefined ||
    config.lastFmSharedSecret === undefined
  ) {
    reply.code(400).send({ error: "No Last.fm session configured for user" });
    return undefined;
  }

  return {
    artist: validation.data.artist,
    track: validation.data.track,
    sessionKey: user.lastFmSessionKey,
    sharedSecret: config.lastFmSharedSecret,
  };
};

/**
 * Resolves the love/unlove request context, invokes `action` against it,
 * and maps a failed result to the given 502 message. Shared by the
 * POST (love) and DELETE (unlove) handlers below, which only differ in
 * which client method they call and the failure message.
 */
const respondToLoveAction = async (
  request: FastifyRequest<{ readonly Body: unknown }>,
  reply: FastifyReply,
  action: (context: LoveRequestContext) => Promise<Result<void, unknown>>,
  failureMessage: string,
): Promise<FastifyReply> => {
  const context = resolveLoveRequestContext(request, reply);
  if (context === undefined) {
    return reply;
  }

  const result = await action(context);
  if (!result.ok) {
    return reply.code(502).send({ error: failureMessage });
  }

  return reply.code(204).send();
};

export const createLastFmLoveRoute = (
  server: FastifyInstance,
  lastFmClient: LastFmClient,
): void => {
  server.post<{ readonly Body: unknown }>(
    "/api/lastfm/love",
    async (
      request: FastifyRequest<{ readonly Body: unknown }>,
      reply: FastifyReply,
    ) =>
      respondToLoveAction(
        request,
        reply,
        (context) => lastFmClient.love(context),
        "Failed to love track on Last.fm",
      ),
  );

  server.delete<{ readonly Body: unknown }>(
    "/api/lastfm/love",
    async (
      request: FastifyRequest<{ readonly Body: unknown }>,
      reply: FastifyReply,
    ) =>
      respondToLoveAction(
        request,
        reply,
        (context) => lastFmClient.unlove(context),
        "Failed to unlove track on Last.fm",
      ),
  );
};
