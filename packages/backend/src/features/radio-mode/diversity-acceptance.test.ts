/**
 * Artist Diversity Filter — Acceptance Tests (BDD).
 */

import { describe, test, expect } from "vitest";
import {
  filterByDiversity,
  addToSlidingWindow,
} from "./core/diversity-service.js";
import type { CandidateTrack } from "./core/types.js";

describe("Artist Diversity Filter — Acceptance Tests", () => {
  test("Scenario 1: Miles Davis in recent 10 → filtered out; Coltrane not in window → kept (AC1+AC2)", () => {
    const recentArtists = [
      "Coltrane",
      "Monk",
      "Evans",
      "Parker",
      "Miles Davis",
      "Mingus",
      "Rollins",
      "Shorter",
      "Hancock",
      "Corea",
    ]; // 10 artists, Miles Davis is in window
    const candidates: readonly CandidateTrack[] = [
      { name: "Kind of Blue", artist: "Miles Davis", match: 0.9, url: "" },
      { name: "A Love Supreme", artist: "John Coltrane", match: 0.85, url: "" },
    ];
    const result = filterByDiversity(candidates, recentArtists);
    expect(result.some((t) => t.artist === "Miles Davis")).toBe(false);
    expect(result.some((t) => t.artist === "John Coltrane")).toBe(true);
  });

  test("Scenario 2: Miles Davis NOT in recent 10 → Miles Davis candidate kept (AC1)", () => {
    const recentArtists = [
      "Coltrane",
      "Monk",
      "Evans",
      "Parker",
      "Mingus",
      "Rollins",
      "Shorter",
      "Hancock",
      "Corea",
      "Jarrett",
    ]; // Miles Davis NOT in window
    const candidates: readonly CandidateTrack[] = [
      { name: "Kind of Blue", artist: "Miles Davis", match: 0.9, url: "" },
    ];
    const result = filterByDiversity(candidates, recentArtists);
    expect(result).toHaveLength(1);
    expect(result[0]?.artist).toBe("Miles Davis");
  });

  test("Scenario 3: Empty window → all candidates pass (AC5 graceful degradation)", () => {
    const candidates: readonly CandidateTrack[] = [
      { name: "Kind of Blue", artist: "Miles Davis", match: 0.9, url: "" },
      { name: "Giant Steps", artist: "Coltrane", match: 0.85, url: "" },
    ];
    const result = filterByDiversity(candidates, []);
    expect(result).toHaveLength(2);
  });

  test("Scenario 4: 10 new tracks after Miles Davis → Miles Davis pushed out of window → allowed again (AC4)", () => {
    const initialWindow: readonly string[] = ["Miles Davis"];
    // Add 10 more artists → Miles Davis (index 0) is pushed out by slice(-10)
    const updatedWindow = [
      "Coltrane",
      "Monk",
      "Evans",
      "Parker",
      "Mingus",
      "Rollins",
      "Shorter",
      "Hancock",
      "Corea",
      "Jarrett",
    ].reduce<readonly string[]>(
      (w, artist) => addToSlidingWindow(w, artist, 10),
      initialWindow,
    );
    const candidates: readonly CandidateTrack[] = [
      { name: "Kind of Blue", artist: "Miles Davis", match: 0.9, url: "" },
    ];
    const result = filterByDiversity(candidates, updatedWindow);
    expect(result).toHaveLength(1); // Miles Davis allowed again after 10 tracks
  });

  test("Scenario 5: All candidates by artists in window → empty result, no error (AC5)", () => {
    const recentArtists = ["Miles Davis", "Coltrane"];
    const candidates: readonly CandidateTrack[] = [
      { name: "Track1", artist: "Miles Davis", match: 0.9, url: "" },
      { name: "Track2", artist: "Coltrane", match: 0.85, url: "" },
    ];
    const result = filterByDiversity(candidates, recentArtists);
    expect(result).toHaveLength(0);
  });

  test("Scenario 6: Pure function — same input always returns same output (AC6)", () => {
    const recentArtists = ["Miles Davis", "Coltrane"];
    const candidates: readonly CandidateTrack[] = [
      { name: "Night Train", artist: "Evans", match: 0.8, url: "" },
    ];
    const result1 = filterByDiversity(candidates, recentArtists);
    const result2 = filterByDiversity(candidates, recentArtists);
    expect(result1).toEqual(result2);
    expect(result1).toHaveLength(1);
  });
});
