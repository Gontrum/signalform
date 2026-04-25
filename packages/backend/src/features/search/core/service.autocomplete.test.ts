/**
 * Autocomplete Service Unit Tests
 *
 * Tests the functional core for autocomplete logic.
 * Uses Given/When/Then pattern with helper functions.
 *
 * Since the LMS titles command only returns tracks, autocomplete suggestions
 * are now derived from artist/album metadata on track results.
 */

import { describe, it, expect } from "vitest";
import { getAutocompleteSuggestions } from "./service.js";
import type { SearchResult } from "../../../adapters/lms-client/index.js";

describe("getAutocompleteSuggestions", () => {
  it("returns top 5 artist/album matches derived from track metadata", async () => {
    const lmsResults = await givenTracksFromMultipleArtistsAndAlbums();

    const result = await whenGetAutocompleteSuggestionsIsCalled(
      "Pink",
      lmsResults,
    );

    await thenResultIsSuccessful(result);
    await thenSuggestionsContainOnlyArtistsAndAlbums(result);
    await thenSuggestionsAreLimitedTo5OrLess(result);
  });

  it("suggestions are always artists and albums (never tracks)", async () => {
    const lmsResults = await givenTracksWithArtistAndAlbum();

    const result = await whenGetAutocompleteSuggestionsIsCalled(
      "Pink Floyd",
      lmsResults,
    );

    await thenResultIsSuccessful(result);
    await thenSuggestionsContainNoTracks(result);
  });

  it("returns error when query is empty", async () => {
    const lmsResults = await givenTracksWithArtistAndAlbum();

    const result = await whenGetAutocompleteSuggestionsIsCalled("", lmsResults);

    await thenResultIsError(result);
    await thenErrorCodeIs(result, "EMPTY_QUERY");
  });

  it("returns empty array when tracks have no artist and no album metadata", async () => {
    const lmsResults = await givenTracksWithNoMetadata();

    const result = await whenGetAutocompleteSuggestionsIsCalled(
      "Pink",
      lmsResults,
    );

    await thenResultIsSuccessful(result);
    await thenSuggestionsAreEmpty(result);
  });

  it("limits to exactly 5 results when many unique albums exist", async () => {
    const lmsResults = await givenTracksWith10UniqueAlbums();

    const result = await whenGetAutocompleteSuggestionsIsCalled(
      "Pi",
      lmsResults,
    );

    await thenResultIsSuccessful(result);
    await thenSuggestionsContainExactly5Results(result);
  });

  it("includes album name for album type suggestions", async () => {
    const lmsResults = await givenTracksWithAlbumMetadata();

    const result = await whenGetAutocompleteSuggestionsIsCalled(
      "Dark Side",
      lmsResults,
    );

    await thenResultIsSuccessful(result);
    await thenAlbumSuggestionsIncludeAlbumName(result);
  });

  it("excludes album name for artist type suggestions", async () => {
    const lmsResults = await givenTracksWithArtistMetadata();

    const result = await whenGetAutocompleteSuggestionsIsCalled(
      "Pink Floyd",
      lmsResults,
    );

    await thenResultIsSuccessful(result);
    await thenArtistSuggestionsExcludeAlbumName(result);
  });

  it("deduplicates artists across multiple tracks from the same artist", async () => {
    const lmsResults: readonly SearchResult[] = [
      makeTrack("Pink Floyd", "Dark Side of the Moon", "Money"),
      makeTrack("Pink Floyd", "Dark Side of the Moon", "Time"),
      makeTrack("Pink Floyd", "The Wall", "Comfortably Numb"),
    ];

    const result = await whenGetAutocompleteSuggestionsIsCalled(
      "Pink",
      lmsResults,
    );

    await thenResultIsSuccessful(result);
    if (result.ok) {
      const artists = result.value.filter((s) => s.type === "artist");
      // "Pink Floyd" should appear only once
      expect(artists).toHaveLength(1);
    }
  });

  it("deduplicates albums across multiple tracks from the same album", async () => {
    const lmsResults: readonly SearchResult[] = [
      makeTrack("Pink Floyd", "Dark Side of the Moon", "Money"),
      makeTrack("Pink Floyd", "Dark Side of the Moon", "Time"),
    ];

    const result = await whenGetAutocompleteSuggestionsIsCalled(
      "Dark",
      lmsResults,
    );

    await thenResultIsSuccessful(result);
    if (result.ok) {
      const albums = result.value.filter((s) => s.type === "album");
      // "Dark Side of the Moon" should appear only once
      expect(albums).toHaveLength(1);
    }
  });

  it("ranks exact-match artist above substring-match artist", async () => {
    // LMS returns "Dr. Know" tracks first, "The Black Keys" tracks second
    // (simulating an arbitrary LMS ordering). With relevance scoring,
    // "The Black Keys" must appear first for query "the black keys".
    const lmsResults: readonly SearchResult[] = [
      makeTrack("Dr. Know", "Built for Destruction", "Acid Rain"),
      makeTrack("Dr. Know", "Built for Destruction", "Wasted"),
      makeTrack("The Black Keys", "Delta Kream", "Going Down South"),
      makeTrack("The Black Keys", "Delta Kream", "Crawling Kingsnake"),
    ];

    const result = await whenGetAutocompleteSuggestionsIsCalled(
      "The Black Keys",
      lmsResults,
    );

    await thenResultIsSuccessful(result);
    if (result.ok) {
      const artists = result.value.filter((s) => s.type === "artist");
      expect(artists[0]?.artist).toBe("The Black Keys");
    }
  });

  it("ranks prefix-match above substring-match", async () => {
    const lmsResults: readonly SearchResult[] = [
      makeTrack("Unknown Black Artist", "Some Album", "Track 1"),
      makeTrack("Blackwater", "Debut", "Intro"),
      makeTrack("Black Sabbath", "Paranoid", "War Pigs"),
    ];

    const result = await whenGetAutocompleteSuggestionsIsCalled(
      "Black",
      lmsResults,
    );

    await thenResultIsSuccessful(result);
    if (result.ok) {
      const artists = result.value.filter((s) => s.type === "artist");
      // "Blackwater" starts with "Black" (prefix=2) — should rank above
      // "Unknown Black Artist" which only contains it (substring=1)
      const blackwaterIdx = artists.findIndex((s) => s.artist === "Blackwater");
      const unknownIdx = artists.findIndex(
        (s) => s.artist === "Unknown Black Artist",
      );
      expect(blackwaterIdx).toBeLessThan(unknownIdx);
    }
  });

  // GIVEN helper functions
  const makeTrack = (
    artist: string,
    album: string,
    title: string,
  ): SearchResult => ({
    id: `track-${artist}-${title}`.toLowerCase().replace(/ /g, "-"),
    title,
    artist,
    album,
    url: `local://tracks/${title.toLowerCase().replace(/ /g, "-")}`,
    source: "local" as const,
    type: "track" as const,
  });

  const givenTracksFromMultipleArtistsAndAlbums = async (): Promise<
    readonly SearchResult[]
  > => {
    return [
      makeTrack("Pink Floyd", "The Dark Side of the Moon", "Money"),
      makeTrack("Pink Floyd", "The Wall", "Comfortably Numb"),
      makeTrack("Led Zeppelin", "Led Zeppelin IV", "Stairway to Heaven"),
    ];
  };

  const givenTracksWithArtistAndAlbum = async (): Promise<
    readonly SearchResult[]
  > => {
    return [
      makeTrack("Pink Floyd", "The Wall", "Comfortably Numb"),
      makeTrack("Pink Floyd", "The Wall", "Another Brick in the Wall"),
    ];
  };

  const givenTracksWithNoMetadata = async (): Promise<
    readonly SearchResult[]
  > => {
    return [
      {
        id: "track-1",
        title: "Unknown Track",
        artist: "",
        album: "",
        url: "local://tracks/unknown",
        source: "local" as const,
        type: "track" as const,
      },
    ];
  };

  const givenTracksWith10UniqueAlbums = async (): Promise<
    readonly SearchResult[]
  > => {
    return Array.from({ length: 10 }, (_, i) =>
      makeTrack(`Artist ${i}`, `Album ${i}`, `Track ${i}`),
    );
  };

  const givenTracksWithAlbumMetadata = async (): Promise<
    readonly SearchResult[]
  > => {
    return [makeTrack("Pink Floyd", "The Dark Side of the Moon", "Money")];
  };

  const givenTracksWithArtistMetadata = async (): Promise<
    readonly SearchResult[]
  > => {
    return [makeTrack("Pink Floyd", "The Wall", "Comfortably Numb")];
  };

  // WHEN helper functions
  const whenGetAutocompleteSuggestionsIsCalled = async (
    query: string,
    lmsResults: readonly SearchResult[],
  ): Promise<ReturnType<typeof getAutocompleteSuggestions>> => {
    return getAutocompleteSuggestions(query, lmsResults);
  };

  // THEN helper functions
  const thenResultIsSuccessful = async (
    result: ReturnType<typeof getAutocompleteSuggestions>,
  ): Promise<void> => {
    expect(result.ok).toBe(true);
  };

  const thenResultIsError = async (
    result: ReturnType<typeof getAutocompleteSuggestions>,
  ): Promise<void> => {
    expect(result.ok).toBe(false);
  };

  const thenErrorCodeIs = async (
    result: ReturnType<typeof getAutocompleteSuggestions>,
    expectedCode: string,
  ): Promise<void> => {
    if (!result.ok) {
      expect(result.error.code).toBe(expectedCode);
    }
  };

  const thenSuggestionsContainOnlyArtistsAndAlbums = async (
    result: ReturnType<typeof getAutocompleteSuggestions>,
  ): Promise<void> => {
    if (result.ok) {
      const allArtistsOrAlbums = result.value.every(
        (s) => s.type === "artist" || s.type === "album",
      );
      expect(allArtistsOrAlbums).toBe(true);
    }
  };

  const thenSuggestionsAreLimitedTo5OrLess = async (
    result: ReturnType<typeof getAutocompleteSuggestions>,
  ): Promise<void> => {
    if (result.ok) {
      expect(result.value.length).toBeLessThanOrEqual(5);
    }
  };

  const thenSuggestionsContainNoTracks = async (
    result: ReturnType<typeof getAutocompleteSuggestions>,
  ): Promise<void> => {
    if (result.ok) {
      const allArtistsOrAlbums = result.value.every(
        (s) => s.type === "artist" || s.type === "album",
      );
      expect(allArtistsOrAlbums).toBe(true);
    }
  };

  const thenSuggestionsAreEmpty = async (
    result: ReturnType<typeof getAutocompleteSuggestions>,
  ): Promise<void> => {
    if (result.ok) {
      expect(result.value.length).toBe(0);
    }
  };

  const thenSuggestionsContainExactly5Results = async (
    result: ReturnType<typeof getAutocompleteSuggestions>,
  ): Promise<void> => {
    if (result.ok) {
      expect(result.value.length).toBe(5);
    }
  };

  const thenAlbumSuggestionsIncludeAlbumName = async (
    result: ReturnType<typeof getAutocompleteSuggestions>,
  ): Promise<void> => {
    if (result.ok) {
      const albumSuggestions = result.value.filter((s) => s.type === "album");
      const allHaveAlbumName = albumSuggestions.every(
        (s) => s.album !== undefined,
      );
      expect(allHaveAlbumName).toBe(true);
    }
  };

  const thenArtistSuggestionsExcludeAlbumName = async (
    result: ReturnType<typeof getAutocompleteSuggestions>,
  ): Promise<void> => {
    if (result.ok) {
      const artistSuggestions = result.value.filter((s) => s.type === "artist");
      const allExcludeAlbumName = artistSuggestions.every(
        (s) => s.album === undefined,
      );
      expect(allExcludeAlbumName).toBe(true);
    }
  };
});
