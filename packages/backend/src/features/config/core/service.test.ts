import { describe, expect, it } from "vitest";
import {
  maskConfig,
  mergeConfigUpdate,
  normalizeLmsMacAddress,
} from "./service.js";
import type { AppConfig } from "../../../infrastructure/config/index.js";

const makeConfig = (): AppConfig => ({
  lmsHost: "192.168.1.100",
  lmsPort: 9000,
  playerId: "aa:bb:cc:dd:ee:ff",
  lastFmApiKey: "test-lastfm",
  fanartApiKey: "test-fanart",
  language: "en",
  users: [],
  personalRadioEnabled: false,
  scrobblingEnabled: false,
  personalRadioDiscovery: 50,
});

describe("maskConfig", () => {
  it("masks API keys into presence flags", () => {
    const result = maskConfig(makeConfig());

    expect(result.hasLastFmKey).toBe(true);
    expect(result.hasFanartKey).toBe(true);
    expect("lastFmApiKey" in result).toBe(false);
    expect("fanartApiKey" in result).toBe(false);
  });

  it("detects empty API keys as missing", () => {
    const result = maskConfig({
      ...makeConfig(),
      lastFmApiKey: "",
      fanartApiKey: " ",
    });

    expect(result.hasLastFmKey).toBe(false);
    expect(result.hasFanartKey).toBe(false);
  });

  it("exposes personalRadioEnabled, scrobblingEnabled, personalRadioDiscovery", () => {
    const result = maskConfig({
      ...makeConfig(),
      personalRadioEnabled: true,
      scrobblingEnabled: true,
      personalRadioDiscovery: 75,
    });

    expect(result.personalRadioEnabled).toBe(true);
    expect(result.scrobblingEnabled).toBe(true);
    expect(result.personalRadioDiscovery).toBe(75);
  });

  it("exposes lmsMacAddress as-is — a MAC is not a secret", () => {
    const result = maskConfig({
      ...makeConfig(),
      lmsMacAddress: "00:11:22:33:44:55",
    });

    expect(result.lmsMacAddress).toBe("00:11:22:33:44:55");
  });

  it("omits lmsMacAddress when not configured", () => {
    const result = maskConfig(makeConfig());

    expect("lmsMacAddress" in result).toBe(false);
  });

  it("reports hasLastFmSharedSecret true when the secret is set", () => {
    const result = maskConfig({
      ...makeConfig(),
      lastFmSharedSecret: "super-secret",
    });

    expect(result.hasLastFmSharedSecret).toBe(true);
  });

  it("reports hasLastFmSharedSecret false when the secret is unset", () => {
    const result = maskConfig(makeConfig());

    expect(result.hasLastFmSharedSecret).toBe(false);
  });

  it("reports hasLastFmSharedSecret false when the secret is whitespace-only", () => {
    const result = maskConfig({
      ...makeConfig(),
      lastFmSharedSecret: "   ",
    });

    expect(result.hasLastFmSharedSecret).toBe(false);
  });

  it("does NOT expose lastFmSharedSecret or per-user fields", () => {
    const result = maskConfig({
      ...makeConfig(),
      lastFmSharedSecret: "super-secret",
      users: [
        {
          id: "user-1",
          name: "Alice",
          lastFmUsername: "alice_fm",
          lastFmSessionKey: "secret-session",
        },
      ],
    });

    expect("lastFmSharedSecret" in result).toBe(false);
    expect("lastFmUsername" in result).toBe(false);
    expect("lastFmSessionKey" in result).toBe(false);
    expect("hasLastFmSession" in result).toBe(false);
    expect("users" in result).toBe(false);
  });
});

