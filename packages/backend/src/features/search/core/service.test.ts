/**
 * Search Service Unit Tests
 *
 * Tests for pure business logic functions.
 * Following BDD pattern with given/when/then helpers.
 */

import { describe, it, expect } from "vitest";
import {
  searchTracks,
  transformToFullResults,
  normalizeDeduplicationKey,
  selectSourceByPriority,
  deduplicateTracks,
  selectBestAvailableSource,
} from "./service.js";
import type { SearchResult as LmsSearchResult } from "../../../adapters/lms-client/index.js";
import type { SearchResultsResponse, AvailableSource } from "./types.js";
import type { AudioQuality } from "@signalform/shared";

describe("searchTracks", () => {
  it("returns empty array when LMS returns no results", () => {
    const lmsResults = givenNoLmsResults();

    const result = whenSearchingFor("nonexistent query", lmsResults);

    thenResultIsEmptyArray(result);
  });

  it("returns EMPTY_QUERY error for empty string", () => {
    const lmsResults = givenNoLmsResults();

    const result = whenSearchingFor("", lmsResults);

    thenResultIsEmptyQueryError(result);
  });

  it("returns EMPTY_QUERY error for whitespace-only string", () => {
    const lmsResults = givenNoLmsResults();

    const result = whenSearchingFor("   \t\n  ", lmsResults);

    thenResultIsEmptyQueryError(result);
  });

  it("transforms LMS results to Track type", () => {
    const lmsResults = givenLmsResults([
      {
        id: "123",
        title: "Breathe",
        artist: "Pink Floyd",
        album: "Dark Side of the Moon",
        url: "file:///music/breathe.flac",
        source: "local",
        type: "track",
      },
    ]);

    const result = whenSearchingFor("Pink Floyd", lmsResults);

    thenResultContainsTrack(result, {
      id: "123",
      title: "Breathe",
      artist: "Pink Floyd",
      album: "Dark Side of the Moon",
    });
  });

  it("preserves all LMS result fields", () => {
    const lmsResults = givenLmsResults([
      {
        id: "456",
        title: "Comfortably Numb",
        artist: "Pink Floyd",
        album: "The Wall",
        url: "qobuz://track/456",
        source: "qobuz",
        type: "track",
      },
    ]);

    const result = whenSearchingFor("Comfortably Numb", lmsResults);

    thenResultPreservesAllFields(result);
  });

  it("handles multiple results correctly", () => {
    const lmsResults = givenLmsResults([
      {
        id: "1",
        title: "Track 1",
        artist: "Artist 1",
        album: "Album 1",
        url: "file:///1.flac",
        source: "local",
        type: "track",
      },
      {
        id: "2",
        title: "Track 2",
        artist: "Artist 2",
        album: "Album 2",
        url: "tidal://2",
        source: "tidal",
        type: "track",
      },
    ]);

    const result = whenSearchingFor("test", lmsResults);

    thenResultContainsMultipleTracks(result, 2);
  });

  it("does not modify original lmsResults array", () => {
    const originalResults: readonly LmsSearchResult[] = [
      {
        id: "1",
        title: "Test",
        artist: "Artist",
        album: "Album",
        url: "file:///test.flac",
        source: "local",
        type: "track",
      },
    ];

    const lmsResults = givenLmsResults(originalResults);

    whenSearchingFor("test", lmsResults);

    thenOriginalArrayIsUnmodified(originalResults);
  });
});

// GIVEN helpers - return test data instead of mutating shared state
const givenNoLmsResults = (): readonly LmsSearchResult[] => {
  return [];
};

const givenLmsResults = (
  results: readonly LmsSearchResult[],
): readonly LmsSearchResult[] => {
  return results;
};

// WHEN helpers - synchronous, searchTracks is not async
const whenSearchingFor = (
  query: string,
  lmsResults: readonly LmsSearchResult[],
): ReturnType<typeof searchTracks> => {
  return searchTracks(query, lmsResults);
};

// THEN helpers - synchronous assertions
const thenResultIsEmptyArray = (
  result: ReturnType<typeof searchTracks>,
): void => {
  expect(result.ok).toBe(true);
  if (result.ok) {
    expect(result.value).toEqual([]);
  }
};

const thenResultIsEmptyQueryError = (
  result: ReturnType<typeof searchTracks>,
): void => {
  expect(result.ok).toBe(false);
  if (!result.ok) {
    expect(result.error.code).toBe("EMPTY_QUERY");
    expect(result.error.message).toContain("cannot be empty");
  }
};

const thenResultContainsTrack = (
  result: ReturnType<typeof searchTracks>,
  expectedTrack: Partial<LmsSearchResult>,
): void => {
  expect(result.ok).toBe(true);
  if (result.ok) {
    expect(result.value).toHaveLength(1);
    expect(result.value[0]).toMatchObject(expectedTrack);
  }
};

const thenResultPreservesAllFields = (
  result: ReturnType<typeof searchTracks>,
): void => {
  expect(result.ok).toBe(true);
  if (result.ok) {
    const track = result.value[0];
    expect(track).toBeDefined();
    if (track) {
      expect(track).toHaveProperty("id");
      expect(track).toHaveProperty("title");
      expect(track).toHaveProperty("artist");
      expect(track).toHaveProperty("album");
      expect(track).toHaveProperty("url");
      expect(track).toHaveProperty("source");
      expect(track.source).toBe("qobuz");
    }
  }
};

const thenResultContainsMultipleTracks = (
  result: ReturnType<typeof searchTracks>,
  expectedCount: number,
): void => {
  expect(result.ok).toBe(true);
  if (result.ok) {
    expect(result.value).toHaveLength(expectedCount);
  }
};

const thenOriginalArrayIsUnmodified = (
  originalResults: readonly LmsSearchResult[],
): void => {
  expect(originalResults).toHaveLength(1);
  expect(originalResults[0]?.id).toBe("1");
};

