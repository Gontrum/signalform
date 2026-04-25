import { describe, expect, it } from "vitest";
import {
  mapTidalArtistAlbum,
  mapTidalArtistAlbums,
  mapTidalArtistSearch,
  mapTidalSearchArtist,
} from "./service.js";

describe("mapTidalArtistAlbum", () => {
  const baseUrl = "http://192.168.178.39:9000";

  it("maps id and title (name field is title-only, no split)", () => {
    const result = mapTidalArtistAlbum(
      { id: "6.0.1.0", name: "When I Fall In Love" },
      baseUrl,
    );

    expect(result.id).toBe("6.0.1.0");
    expect(result.title).toBe("When I Fall In Love");
  });

  it("constructs absolute coverArtUrl from relative image path", () => {
    const result = mapTidalArtistAlbum(
      {
        id: "6.0.1.0",
        name: "When I Fall In Love",
        image:
          "/imageproxy/http%3A%2F%2Fresources.tidal.com%2Fimages%2F3f99c29c%2F1280x1280.jpg/image.jpg",
      },
      baseUrl,
    );

    expect(result.coverArtUrl).toBe(
      "http://192.168.178.39:9000/imageproxy/http%3A%2F%2Fresources.tidal.com%2Fimages%2F3f99c29c%2F1280x1280.jpg/image.jpg",
    );
  });

  it("returns empty string coverArtUrl when image is absent", () => {
    const result = mapTidalArtistAlbum(
      { id: "6.0.1.0", name: "Waltz for Debby" },
      baseUrl,
    );

    expect(result.coverArtUrl).toBe("");
  });

  it("handles album title that contains ' - ' without splitting", () => {
    const result = mapTidalArtistAlbum(
      { id: "6.0.1.2", name: "Kind of Blue - Remaster Edition" },
      baseUrl,
    );

    expect(result.title).toBe("Kind of Blue - Remaster Edition");
  });
});

describe("mapTidalArtistAlbums", () => {
  const baseUrl = "http://192.168.178.39:9000";

  it("maps all albums and includes artistId and totalCount", () => {
    const result = mapTidalArtistAlbums(
      "6.0",
      [
        { id: "6.0.1.0", name: "When I Fall In Love" },
        { id: "6.0.1.1", name: "Waltz for Debby" },
      ],
      2,
      baseUrl,
    );

    expect(result.artistId).toBe("6.0");
    expect(result.totalCount).toBe(2);
    expect(result.albums).toHaveLength(2);
    expect(result.albums[0]?.title).toBe("When I Fall In Love");
    expect(result.albums[1]?.title).toBe("Waltz for Debby");
  });

  it("returns empty albums array when rawAlbums is empty", () => {
    const result = mapTidalArtistAlbums("6.1", [], 0, baseUrl);

    expect(result.artistId).toBe("6.1");
    expect(result.albums).toHaveLength(0);
    expect(result.totalCount).toBe(0);
  });
});

describe("mapTidalSearchArtist", () => {
  const baseUrl = "http://192.168.178.39:9000";

  it("normalizes search artist ID by stripping URL-encoded name suffix", () => {
    const result = mapTidalSearchArtist(
      {
        id: "7_sabrina carpenter_sabrina%20carpenter.2.0",
        name: "Sabrina Carpenter",
      },
      baseUrl,
    );

    expect(result.artistId).toBe("7_sabrina carpenter.2.0");
    expect(result.name).toBe("Sabrina Carpenter");
  });

  it("normalizes single-word artist ID with encoded name suffix", () => {
    const result = mapTidalSearchArtist(
      { id: "7_adele_adele.2.0", name: "Adele" },
      baseUrl,
    );

    expect(result.artistId).toBe("7_adele.2.0");
  });

  it("does not alter Favoriten-Künstler IDs (no encoded-name suffix)", () => {
    const result = mapTidalSearchArtist(
      { id: "6.0", name: "Bill Evans" },
      baseUrl,
    );

    expect(result.artistId).toBe("6.0");
  });

  it("does not re-normalize an already normalized search artist ID (idempotency)", () => {
    const result = mapTidalSearchArtist(
      { id: "7_sabrina carpenter.2.0", name: "Sabrina Carpenter" },
      baseUrl,
    );

    expect(result.artistId).toBe("7_sabrina carpenter.2.0");
  });

  it("constructs absolute coverArtUrl from relative image path", () => {
    const result = mapTidalSearchArtist(
      {
        id: "7_sabrina carpenter_sabrina%20carpenter.2.0",
        name: "Sabrina Carpenter",
        image:
          "/imageproxy/http%3A%2F%2Fresources.tidal.com%2Fimages%2Fabc%2F320x320.jpg/image.jpg",
      },
      baseUrl,
    );

    expect(result.coverArtUrl).toBe(
      "http://192.168.178.39:9000/imageproxy/http%3A%2F%2Fresources.tidal.com%2Fimages%2Fabc%2F320x320.jpg/image.jpg",
    );
  });

  it("returns empty string coverArtUrl when image is absent", () => {
    const result = mapTidalSearchArtist(
      { id: "7_test_test.2.0", name: "Test Artist" },
      baseUrl,
    );

    expect(result.coverArtUrl).toBe("");
  });
});

describe("mapTidalArtistSearch", () => {
  const baseUrl = "http://192.168.178.39:9000";

  it("maps all artists and includes totalCount", () => {
    const result = mapTidalArtistSearch(
      [
        {
          id: "7_sabrina carpenter_sabrina%20carpenter.2.0",
          name: "Sabrina Carpenter",
        },
        {
          id: "7_sabrina carpenter_sabrina%20carpenter.2.1",
          name: "Sabrina Carpenter (similar)",
        },
      ],
      2,
      baseUrl,
    );

    expect(result.totalCount).toBe(2);
    expect(result.artists).toHaveLength(2);
    expect(result.artists[0]?.artistId).toBe("7_sabrina carpenter.2.0");
    expect(result.artists[0]?.name).toBe("Sabrina Carpenter");
  });

  it("returns empty artists array when rawArtists is empty", () => {
    const result = mapTidalArtistSearch([], 0, baseUrl);

    expect(result.artists).toHaveLength(0);
    expect(result.totalCount).toBe(0);
  });
});
