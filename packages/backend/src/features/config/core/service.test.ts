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
});
