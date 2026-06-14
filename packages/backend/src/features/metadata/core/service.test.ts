import { describe, test, expect } from "vitest";
import { resolveArtistTopTracks } from "./service.js";
import type { ArtistTopTrack } from "./types.js";

type ArtistTopTrackCandidate = {
  readonly id: string;
  readonly title: string;
  readonly artist: string;
  readonly albumartist?: string;
  readonly album: string;
  readonly url: string;
  readonly source: "local" | "qobuz" | "tidal" | "unknown";
  readonly type: "track" | "artist" | "album";
  readonly coverArtUrl?: string;
  readonly audioQuality?: ArtistTopTrack["audioQuality"];
};

const makeCandidate = (
  overrides: Partial<Record<string, unknown>> = {},
): ArtistTopTrackCandidate => ({
  id: "1",
  title: "Like a Prayer",
  artist: "Madonna",
  album: "Like a Prayer",
  url: "file:///music/madonna/like-a-prayer.flac",
  source: "local" as const,
  type: "track" as const,
  ...overrides,
});

const makeTrackInput = (
  name: string,
): {
  readonly name: string;
  readonly artist: string;
  readonly playcount: number;
  readonly listeners: number;
  readonly url: string;
} => ({
  name,
  artist: "Madonna",
  playcount: 100,
  listeners: 50,
  url: "",
});

