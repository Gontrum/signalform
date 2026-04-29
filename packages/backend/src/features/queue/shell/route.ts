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
import type { FastifyInstance, FastifyRequest } from "fastify";
import type {
  LmsClient,
  LmsError,
} from "../../../adapters/lms-client/index.js";
import {
  annotateRadioQueueTracks,
  recordQueueReorder,
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

const isBodyRecord = (body: unknown): body is Record<string, unknown> => {
  return typeof body === "object" && body !== null;
};

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

  fastify.get("/api/queue", async (_request, reply) => {
    const lmsResult = await lmsClient.getQueue();
    if (!lmsResult.ok) {
      return sendLmsError(
        reply,
        _request as FastifyRequest,
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

  fastify.post("/api/queue/radio-mode", async (request, reply) => {
    const body = isBodyRecord(request.body) ? request.body : null;
    const enabled = body?.["enabled"];

    if (typeof enabled !== "boolean") {
      return reply.code(400).send({
        message: "enabled must be a boolean",
        code: "INVALID_INPUT",
      });
    }

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
  });

  fastify.post("/api/queue/add", async (request, reply) => {
    const body = isBodyRecord(request.body) ? request.body : null;
    const trackUrl = body?.["trackUrl"];

    if (typeof trackUrl !== "string" || trackUrl.trim() === "") {
      return reply.code(400).send({
        message: "trackUrl is required",
        code: "INVALID_INPUT",
      });
    }

    const trimmedUrl = trackUrl.trim();

    if (trimmedUrl.length > 2048) {
      return reply.code(400).send({
        message: "trackUrl exceeds maximum length",
        code: "INVALID_INPUT",
      });
    }

    if (!VALID_TRACK_PROTOCOLS.some((p) => trimmedUrl.startsWith(p))) {
      return reply.code(400).send({
        message: `Invalid trackUrl protocol. Must start with: ${VALID_TRACK_PROTOCOLS.join(", ")}`,
        code: "INVALID_INPUT",
      });
    }

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
  });

  fastify.post("/api/queue/add-album", async (request, reply) => {
    const body = isBodyRecord(request.body) ? request.body : null;
    const albumId = body?.["albumId"];

    if (typeof albumId !== "string" || albumId.trim() === "") {
      return reply
        .code(400)
        .send({ message: "albumId is required", code: "INVALID_INPUT" });
    }

    const trimmedAlbumId = albumId.trim();
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
  });

  fastify.post("/api/queue/add-track-list", async (request, reply) => {
    const body = isBodyRecord(request.body) ? request.body : null;
    const urls = body?.["urls"];

    if (
      !Array.isArray(urls) ||
      urls.length === 0 ||
      !urls.every((u): u is string => typeof u === "string")
    ) {
      return reply.code(400).send({
        message: "urls must be a non-empty string array",
        code: "INVALID_INPUT",
      });
    }

    const result = await urls.reduce<Promise<Result<void, LmsError>>>(
      async (prevPromise, url) => {
        const prev = await prevPromise;
        if (!prev.ok) {
          return prev;
        }
        return lmsClient.addToQueue(url);
      },
      Promise.resolve(ok(undefined)),
    );

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
  });

  fastify.post("/api/queue/add-tidal-search-album", async (request, reply) => {
    const body = isBodyRecord(request.body) ? request.body : null;

    if (
      typeof body?.["albumTitle"] !== "string" ||
      body["albumTitle"].trim() === ""
    ) {
      return reply.code(400).send({
        message: "albumTitle is required",
        code: "INVALID_INPUT",
      });
    }

    const albumTitle = body["albumTitle"].trim();
    const artist =
      typeof body["artist"] === "string" ? body["artist"].trim() : "";
    const trackUrls: readonly string[] = Array.isArray(body["trackUrls"])
      ? body["trackUrls"].filter((u): u is string => typeof u === "string")
      : [];

    const browseResult = await lmsClient.findTidalSearchAlbumId(
      albumTitle,
      artist,
    );

    if (!browseResult.ok) {
      fastify.log.warn(
        { event: "tidal_album_browse_failed", error: browseResult.error },
        "Tidal album search failed — falling back to trackUrls",
      );
    }

    if (browseResult.ok && browseResult.value !== null) {
      const addResult = await lmsClient.addTidalAlbumToQueue(
        browseResult.value,
      );
      if (!addResult.ok) {
        return sendLmsError(
          reply,
          request,
          addResult.error,
          queueLmsMessage,
          "LMS add Tidal album to queue failed",
        );
      }
      await emitQueueUpdate("add-tidal-search-album");
      return reply.code(204).send();
    }

    if (trackUrls.length === 0) {
      return reply.code(503).send({
        message: "No playable content found for Tidal album",
        code: "NO_PLAYABLE_CONTENT",
      });
    }

    const fallbackResult = await trackUrls.reduce<
      Promise<Result<void, LmsError>>
    >(
      async (prevPromise, url) => {
        const prev = await prevPromise;
        if (!prev.ok) {
          return prev;
        }
        return lmsClient.addToQueue(url);
      },
      Promise.resolve(ok(undefined)),
    );

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
  });

  fastify.post("/api/queue/jump", async (request, reply) => {
    const body = isBodyRecord(request.body) ? request.body : null;
    const trackIndex = body?.["trackIndex"];

    if (
      typeof trackIndex !== "number" ||
      !Number.isInteger(trackIndex) ||
      trackIndex < 0 ||
      trackIndex > 9999
    ) {
      return reply.code(400).send({
        message: "trackIndex must be a non-negative integer",
        code: "INVALID_INPUT",
      });
    }

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
  });

  fastify.post("/api/queue/remove", async (request, reply) => {
    const body = isBodyRecord(request.body) ? request.body : null;
    const trackIndex = body?.["trackIndex"];

    if (typeof trackIndex !== "number") {
      fastify.log.warn(
        { event: "queue_remove_validation_failed", trackIndex },
        "Queue remove validation failed",
      );
      return reply.code(400).send({
        message: "trackIndex must be a non-negative integer",
        code: "INVALID_INPUT",
      });
    }

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

    return removalResult.queueProjection === undefined
      ? reply.code(204).send()
      : reply
          .code(200)
          .send(serializeQueueProjection(removalResult.queueProjection));
  });

  fastify.post("/api/queue/reorder", async (request, reply) => {
    const body = isBodyRecord(request.body) ? request.body : null;
    const fromIndex = body?.["fromIndex"];
    const toIndex = body?.["toIndex"];

    if (typeof fromIndex !== "number" || typeof toIndex !== "number") {
      fastify.log.warn(
        {
          event: "queue_reorder_validation_failed",
          fromIndex,
          toIndex,
        },
        "Queue reorder validation failed",
      );
      return reply.code(400).send({
        message: "fromIndex and toIndex must be non-negative integers",
        code: "INVALID_INPUT",
      });
    }

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
  });
};