describe("transformToFullResults", () => {
  it("returns empty arrays when LMS returns no results", () => {
    const lmsResults = givenNoLmsResults();

    const result = whenTransformingFullResults("test query", lmsResults);

    thenFullResultsAreEmpty(result, "test query");
  });

  it("returns EMPTY_QUERY error for empty string", () => {
    const lmsResults = givenNoLmsResults();

    const result = whenTransformingFullResults("", lmsResults);

    thenFullResultsHaveEmptyQueryError(result);
  });

  it("returns EMPTY_QUERY error for whitespace-only string", () => {
    const lmsResults = givenNoLmsResults();

    const result = whenTransformingFullResults("   ", lmsResults);

    thenFullResultsHaveEmptyQueryError(result);
  });

  it("transforms track results with duration", () => {
    const lmsResults = givenLmsResultsWithTracks([
      {
        id: "track-1",
        title: "Breathe",
        artist: "Pink Floyd",
        album: "Dark Side of the Moon",
        url: "file:///music/breathe.flac",
        source: "local",
        type: "track",
      },
    ]);

    const result = whenTransformingFullResults("Pink Floyd", lmsResults);

    // After deduplication, id = best source URL (not original LMS id)
    thenFullResultsContainTrack(result, {
      id: "file:///music/breathe.flac",
      title: "Breathe",
      artist: "Pink Floyd",
      album: "Dark Side of the Moon",
      source: "local",
    });
    thenFullResultsTrackHasAvailableSources(result, 1);
  });

  it("extracts album information from tracks", () => {
    const lmsResults = givenLmsResultsWithTracks([
      {
        id: "track-1",
        title: "Breathe",
        artist: "Pink Floyd",
        album: "Dark Side of the Moon",
        albumId: "42",
        url: "file:///music/breathe.flac",
        source: "local",
        type: "track",
      },
      {
        id: "track-2",
        title: "Time",
        artist: "Pink Floyd",
        album: "Dark Side of the Moon",
        albumId: "42",
        url: "file:///music/time.flac",
        source: "local",
        type: "track",
      },
    ]);

    const result = whenTransformingFullResults("Pink Floyd", lmsResults);

    thenFullResultsContainAlbum(result, {
      title: "Dark Side of the Moon",
      artist: "Pink Floyd",
      trackCount: 2,
    });
  });

  it("handles multiple albums correctly", () => {
    const lmsResults = givenLmsResultsWithTracks([
      {
        id: "track-1",
        title: "Breathe",
        artist: "Pink Floyd",
        album: "Dark Side of the Moon",
        albumId: "42",
        url: "file:///music/breathe.flac",
        source: "local",
        type: "track",
      },
      {
        id: "track-2",
        title: "Comfortably Numb",
        artist: "Pink Floyd",
        album: "The Wall",
        albumId: "43",
        url: "file:///music/numb.flac",
        source: "local",
        type: "track",
      },
    ]);

    const result = whenTransformingFullResults("Pink Floyd", lmsResults);

    thenFullResultsContainMultipleAlbums(result, 2);
  });

  it("uses albumartist tag for album artist when present, ignoring per-track composers", () => {
    const lmsResults = givenLmsResultsWithTracks([
      {
        id: "t1",
        title: "Opel-Gang",
        artist: "Holst/Fregee",
        albumartist: "Die Toten Hosen",
        album: "Reich & Sexy",
        albumId: "317",
        url: "file:///1.flac",
        source: "local",
        type: "track",
      },
      {
        id: "t2",
        title: "Bonnie & Clyde",
        artist: "Holst/Meurer",
        albumartist: "Die Toten Hosen",
        album: "Reich & Sexy",
        albumId: "317",
        url: "file:///2.flac",
        source: "local",
        type: "track",
      },
    ]);

    const result = whenTransformingFullResults("opel gang", lmsResults);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.albums).toHaveLength(1);
      expect(result.value.albums[0]?.artist).toBe("Die Toten Hosen");
    }
  });

  it("groups tracks with same albumId but different track artists, showing most common artist", () => {
    const lmsResults = givenLmsResultsWithTracks([
      {
        id: "t1",
        title: "Die da!",
        artist: "Die Toten Hosen",
        album: "Reich & Sexy",
        albumId: "100",
        url: "file:///1.flac",
        source: "local",
        type: "track",
      },
      {
        id: "t2",
        title: "Opel-Gang",
        artist: "Holst/Meurer",
        album: "Reich & Sexy",
        albumId: "100",
        url: "file:///2.flac",
        source: "local",
        type: "track",
      },
      {
        id: "t3",
        title: "Bonnie & Clyde",
        artist: "Die Toten Hosen",
        album: "Reich & Sexy",
        albumId: "100",
        url: "file:///3.flac",
        source: "local",
        type: "track",
      },
    ]);

    const result = whenTransformingFullResults("toten hosen", lmsResults);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.albums).toHaveLength(1);
      expect(result.value.albums[0]?.title).toBe("Reich & Sexy");
      expect(result.value.albums[0]?.artist).toBe("Die Toten Hosen");
      expect(result.value.albums[0]?.trackCount).toBe(3);
    }
  });

  it("filters out non-track results", () => {
    const lmsResults = givenMixedLmsResults();

    const result = whenTransformingFullResults("Pink Floyd", lmsResults);

    thenFullResultsOnlyContainTracks(result);
  });

  it("includes totalResults count", () => {
    const lmsResults = givenLmsResultsWithTracks([
      {
        id: "track-1",
        title: "Track 1",
        artist: "Artist",
        album: "Album",
        url: "file:///1.flac",
        source: "local",
        type: "track",
      },
    ]);

    const result = whenTransformingFullResults("test", lmsResults);

    thenFullResultsHaveTotalCount(result, 1);
  });

  // ============================================================
  // Story 7.4 Acceptance Tests (Task 0 — AC4a/b/c)
  // ============================================================

  it("AC4a: transformToFullResults returns artists array with unique artists from track results", () => {
    const lmsResults = givenLmsResultsWithTracks([
      {
        id: "t1",
        title: "Breathe",
        artist: "Pink Floyd",
        album: "Dark Side",
        url: "file:///breathe.flac",
        source: "local",
        type: "track",
        artistId: "42",
      },
      {
        id: "t2",
        title: "Ziggy Stardust",
        artist: "David Bowie",
        album: "Ziggy",
        url: "file:///ziggy.flac",
        source: "local",
        type: "track",
        artistId: "7",
      },
    ]);

    const result = whenTransformingFullResults("Floyd", lmsResults);

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.value.artists).toHaveLength(2);
    expect(result.value.artists[0]!.name).toBe("Pink Floyd");
    expect(result.value.artists[1]!.name).toBe("David Bowie");
  });

  it("AC4b: transformToFullResults deduplicates artists by name (case-insensitive)", () => {
    const lmsResults = givenLmsResultsWithTracks([
      {
        id: "t1",
        title: "Breathe",
        artist: "Pink Floyd",
        album: "Dark Side",
        url: "file:///breathe.flac",
        source: "local",
        type: "track",
      },
      {
        id: "t2",
        title: "Time",
        artist: "pink floyd",
        album: "Dark Side",
        url: "file:///time.flac",
        source: "local",
        type: "track",
      },
    ]);

    const result = whenTransformingFullResults("floyd", lmsResults);

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.value.artists).toHaveLength(1);
  });

  // ============================================================
  // Story 8.3 Acceptance Tests (Task 0 — RED phase)
  // ============================================================

  it("AC1 (Story 8.3): streaming track with no albumId → included in albums with albumId undefined, lowercase compound id, source set", () => {
    const lmsResults = givenLmsResultsWithTracks([
      {
        id: "track-tidal",
        title: "Opel-Gang",
        artist: "Die Toten Hosen",
        album: "Opel-Gang",
        // no albumId — streaming track
        url: "tidal://123.flc",
        source: "tidal",
        type: "track",
      },
    ]);

    const result = whenTransformingFullResults("opel gang", lmsResults);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.albums).toHaveLength(1);
      expect(result.value.albums[0]?.albumId).toBeUndefined();
      expect(result.value.albums[0]?.id).toBe("die toten hosen::opel-gang"); // M3: compound key is lowercase
      expect(result.value.albums[0]?.source).toBe("tidal"); // L1: source tracked for badge display
      expect(result.value.albums[0]?.title).toBe("Opel-Gang");
      expect(result.value.albums[0]?.artist).toBe("Die Toten Hosen");
    }
  });

  it("AC5 (Story 8.3): local albums unaffected — appear with albumId defined and source set", () => {
    const lmsResults = givenLmsResultsWithTracks([
      {
        id: "track-local",
        title: "Local Track",
        artist: "Artist A",
        album: "Local Album",
        albumId: "99",
        url: "file:///local.flac",
        source: "local",
        type: "track",
      },
    ]);

    const result = whenTransformingFullResults("test", lmsResults);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.albums).toHaveLength(1);
      expect(result.value.albums[0]?.albumId).toBe("99");
      expect(result.value.albums[0]?.id).toBe("99");
      expect(result.value.albums[0]?.source).toBe("local"); // L1: source tracked
    }
  });

  it("AC1+AC5 (Story 8.3): streaming and local albums both included — correct ids, albumIds, and sources", () => {
    const lmsResults = givenLmsResultsWithTracks([
      {
        id: "track-local",
        title: "Local Track",
        artist: "Artist A",
        album: "Local Album",
        albumId: "99",
        url: "file:///local.flac",
        source: "local",
        type: "track",
      },
      {
        id: "track-tidal",
        title: "Tidal Track",
        artist: "Artist B",
        album: "Tidal Album",
        // no albumId — streaming track
        url: "tidal://123.flc",
        source: "tidal",
        type: "track",
      },
    ]);

    const result = whenTransformingFullResults("test", lmsResults);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.albums).toHaveLength(2);
      const localAlbum = result.value.albums.find(
        (a) => a.title === "Local Album",
      );
      const tidalAlbum = result.value.albums.find(
        (a) => a.title === "Tidal Album",
      );
      expect(localAlbum?.id).toBe("99");
      expect(localAlbum?.albumId).toBe("99");
      expect(localAlbum?.source).toBe("local");
      expect(tidalAlbum?.id).toBe("artist b::tidal album"); // compound lowercase key
      expect(tidalAlbum?.albumId).toBeUndefined();
      expect(tidalAlbum?.source).toBe("tidal");
    }
  });

  it("AC4c: transformToFullResults includes artistId in artist results when available", () => {
    const lmsResults = givenLmsResultsWithTracks([
      {
        id: "t1",
        title: "Breathe",
        artist: "Pink Floyd",
        album: "Dark Side",
        url: "file:///breathe.flac",
        source: "local",
        type: "track",
        artistId: "42",
      },
    ]);

    const result = whenTransformingFullResults("Floyd", lmsResults);

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.value.artists).toHaveLength(1);
    expect(result.value.artists[0]!.artistId).toBe("42");
  });

  // ============================================================
  // getNavigationArtist / extractUniqueArtists — albumartist preference
  // ============================================================

  it("uses albumartist for artist navigation — collaboration track shows main artist", () => {
    const lmsResults = givenLmsResultsWithTracks([
      {
        id: "t1",
        title: "Everything Has Changed",
        artist: "Taylor Swift, Ed Sheeran",
        albumartist: "Taylor Swift",
        album: "Red",
        url: "file:///everything.flac",
        source: "local" as const,
        type: "track" as const,
      },
    ]);

    const result = whenTransformingFullResults("Taylor Swift", lmsResults);

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.value.artists).toHaveLength(1);
    expect(result.value.artists[0]!.name).toBe("Taylor Swift");
  });

  it("falls back to track artist when albumartist is 'Various Artists'", () => {
    const lmsResults = givenLmsResultsWithTracks([
      {
        id: "t1",
        title: "Creep",
        artist: "Radiohead",
        albumartist: "Various Artists",
        album: "90s Hits",
        url: "file:///creep.flac",
        source: "local" as const,
        type: "track" as const,
      },
    ]);

    const result = whenTransformingFullResults("Radiohead", lmsResults);

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.value.artists).toHaveLength(1);
    expect(result.value.artists[0]!.name).toBe("Radiohead");
  });

  it("deduplicates by albumartist — solo and collaboration tracks merge into one artist entry", () => {
    const lmsResults = givenLmsResultsWithTracks([
      {
        id: "t1",
        title: "Shake It Off",
        artist: "Taylor Swift",
        albumartist: "Taylor Swift",
        album: "1989",
        url: "file:///shake.flac",
        source: "local" as const,
        type: "track" as const,
      },
      {
        id: "t2",
        title: "Everything Has Changed",
        artist: "Taylor Swift, Ed Sheeran",
        albumartist: "Taylor Swift",
        album: "Red",
        url: "file:///everything.flac",
        source: "local" as const,
        type: "track" as const,
      },
    ]);

    const result = whenTransformingFullResults("Taylor Swift", lmsResults);

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    // Both tracks have albumartist "Taylor Swift" → only one artist entry
    expect(result.value.artists).toHaveLength(1);
    expect(result.value.artists[0]!.name).toBe("Taylor Swift");
  });

  // Story 9.5 — AC4: AlbumResult.trackUrls
  it("AC4 (Story 9.5): streaming album has trackUrls populated from track URLs", () => {
    const lmsResults = givenLmsResultsWithTracks([
      {
        id: "t1",
        title: "Come Together",
        artist: "The Beatles",
        album: "Abbey Road",
        url: "tidal://111.flc",
        source: "tidal" as const,
        type: "track" as const,
      },
      {
        id: "t2",
        title: "Something",
        artist: "The Beatles",
        album: "Abbey Road",
        url: "tidal://222.flc",
        source: "tidal" as const,
        type: "track" as const,
      },
    ]);

    const result = whenTransformingFullResults("Beatles", lmsResults);

    expect(result.ok).toBe(true);
    if (result.ok) {
      const album = result.value.albums.find((a) => a.title === "Abbey Road");
      expect(album?.albumId).toBeUndefined();
      expect(album?.trackUrls).toEqual(["tidal://111.flc", "tidal://222.flc"]);
    }
  });

  it("AC4 (Story 9.5): local album has trackUrls undefined", () => {
    const lmsResults = givenLmsResultsWithTracks([
      {
        id: "t1",
        title: "Breathe",
        artist: "Pink Floyd",
        album: "Dark Side of the Moon",
        albumId: "42",
        url: "file:///breathe.flac",
        source: "local" as const,
        type: "track" as const,
      },
    ]);

    const result = whenTransformingFullResults("Pink Floyd", lmsResults);

    expect(result.ok).toBe(true);
    if (result.ok) {
      const album = result.value.albums.find(
        (a) => a.title === "Dark Side of the Moon",
      );
      expect(album?.albumId).toBe("42");
      expect(album?.trackUrls).toBeUndefined();
    }
  });

  // Story 9.8: coverArtUrl propagation
  it("AC1 (Story 9.8): local album result includes coverArtUrl from first track with coverArtUrl", () => {
    const lmsResults = givenLmsResultsWithTracks([
      {
        id: "t1",
        title: "Breathe",
        artist: "Pink Floyd",
        album: "Dark Side of the Moon",
        albumId: "42",
        url: "file:///music/breathe.flac",
        source: "local" as const,
        type: "track" as const,
        coverArtUrl: "http://localhost:9000/music/aabbcc/cover.jpg",
      },
      {
        id: "t2",
        title: "Time",
        artist: "Pink Floyd",
        album: "Dark Side of the Moon",
        albumId: "42",
        url: "file:///music/time.flac",
        source: "local" as const,
        type: "track" as const,
        // second track has no coverArtUrl — first wins
      },
    ]);

    const result = whenTransformingFullResults("Pink Floyd", lmsResults);

    expect(result.ok).toBe(true);
    if (result.ok) {
      const album = result.value.albums.find(
        (a) => a.title === "Dark Side of the Moon",
      );
      expect(album?.coverArtUrl).toBe(
        "http://localhost:9000/music/aabbcc/cover.jpg",
      );
    }
  });

  it("AC1 (Story 9.8): local album without coverArtUrl has coverArtUrl undefined", () => {
    const lmsResults = givenLmsResultsWithTracks([
      {
        id: "t1",
        title: "Breathe",
        artist: "Pink Floyd",
        album: "Dark Side of the Moon",
        albumId: "42",
        url: "file:///music/breathe.flac",
        source: "local" as const,
        type: "track" as const,
        // no coverArtUrl
      },
    ]);

    const result = whenTransformingFullResults("Pink Floyd", lmsResults);

    expect(result.ok).toBe(true);
    if (result.ok) {
      const album = result.value.albums.find(
        (a) => a.title === "Dark Side of the Moon",
      );
      expect(album?.coverArtUrl).toBeUndefined();
    }
  });

  it("AC1 (Story 9.8): album coverArtUrl uses any track with a URL when best-source track has none", () => {
    // Edge case: deduplication group where best-source track (Tidal, group[0]) has no coverArtUrl
    // but a secondary track (local) does. The find() in deduplicateTracks must search all tracks.
    const lmsResults = givenLmsResultsWithTracks([
      {
        id: "t-tidal",
        title: "Money",
        artist: "Pink Floyd",
        album: "Dark Side of the Moon",
        albumId: "42",
        url: "tidal://123.flc",
        source: "tidal" as const,
        type: "track" as const,
        // best-source (Tidal) has no coverArtUrl
      },
      {
        id: "t-local",
        title: "Money",
        artist: "Pink Floyd",
        album: "Dark Side of the Moon",
        albumId: "42",
        url: "file:///music/money.flac",
        source: "local" as const,
        type: "track" as const,
        coverArtUrl: "http://localhost:9000/music/aabbcc/cover.jpg",
      },
    ]);

    const result = whenTransformingFullResults("Pink Floyd", lmsResults);

    expect(result.ok).toBe(true);
    if (result.ok) {
      const album = result.value.albums.find(
        (a) => a.title === "Dark Side of the Moon",
      );
      expect(album?.coverArtUrl).toBe(
        "http://localhost:9000/music/aabbcc/cover.jpg",
      );
    }
  });

  // Story 9.12: trackTitles propagation
  it("AC1 (Story 9.12): streaming album has trackTitles populated from track titles", () => {
    const lmsResults = givenLmsResultsWithTracks([
      {
        id: "t1",
        title: "Come Together",
        artist: "The Beatles",
        album: "Abbey Road",
        url: "tidal://111.flc",
        source: "tidal" as const,
        type: "track" as const,
      },
      {
        id: "t2",
        title: "Something",
        artist: "The Beatles",
        album: "Abbey Road",
        url: "tidal://222.flc",
        source: "tidal" as const,
        type: "track" as const,
      },
    ]);

    const result = whenTransformingFullResults("Beatles", lmsResults);

    expect(result.ok).toBe(true);
    if (result.ok) {
      const album = result.value.albums.find((a) => a.title === "Abbey Road");
      expect(album?.trackTitles).toEqual(["Come Together", "Something"]);
    }
  });

  it("AC1 (Story 9.12): local album has trackTitles undefined", () => {
    const lmsResults = givenLmsResultsWithTracks([
      {
        id: "t1",
        title: "Breathe",
        artist: "Pink Floyd",
        album: "Dark Side of the Moon",
        albumId: "42",
        url: "file:///breathe.flac",
        source: "local" as const,
        type: "track" as const,
      },
    ]);

    const result = whenTransformingFullResults("Pink Floyd", lmsResults);

    expect(result.ok).toBe(true);
    if (result.ok) {
      const album = result.value.albums.find(
        (a) => a.title === "Dark Side of the Moon",
      );
      expect(album?.trackTitles).toBeUndefined();
    }
  });

  it("AC4 (Story 9.5): streaming album with empty track URLs has trackUrls undefined", () => {
    const lmsResults = givenLmsResultsWithTracks([
      {
        id: "t1",
        title: "Unknown Track",
        artist: "Unknown Artist",
        album: "Unknown Album",
        url: "",
        source: "tidal" as const,
        type: "track" as const,
      },
    ]);

    const result = whenTransformingFullResults("Unknown", lmsResults);

    expect(result.ok).toBe(true);
    if (result.ok) {
      const album = result.value.albums.find(
        (a) => a.title === "Unknown Album",
      );
      expect(album?.albumId).toBeUndefined();
      expect(album?.trackUrls).toBeUndefined();
    }
  });
});

