import { describe, expect, it } from "vitest";
import { unwrap } from "@signalform/shared";
import { buildMagicPacket } from "./service.js";

const MAC_BYTES = [0xaa, 0xbb, 0xcc, 0xdd, 0xee, 0xff] as const;

const unwrapPacket = (mac: string): Uint8Array => unwrap(buildMagicPacket(mac));

describe("buildMagicPacket", () => {
  it("builds a 102-byte packet: 6x 0xFF header, MAC repeated 16 times", () => {
    const packet = unwrapPacket("aa:bb:cc:dd:ee:ff");

    expect(packet.length).toBe(102);
    expect(Array.from(packet.subarray(0, 6))).toEqual([
      0xff, 0xff, 0xff, 0xff, 0xff, 0xff,
    ]);
    expect(Array.from(packet.subarray(6, 12))).toEqual([...MAC_BYTES]);
    expect(Array.from(packet.subarray(96, 102))).toEqual([...MAC_BYTES]);
  });

  it("repeats the MAC in every one of the 16 payload slots", () => {
    const packet = unwrapPacket("aa:bb:cc:dd:ee:ff");

    const offsets = Array.from({ length: 16 }, (_, index) => 6 + index * 6);
    offsets.forEach((offset) => {
      expect(Array.from(packet.subarray(offset, offset + 6))).toEqual([
        ...MAC_BYTES,
      ]);
    });
  });

  it("accepts dash-separated MACs and produces identical bytes", () => {
    const colon = unwrapPacket("aa:bb:cc:dd:ee:ff");
    const dash = unwrapPacket("aa-bb-cc-dd-ee-ff");

    expect(Array.from(dash)).toEqual(Array.from(colon));
  });

  it("accepts uppercase MACs and produces identical bytes", () => {
    const lower = unwrapPacket("aa:bb:cc:dd:ee:ff");
    const upper = unwrapPacket("AA:BB:CC:DD:EE:FF");

    expect(Array.from(upper)).toEqual(Array.from(lower));
  });

  it.each([
    ["empty string", ""],
    ["too few groups", "aa:bb:cc:dd:ee"],
    ["too many groups", "aa:bb:cc:dd:ee:ff:00"],
    ["non-hex characters", "aa:bb:cc:dd:ee:gg"],
    ["missing separators", "aabbccddeeff"],
    ["mixed separators", "aa:bb-cc:dd-ee:ff"],
    ["groups of wrong length", "a:bb:cc:dd:ee:fff"],
  ])("returns INVALID_MAC for %s", (_label, mac) => {
    const result = buildMagicPacket(mac);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.type).toBe("INVALID_MAC");
      expect(result.error.message).toContain(mac);
    }
  });
});
