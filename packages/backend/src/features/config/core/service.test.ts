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

  it("exposes lastFmUsername when set", () => {
    const result = maskConfig({
      ...makeConfig(),
      lastFmUsername: "testuser",
    });

    expect(result.lastFmUsername).toBe("testuser");
  });

  it("exposes lastFmUsername as undefined when not set", () => {
    const result = maskConfig(makeConfig());
    expect(result.lastFmUsername).toBeUndefined();
  });

  it("hasLastFmSession is true when lastFmSessionKey is a non-empty string", () => {
    const result = maskConfig({
      ...makeConfig(),
      lastFmSessionKey: "abc123",
    });

    expect(result.hasLastFmSession).toBe(true);
  });

  it("hasLastFmSession is false when lastFmSessionKey is undefined", () => {
    const result = maskConfig(makeConfig());
    expect(result.hasLastFmSession).toBe(false);
  });

  it("hasLastFmSession is false when lastFmSessionKey is whitespace", () => {
    const result = maskConfig({
      ...makeConfig(),
      lastFmSessionKey: "   ",
    });

    expect(result.hasLastFmSession).toBe(false);
  });

  it("does NOT expose lastFmSessionKey or lastFmSharedSecret directly", () => {
    const result = maskConfig({
      ...makeConfig(),
      lastFmSessionKey: "secret-session",
      lastFmSharedSecret: "super-secret",
    });

    expect("lastFmSessionKey" in result).toBe(false);
    expect("lastFmSharedSecret" in result).toBe(false);
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

  it("clears lastFmSessionKey when update passes null", () => {
    const existing: AppConfig = {
      ...makeConfig(),
      lastFmSessionKey: "existing-session",
    };

    const result = mergeConfigUpdate(existing, { lastFmSessionKey: null });

    expect(result.lastFmSessionKey).toBeUndefined();
  });

  it("keeps lastFmSessionKey when update does not include it", () => {
    const existing: AppConfig = {
      ...makeConfig(),
      lastFmSessionKey: "existing-session",
    };

    const result = mergeConfigUpdate(existing, { lmsHost: "10.0.0.1" });

    expect(result.lastFmSessionKey).toBe("existing-session");
  });

  it("sets lastFmSessionKey when update passes a string", () => {
    const result = mergeConfigUpdate(makeConfig(), {
      lastFmSessionKey: "new-session",
    });

    expect(result.lastFmSessionKey).toBe("new-session");
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

  it("updates lastFmUsername and lastFmSharedSecret", () => {
    const result = mergeConfigUpdate(makeConfig(), {
      lastFmUsername: "newuser",
      lastFmSharedSecret: "newsecret",
    });

    expect(result.lastFmUsername).toBe("newuser");
    expect(result.lastFmSharedSecret).toBe("newsecret");
  });

  it("preserves existing lastFmUsername when not in update", () => {
    const existing: AppConfig = {
      ...makeConfig(),
      lastFmUsername: "existinguser",
    };

    const result = mergeConfigUpdate(existing, { lmsHost: "10.0.0.1" });

    expect(result.lastFmUsername).toBe("existinguser");
  });
});
