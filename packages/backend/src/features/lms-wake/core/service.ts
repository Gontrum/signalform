import { err, ok, type Result } from "@signalform/shared";

export type WakeError = {
  readonly type: "INVALID_MAC";
  readonly message: string;
};

const invalidMac = (mac: string): WakeError => ({
  type: "INVALID_MAC",
  message: `Not a valid MAC address: "${mac}"`,
});

const MAC_PATTERN =
  /^([0-9a-f]{2}):([0-9a-f]{2}):([0-9a-f]{2}):([0-9a-f]{2}):([0-9a-f]{2}):([0-9a-f]{2})$|^([0-9a-f]{2})-([0-9a-f]{2})-([0-9a-f]{2})-([0-9a-f]{2})-([0-9a-f]{2})-([0-9a-f]{2})$/i;

const HEADER_BYTE_COUNT = 6;
const MAC_REPETITIONS = 16;

/** Parses a MAC in `aa:bb:cc:dd:ee:ff` or `aa-bb-cc-dd-ee-ff` form. */
const parseMacBytes = (mac: string): Result<readonly number[], WakeError> => {
  if (!MAC_PATTERN.test(mac)) {
    return err(invalidMac(mac));
  }
  const groups = mac.split(mac.includes(":") ? ":" : "-");
  return ok(groups.map((group) => parseInt(group, 16)));
};

/**
 * Builds a wake-on-LAN magic packet: 6 bytes of 0xFF followed by the
 * 6-byte MAC address repeated 16 times — 102 bytes in total.
 */
export const buildMagicPacket = (
  mac: string,
): Result<Uint8Array, WakeError> => {
  const parsed = parseMacBytes(mac);
  if (!parsed.ok) {
    return parsed;
  }

  const header: readonly number[] = Array.from(
    { length: HEADER_BYTE_COUNT },
    () => 0xff,
  );
  const repeatedMac: readonly number[] = Array.from(
    { length: MAC_REPETITIONS },
    () => parsed.value,
  ).flat();
  return ok(Uint8Array.from([...header, ...repeatedMac]));
};