// Additional GIVEN helpers for transformToFullResults tests
const givenLmsResultsWithTracks = (
  tracks: readonly LmsSearchResult[],
): readonly LmsSearchResult[] => {
  return tracks;
};

const givenMixedLmsResults = (): readonly LmsSearchResult[] => {
  return [
    {
      id: "track-1",
      title: "Breathe",
      artist: "Pink Floyd",
      album: "Dark Side of the Moon",
      url: "file:///breathe.flac",
      source: "local",
      type: "track",
    },
    {
      id: "artist-1",
      title: "Pink Floyd",
      artist: "Pink Floyd",
      album: "",
      url: "artist://pink-floyd",
      source: "local",
      type: "artist",
    },
    {
      id: "album-1",
      title: "Dark Side of the Moon",
      artist: "Pink Floyd",
      album: "Dark Side of the Moon",
      url: "album://dark-side",
      source: "local",
      type: "album",
    },
  ];
};

// WHEN helper for transformToFullResults
const whenTransformingFullResults = (
  query: string,
  lmsResults: readonly LmsSearchResult[],
): ReturnType<typeof transformToFullResults> => {
  return transformToFullResults(query, lmsResults);
};

// THEN helpers for transformToFullResults
const thenFullResultsAreEmpty = (
  result: ReturnType<typeof transformToFullResults>,
  expectedQuery: string,
): void => {
  expect(result.ok).toBe(true);
  if (result.ok) {
    expect(result.value.tracks).toEqual([]);
    expect(result.value.albums).toEqual([]);
    expect(result.value.artists).toEqual([]);
    expect(result.value.query).toBe(expectedQuery);
    expect(result.value.totalResults).toBe(0);
  }
};

