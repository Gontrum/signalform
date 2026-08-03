/**
 * Playback Transport Routes
 *
 * Simple play/pause/resume/next/previous controls.
 * Each handler: validate → call LMS → respond.
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { z } from "zod";
import type { RepeatMode, ShuffleMode } from "@signalform/shared";
import type { LmsClient } from "../../../adapters/lms-client/index.js";
import { initiatePlayback } from "../core/service.js";
import {
  getUserFriendlyErrorMessage,
  getUserFriendlySkipErrorMessage,
} from "../core/error-mappers.js";
import { sendLmsError } from "../../../infrastructure/http-errors.js";
import { recordUserTransportCommand } from "../../../infrastructure/transport-commands.js";

const PlayRequestSchema = z.object({
  trackUrl: z.string().min(1, "Track URL is required"),
});

const SHUFFLE_MODES: readonly ShuffleMode[] = ["off", "songs", "albums"];
const REPEAT_MODES: readonly RepeatMode[] = ["off", "track", "playlist"];

const ShuffleRequestSchema = z.object({
  mode: z.enum(SHUFFLE_MODES),
});

const RepeatRequestSchema = z.object({
  mode: z.enum(REPEAT_MODES),
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

      recordUserTransportCommand();
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

      recordUserTransportCommand();
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

      recordUserTransportCommand();
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

      recordUserTransportCommand();
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

  /**
   * POST /api/playback/shuffle
   * Set shuffle mode.  Body: { mode: "off" | "songs" | "albums" }
   * 200 | 400 | 503
   */
  fastify.post<{ readonly Body: unknown }>(
    "/api/playback/shuffle",
    async (
      request: FastifyRequest<{ readonly Body: unknown }>,
      reply: FastifyReply,
    ) => {
      const startTime = Date.now();

      request.log.debug(
        { endpoint: "/api/playback/shuffle", method: "POST" },
        "Set shuffle mode request received",
      );

      const validation = ShuffleRequestSchema.safeParse(request.body);
      if (!validation.success) {
        request.log.warn(
          { errors: validation.error.issues },
          "Invalid shuffle request",
        );
        return reply.code(400).send({
          error: "VALIDATION_ERROR",
          message: "Shuffle mode must be one of: off, songs, albums",
          details: validation.error.issues,
        });
      }

      const { mode } = validation.data;
      const result = await lmsClient.setShuffle(mode);
      if (!result.ok) {
        return sendLmsError(
          reply,
          request,
          result.error,
          getUserFriendlyErrorMessage,
          "LMS set shuffle failed",
        );
      }

      const duration = Date.now() - startTime;
      request.log.info({ mode, duration }, "Shuffle mode set successfully");
      return reply.code(200).send({});
    },
  );

  /**
   * POST /api/playback/repeat
   * Set repeat mode.  Body: { mode: "off" | "track" | "playlist" }
   * 200 | 400 | 503
   */
  fastify.post<{ readonly Body: unknown }>(
    "/api/playback/repeat",
    async (
      request: FastifyRequest<{ readonly Body: unknown }>,
      reply: FastifyReply,
    ) => {
      const startTime = Date.now();

      request.log.debug(
        { endpoint: "/api/playback/repeat", method: "POST" },
        "Set repeat mode request received",
      );

      const validation = RepeatRequestSchema.safeParse(request.body);
      if (!validation.success) {
        request.log.warn(
          { errors: validation.error.issues },
          "Invalid repeat request",
        );
        return reply.code(400).send({
          error: "VALIDATION_ERROR",
          message: "Repeat mode must be one of: off, track, playlist",
          details: validation.error.issues,
        });
      }

      const { mode } = validation.data;
      const result = await lmsClient.setRepeat(mode);
      if (!result.ok) {
        return sendLmsError(
          reply,
          request,
          result.error,
          getUserFriendlyErrorMessage,
          "LMS set repeat failed",
        );
      }

      const duration = Date.now() - startTime;
      request.log.info({ mode, duration }, "Repeat mode set successfully");
      return reply.code(200).send({});
    },
  );
};
