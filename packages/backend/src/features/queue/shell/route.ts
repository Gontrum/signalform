/**
 * Queue HTTP Route Handler
 *
 * Imperative shell: thin handlers that validate, delegate, and respond.
 * Complex removal logic lives in queue-removal-service.ts.
 */

import {
  fromThrowable,
  isTidalAlbumId,
  ok,
  VALID_TRACK_PROTOCOLS,
  type Result,
} from "@signalform/shared";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import {
  addUrlsSequentially,
  type LmsClient,
  type LmsError,
} from "../../../adapters/lms-client/index.js";
import {
  annotateRadioQueueTracks,
  recordQueueReorder,
  setRadioModeEnabledState,
  clearRadioQueueRuntimeState,
} from "../../radio-mode/shell/radio-state.js";
import type { QueueTrack } from "@signalform/shared";
import {
  PLAYER_QUEUE_UPDATED,
  PLAYER_UPDATES_ROOM,
  type TypedSocketIOServer,
} from "../../../infrastructure/websocket/index.js";
import {
  createRemoveQueueCommand,
  createReorderQueueCommand,
} from "../core/service.js";
import { sendLmsError } from "../../../infrastructure/http-errors.js";
import { recordUserTransportCommand } from "../../../infrastructure/transport-commands.js";
import {
  handleQueueRemoval,
  type QueueProjection,
  type RadioRemovalPolicy,
} from "./queue-removal-service.js";

type RadioModeController = {
  readonly setModeEnabled: (enabled: boolean) => Promise<
    | {
        readonly status: "success";
        readonly queueProjection: {
          readonly tracks: readonly QueueTrack[];
          readonly radioModeActive: boolean;
          readonly radioBoundaryIndex: number | null;
        };
      }
    | {
        readonly status: "failed";
        readonly reason: "busy" | "queue-fetch-failed" | "queue-update-failed";
        readonly error: string;
      }
  >;
};

type RadioController = Partial<RadioRemovalPolicy & RadioModeController>;

// Generic queue error message used by sendLmsError
const queueLmsMessage = (error: LmsError): string => {
  switch (error.type) {
    case "NetworkError":
      return "Cannot connect to music server. Please check that Lyrion Music Server is running.";
    case "TimeoutError":
      return "Music server did not respond in time. Please try again.";
    default:
      return "Queue operation failed. Please try again.";
  }
};

const RadioModeBodySchema = z.object({
  enabled: z.boolean(),
});

const AddTrackBodySchema = z.object({
  trackUrl: z
    .string()
    .trim()
    .min(1, "trackUrl is required")
    .max(2048, "trackUrl exceeds maximum length")
    .refine((url) => VALID_TRACK_PROTOCOLS.some((p) => url.startsWith(p)), {
      message: `Invalid trackUrl protocol. Must start with: ${VALID_TRACK_PROTOCOLS.join(", ")}`,
    }),
});

const AddAlbumBodySchema = z.object({
  albumId: z.string().trim().min(1, "albumId is required"),
});

const AddTrackListBodySchema = z.object({
  urls: z.array(z.string()).min(1, "urls must be a non-empty string array"),
});

const AddTidalSearchAlbumBodySchema = z.object({
  trackUrls: z.array(z.string()).optional(),
});

const JumpBodySchema = z.object({
  trackIndex: z
    .number()
    .int()
    .min(0, "trackIndex must be a non-negative integer")
    .max(9999, "trackIndex must be a non-negative integer"),
});

const RemoveBodySchema = z.object({
  trackIndex: z.number(),
});

// Lenient counterpart of RemoveBodySchema used only to recover a raw
// trackIndex value for diagnostic logging when validation fails.
const RemoveBodyRawSchema = z.object({
  trackIndex: z.unknown(),
});

const ReorderBodySchema = z.object({
  fromIndex: z.number(),
  toIndex: z.number(),
});

// Lenient counterpart of ReorderBodySchema used only to recover raw
// fromIndex/toIndex values for diagnostic logging when validation fails.
const ReorderBodyRawSchema = z.object({
  fromIndex: z.unknown(),
  toIndex: z.unknown(),
});

const RemoveBatchBodySchema = z.object({
  trackIndices: z
    .array(z.number().int().min(0).max(9999))
    .min(1)
    .max(
      500,
      "trackIndices must be a non-empty array of valid track indices (max 500)",
    ),
});