const thenFullResultsHaveEmptyQueryError = (
  result: ReturnType<typeof transformToFullResults>,
): void => {
  expect(result.ok).toBe(false);
  if (!result.ok) {
    expect(result.error.code).toBe("EMPTY_QUERY");
    expect(result.error.message).toContain("cannot be empty");
  }
};

const thenFullResultsContainTrack = (
  result: ReturnType<typeof transformToFullResults>,
  expectedTrack: Partial<SearchResultsResponse["tracks"][number]>,
): void => {
  expect(result.ok).toBe(true);
  if (result.ok) {
    expect(result.value.tracks.length).toBeGreaterThan(0);
    expect(result.value.tracks[0]).toMatchObject(expectedTrack);
    // Duration is optional - LMS search API doesn't provide it
    const duration = result.value.tracks[0]?.duration;
    expect(
      duration === undefined || (typeof duration === "number" && duration >= 0),
    ).toBe(true);
  }
};

const thenFullResultsContainAlbum = (
  result: ReturnType<typeof transformToFullResults>,
  expectedAlbum: Partial<SearchResultsResponse["albums"][number]>,
): void => {
  expect(result.ok).toBe(true);
  if (result.ok) {
    expect(result.value.albums.length).toBeGreaterThan(0);
    const album = result.value.albums.find(
      (a) => a.title === expectedAlbum.title,
    );
    expect(album).toBeDefined();
    expect(album).toMatchObject(expectedAlbum);
  }
};