describe("resolveArtistTopTracks", () => {
  describe("Happy path", () => {
    test("1. local track with exact artist + title resolves", () => {
      const result = resolveArtistTopTracks(
        "Madonna",
        [makeTrackInput("Like a Prayer")],
        [[makeCandidate()]],
      );
      expect(result).toHaveLength(1);
      expect(result[0]?.url).toBe("file:///music/madonna/like-a-prayer.flac");
    });

    test("2. Tidal track with artist set after enrichment + exact title resolves", () => {
      const tidalCandidate = makeCandidate({
        source: "tidal" as const,
        artist: "Madonna",
        url: "tidal://track/123",
      });
      const result = resolveArtistTopTracks(
        "Madonna",
        [makeTrackInput("Like a Prayer")],
        [[tidalCandidate]],
      );
      expect(result).toHaveLength(1);
      expect(result[0]?.url).toBe("tidal://track/123");
    });

    test('3. Tidal track with artist: "" (enrichment timed out) + exact title resolves (bug fix)', () => {
      const tidalCandidate = makeCandidate({
        source: "tidal" as const,
        artist: "",
        url: "tidal://track/456",
      });
      const result = resolveArtistTopTracks(
        "Madonna",
        [makeTrackInput("Like a Prayer")],
        [[tidalCandidate]],
      );
      expect(result).toHaveLength(1);
      expect(result[0]?.url).toBe("tidal://track/456");
    });

    test("4. Prefers local over Tidal when both match", () => {
      const localCandidate = makeCandidate({
        id: "local-1",
        source: "local" as const,
        url: "file:///music/like-a-prayer.flac",
      });
      const tidalCandidate = makeCandidate({
        id: "tidal-1",
        source: "tidal" as const,
        artist: "",
        url: "tidal://track/456",
      });
      const result = resolveArtistTopTracks(
        "Madonna",
        [makeTrackInput("Like a Prayer")],
        [[tidalCandidate, localCandidate]],
      );
      expect(result).toHaveLength(1);
      expect(result[0]?.source).toBe("local");
    });

    test("5. Title with diacritics: normalized Bjork matches track titled Bjork", () => {
      const candidate = makeCandidate({
        artist: "Bjork",
        title: "Bjork",
        url: "file:///music/bjork.flac",
      });
      const result = resolveArtistTopTracks(
        "Bjork",
        [makeTrackInput("Bjork")],
        [[candidate]],
      );
      expect(result).toHaveLength(1);
      expect(result[0]?.url).toBe("file:///music/bjork.flac");
    });

    test("5b. Diacritics: Last.fm Bjork (with umlaut) normalized matches local track Bjork", () => {
      const candidate = makeCandidate({
        artist: "Bjork",
        title: "Human Behaviour",
        url: "file:///music/bjork/human.flac",
      });
      // simulate normalizeMatchText stripping the umlaut from artist
      const result = resolveArtistTopTracks(
        "Björk",
        [makeTrackInput("Human Behaviour")],
        [[candidate]],
      );
      expect(result).toHaveLength(1);
      expect(result[0]?.url).toBe("file:///music/bjork/human.flac");
    });

    test("6. Tidal title Like a Prayer (2009 Remaster) matches Last.fm Like a Prayer via includes", () => {
      const tidalCandidate = makeCandidate({
        source: "tidal" as const,
        artist: "",
        title: "Like a Prayer (2009 Remaster)",
        url: "tidal://track/remaster",
      });
      const result = resolveArtistTopTracks(
        "Madonna",
        [makeTrackInput("Like a Prayer")],
        [[tidalCandidate]],
      );
      expect(result).toHaveLength(1);
      expect(result[0]?.url).toBe("tidal://track/remaster");
    });

    test("7. albumartist takes priority over artist: local track with albumartist Madonna + artist empty still matches", () => {
      const candidate = makeCandidate({
        artist: "",
        albumartist: "Madonna",
        url: "file:///music/compilation.flac",
      });
      const result = resolveArtistTopTracks(
        "Madonna",
        [makeTrackInput("Like a Prayer")],
        [[candidate]],
      );
      expect(result).toHaveLength(1);
      expect(result[0]?.url).toBe("file:///music/compilation.flac");
    });
  });

  describe("Error paths", () => {
    test("8. Tidal track with non-empty artist that does not match is rejected", () => {
      const tidalCandidate = makeCandidate({
        source: "tidal" as const,
        artist: "Janet Jackson",
        url: "tidal://track/wrong-artist",
      });
      const result = resolveArtistTopTracks(
        "Madonna",
        [makeTrackInput("Like a Prayer")],
        [[tidalCandidate]],
      );
      expect(result).toHaveLength(0);
    });

    test("9. Track with mismatched title is rejected", () => {
      const candidate = makeCandidate({
        title: "Material Girl",
      });
      const result = resolveArtistTopTracks(
        "Madonna",
        [makeTrackInput("Like a Prayer")],
        [[candidate]],
      );
      expect(result).toHaveLength(0);
    });

    test("10. Track with empty URL is rejected", () => {
      const candidate = makeCandidate({ url: "" });
      const result = resolveArtistTopTracks(
        "Madonna",
        [makeTrackInput("Like a Prayer")],
        [[candidate]],
      );
      expect(result).toHaveLength(0);
    });

    test("11. Non-track type artist is rejected", () => {
      const candidate = makeCandidate({ type: "artist" as const });
      const result = resolveArtistTopTracks(
        "Madonna",
        [makeTrackInput("Like a Prayer")],
        [[candidate]],
      );
      expect(result).toHaveLength(0);
    });

    test("11b. Non-track type album is rejected", () => {
      const candidate = makeCandidate({ type: "album" as const });
      const result = resolveArtistTopTracks(
        "Madonna",
        [makeTrackInput("Like a Prayer")],
        [[candidate]],
      );
      expect(result).toHaveLength(0);
    });

    test("12. Empty candidate set returns empty result", () => {
      const result = resolveArtistTopTracks(
        "Madonna",
        [makeTrackInput("Like a Prayer")],
        [[]],
      );
      expect(result).toHaveLength(0);
    });
  });

  describe("Edge cases", () => {
    test("13. Multiple candidates: sorts by source rank, picks local over tidal over unknown", () => {
      const unknown = makeCandidate({
        id: "unknown-1",
        source: "unknown" as const,
        artist: "",
        url: "unknown://track/1",
      });
      const tidal = makeCandidate({
        id: "tidal-1",
        source: "tidal" as const,
        artist: "",
        url: "tidal://track/2",
      });
      const local = makeCandidate({
        id: "local-1",
        source: "local" as const,
        url: "file:///music/3.flac",
      });
      const result = resolveArtistTopTracks(
        "Madonna",
        [makeTrackInput("Like a Prayer")],
        [[unknown, tidal, local]],
      );
      expect(result).toHaveLength(1);
      expect(result[0]?.source).toBe("local");
      expect(result[0]?.id).toBe("local-1");
    });

    test("14. All candidates fail filter returns empty result", () => {
      const candidates = [
        makeCandidate({ title: "Material Girl" }),
        makeCandidate({ url: "" }),
        makeCandidate({ type: "album" as const }),
      ];
      const result = resolveArtistTopTracks(
        "Madonna",
        [makeTrackInput("Like a Prayer")],
        [candidates],
      );
      expect(result).toHaveLength(0);
    });

    test("resolves multiple topTracks each with their own candidateSet", () => {
      const prayer = makeCandidate({
        id: "prayer",
        title: "Like a Prayer",
        url: "file:///prayer.flac",
      });
      const material = makeCandidate({
        id: "material",
        title: "Material Girl",
        url: "file:///material.flac",
      });
      const result = resolveArtistTopTracks(
        "Madonna",
        [makeTrackInput("Like a Prayer"), makeTrackInput("Material Girl")],
        [[prayer], [material]],
      );
      expect(result).toHaveLength(2);
      expect(result[0]?.rank).toBe(1);
      expect(result[1]?.rank).toBe(2);
    });

    test("URL with only whitespace is rejected", () => {
      const candidate = makeCandidate({ url: "   " });
      const result = resolveArtistTopTracks(
        "Madonna",
        [makeTrackInput("Like a Prayer")],
        [[candidate]],
      );
      expect(result).toHaveLength(0);
    });
  });
});
