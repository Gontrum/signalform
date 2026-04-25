/**
 * WebSocket Server Setup
 * Configures Socket.IO with Fastify integration
 * Following architecture pattern: Backend-for-Frontend (BFF)
 */

import { Server, type Socket } from "socket.io";
import type { FastifyInstance } from "fastify";
import type {
  ServerToClientEvents,
  ClientToServerEvents,
} from "@signalform/shared";
import {
  PLAYER_SUBSCRIBE,
  PLAYER_UNSUBSCRIBE,
  PLAYER_UPDATES_ROOM,
} from "./events.js";

/**
 * Socket.IO server instance with typed events
 */
export type TypedSocketIOServer = Server<
  ClientToServerEvents,
  ServerToClientEvents
>;

/**
 * Socket instance with typed events
 */
export type TypedSocket = Socket<ClientToServerEvents, ServerToClientEvents>;

/**
 * Sets up WebSocket server with Socket.IO
 * Connection state recovery enabled for auto-reconnection
 * @param app - Fastify instance
 * @returns Configured Socket.IO server
 */
export const setupWebSocket = (app: FastifyInstance): TypedSocketIOServer => {
  const io: TypedSocketIOServer = new Server(app.server, {
    cors: {
      origin: process.env["CORS_ORIGIN"] ?? "http://localhost:3000", // Vite dev server
      credentials: true,
    },
    connectionStateRecovery: {
      maxDisconnectionDuration: 2 * 60 * 1000, // 2 minutes (NFR21)
      skipMiddlewares: true,
    },
    pingTimeout: 5000, // 5s connection timeout (NFR26)
    pingInterval: 25000, // 25s heartbeat
    transports: ["websocket", "polling"], // WebSocket preferred, polling fallback
  });

  // Connection event handler
  io.on("connection", (socket: TypedSocket) => {
    const socketId = socket.id;
    const recovered = socket.recovered;

    app.log.info(
      {
        socketId,
        recovered,
        event: "client_connected",
      },
      "WebSocket client connected",
    );

    // Handle player subscription
    socket.on(PLAYER_SUBSCRIBE, () => {
      void socket.join(PLAYER_UPDATES_ROOM);
      app.log.info(
        {
          socketId,
          room: PLAYER_UPDATES_ROOM,
          event: "player_subscribed",
        },
        "Client subscribed to player updates",
      );
    });

    // Handle player unsubscription
    socket.on(PLAYER_UNSUBSCRIBE, () => {
      void socket.leave(PLAYER_UPDATES_ROOM);
      app.log.info(
        {
          socketId,
          room: PLAYER_UPDATES_ROOM,
          event: "player_unsubscribed",
        },
        "Client unsubscribed from player updates",
      );
    });

    // Handle disconnection
    socket.on("disconnect", (reason: string) => {
      app.log.info(
        {
          socketId,
          reason,
          event: "client_disconnected",
        },
        "WebSocket client disconnected",
      );
    });
  });

  return io;
};