const thenFullResultsContainMultipleAlbums = (
  result: ReturnType<typeof transformToFullResults>,
  expectedCount: number,
): void => {
  expect(result.ok).toBe(true);
  if (result.ok) {
    expect(result.value.albums).toHaveLength(expectedCount);
  }
};

const thenFullResultsOnlyContainTracks = (
  result: ReturnType<typeof transformToFullResults>,
): void => {
  expect(result.ok).toBe(true);
  if (result.ok) {
    expect(result.value.tracks).toHaveLength(1);
    // After deduplication, track id is the best source URL (not the original LMS id)
    expect(result.value.tracks[0]).toHaveProperty("id");
    expect(result.value.tracks[0]).toHaveProperty("availableSources");
  }
};

const thenFullResultsHaveTotalCount = (
  result: ReturnType<typeof transformToFullResults>,
  expectedCount: number,
): void => {
  expect(result.ok).toBe(true);
  if (result.ok) {
    expect(result.value.totalResults).toBe(expectedCount);
  }
};

const thenFullResultsTrackHasAvailableSources = (
  result: ReturnType<typeof transformToFullResults>,
  expectedSourceCount: number,
): void => {
  expect(result.ok).toBe(true);
  if (result.ok) {
    expect(result.value.tracks[0]?.availableSources).toHaveLength(
      expectedSourceCount,
    );
  }
};

// ============================================================================
// Task 6: Unit tests for normalizeDeduplicationKey
// ============================================================================

describe("normalizeDeduplicationKey", () => {
  it("lowercases all fields", () => {
    const key = normalizeDeduplicationKey(
      "Pink Floyd",
      "Dark Side of the Moon",
      "Money",
      "local://track",
    );
    expect(key).toBe("pink floyd::dark side of the moon::money");
  });

  it("trims whitespace from all fields", () => {
    const key = normalizeDeduplicationKey(
      "  Pink Floyd  ",
      "  Dark Side  ",
      "  Money  ",
      "local://track",
    );
    expect(key).toBe("pink floyd::dark side::money");
  });

  it("produces same key for matching tracks regardless of case", () => {
    const key1 = normalizeDeduplicationKey(
      "Pink Floyd",
      "Dark Side of the Moon",
      "Money",
      "local://track",
    );
    const key2 = normalizeDeduplicationKey(
      "pink floyd",
      "DARK SIDE OF THE MOON",
      "MONEY",
      "qobuz://track",
    );
    expect(key1).toBe(key2);
  });

  it("produces same key when trailing spaces differ", () => {
    const key1 = normalizeDeduplicationKey(
      "Pink Floyd",
      "Album",
      "Money ",
      "local://track",
    );
    const key2 = normalizeDeduplicationKey(
      "Pink Floyd",
      "Album",
      "Money",
      "qobuz://track",
    );
    expect(key1).toBe(key2);
  });

  it("produces different key for different artist", () => {
    const key1 = normalizeDeduplicationKey(
      "Pink Floyd",
      "Album",
      "Money",
      "local://track",
    );
    const key2 = normalizeDeduplicationKey(
      "Led Zeppelin",
      "Album",
      "Money",
      "local://track",
    );
    expect(key1).not.toBe(key2);
  });

  it("produces different key for different album", () => {
    const key1 = normalizeDeduplicationKey(
      "Artist",
      "Album A",
      "Title",
      "local://track",
    );
    const key2 = normalizeDeduplicationKey(
      "Artist",
      "Album B",
      "Title",
      "local://track",
    );
    expect(key1).not.toBe(key2);
  });

  it("produces different key for different title", () => {
    const key1 = normalizeDeduplicationKey(
      "Artist",
      "Album",
      "Money",
      "local://track",
    );
    const key2 = normalizeDeduplicationKey(
      "Artist",
      "Album",
      "Time",
      "local://track",
    );
    expect(key1).not.toBe(key2);
  });

  it("uses '::' as delimiter between fields", () => {
    const key = normalizeDeduplicationKey("a", "b", "c", "local://track");
    expect(key).toBe("a::b::c");
  });

  it("falls back to URL when both artist AND album are empty — prevents false dedup of unrelated tracks", () => {
    const key1 = normalizeDeduplicationKey("", "", "Intro", "local://track/1");
    const key2 = normalizeDeduplicationKey("", "", "Intro", "qobuz://track/2");
    // Different URLs → different keys → no false deduplication
    expect(key1).not.toBe(key2);
    expect(key1).toBe("local://track/1");
    expect(key2).toBe("qobuz://track/2");
  });

  it("uses artist+album+title key when only album is empty (artist present)", () => {
    const key = normalizeDeduplicationKey(
      "Pink Floyd",
      "",
      "Money",
      "local://track",
    );
    expect(key).toBe("pink floyd::::money");
  });

  it("uses artist+album+title key when only artist is empty (album present)", () => {
    const key = normalizeDeduplicationKey(
      "",
      "Dark Side",
      "Money",
      "local://track",
    );
    expect(key).toBe("::dark side::money");
  });
});

