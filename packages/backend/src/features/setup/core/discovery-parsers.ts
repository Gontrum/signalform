/**
 * Setup Discovery — Pure Parser Functions
 *
 * Pure functions extracted from shell/discovery.ts for direct unit testing.
 * No I/O, no network calls, no side effects.
 *
 * Exported so they can be tested independently of the UDP/HTTP shell logic.
 */

// ─── Types ───────────────────────────────────────────────────────────────────

type JsonObject = Record<string, unknown>;

type ServerStatusResult = {
  readonly result?: {
    readonly server_name?: string;
    readonly version?: string;
  };
};

type ParsedPlayer = {
  readonly playerid: string;
  readonly name: string;
  readonly model?: string;
  readonly connected?: number;
};

type PlayersResult = {
  readonly result?: {
    readonly players_loop?: readonly ParsedPlayer[];
  };
};

export type NetworkInterfaceEntry = {
  readonly address: string;
  readonly netmask: string;
  readonly family: string | number;
};

// ─── Pure parsers ────────────────────────────────────────────────────────────

export const isJsonObject = (value: unknown): value is JsonObject =>
  typeof value === "object" && value !== null;

/**
 * Parses LMS serverstatus JSON-RPC response into a typed structure.
 * Returns {} on invalid input — never throws.
 */
export const parseServerStatusResult = (value: unknown): ServerStatusResult => {
  if (!isJsonObject(value)) {
    return {};
  }

  const result = value["result"];
  if (!isJsonObject(result)) {
    return {};
  }

  return {
    result: {
      server_name:
        typeof result["server_name"] === "string"
          ? result["server_name"]
          : undefined,
      version:
        typeof result["version"] === "string" ? result["version"] : undefined,
    },
  };
};

/**
 * Parses a single LMS player entry from the JSON-RPC players_loop array.
 * Returns null for entries that lack the required playerid/name fields.
 */
export const toParsedPlayer = (value: unknown): ParsedPlayer | null => {
  if (!isJsonObject(value)) {
    return null;
  }

  const playerid = value["playerid"];
  const name = value["name"];
  if (typeof playerid !== "string" || typeof name !== "string") {
    return null;
  }

  return {
    playerid,
    name,
    model: typeof value["model"] === "string" ? value["model"] : undefined,
    connected:
      typeof value["connected"] === "number" ? value["connected"] : undefined,
  };
};

/**
 * Parses LMS players JSON-RPC response into a typed structure.
 * Returns {} on invalid input — never throws.
 */
export const parsePlayersResult = (value: unknown): PlayersResult => {
  if (!isJsonObject(value)) {
    return {};
  }

  const result = value["result"];
  if (!isJsonObject(result)) {
    return {};
  }

  const playersLoop = Array.isArray(result["players_loop"])
    ? result["players_loop"]
        .map(toParsedPlayer)
        .filter((player): player is ParsedPlayer => player !== null)
    : undefined;

  return {
    result: {
      players_loop: playersLoop,
    },
  };
};

/**
 * Deduplicates an array of strings — returns the same array if value already present.
 */
export const appendUnique = (
  values: readonly string[],
  value: string,
): readonly string[] => (values.includes(value) ? values : [...values, value]);

/**
 * Computes the directed broadcast address for a given IPv4 address + netmask pair.
 * Pure function — no network I/O.
 *
 * @param address - IPv4 address string (e.g. "192.168.1.5")
 * @param netmask - IPv4 netmask string (e.g. "255.255.255.0")
 * @returns Directed broadcast address (e.g. "192.168.1.255")
 */
export const computeDirectedBroadcast = (
  address: string,
  netmask: string,
): string => {
  const addressParts = address.split(".").map((part) => Number(part));
  const maskParts = netmask.split(".").map((part) => Number(part));
  return addressParts
    .map((part, index) => part | (~(maskParts[index] ?? 255) & 0xff))
    .join(".");
};

/**
 * Extracts directed broadcast addresses from a list of network interface entries.
 * Pure function — the caller provides the interface data (injectable for testing).
 *
 * Only IPv4 non-loopback interfaces are considered.
 * Always includes 255.255.255.255 as the global broadcast fallback.
 *
 * @param interfaces - Map of interface name → entries (injectable, typically from node:os)
 * @returns Deduplicated list of directed broadcast addresses
 */
export const extractBroadcastAddresses = (
  interfaces: Readonly<
    Record<string, readonly NetworkInterfaceEntry[] | undefined>
  >,
): readonly string[] =>
  Object.values(interfaces).reduce<readonly string[]>(
    (addresses, interfaceEntries) => {
      const entries = interfaceEntries ?? [];

      return entries.reduce<readonly string[]>((nextAddresses, entry) => {
        // Node.js returns family as "IPv4"/"IPv6" string or 4/6 number depending on version
        const isIPv4 = entry.family === "IPv4" || entry.family === 4;
        if (!isIPv4 || entry.address.startsWith("127.")) {
          return nextAddresses;
        }

        const broadcast = computeDirectedBroadcast(
          entry.address,
          entry.netmask,
        );
        return appendUnique(nextAddresses, broadcast);
      }, addresses);
    },
    ["255.255.255.255"],
  );
