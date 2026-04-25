/**
 * Playback Transport Routes
 *
 * Simple play/pause/resume/next/previous controls.
 * Each handler: validate → call LMS → respond.
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { z } from "zod";
import type { LmsClient } from "../../../adapters/lms-client/index.js";
import { initiatePlayback } from "../core/service.js";
import {
  getUserFriendlyErrorMessage,
  getUserFriendlySkipErrorMessage,
} from "../core/error-mappers.js";
import { sendLmsError } from "../../../infrastructure/http-errors.js";

const PlayRequestSchema = z.object({
  trackUrl: z.string().min(1, "Track URL is required"),
});

export const registerTransportRoutes = (
  fastify: FastifyInstance,
  lmsClient: LmsClient,
): void => {
  /**
   * POST /api/playback/play
   *
   * Initiate playback for a single track URL.
   * Body: { trackUrl: string }
   * 200 | 400 | 503
   */
  fastify.post<{ readonly Body: unknown }>(
    "/api/playback/play",
    async (
      request: FastifyRequest<{ readonly Body: unknown }>,
      reply: FastifyReply,
    ) => {
      const startTime = Date.now();

      request.log.debug(
        { endpoint: "/api/playback/play", method: "POST" },
        "Play request received",
      );

      const validation = PlayRequestSchema.safeParse(request.body);
      if (!validation.success) {
        request.log.warn(
          { errors: validation.error.issues },
          "Invalid play request",
        );
        return reply.code(400).send({
          error: "INVALID_TRACK_URL",
          message: "Track URL is required and cannot be empty",
          details: validation.error.issues,
        });
      }

      const { trackUrl } = validation.data;

      const validationResult = initiatePlayback(trackUrl);
      if (!validationResult.ok) {
        request.log.warn(
          {
            error: validationResult.error.type,
            message: validationResult.error.message,
          },
          "Track URL validation failed",
        );
        return reply.code(400).send({
          error: validationResult.error.type,
          message: validationResult.error.message,
        });
      }

      const playbackResult = await lmsClient.play(
        validationResult.value.trackUrl ?? "",
      );
      if (!playbackResult.ok) {
        return sendLmsError(
          reply,
          request,
          playbackResult.error,
          getUserFriendlyErrorMessage,
          "LMS playback failed",
        );
      }

      const duration = Date.now() - startTime;
      request.log.info({ trackUrl, duration }, "Playback started successfully");
      return reply.code(200).send({});
    },
  );

  /**
   * POST /api/playback/next
   * Skip to next track.  200 | 503
   */
  fastify.post(
    "/api/playback/next",
    async (request: FastifyRequest, reply: FastifyReply) => {
      const startTime = Date.now();

      request.log.debug(
        { endpoint: "/api/playback/next", method: "POST" },
        "Next track request received",
      );

      const result = await lmsClient.nextTrack();
      if (!result.ok) {
        return sendLmsError(
          reply,
          request,
          result.error,
          (e) => getUserFriendlySkipErrorMessage(e, "next"),
          "LMS next track failed",
        );
      }

      const duration = Date.now() - startTime;
      request.log.info({ duration }, "Skip to next track successful");
      return reply.code(200).send({});
    },
  );

  /**
   * POST /api/playback/previous
   * Skip to previous track.  200 | 503
   */
  fastify.post(
    "/api/playback/previous",
    async (request: FastifyRequest, reply: FastifyReply) => {
      const startTime = Date.now();

      request.log.debug(
        { endpoint: "/api/playback/previous", method: "POST" },
        "Previous track request received",
      );

      const result = await lmsClient.previousTrack();
      if (!result.ok) {
        return sendLmsError(
          reply,
          request,
          result.error,
          (e) => getUserFriendlySkipErrorMessage(e, "previous"),
          "LMS previous track failed",
        );
      }

      const duration = Date.now() - startTime;
      request.log.info({ duration }, "Skip to previous track successful");
      return reply.code(200).send({});
    },
  );

  /**
   * POST /api/playback/pause
   * Pause current playback.  200 | 503
   */
  fastify.post(
    "/api/playback/pause",
    async (request: FastifyRequest, reply: FastifyReply) => {
      const startTime = Date.now();

      request.log.debug(
        { endpoint: "/api/playback/pause", method: "POST" },
        "Pause playback request received",
      );

      const result = await lmsClient.pause();
      if (!result.ok) {
        return sendLmsError(
          reply,
          request,
          result.error,
          getUserFriendlyErrorMessage,
          "LMS pause failed",
        );
      }

      const duration = Date.now() - startTime;
      request.log.info({ duration }, "Pause playback successful");
      return reply.code(200).send({});
    },
  );

  /**
   * POST /api/playback/resume
   * Resume paused playback.  200 | 503
   */
  fastify.post(
    "/api/playback/resume",
    async (request: FastifyRequest, reply: FastifyReply) => {
      const startTime = Date.now();

      request.log.debug(
        { endpoint: "/api/playback/resume", method: "POST" },
        "Resume playback request received",
      );

      const result = await lmsClient.resume();
      if (!result.ok) {
        return sendLmsError(
          reply,
          request,
          result.error,
          getUserFriendlyErrorMessage,
          "LMS resume failed",
        );
      }

      const duration = Date.now() - startTime;
      request.log.info({ duration }, "Resume playback successful");
      return reply.code(200).send({});
    },
  );
};