// ============================================================================
// Task 7: Unit tests for selectSourceByPriority
// ============================================================================

describe("selectSourceByPriority", () => {
  const makeSource = (
    source: AvailableSource["source"],
    url?: string,
  ): AvailableSource => ({
    source,
    url: url ?? `${source}://track`,
  });

  it("returns undefined for empty sources array", () => {
    expect(selectSourceByPriority([])).toBeUndefined();
  });

  it("prefers local over qobuz and tidal", () => {
    const sources: readonly AvailableSource[] = [
      makeSource("tidal"),
      makeSource("qobuz"),
      makeSource("local"),
    ];
    const best = selectSourceByPriority(sources);
    expect(best?.source).toBe("local");
  });

  it("prefers qobuz over tidal when local absent", () => {
    const sources: readonly AvailableSource[] = [
      makeSource("tidal"),
      makeSource("qobuz"),
    ];
    const best = selectSourceByPriority(sources);
    expect(best?.source).toBe("qobuz");
  });

  it("returns tidal when it is the only source", () => {
    const sources: readonly AvailableSource[] = [makeSource("tidal")];
    const best = selectSourceByPriority(sources);
    expect(best?.source).toBe("tidal");
  });

  it("returns local when it is the only source", () => {
    const sources: readonly AvailableSource[] = [makeSource("local")];
    const best = selectSourceByPriority(sources);
    expect(best?.source).toBe("local");
  });

  it("treats unknown source as lowest priority (after tidal)", () => {
    const sources: readonly AvailableSource[] = [
      makeSource("unknown"),
      makeSource("tidal"),
    ];
    const best = selectSourceByPriority(sources);
    expect(best?.source).toBe("tidal");
  });

  it("returns the source with its correct url", () => {
    const sources: readonly AvailableSource[] = [
      { source: "local", url: "file:///music/money.flac" },
      { source: "qobuz", url: "qobuz://track/123" },
    ];
    const best = selectSourceByPriority(sources);
    expect(best?.url).toBe("file:///music/money.flac");
  });

  it("selects deterministically when multiple unknown sources present (alphabetical url)", () => {
    const sources: readonly AvailableSource[] = [
      { source: "unknown", url: "unknown://z-track" },
      { source: "unknown", url: "unknown://a-track" },
    ];
    const best1 = selectSourceByPriority(sources);
    const best2 = selectSourceByPriority([...sources].reverse());
    // Both orderings must yield the same result (alphabetically first url)
    expect(best1?.url).toBe("unknown://a-track");
    expect(best2?.url).toBe("unknown://a-track");
  });
});

// ============================================================================
// Task 8: Unit tests for deduplicateTracks
// ============================================================================

