/**
 * LMS Server Discovery via UDP Slim Protocol
 *
 * Sends a UDP broadcast on port 3483. LMS servers respond with 'E' (0x45).
 * After collecting UDP responses, enriches each server with HTTP metadata.
 */

import dgram from "node:dgram";
import { networkInterfaces } from "node:os";
import { err, fromThrowable, ok, type Result } from "@signalform/shared";
import type {
  DiscoveredServer,
  DiscoveryError,
  LmsPlayer,
} from "../core/types.js";
import {
  parseServerStatusResult,
  parsePlayersResult,
  appendUnique,
  extractBroadcastAddresses,
  type NetworkInterfaceEntry,
} from "../core/discovery-parsers.js";

const DISCOVERY_PACKET = Buffer.from([
  0x65, 0x49, 0x50, 0x41, 0x44, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
  0x00, 0x00, 0x00, 0x00, 0x00,
]);
const LMS_UDP_PORT = 3483;
const DEFAULT_LMS_HTTP_PORT = 9000;
const DISCOVERY_RESPONSE_BYTE = 0x45;

const getBroadcastAddresses = (): readonly string[] => {
  const ifaces = networkInterfaces() as Readonly<
    Record<string, readonly NetworkInterfaceEntry[] | undefined>
  >;
  return extractBroadcastAddresses(ifaces);
};

const fetchServerMeta = async (
  host: string,
  port: number,
): Promise<readonly [string, string]> =>
  fetch(`http://${host}:${port}/jsonrpc.js`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      method: "slim.request",
      params: ["", ["serverstatus", "-", 1]],
      id: 1,
    }),
    signal: AbortSignal.timeout(2000),
  })
    .then(async (response): Promise<readonly [string, string]> => {
      if (!response.ok) {
        return [`LMS @ ${host}`, "unknown"];
      }

      const data = parseServerStatusResult(await response.json());
      return [
        data.result?.server_name ?? `LMS @ ${host}`,
        data.result?.version ?? "unknown",
      ];
    })
    .catch((): readonly [string, string] => [`LMS @ ${host}`, "unknown"]);

const collectDiscoveredHosts = async (
  socket: dgram.Socket,
  timeoutMs: number,
): Promise<readonly string[]> => {
  return new Promise((resolve) => {
    const hosts = { current: [] as readonly string[] };

    const onMessage = (msg: Buffer, rinfo: dgram.RemoteInfo): void => {
      if (msg.length < 1 || msg[0] !== DISCOVERY_RESPONSE_BYTE) {
        return;
      }
      hosts.current = appendUnique(hosts.current, rinfo.address);
    };

    socket.on("message", onMessage);
    setTimeout(() => {
      socket.off("message", onMessage);
      resolve(hosts.current);
    }, timeoutMs);
  });
};

export const discoverLmsServers = async (
  timeoutMs = 2000,
  extraHosts: readonly string[] = [],
): Promise<Result<readonly DiscoveredServer[], DiscoveryError>> => {
  return new Promise((resolve) => {
    const socket = dgram.createSocket({ type: "udp4", reuseAddr: true });

    const finalize = async (foundHosts: readonly string[]): Promise<void> => {
      void fromThrowable(
        () => socket.close(),
        () => undefined,
      );

      const allHosts = extraHosts.reduce<readonly string[]>(
        (hosts, host) => appendUnique(hosts, host),
        foundHosts,
      );

      if (allHosts.length === 0) {
        resolve(ok([]));
        return;
      }

      const servers = await Promise.all(
        allHosts.map(async (host): Promise<DiscoveredServer> => {
          const [name, version] = await fetchServerMeta(
            host,
            DEFAULT_LMS_HTTP_PORT,
          );
          return {
            host,
            port: DEFAULT_LMS_HTTP_PORT,
            name,
            version,
          };
        }),
      );

      resolve(ok(servers));
    };

    socket.on("error", () => {
      resolve(ok([]));
    });

    socket.bind(0, () => {
      const broadcastResult = fromThrowable(
        () => {
          socket.setBroadcast(true);
          getBroadcastAddresses().forEach((address) => {
            socket.send(DISCOVERY_PACKET, LMS_UDP_PORT, address, () => {
              return undefined;
            });
          });
        },
        () => false,
      );

      if (!broadcastResult.ok) {
        resolve(ok([]));
        return;
      }

      void collectDiscoveredHosts(socket, timeoutMs).then(finalize);
    });
  });
};

export const fetchLmsPlayers = async (
  host: string,
  port: number,
): Promise<Result<readonly LmsPlayer[], DiscoveryError>> =>
  fetch(`http://${host}:${port}/jsonrpc.js`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      method: "slim.request",
      params: ["", ["players", 0, 100]],
      id: 1,
    }),
    signal: AbortSignal.timeout(3000),
  })
    .then(
      async (
        response,
      ): Promise<Result<readonly LmsPlayer[], DiscoveryError>> => {
        if (!response.ok) {
          return err({
            type: "NETWORK_ERROR",
            message: `HTTP ${response.status}`,
          });
        }

        const data = parsePlayersResult(await response.json());
        const players = (data.result?.players_loop ?? []).map((player) => ({
          id: player.playerid,
          name: player.name,
          model: player.model ?? "unknown",
          connected: (player.connected ?? 0) === 1,
        }));
        return ok(players);
      },
    )
    .catch(
      (error: unknown): Result<readonly LmsPlayer[], DiscoveryError> =>
        err({
          type: "NETWORK_ERROR",
          message: error instanceof Error ? error.message : "Unknown error",
        }),
    );