export const createQueueRoute = (
  fastify: FastifyInstance,
  lmsClient: LmsClient,
  io: TypedSocketIOServer,
  playerId: string,
  radioController?: RadioController,
): void => {
  // ---------------------------------------------------------------------------
  // Shared helpers
  // ---------------------------------------------------------------------------

  const serializeQueueProjection = (
    queueProjection: QueueProjection,
  ): QueueProjection => ({
    tracks: queueProjection.tracks,
    radioModeActive: queueProjection.radioModeActive,
    radioBoundaryIndex: queueProjection.radioBoundaryIndex,
  });

  const emitQueueUpdate = async (
    mutation: string,
    projectQueue?: (tracks: readonly QueueTrack[]) => QueueProjection,
  ): Promise<QueueProjection | null> => {
    const queueResult = await lmsClient.getQueue();
    if (!queueResult.ok) {
      fastify.log.warn(
        {
          event: "queue_refresh_failed",
          mutation,
          error: queueResult.error,
        },
        `Could not fetch queue after ${mutation} — status poller will sync within 1s`,
      );
      return null;
    }

    const queueProjection =
      projectQueue?.(queueResult.value) ??
      annotateRadioQueueTracks(queueResult.value);

    const emitResult = fromThrowable(
      () =>
        io.to(PLAYER_UPDATES_ROOM).emit(PLAYER_QUEUE_UPDATED, {
          playerId,
          tracks: queueProjection.tracks,
          radioModeActive: queueProjection.radioModeActive,
          radioBoundaryIndex: queueProjection.radioBoundaryIndex ?? undefined,
          timestamp: Date.now(),
        }),
      (error: unknown) => error,
    );

    if (!emitResult.ok) {
      fastify.log.warn(
        {
          event: "queue_emit_failed",
          mutation,
          error: emitResult.error,
        },
        `Could not emit queue update after ${mutation} — status poller will sync within 1s`,
      );
    }

    return queueProjection;
  };

  // ---------------------------------------------------------------------------
  // Routes
  // ---------------------------------------------------------------------------

  fastify.get("/api/queue", async (request: FastifyRequest, reply) => {
    const lmsResult = await lmsClient.getQueue();
    if (!lmsResult.ok) {
      return sendLmsError(
        reply,
        request,
        lmsResult.error,
        queueLmsMessage,
        "LMS get queue failed",
      );
    }
    const queueProjection = annotateRadioQueueTracks(lmsResult.value);
    return reply.code(200).send({
      tracks: queueProjection.tracks,
      radioModeActive: queueProjection.radioModeActive,
      radioBoundaryIndex: queueProjection.radioBoundaryIndex,
    });
  });

  fastify.post<{ readonly Body: unknown }>(
    "/api/queue/radio-mode",
    async (
      request: FastifyRequest<{ readonly Body: unknown }>,
      reply: FastifyReply,
    ) => {
      const validation = RadioModeBodySchema.safeParse(request.body);
      if (!validation.success) {
        return reply.code(400).send({
          message: "enabled must be a boolean",
          code: "INVALID_INPUT",
        });
      }
      const { enabled } = validation.data;

      if (radioController?.setModeEnabled === undefined) {
        return reply.code(503).send({
          message: "Radio mode controller unavailable",
          code: "RADIO_MODE_UNAVAILABLE",
        });
      }

      const result = await radioController.setModeEnabled(enabled);
      if (result.status === "failed") {
        const statusCode = result.reason === "busy" ? 409 : 503;
        return reply.code(statusCode).send({
          message: result.error,
          code:
            result.reason === "busy"
              ? "RADIO_MODE_BUSY"
              : "RADIO_MODE_UPDATE_FAILED",
        });
      }

      return reply.code(200).send({
        tracks: result.queueProjection.tracks,
        radioModeActive: result.queueProjection.radioModeActive,
        radioBoundaryIndex: result.queueProjection.radioBoundaryIndex,
      });
    },
  );

  fastify.post<{ readonly Body: unknown }>(
    "/api/queue/add",
    async (
      request: FastifyRequest<{ readonly Body: unknown }>,
      reply: FastifyReply,
    ) => {
      const validation = AddTrackBodySchema.safeParse(request.body);
      if (!validation.success) {
        return reply.code(400).send({
          message: validation.error.issues[0]?.message ?? "Invalid trackUrl",
          code: "INVALID_INPUT",
        });
      }
      const { trackUrl: trimmedUrl } = validation.data;

      const result = await lmsClient.addToQueue(trimmedUrl);
      if (!result.ok) {
        return sendLmsError(
          reply,
          request,
          result.error,
          queueLmsMessage,
          "LMS add to queue failed",
        );
      }

      await emitQueueUpdate("add");
      return reply.code(204).send();
    },
  );

  fastify.post<{ readonly Body: unknown }>(
    "/api/queue/add-album",
    async (
      request: FastifyRequest<{ readonly Body: unknown }>,
      reply: FastifyReply,
    ) => {
      const validation = AddAlbumBodySchema.safeParse(request.body);
      if (!validation.success) {
        return reply
          .code(400)
          .send({ message: "albumId is required", code: "INVALID_INPUT" });
      }
      const { albumId: trimmedAlbumId } = validation.data;

      const result = isTidalAlbumId(trimmedAlbumId)
        ? await lmsClient.addTidalAlbumToQueue(trimmedAlbumId)
        : await lmsClient.addAlbumToQueue(trimmedAlbumId);

      if (!result.ok) {
        return sendLmsError(
          reply,
          request,
          result.error,
          queueLmsMessage,
          "LMS add album to queue failed",
        );
      }

      await emitQueueUpdate("add-album");
      return reply.code(204).send();
    },
  );

  fastify.post<{ readonly Body: unknown }>(
    "/api/queue/add-track-list",
    async (
      request: FastifyRequest<{ readonly Body: unknown }>,
      reply: FastifyReply,
    ) => {
      const validation = AddTrackListBodySchema.safeParse(request.body);
      if (!validation.success) {
        return reply.code(400).send({
          message: "urls must be a non-empty string array",
          code: "INVALID_INPUT",
        });
      }
      const { urls } = validation.data;

      const result = await addUrlsSequentially(lmsClient, urls);

      if (!result.ok) {
        return sendLmsError(
          reply,
          request,
          result.error,
          queueLmsMessage,
          "LMS add track list to queue failed",
        );
      }

      await emitQueueUpdate("add-track-list");
      return reply.code(204).send();
    },
  );

  fastify.post<{ readonly Body: unknown }>(
    "/api/queue/add-tidal-search-album",
    async (
      request: FastifyRequest<{ readonly Body: unknown }>,
      reply: FastifyReply,
    ) => {
      const parsed = AddTidalSearchAlbumBodySchema.safeParse(request.body);
      const trackUrls: readonly string[] = parsed.success
        ? (parsed.data.trackUrls ?? [])
        : [];

      if (trackUrls.length === 0) {
        return reply.code(503).send({
          message: "No playable content found for Tidal album",
          code: "NO_PLAYABLE_CONTENT",
        });
      }

      const fallbackResult = await addUrlsSequentially(lmsClient, trackUrls);

      if (!fallbackResult.ok) {
        return sendLmsError(
          reply,
          request,
          fallbackResult.error,
          queueLmsMessage,
          "LMS add Tidal search album (fallback) to queue failed",
        );
      }

      await emitQueueUpdate("add-tidal-search-album-fallback");
      return reply.code(204).send();
    },
  );

  fastify.post<{ readonly Body: unknown }>(
    "/api/queue/jump",
    async (
      request: FastifyRequest<{ readonly Body: unknown }>,
      reply: FastifyReply,
    ) => {
      const validation = JumpBodySchema.safeParse(request.body);
      if (!validation.success) {
        return reply.code(400).send({
          message: "trackIndex must be a non-negative integer",
          code: "INVALID_INPUT",
        });
      }
      const { trackIndex } = validation.data;

      recordUserTransportCommand();
      const result = await lmsClient.jumpToTrack(trackIndex);
      if (!result.ok) {
        return sendLmsError(
          reply,
          request,
          result.error,
          queueLmsMessage,
          "LMS jump to track failed",
        );
      }

      const queueProjection = await emitQueueUpdate("jump");
      return queueProjection === null
        ? reply.code(204).send()
        : reply.code(200).send(serializeQueueProjection(queueProjection));
    },
  );

  fastify.post<{ readonly Body: unknown }>(
    "/api/queue/remove",
    async (
      request: FastifyRequest<{ readonly Body: unknown }>,
      reply: FastifyReply,
    ) => {
      const validation = RemoveBodySchema.safeParse(request.body);
      if (!validation.success) {
        const rawValidation = RemoveBodyRawSchema.safeParse(request.body);
        fastify.log.warn(
          {
            event: "queue_remove_validation_failed",
            trackIndex: rawValidation.success
              ? rawValidation.data.trackIndex
              : undefined,
          },
          "Queue remove validation failed",
        );
        return reply.code(400).send({
          message: "trackIndex must be a non-negative integer",
          code: "INVALID_INPUT",
        });
      }
      const { trackIndex } = validation.data;

      const commandResult = createRemoveQueueCommand(trackIndex);
      if (!commandResult.ok) {
        fastify.log.warn(
          {
            event: "queue_remove_validation_failed",
            error: commandResult.error,
          },
          "Queue remove validation failed",
        );
        return reply.code(400).send({
          message: commandResult.error.message,
          code: "INVALID_INPUT",
        });
      }

      // Removing the entry that is playing makes LMS advance — indistinguishable
      // from a cut-off unless the command is on record.
      recordUserTransportCommand();
      const removalResult = await handleQueueRemoval(trackIndex, {
        lmsClient,
        log: fastify.log,
        emitQueueUpdate,
        radioRemovalPolicy:
          radioController?.handleRemoval !== undefined
            ? { handleRemoval: radioController.handleRemoval }
            : undefined,
      });

      if (!removalResult.ok) {
        return sendLmsError(
          reply,
          request,
          removalResult.error,
          queueLmsMessage,
          "Queue remove LMS mutation failed",
        );
      }

      return removalResult.value === undefined
        ? reply.code(204).send()
        : reply.code(200).send(serializeQueueProjection(removalResult.value));
    },
  );

  fastify.post<{ readonly Body: unknown }>(
    "/api/queue/reorder",
    async (
      request: FastifyRequest<{ readonly Body: unknown }>,
      reply: FastifyReply,
    ) => {
      const validation = ReorderBodySchema.safeParse(request.body);
      if (!validation.success) {
        const rawValidation = ReorderBodyRawSchema.safeParse(request.body);
        fastify.log.warn(
          {
            event: "queue_reorder_validation_failed",
            fromIndex: rawValidation.success
              ? rawValidation.data.fromIndex
              : undefined,
            toIndex: rawValidation.success
              ? rawValidation.data.toIndex
              : undefined,
          },
          "Queue reorder validation failed",
        );
        return reply.code(400).send({
          message: "fromIndex and toIndex must be non-negative integers",
          code: "INVALID_INPUT",
        });
      }
      const { fromIndex, toIndex } = validation.data;

      const commandResult = createReorderQueueCommand(fromIndex, toIndex);
      if (!commandResult.ok) {
        fastify.log.warn(
          {
            event: "queue_reorder_validation_failed",
            error: commandResult.error,
          },
          "Queue reorder validation failed",
        );
        return reply.code(400).send({
          message: commandResult.error.message,
          code: "INVALID_INPUT",
        });
      }

      const mutationResult = await lmsClient.moveQueueTrack(fromIndex, toIndex);
      if (!mutationResult.ok) {
        return sendLmsError(
          reply,
          request,
          mutationResult.error,
          queueLmsMessage,
          "LMS queue reorder failed",
        );
      }

      const queueProjection = await emitQueueUpdate("reorder", (tracks) =>
        recordQueueReorder(tracks, fromIndex + 1, toIndex + 1),
      );
      return queueProjection === null
        ? reply.code(204).send()
        : reply.code(200).send(serializeQueueProjection(queueProjection));
    },
  );

  fastify.post("/api/queue/clear", async (request: FastifyRequest, reply) => {
    setRadioModeEnabledState(false);
    clearRadioQueueRuntimeState();

    recordUserTransportCommand();
    const mutationResult = await lmsClient.clearQueue();
    if (!mutationResult.ok) {
      return sendLmsError(
        reply,
        request,
        mutationResult.error,
        queueLmsMessage,
        "LMS clear queue failed",
      );
    }

    const queueProjection = await emitQueueUpdate("clear");
    return queueProjection === null
      ? reply.code(204).send()
      : reply.code(200).send(serializeQueueProjection(queueProjection));
  });

  fastify.post<{ readonly Body: unknown }>(
    "/api/queue/remove-batch",
    async (
      request: FastifyRequest<{ readonly Body: unknown }>,
      reply: FastifyReply,
    ) => {
      const validation = RemoveBatchBodySchema.safeParse(request.body);
      if (!validation.success) {
        return reply.code(400).send({
          message:
            "trackIndices must be a non-empty array of valid track indices (max 500)",
          code: "INVALID_INPUT",
        });
      }
      const { trackIndices } = validation.data;

      // Deduplicate and sort descending: remove highest indices first to avoid
      // index shifting invalidating subsequent removals.
      const uniqueSortedIndices = [...new Set<number>(trackIndices)].sort(
        (a, b) => b - a,
      );

      recordUserTransportCommand();
      const removalResult = await uniqueSortedIndices.reduce<
        Promise<Result<void, LmsError>>
      >(
        async (prevPromise, trackIndex) => {
          const prev = await prevPromise;
          if (!prev.ok) {
            return prev;
          }
          return lmsClient.removeFromQueue(trackIndex);
        },
        Promise.resolve(ok(undefined)),
      );

      if (!removalResult.ok) {
        return sendLmsError(
          reply,
          request,
          removalResult.error,
          queueLmsMessage,
          "LMS batch remove failed",
        );
      }

      const queueProjection = await emitQueueUpdate("remove-batch");
      return queueProjection === null
        ? reply.code(204).send()
        : reply.code(200).send(serializeQueueProjection(queueProjection));
    },
  );
};
