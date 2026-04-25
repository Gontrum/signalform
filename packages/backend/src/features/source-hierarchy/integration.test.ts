/**
 * Source Hierarchy Feature - Integration Tests
 *
 * Tests module integration: service factory with custom config,
 * integration with @signalform/shared Track types, TypeScript compilation checks.
 *
 * Target: 5-7 integration tests.
 */

import { describe, test, expect } from "vitest";
import {
  createSourceHierarchyService,
  selectBestSource,
  DEFAULT_QUALITY_CONFIG,
} from "./index.js";
import type { Track } from "@signalform/shared";
import { isOk, isErr } from "@signalform/shared";
import type { QualityHierarchyConfig } from "./index.js";

// ---------------------------------------------------------------------------
// Integration Tests
// ---------------------------------------------------------------------------

describe("Source Hierarchy Feature - Integration", () => {
  test("service factory creates service with custom quality hierarchy config", () => {
    const customConfig: QualityHierarchyConfig = {
      sourcePriority: ["qobuz", "tidal", "local"],
      losslessFactor: 20,
      formatBonuses: {
        FLAC: 2000,
        ALAC: 2000,
        AAC: 1000,
        OGG: 500,
        MP3: 500,
      },
    };

    const service = createSourceHierarchyService(customConfig);

    // Service is created without errors
    expect(service).toBeDefined();
    expect(typeof service.selectBestSource).toBe("function");
    expect(typeof service.rankSources).toBe("function");
  });

  test("service integrates with @signalform/shared Track type sources", () => {
    // Verify the service works with sources from a real Track type
    const track: Track = {
      id: "track-1",
      title: "Dark Side of the Moon",
      artist: "Pink Floyd",
      album: "The Dark Side of the Moon",
      duration: 263,
      sources: [
        {
          source: "local",
          url: "file:///music/dsotm.flac",
          quality: {
            format: "FLAC",
            bitrate: 4608,
            sampleRate: 96000,
            bitDepth: 24,
            lossless: true,
          },
          available: true,
        },
        {
          source: "tidal",
          url: "tidal://track/12345",
          quality: {
            format: "FLAC",
            bitrate: 1411,
            sampleRate: 44100,
            bitDepth: 16,
            lossless: true,
          },
          available: true,
        },
      ],
    };

    const result = selectBestSource(track.sources);

    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      // Local 24/96 should beat Tidal 16/44
      expect(result.value.source).toBe("local");
    }
  });

  test("Result<T, E> helpers from @signalform/shared work correctly with service output", () => {
    const successResult = selectBestSource([
      {
        source: "local",
        url: "file:///music/track.flac",
        quality: {
          format: "FLAC",
          bitrate: 1411,
          sampleRate: 44100,
          bitDepth: 16,
          lossless: true,
        },
        available: true,
      },
    ]);

    const errorResult = selectBestSource([]);

    // isOk / isErr helpers from shared package work with our Result types
    expect(isOk(successResult)).toBe(true);
    expect(isErr(successResult)).toBe(false);
    expect(isOk(errorResult)).toBe(false);
    expect(isErr(errorResult)).toBe(true);
  });

  test("DEFAULT_QUALITY_CONFIG is exported and has correct structure", () => {
    expect(DEFAULT_QUALITY_CONFIG).toBeDefined();
    expect(Array.isArray(DEFAULT_QUALITY_CONFIG.sourcePriority)).toBe(true);
    expect(DEFAULT_QUALITY_CONFIG.sourcePriority).toContain("local");
    expect(DEFAULT_QUALITY_CONFIG.sourcePriority).toContain("qobuz");
    expect(DEFAULT_QUALITY_CONFIG.sourcePriority).toContain("tidal");
    expect(typeof DEFAULT_QUALITY_CONFIG.losslessFactor).toBe("number");
    expect(DEFAULT_QUALITY_CONFIG.losslessFactor).toBeGreaterThan(1);
    expect(typeof DEFAULT_QUALITY_CONFIG.formatBonuses).toBe("object");
  });

  test("custom config service applies overridden source priority", () => {
    const tidalFirstConfig: QualityHierarchyConfig = {
      ...DEFAULT_QUALITY_CONFIG,
      sourcePriority: ["tidal", "qobuz", "local"],
    };

    const service = createSourceHierarchyService(tidalFirstConfig);
    const sources = [
      {
        source: "local" as const,
        url: "file:///track.flac",
        quality: {
          format: "FLAC" as const,
          bitrate: 4608,
          sampleRate: 96000,
          bitDepth: 24,
          lossless: true,
        },
        available: true,
      },
      {
        source: "tidal" as const,
        url: "tidal://track/1",
        quality: {
          format: "FLAC" as const,
          bitrate: 4608,
          sampleRate: 96000,
          bitDepth: 24,
          lossless: true,
        },
        available: true,
      },
    ];

    const result = service.selectBestSource(sources);

    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      // With custom config: tidal has highest priority
      expect(result.value.source).toBe("tidal");
    }
  });

  test("service module exports all expected symbols from index.ts", async () => {
    // Verify public API completeness
    const exports = Object.keys(await import("./index.js"));

    expect(exports).toContain("createSourceHierarchyService");
    expect(exports).toContain("selectBestSource");
    expect(exports).toContain("rankSources");
    expect(exports).toContain("calculateQualityScore");
    expect(exports).toContain("compareQuality");
    expect(exports).toContain("applySourceTieBreaker");
    expect(exports).toContain("DEFAULT_QUALITY_CONFIG");
  });
});
