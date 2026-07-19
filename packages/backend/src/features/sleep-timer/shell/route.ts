/**
 * Sleep Timer Routes
 *
 * Server-side sleep timer backed by the LMS `sleep` player command:
 * LMS stops playback after the given number of seconds, so the timer
 * survives browser tab closes and device sleep.
 *
 * Handlers: validate → call core → call LMS → respond.
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import type { LmsClient } from "../../../adapters/lms-client/index.js";
import { getUserFriendlyErrorMessage } from "../../playback/core/error-mappers.js";
import { sendLmsError } from "../../../infrastructure/http-errors.js";
import { parseSleepDuration } from "../core/service.js";

const extractSeconds = (body: unknown): unknown => {
  if (typeof body !== "object" || body === null || !("seconds" in body)) {
    return undefined;
  }
  return (body as { readonly seconds: unknown }).seconds;
};

export const createSleepTimerRoute = (
  fastify: FastifyInstance,
  lmsClient: LmsClient,
): void => {
  /**
   * POST /api/playback/sleep
   *
   * Set (or cancel, with 0) the sleep timer.
   * Body: { seconds: number } — integer 0–86400
   * 204 | 400 | 5xx
   */
  fastify.post<{ readonly Body: unknown }>(
    "/api/playback/sleep",
    async (
      request: FastifyRequest<{ readonly Body: unknown }>,
      reply: FastifyReply,
    ) => {
      request.log.debug(
        { endpoint: "/api/playback/sleep", method: "POST" },
        "Set sleep timer request received",
      );

      const parsed = parseSleepDuration(extractSeconds(request.body));
      if (!parsed.ok) {
        request.log.warn(
          { message: parsed.error.message },
          "Invalid sleep timer request",
        );
        return reply.code(400).send({ error: parsed.error.message });
      }

      const result = await lmsClient.setSleep(parsed.value);
      if (!result.ok) {
        return sendLmsError(
          reply,
          request,
          result.error,
          getUserFriendlyErrorMessage,
          "LMS set sleep timer failed",
          { seconds: parsed.value },
        );
      }

      request.log.info({ seconds: parsed.value }, "Sleep timer set");
      return reply.code(204).send();
    },
  );

  /**
   * GET /api/playback/sleep
   *
   * Query the remaining sleep timer duration (0 = no timer active).
   * 200 { remainingSeconds: number } | 5xx
   */
  fastify.get(
    "/api/playback/sleep",
    async (request: FastifyRequest, reply: FastifyReply) => {
      request.log.debug(
        { endpoint: "/api/playback/sleep", method: "GET" },
        "Get sleep timer request received",
      );

      const result = await lmsClient.getSleep();
      if (!result.ok) {
        return sendLmsError(
          reply,
          request,
          result.error,
          getUserFriendlyErrorMessage,
          "LMS get sleep timer failed",
        );
      }

      return reply.code(200).send({ remainingSeconds: result.value });
    },
  );
};