describe("normalizeLmsMacAddress", () => {
  it("normalizes an empty string to null — a clear request", () => {
    expect(normalizeLmsMacAddress("")).toBeNull();
  });

  it("normalizes a whitespace-only string to null", () => {
    expect(normalizeLmsMacAddress("   ")).toBeNull();
  });

  it("passes a MAC address through unchanged", () => {
    expect(normalizeLmsMacAddress("00:11:22:33:44:55")).toBe(
      "00:11:22:33:44:55",
    );
  });

  it("passes null through unchanged", () => {
    expect(normalizeLmsMacAddress(null)).toBeNull();
  });

  it("passes undefined through unchanged", () => {
    expect(normalizeLmsMacAddress(undefined)).toBeUndefined();
  });
});

describe("mergeConfigUpdate", () => {
  it("merges partial updates without dropping existing values", () => {
    const result = mergeConfigUpdate(makeConfig(), {
      playerId: "ff:ee:dd:cc:bb:aa",
      language: "de",
    });

    expect(result.playerId).toBe("ff:ee:dd:cc:bb:aa");
    expect(result.language).toBe("de");
    expect(result.lmsHost).toBe("192.168.1.100");
  });

  it("allows clearing API keys with empty strings", () => {
    const result = mergeConfigUpdate(makeConfig(), {
      lastFmApiKey: "",
      fanartApiKey: "",
    });

    expect(result.lastFmApiKey).toBe("");
    expect(result.fanartApiKey).toBe("");
  });

  it("updates personalRadioDiscovery to 75", () => {
    const result = mergeConfigUpdate(makeConfig(), {
      personalRadioDiscovery: 75,
    });

    expect(result.personalRadioDiscovery).toBe(75);
  });

  it("updates personalRadioEnabled and scrobblingEnabled", () => {
    const result = mergeConfigUpdate(makeConfig(), {
      personalRadioEnabled: true,
      scrobblingEnabled: true,
    });

    expect(result.personalRadioEnabled).toBe(true);
    expect(result.scrobblingEnabled).toBe(true);
  });

  it("updates lastFmSharedSecret", () => {
    const result = mergeConfigUpdate(makeConfig(), {
      lastFmSharedSecret: "newsecret",
    });

    expect(result.lastFmSharedSecret).toBe("newsecret");
  });

  it("preserves existing lastFmSharedSecret when not in update", () => {
    const existing: AppConfig = {
      ...makeConfig(),
      lastFmSharedSecret: "existing-secret",
    };

    const result = mergeConfigUpdate(existing, { lmsHost: "10.0.0.1" });

    expect(result.lastFmSharedSecret).toBe("existing-secret");
  });

  it("sets lmsMacAddress", () => {
    const result = mergeConfigUpdate(makeConfig(), {
      lmsMacAddress: "00:11:22:33:44:55",
    });

    expect(result.lmsMacAddress).toBe("00:11:22:33:44:55");
  });

  it("clears lmsMacAddress with null", () => {
    const existing: AppConfig = {
      ...makeConfig(),
      lmsMacAddress: "00:11:22:33:44:55",
    };

    const result = mergeConfigUpdate(existing, { lmsMacAddress: null });

    expect(result.lmsMacAddress).toBeUndefined();
  });

  it("preserves existing lmsMacAddress when absent from the update", () => {
    const existing: AppConfig = {
      ...makeConfig(),
      lmsMacAddress: "00:11:22:33:44:55",
    };

    const result = mergeConfigUpdate(existing, { lmsHost: "10.0.0.1" });

    expect(result.lmsMacAddress).toBe("00:11:22:33:44:55");
  });

  it("carries over users unchanged — updates never touch users", () => {
    const existing: AppConfig = {
      ...makeConfig(),
      users: [
        {
          id: "user-1",
          name: "Alice",
          lastFmUsername: "alice_fm",
          lastFmSessionKey: "session-key",
        },
        { id: "user-2", name: "Bob" },
      ],
    };

    const result = mergeConfigUpdate(existing, {
      lmsHost: "10.0.0.1",
      lastFmApiKey: "new-key",
    });

    expect(result.users).toBe(existing.users);
  });
});
