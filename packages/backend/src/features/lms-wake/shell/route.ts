import { createSocket, type Socket } from "node:dgram";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { loadConfig } from "../../../infrastructure/config/index.js";
import { buildMagicPacket } from "../core/service.js";

const WAKE_PORT = 9;
const BROADCAST_ADDRESS = "255.255.255.255";

/**
 * Sends the magic packet to every target over UDP. The production container
 * sits in a Docker bridge network where broadcasts do not leave the bridge,
 * so a unicast to the LMS host is sent as well (a static ARP entry on the
 * host reaches the sleeping server); the broadcast helps host-network
 * deployments. Individual send failures are swallowed — a dead broadcast
 * target must not fail the request.
 */
const bindSocket = (socket: Socket): Promise<void> =>
  new Promise((resolve, reject) => {
    socket.once("error", reject);
    socket.bind(() => {
      resolve();
    });
  });

/** Resolves regardless of the send outcome — errors land in the callback. */
const sendIgnoringErrors = (
  socket: Socket,
  packet: Uint8Array,
  target: string,
): Promise<void> =>
  new Promise((resolve) => {
    socket.send(packet, WAKE_PORT, target, () => {
      resolve();
    });
  });

const sendWakePacket = async (
  packet: Uint8Array,
  targets: readonly string[],
): Promise<void> => {
  const socket = createSocket("udp4");
  // Persistent no-op listener for the socket's whole lifetime: bindSocket's
  // `once` listener is consumed by the first error event, so without this a
  // second emitted "error" would have no listener and crash the process.
  socket.on("error", () => {});
  try {
    await bindSocket(socket);
    socket.setBroadcast(true);
    await Promise.all(
      targets.map((target) => sendIgnoringErrors(socket, packet, target)),
    );
  } catch {
    // bind failures are swallowed — waking the server is best-effort
  } finally {
    try {
      socket.close();
    } catch {
      // socket never opened or already closed — nothing left to release
    }
  }
};

export const createLmsWakeRoute = (server: FastifyInstance): void => {
  server.post(
    "/api/lms/wake",
    async (_request: FastifyRequest, reply: FastifyReply) => {
      const configResult = loadConfig();
      if (!configResult.ok) {
        return reply.code(500).send({ error: "Failed to load configuration" });
      }

      const config = configResult.value;
      if (config.lmsMacAddress === undefined) {
        // Silent no-op — the frontend calls this unconditionally.
        return reply.code(204).send();
      }

      const packetResult = buildMagicPacket(config.lmsMacAddress);
      if (!packetResult.ok) {
        return reply.code(400).send({ error: packetResult.error.message });
      }

      // ponytail: fire-and-forget, no reachability check — a magic packet to an awake server is harmless
      await sendWakePacket(packetResult.value, [
        config.lmsHost,
        BROADCAST_ADDRESS,
      ]);

      return reply.code(204).send();
    },
  );
};