describe("deduplicateTracks", () => {
  const makeTrack = (
    source: "local" | "qobuz" | "tidal" | "unknown",
    title: string,
    artist = "Pink Floyd",
    album = "Dark Side of the Moon",
    audioQuality?: AudioQuality,
  ): LmsSearchResult => ({
    id: `${source}-${title}`,
    title,
    artist,
    album,
    url: `${source}://tracks/${title.toLowerCase().replace(/ /g, "-")}`,
    source,
    type: "track" as const,
    audioQuality,
  });

  it("returns empty array for empty input", () => {
    expect(deduplicateTracks([])).toEqual([]);
  });

  it("returns single track for single source", () => {
    const tracks = [makeTrack("tidal", "Money")];
    const result = deduplicateTracks(tracks);
    expect(result).toHaveLength(1);
    expect(result[0]?.source).toBe("tidal");
    expect(result[0]?.availableSources).toHaveLength(1);
  });

  it("deduplicates track from local, qobuz, tidal into 1 result", () => {
    const tracks = [
      makeTrack("local", "Money"),
      makeTrack("qobuz", "Money"),
      makeTrack("tidal", "Money"),
    ];
    const result = deduplicateTracks(tracks);
    expect(result).toHaveLength(1);
    expect(result[0]?.availableSources).toHaveLength(3);
  });

  it("selects local as best source when all 3 sources present", () => {
    const tracks = [
      makeTrack("tidal", "Money"),
      makeTrack("qobuz", "Money"),
      makeTrack("local", "Money"),
    ];
    const result = deduplicateTracks(tracks);
    expect(result[0]?.source).toBe("local");
  });

  it("selects qobuz when local is absent", () => {
    const tracks = [makeTrack("tidal", "Money"), makeTrack("qobuz", "Money")];
    const result = deduplicateTracks(tracks);
    expect(result[0]?.source).toBe("qobuz");
  });

  it("selects tidal when it is the only source", () => {
    const tracks = [makeTrack("tidal", "Money")];
    const result = deduplicateTracks(tracks);
    expect(result[0]?.source).toBe("tidal");
  });

  it("keeps 2 separate tracks when titles differ", () => {
    const tracks = [makeTrack("local", "Money"), makeTrack("local", "Time")];
    const result = deduplicateTracks(tracks);
    expect(result).toHaveLength(2);
  });

  it("deduplicates when artist/title casing differs", () => {
    const track1: LmsSearchResult = {
      id: "local-1",
      title: "MONEY",
      artist: "PINK FLOYD",
      album: "Dark Side of the Moon",
      url: "local://tracks/money",
      source: "local",
      type: "track",
    };
    const track2: LmsSearchResult = {
      id: "qobuz-1",
      title: "Money",
      artist: "Pink Floyd",
      album: "dark side of the moon",
      url: "qobuz://tracks/money",
      source: "qobuz",
      type: "track",
    };
    const result = deduplicateTracks([track1, track2]);
    expect(result).toHaveLength(1);
    expect(result[0]?.availableSources).toHaveLength(2);
  });

  it("deduplicates when titles have trailing spaces", () => {
    const track1: LmsSearchResult = {
      id: "local-1",
      title: "Money ",
      artist: "Pink Floyd",
      album: "Dark Side",
      url: "local://tracks/money",
      source: "local",
      type: "track",
    };
    const track2: LmsSearchResult = {
      id: "qobuz-1",
      title: "Money",
      artist: "Pink Floyd",
      album: "Dark Side",
      url: "qobuz://tracks/money",
      source: "qobuz",
      type: "track",
    };
    const result = deduplicateTracks([track1, track2]);
    expect(result).toHaveLength(1);
  });

  it("AC2 (Story 7.9): deduplicates Tidal track with local after tidal_info enrichment populates artist/album", () => {
    // Simulates the fresh-track enrichment path: tidal_info populates artist/album on a Tidal
    // track that was never played. After enrichment both local and Tidal share the same
    // normalizeDeduplicationKey → merged into 1 result, local preferred (source priority).
    const localTrack: LmsSearchResult = {
      id: "local-creep",
      title: "Creep",
      artist: "Radiohead",
      album: "Pablo Honey",
      url: "file:///music/creep.flac",
      source: "local",
      type: "track",
    };
    const tidalTrackEnriched: LmsSearchResult = {
      id: "tidal-creep",
      title: "Creep",
      artist: "Radiohead", // populated by tidal_info enrichment (Story 7.9)
      album: "Pablo Honey", // populated by tidal_info enrichment
      url: "tidal://58990486.flc",
      source: "tidal",
      type: "track",
    };
    const result = deduplicateTracks([localTrack, tidalTrackEnriched]);
    expect(result).toHaveLength(1);
    expect(result[0]?.source).toBe("local");
    expect(result[0]?.availableSources).toHaveLength(2);
    const sources = result[0]?.availableSources.map((s) => s.source);
    expect(sources).toContain("local");
    expect(sources).toContain("tidal");
  });

  it("deduplicates same source — multiple Tidal quality tiers show as one Tidal entry", () => {
    // Tidal returns FLAC + AAC versions of same track → after enrichment both get same
    // artist/album/title → same dedup key → availableSources must show only one Tidal entry.
    const flac: AudioQuality = {
      format: "FLAC",
      lossless: true,
      bitrate: 1411000,
      sampleRate: 44100,
    };
    const aac: AudioQuality = {
      format: "AAC",
      lossless: false,
      bitrate: 320000,
      sampleRate: 44100,
    };
    const tracks: readonly LmsSearchResult[] = [
      makeTrack("tidal", "Money", "Pink Floyd", "Dark Side of the Moon", flac),
      {
        ...makeTrack(
          "tidal",
          "Money",
          "Pink Floyd",
          "Dark Side of the Moon",
          aac,
        ),
        id: "tidal-aac",
        url: "tidal://tracks/money-aac",
      },
    ];
    const result = deduplicateTracks(tracks);
    expect(result).toHaveLength(1);
    expect(result[0]?.availableSources).toHaveLength(1);
    expect(result[0]?.availableSources[0]?.source).toBe("tidal");
  });

  it("deduplicates same source — keeps best quality when multiple same-source entries exist", () => {
    const flac: AudioQuality = {
      format: "FLAC",
      lossless: true,
      bitrate: 1411000,
      sampleRate: 44100,
    };
    const aac: AudioQuality = {
      format: "AAC",
      lossless: false,
      bitrate: 320000,
      sampleRate: 44100,
    };
    const local = makeTrack(
      "local",
      "Money",
      "Pink Floyd",
      "Dark Side of the Moon",
      flac,
    );
    const tidalFlac = makeTrack(
      "tidal",
      "Money",
      "Pink Floyd",
      "Dark Side of the Moon",
      flac,
    );
    const tidalAac = {
      ...makeTrack(
        "tidal",
        "Money",
        "Pink Floyd",
        "Dark Side of the Moon",
        aac,
      ),
      id: "tidal-aac",
      url: "tidal://tracks/money-aac",
    };
    const result = deduplicateTracks([local, tidalFlac, tidalAac]);
    expect(result).toHaveLength(1);
    expect(result[0]?.availableSources).toHaveLength(2); // local + tidal (not tidal + tidal)
    const sources = result[0]?.availableSources.map((s) => s.source);
    expect(sources).toContain("local");
    expect(sources).toContain("tidal");
  });

  it("filters out non-track results (artists/albums)", () => {
    const mixed: readonly LmsSearchResult[] = [
      makeTrack("local", "Money"),
      {
        id: "artist-1",
        title: "Pink Floyd",
        artist: "Pink Floyd",
        album: "",
        url: "artist://pink-floyd",
        source: "local",
        type: "artist",
      },
      {
        id: "album-1",
        title: "Dark Side",
        artist: "Pink Floyd",
        album: "Dark Side",
        url: "album://dark-side",
        source: "local",
        type: "album",
      },
    ];
    const result = deduplicateTracks(mixed);
    expect(result).toHaveLength(1);
    expect(result[0]?.title).toBe("Money");
  });

  it("best source url is used as track id", () => {
    const tracks = [makeTrack("local", "Money"), makeTrack("qobuz", "Money")];
    const result = deduplicateTracks(tracks);
    expect(result[0]?.id).toBe(result[0]?.url);
    expect(result[0]?.source).toBe("local");
  });

  it("deduplicates 100 tracks (10 titles × 10 artists) in < 10ms (NFR1)", () => {
    const manyTracks = Array.from({ length: 100 }, (_, i) => ({
      id: `id-${i}`,
      title: `Track ${i % 10}`,
      artist: `Artist ${i % 10}`,
      album: "Album",
      url: `local://track-${i}`,
      source: "local" as const,
      type: "track" as const,
    }));

    const start = performance.now();
    const result = deduplicateTracks(manyTracks);
    const duration = performance.now() - start;

    expect(duration).toBeLessThan(10);
    expect(result).toHaveLength(10); // 10 unique title+artist combinations
  });

  it("includes audioQuality from best source when all sources have quality (AC4)", () => {
    const flac: AudioQuality = {
      format: "FLAC",
      bitrate: 1411000,
      sampleRate: 44100,
      lossless: true,
    };
    const mp3: AudioQuality = {
      format: "MP3",
      bitrate: 192000,
      sampleRate: 44100,
      lossless: false,
    };
    const tracks = [
      makeTrack("local", "Money", "Pink Floyd", "Dark Side", mp3),
      makeTrack("qobuz", "Money", "Pink Floyd", "Dark Side", flac),
    ];
    const result = deduplicateTracks(tracks);
    expect(result).toHaveLength(1);
    // Quality-based: FLAC (qobuz) wins over MP3 (local)
    expect(result[0]?.source).toBe("qobuz");
    expect(result[0]?.audioQuality?.format).toBe("FLAC");
  });

  it("falls back to source priority and clears audioQuality when not all sources have quality (AC9)", () => {
    const flac: AudioQuality = {
      format: "FLAC",
      bitrate: 1411000,
      sampleRate: 44100,
      lossless: true,
    };
    const mp3: AudioQuality = {
      format: "MP3",
      bitrate: 320000,
      sampleRate: 44100,
      lossless: false,
    };
    const tracks = [
      makeTrack("local", "Money", "Pink Floyd", "Dark Side", flac),
      makeTrack("qobuz", "Money", "Pink Floyd", "Dark Side", undefined), // no quality
      makeTrack("tidal", "Money", "Pink Floyd", "Dark Side", mp3),
    ];
    const result = deduplicateTracks(tracks);
    expect(result).toHaveLength(1);
    // Priority-fallback: local wins (highest priority)
    expect(result[0]?.source).toBe("local");
    // Quality not propagated when priority-fallback was used
    expect(result[0]?.audioQuality).toBeUndefined();
  });

  it("sets audioQuality to undefined when all sources have no quality (AC5)", () => {
    const tracks = [
      makeTrack("local", "Money", "Pink Floyd", "Dark Side", undefined),
      makeTrack("qobuz", "Money", "Pink Floyd", "Dark Side", undefined),
    ];
    const result = deduplicateTracks(tracks);
    expect(result[0]?.source).toBe("local");
    expect(result[0]?.audioQuality).toBeUndefined();
  });
});

