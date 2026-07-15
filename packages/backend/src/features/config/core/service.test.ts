import { describe, expect, it } from "vitest";
import { maskConfig, mergeConfigUpdate } from "./service.js";
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