// ============================================================================
// selectBestAvailableSource — Unit tests for quality-based source selection
// ============================================================================

describe("selectBestAvailableSource", () => {
  const flac: AudioQuality = {
    format: "FLAC",
    bitrate: 1411000,
    sampleRate: 44100,
    lossless: true,
  };
  const mp3: AudioQuality = {
    format: "MP3",
    bitrate: 192000,
    sampleRate: 44100,
    lossless: false,
  };

  const makeSource = (
    source: AvailableSource["source"],
    url?: string,
    audioQuality?: AudioQuality,
  ): AvailableSource => ({
    source,
    url: url ?? `${source}://track`,
    audioQuality,
  });

  it("returns undefined for empty sources array", () => {
    expect(selectBestAvailableSource([])).toBeUndefined();
  });

  it("uses quality-based selection when ALL sources have quality (AC4)", () => {
    const sources: readonly AvailableSource[] = [
      makeSource("local", "local://track", mp3),
      makeSource("qobuz", "qobuz://track", flac),
    ];
    const best = selectBestAvailableSource(sources);
    // FLAC (qobuz) wins over MP3 (local) via quality score
    expect(best?.source).toBe("qobuz");
    expect(best?.audioQuality?.format).toBe("FLAC");
  });

  it("uses source priority as tie-breaker for equal quality (AC8)", () => {
    const sources: readonly AvailableSource[] = [
      makeSource("qobuz", "qobuz://track", flac),
      makeSource("local", "local://track", flac),
    ];
    const best = selectBestAvailableSource(sources);
    // Equal quality → local wins (priority: local > qobuz)
    expect(best?.source).toBe("local");
    expect(best?.audioQuality?.format).toBe("FLAC");
  });

  it("falls back to priority and clears audioQuality when not all sources have quality (AC9)", () => {
    const sources: readonly AvailableSource[] = [
      makeSource("local", "local://track", flac),
      makeSource("qobuz", "qobuz://track", undefined), // no quality
    ];
    const best = selectBestAvailableSource(sources);
    // Priority-fallback: local wins, but audioQuality cleared
    expect(best?.source).toBe("local");
    expect(best?.audioQuality).toBeUndefined();
  });

  it("falls back to priority when no sources have quality (AC5)", () => {
    const sources: readonly AvailableSource[] = [
      makeSource("tidal"),
      makeSource("local"),
    ];
    const best = selectBestAvailableSource(sources);
    expect(best?.source).toBe("local");
    expect(best?.audioQuality).toBeUndefined();
  });

  it("excludes 'unknown' sources from quality comparison — quality still works for known sources", () => {
    // local (FLAC) + unknown (MP3): quality selection runs for local only
    const sources: readonly AvailableSource[] = [
      makeSource("local", "local://track", mp3),
      makeSource("unknown", "unknown://track", flac),
    ];
    const best = selectBestAvailableSource(sources);
    // local is the only non-unknown source → selected via quality path
    expect(best?.source).toBe("local");
    expect(best?.audioQuality?.format).toBe("MP3"); // local's quality retained
  });

  it("falls back to priority when ALL sources are 'unknown'", () => {
    const sources: readonly AvailableSource[] = [
      makeSource("unknown", "unknown://track", flac),
    ];
    const best = selectBestAvailableSource(sources);
    expect(best?.source).toBe("unknown");
    // audioQuality cleared: no non-unknown sources → priority fallback
    expect(best?.audioQuality).toBeUndefined();
  });

  it("returns undefined when sources array is empty", () => {
    expect(selectBestAvailableSource([])).toBeUndefined();
  });
});

// ============================================================================
// Story 7.8: deduplicateTracks — Tidal enrichment integration (AC2, AC3, AC6)
// ============================================================================

describe("deduplicateTracks — Story 7.8 Tidal enrichment (AC2, AC3, AC6)", () => {
  it("AC2: merges local and enriched Tidal track into one result when artist/album match", () => {
    const localCreep: LmsSearchResult = {
      id: "local-42",
      title: "Creep",
      artist: "Radiohead",
      album: "Pablo Honey",
      url: "file:///music/creep.flac",
      source: "local",
      type: "track",
    };
    // Tidal track WITH artist/album (as returned after enrichment via songinfo)
    const tidalCreep: LmsSearchResult = {
      id: "tidal://58990486.flc",
      title: "Creep",
      artist: "Radiohead",
      album: "Pablo Honey",
      url: "tidal://58990486.flc",
      source: "tidal",
      type: "track",
    };

    const result = deduplicateTracks([localCreep, tidalCreep]);

    expect(result).toHaveLength(1);
    expect(result[0]?.source).toBe("local"); // local wins by priority
    const sources = result[0]?.availableSources ?? [];
    expect(sources).toHaveLength(2);
    expect(sources.some((s) => s.source === "local")).toBe(true);
    expect(sources.some((s) => s.source === "tidal")).toBe(true);
  });

  it("AC3: local FLAC wins over Tidal AAC via quality-based selection when both have audioQuality", () => {
    const localFlac: LmsSearchResult = {
      id: "local-1",
      title: "Creep",
      artist: "Radiohead",
      album: "Pablo Honey",
      url: "file:///music/creep.flac",
      source: "local",
      type: "track",
      audioQuality: {
        format: "FLAC",
        bitrate: 1411000,
        sampleRate: 44100,
        lossless: true,
        bitDepth: 16,
      },
    };
    const tidalAac: LmsSearchResult = {
      id: "tidal://58990486.flc",
      title: "Creep",
      artist: "Radiohead",
      album: "Pablo Honey",
      url: "tidal://58990486.flc",
      source: "tidal",
      type: "track",
      audioQuality: {
        format: "AAC",
        bitrate: 320000,
        sampleRate: 44100,
        lossless: false,
      },
    };

    const result = deduplicateTracks([localFlac, tidalAac]);

    expect(result).toHaveLength(1);
    expect(result[0]?.source).toBe("local");
    expect(result[0]?.audioQuality?.format).toBe("FLAC");
    expect(result[0]?.availableSources).toHaveLength(2);
  });

  it("AC6: unenriched Tidal track (empty artist/album) is NOT merged with local — graceful degradation", () => {
    const localCreep: LmsSearchResult = {
      id: "local-42",
      title: "Creep",
      artist: "Radiohead",
      album: "Pablo Honey",
      url: "file:///music/creep.flac",
      source: "local",
      type: "track",
    };
    const tidalCreepUnenriched: LmsSearchResult = {
      id: "tidal://58990486.flc",
      title: "Creep",
      artist: "",
      album: "",
      url: "tidal://58990486.flc",
      source: "tidal",
      type: "track",
    };

    const result = deduplicateTracks([localCreep, tidalCreepUnenriched]);

    // Both shown separately — dedup cannot match without artist/album
    expect(result).toHaveLength(2);
  });
});
