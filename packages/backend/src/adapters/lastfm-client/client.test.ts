import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createLastFmClient } from "./client.js";

const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("createLastFmClient - getSimilarTracks", () => {
  it("AC2: getSimilarTracks returns SimilarTrack[] on success", async () => {
    fetchMock.mockResolvedValue({
      status: 200,
      text: async () =>
        JSON.stringify({
          similartracks: {
            track: [
              {
                name: "Blue Rondo a la Turk",
                artist: { name: "Dave Brubeck" },
                mbid: "abc-123",
                match: 0.95,
                duration: "240",
                url: "https://www.last.fm/music/Dave+Brubeck/_/Blue+Rondo+a+la+Turk",
              },
            ],
          },
        }),
    });
    const client = createLastFmClient({
      apiKey: "testkey",
      timeout: 5000,
      baseUrl: "https://ws.audioscrobbler.com/2.0/",
      language: "en",
    });
    const result = await client.getSimilarTracks("Dave Brubeck", "Take Five");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toHaveLength(1);
      expect(result.value[0]?.name).toBe("Blue Rondo a la Turk");
      expect(result.value[0]?.artist).toBe("Dave Brubeck");
      expect(result.value[0]?.match).toBe(0.95);
      expect(result.value[0]?.mbid).toBe("abc-123");
      expect(result.value[0]?.duration).toBe(240);
    }
  });

  it("AC2: getSimilarTracks calls correct last.fm API URL with params", async () => {
    fetchMock.mockResolvedValue({
      status: 200,
      text: async () => JSON.stringify({ similartracks: { track: [] } }),
    });
    const client = createLastFmClient({
      apiKey: "mykey",
      timeout: 5000,
      baseUrl: "https://ws.audioscrobbler.com/2.0/",
      language: "en",
    });
    await client.getSimilarTracks("Radiohead", "Creep", 10);
    expect(fetchMock).toHaveBeenCalledOnce();
    const calledUrl = String(fetchMock.mock.calls[0]?.[0]);
    expect(calledUrl).toContain("method=track.getSimilar");
    expect(calledUrl).toContain("artist=Radiohead");
    expect(calledUrl).toContain("track=Creep");
    expect(calledUrl).toContain("api_key=mykey");
    expect(calledUrl).toContain("format=json");
    expect(calledUrl).toContain("limit=10");
  });

  it("AC4: SimilarTrack maps empty mbid string to undefined", async () => {
    fetchMock.mockResolvedValue({
      status: 200,
      text: async () =>
        JSON.stringify({
          similartracks: {
            track: [
              {
                name: "Track",
                artist: { name: "Artist" },
                mbid: "",
                match: 0.5,
                duration: "0",
                url: "https://last.fm",
              },
            ],
          },
        }),
    });
    const client = createLastFmClient({
      apiKey: "testkey",
      timeout: 5000,
      baseUrl: "https://ws.audioscrobbler.com/2.0/",
      language: "en",
    });
    const result = await client.getSimilarTracks("Artist", "Track");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value[0]?.mbid).toBeUndefined();
      expect(result.value[0]?.duration).toBeUndefined(); // duration 0 → undefined
    }
  });

  it("AC5: returns RateLimitError on HTTP 429", async () => {
    fetchMock.mockResolvedValue({
      status: 429,
      text: async () => "",
    });
    const client = createLastFmClient({
      apiKey: "testkey",
      timeout: 5000,
      baseUrl: "https://ws.audioscrobbler.com/2.0/",
      language: "en",
    });
    const result = await client.getSimilarTracks("Artist", "Track");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.type).toBe("RateLimitError");
    }
  });

  it("AC6: returns NotFoundError when last.fm returns error code 6", async () => {
    fetchMock.mockResolvedValue({
      status: 200,
      text: async () =>
        JSON.stringify({ error: 6, message: "Track not found" }),
    });
    const client = createLastFmClient({
      apiKey: "testkey",
      timeout: 5000,
      baseUrl: "https://ws.audioscrobbler.com/2.0/",
      language: "en",
    });
    const result = await client.getSimilarTracks("Unknown", "Track");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.type).toBe("NotFoundError");
      if (result.error.type === "NotFoundError") {
        expect(result.error.code).toBe(6);
      }
    }
  });

  it("AC6: returns ApiError when last.fm returns a non-6 error code", async () => {
    fetchMock.mockResolvedValue({
      status: 200,
      text: async () =>
        JSON.stringify({ error: 10, message: "Service offline" }),
    });
    const client = createLastFmClient({
      apiKey: "testkey",
      timeout: 5000,
      baseUrl: "https://ws.audioscrobbler.com/2.0/",
      language: "en",
    });
    const result = await client.getSimilarTracks("Artist", "Track");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.type).toBe("ApiError");
      if (result.error.type === "ApiError") {
        expect(result.error.code).toBe(10);
      }
    }
  });

  it("AC6: returns NetworkError when fetch throws", async () => {
    fetchMock.mockRejectedValue(new Error("ECONNREFUSED"));
    const client = createLastFmClient({
      apiKey: "testkey",
      timeout: 5000,
      baseUrl: "https://ws.audioscrobbler.com/2.0/",
      language: "en",
    });
    const result = await client.getSimilarTracks("Artist", "Track");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.type).toBe("NetworkError");
    }
  });

  it("AC6: returns ParseError on malformed JSON", async () => {
    fetchMock.mockResolvedValue({
      status: 200,
      text: async () => "not-json",
    });
    const client = createLastFmClient({
      apiKey: "testkey",
      timeout: 5000,
      baseUrl: "https://ws.audioscrobbler.com/2.0/",
      language: "en",
    });
    const result = await client.getSimilarTracks("Artist", "Track");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.type).toBe("ParseError");
    }
  });

  it("AC6: returns TimeoutError when fetch times out (AbortError DOMException)", async () => {
    const timeoutError = new DOMException(
      "The operation was aborted",
      "TimeoutError",
    );
    fetchMock.mockRejectedValue(timeoutError);
    const client = createLastFmClient({
      apiKey: "testkey",
      timeout: 100,
      baseUrl: "https://ws.audioscrobbler.com/2.0/",
      language: "en",
    });
    const result = await client.getSimilarTracks("Artist", "Track");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.type).toBe("TimeoutError");
    }
  });

  it("AC7/AC8: returns empty array when last.fm returns empty string for tracks", async () => {
    fetchMock.mockResolvedValue({
      status: 200,
      text: async () =>
        JSON.stringify({
          similartracks: { track: "", "@attr": { artist: "Unknown" } },
        }),
    });
    const client = createLastFmClient({
      apiKey: "testkey",
      timeout: 5000,
      baseUrl: "https://ws.audioscrobbler.com/2.0/",
      language: "en",
    });
    const result = await client.getSimilarTracks("Unknown", "Track");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toHaveLength(0);
    }
  });
});

describe("createLastFmClient - getSimilarArtists", () => {
  it("AC3: getSimilarArtists returns SimilarArtist[] on success", async () => {
    fetchMock.mockResolvedValue({
      status: 200,
      text: async () =>
        JSON.stringify({
          similarartists: {
            artist: [
              {
                name: "Miles Davis",
                mbid: "def-456",
                match: "0.87",
                url: "https://www.last.fm/music/Miles+Davis",
              },
            ],
          },
        }),
    });
    const client = createLastFmClient({
      apiKey: "testkey",
      timeout: 5000,
      baseUrl: "https://ws.audioscrobbler.com/2.0/",
      language: "en",
    });
    const result = await client.getSimilarArtists("Dave Brubeck");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toHaveLength(1);
      expect(result.value[0]?.name).toBe("Miles Davis");
      expect(result.value[0]?.match).toBe(0.87);
      expect(result.value[0]?.mbid).toBe("def-456");
    }
  });

  it("AC3: getSimilarArtists calls correct last.fm API URL with params", async () => {
    fetchMock.mockResolvedValue({
      status: 200,
      text: async () => JSON.stringify({ similarartists: { artist: [] } }),
    });
    const client = createLastFmClient({
      apiKey: "mykey",
      timeout: 5000,
      baseUrl: "https://ws.audioscrobbler.com/2.0/",
      language: "en",
    });
    await client.getSimilarArtists("Radiohead", 20);
    expect(fetchMock).toHaveBeenCalledOnce();
    const calledUrl = String(fetchMock.mock.calls[0]?.[0]);
    expect(calledUrl).toContain("method=artist.getSimilar");
    expect(calledUrl).toContain("artist=Radiohead");
    expect(calledUrl).toContain("api_key=mykey");
    expect(calledUrl).toContain("format=json");
    expect(calledUrl).toContain("limit=20");
  });

  it("AC4: SimilarArtist maps empty mbid string to undefined", async () => {
    fetchMock.mockResolvedValue({
      status: 200,
      text: async () =>
        JSON.stringify({
          similarartists: {
            artist: [
              {
                name: "Artist",
                mbid: "",
                match: "0.5",
                url: "https://last.fm",
              },
            ],
          },
        }),
    });
    const client = createLastFmClient({
      apiKey: "testkey",
      timeout: 5000,
      baseUrl: "https://ws.audioscrobbler.com/2.0/",
      language: "en",
    });
    const result = await client.getSimilarArtists("Artist");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value[0]?.mbid).toBeUndefined();
    }
  });

  it("AC5: getSimilarArtists returns RateLimitError on HTTP 429", async () => {
    fetchMock.mockResolvedValue({
      status: 429,
      text: async () => "",
    });
    const client = createLastFmClient({
      apiKey: "testkey",
      timeout: 5000,
      baseUrl: "https://ws.audioscrobbler.com/2.0/",
      language: "en",
    });
    const result = await client.getSimilarArtists("Artist");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.type).toBe("RateLimitError");
    }
  });

  it("AC6: getSimilarArtists returns NotFoundError when last.fm returns error code 6", async () => {
    fetchMock.mockResolvedValue({
      status: 200,
      text: async () =>
        JSON.stringify({ error: 6, message: "Artist not found" }),
    });
    const client = createLastFmClient({
      apiKey: "testkey",
      timeout: 5000,
      baseUrl: "https://ws.audioscrobbler.com/2.0/",
      language: "en",
    });
    const result = await client.getSimilarArtists("Unknown Artist");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.type).toBe("NotFoundError");
      if (result.error.type === "NotFoundError") {
        expect(result.error.code).toBe(6);
      }
    }
  });

  it("AC6: getSimilarArtists returns NetworkError when fetch throws", async () => {
    fetchMock.mockRejectedValue(new Error("ECONNREFUSED"));
    const client = createLastFmClient({
      apiKey: "testkey",
      timeout: 5000,
      baseUrl: "https://ws.audioscrobbler.com/2.0/",
      language: "en",
    });
    const result = await client.getSimilarArtists("Artist");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.type).toBe("NetworkError");
    }
  });

  it("AC6: getSimilarArtists returns ParseError on malformed JSON", async () => {
    fetchMock.mockResolvedValue({
      status: 200,
      text: async () => "not-json",
    });
    const client = createLastFmClient({
      apiKey: "testkey",
      timeout: 5000,
      baseUrl: "https://ws.audioscrobbler.com/2.0/",
      language: "en",
    });
    const result = await client.getSimilarArtists("Artist");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.type).toBe("ParseError");
    }
  });

  it("AC6: getSimilarArtists returns TimeoutError when fetch times out", async () => {
    const timeoutError = new DOMException(
      "The operation was aborted",
      "TimeoutError",
    );
    fetchMock.mockRejectedValue(timeoutError);
    const client = createLastFmClient({
      apiKey: "testkey",
      timeout: 100,
      baseUrl: "https://ws.audioscrobbler.com/2.0/",
      language: "en",
    });
    const result = await client.getSimilarArtists("Artist");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.type).toBe("TimeoutError");
    }
  });

  it("AC8: returns empty array when last.fm returns empty string for artists", async () => {
    fetchMock.mockResolvedValue({
      status: 200,
      text: async () =>
        JSON.stringify({
          similarartists: { artist: "" },
        }),
    });
    const client = createLastFmClient({
      apiKey: "testkey",
      timeout: 5000,
      baseUrl: "https://ws.audioscrobbler.com/2.0/",
      language: "en",
    });
    const result = await client.getSimilarArtists("Unknown");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toHaveLength(0);
    }
  });
});

describe("createLastFmClient - artist popularity", () => {
  const makeClient = (): ReturnType<typeof createLastFmClient> =>
    createLastFmClient({
      apiKey: "testkey",
      timeout: 5000,
      baseUrl: "https://ws.audioscrobbler.com/2.0/",
      language: "en",
    });

  it("maps artist.getTopTracks results", async () => {
    fetchMock.mockResolvedValue({
      status: 200,
      text: async () =>
        JSON.stringify({
          toptracks: {
            track: [
              {
                name: "Creep",
                artist: { name: "Radiohead" },
                mbid: "",
                playcount: "123456",
                listeners: "7890",
                url: "https://www.last.fm/music/Radiohead/_/Creep",
              },
            ],
          },
        }),
    });

    const result = await makeClient().getArtistTopTracks("Radiohead", 5);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value[0]).toEqual({
        name: "Creep",
        artist: "Radiohead",
        mbid: undefined,
        playcount: 123456,
        listeners: 7890,
        url: "https://www.last.fm/music/Radiohead/_/Creep",
      });
    }
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain(
      "method=artist.getTopTracks",
    );
  });

  it("maps artist.getTopAlbums results", async () => {
    fetchMock.mockResolvedValue({
      status: 200,
      text: async () =>
        JSON.stringify({
          topalbums: {
            album: [
              {
                name: "OK Computer",
                artist: { name: "Radiohead" },
                mbid: "album-mbid",
                playcount: "456789",
                url: "https://www.last.fm/music/Radiohead/OK+Computer",
              },
            ],
          },
        }),
    });

    const result = await makeClient().getArtistTopAlbums("Radiohead", 5);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value[0]).toEqual({
        name: "OK Computer",
        artist: "Radiohead",
        mbid: "album-mbid",
        playcount: 456789,
        url: "https://www.last.fm/music/Radiohead/OK+Computer",
      });
    }
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain(
      "method=artist.getTopAlbums",
    );
  });
});

describe("createLastFmClient - getArtistInfo", () => {
  const makeClient = (): ReturnType<typeof createLastFmClient> =>
    createLastFmClient({
      apiKey: "testkey",
      timeout: 5000,
      baseUrl: "https://ws.audioscrobbler.com/2.0/",
      language: "en",
    });

  const artistInfoResponse = {
    artist: {
      name: "Die Ärzte",
      mbid: "abc-123",
      stats: { listeners: "1234567", playcount: "9876543" },
      tags: {
        tag: [{ name: "punk rock" }, { name: "german" }],
      },
      bio: { summary: "A great punk band from Berlin." },
    },
  };

  it("happy path: maps all fields correctly including parseInt coercion", async () => {
    fetchMock.mockResolvedValue({
      status: 200,
      text: async () => JSON.stringify(artistInfoResponse),
    });
    const result = await makeClient().getArtistInfo("Die Ärzte");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.name).toBe("Die Ärzte");
      expect(result.value.mbid).toBe("abc-123");
      expect(result.value.listeners).toBe(1234567);
      expect(result.value.playcount).toBe(9876543);
      expect(result.value.tags).toEqual(["punk rock", "german"]);
      expect(result.value.bio).toBe("A great punk band from Berlin.");
    }
  });

  it("calls correct last.fm URL with method=artist.getInfo and artist param", async () => {
    fetchMock.mockResolvedValue({
      status: 200,
      text: async () => JSON.stringify(artistInfoResponse),
    });
    await makeClient().getArtistInfo("Die Ärzte");
    const calledUrl = String(fetchMock.mock.calls[0]?.[0]);
    expect(calledUrl).toContain("method=artist.getInfo");
    expect(calledUrl).toContain("artist=Die");
    expect(calledUrl).toContain("api_key=testkey");
    expect(calledUrl).toContain("format=json");
  });

  it("maps empty mbid string to undefined", async () => {
    fetchMock.mockResolvedValue({
      status: 200,
      text: async () =>
        JSON.stringify({
          artist: {
            name: "Unknown",
            mbid: "",
            stats: { listeners: "0", playcount: "0" },
            tags: { tag: [] },
            bio: { summary: "" },
          },
        }),
    });
    const result = await makeClient().getArtistInfo("Unknown");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.mbid).toBeUndefined();
    }
  });

  it("missing bio → bio maps to empty string", async () => {
    fetchMock.mockResolvedValue({
      status: 200,
      text: async () =>
        JSON.stringify({
          artist: {
            name: "NoBio",
            mbid: "",
            stats: { listeners: "0", playcount: "0" },
            tags: { tag: [] },
          },
        }),
    });
    const result = await makeClient().getArtistInfo("NoBio");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.bio).toBe("");
    }
  });

  it("missing tags → tags maps to empty array", async () => {
    fetchMock.mockResolvedValue({
      status: 200,
      text: async () =>
        JSON.stringify({
          artist: {
            name: "NoTags",
            mbid: "",
            stats: { listeners: "0", playcount: "0" },
            bio: { summary: "" },
          },
        }),
    });
    const result = await makeClient().getArtistInfo("NoTags");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.tags).toEqual([]);
    }
  });

  it("NotFoundError: last.fm returns error code 6", async () => {
    fetchMock.mockResolvedValue({
      status: 200,
      text: async () =>
        JSON.stringify({ error: 6, message: "Artist not found" }),
    });
    const result = await makeClient().getArtistInfo("Unknown Artist");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.type).toBe("NotFoundError");
      if (result.error.type === "NotFoundError") {
        expect(result.error.code).toBe(6);
      }
    }
  });

  it("TimeoutError: fetch throws DOMException TimeoutError", async () => {
    fetchMock.mockRejectedValue(
      new DOMException("The operation was aborted", "TimeoutError"),
    );
    const result = await makeClient().getArtistInfo("Artist");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.type).toBe("TimeoutError");
    }
  });

  it("NetworkError: fetch throws generic error", async () => {
    fetchMock.mockRejectedValue(new Error("ECONNREFUSED"));
    const result = await makeClient().getArtistInfo("Artist");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.type).toBe("NetworkError");
    }
  });

  it("ApiError: last.fm returns non-6 error code", async () => {
    fetchMock.mockResolvedValue({
      status: 200,
      text: async () =>
        JSON.stringify({ error: 29, message: "Rate limit exceeded" }),
    });
    const result = await makeClient().getArtistInfo("Artist");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.type).toBe("ApiError");
    }
  });
});

describe("createLastFmClient - getAlbumInfo", () => {
  const makeClient = (): ReturnType<typeof createLastFmClient> =>
    createLastFmClient({
      apiKey: "testkey",
      timeout: 5000,
      baseUrl: "https://ws.audioscrobbler.com/2.0/",
      language: "en",
    });

  const albumInfoResponse = {
    album: {
      name: "Die Bestie in Menschengestalt",
      mbid: "xyz-789",
      listeners: "500000",
      playcount: "2000000",
      tags: {
        tag: [{ name: "punk" }, { name: "rock" }],
      },
      wiki: { summary: "Classic punk album." },
    },
  };

  it("happy path: maps all fields correctly including parseInt coercion", async () => {
    fetchMock.mockResolvedValue({
      status: 200,
      text: async () => JSON.stringify(albumInfoResponse),
    });
    const result = await makeClient().getAlbumInfo(
      "Die Ärzte",
      "Die Bestie in Menschengestalt",
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.name).toBe("Die Bestie in Menschengestalt");
      expect(result.value.mbid).toBe("xyz-789");
      expect(result.value.listeners).toBe(500000);
      expect(result.value.playcount).toBe(2000000);
      expect(result.value.tags).toEqual(["punk", "rock"]);
      expect(result.value.wiki).toBe("Classic punk album.");
    }
  });

  it("calls correct last.fm URL with method=album.getInfo, artist and album params", async () => {
    fetchMock.mockResolvedValue({
      status: 200,
      text: async () => JSON.stringify(albumInfoResponse),
    });
    await makeClient().getAlbumInfo(
      "Die Ärzte",
      "Die Bestie in Menschengestalt",
    );
    const calledUrl = String(fetchMock.mock.calls[0]?.[0]);
    expect(calledUrl).toContain("method=album.getInfo");
    expect(calledUrl).toContain("artist=Die");
    expect(calledUrl).toContain("album=Die");
    expect(calledUrl).toContain("api_key=testkey");
    expect(calledUrl).toContain("format=json");
  });

  it("maps empty mbid string to undefined", async () => {
    fetchMock.mockResolvedValue({
      status: 200,
      text: async () =>
        JSON.stringify({
          album: {
            name: "Album",
            mbid: "",
            listeners: "0",
            playcount: "0",
            tags: { tag: [] },
            wiki: { summary: "" },
          },
        }),
    });
    const result = await makeClient().getAlbumInfo("Artist", "Album");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.mbid).toBeUndefined();
    }
  });

  it("missing wiki → wiki maps to empty string", async () => {
    fetchMock.mockResolvedValue({
      status: 200,
      text: async () =>
        JSON.stringify({
          album: {
            name: "NoWiki",
            mbid: "",
            listeners: "0",
            playcount: "0",
            tags: { tag: [] },
          },
        }),
    });
    const result = await makeClient().getAlbumInfo("Artist", "NoWiki");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.wiki).toBe("");
    }
  });

  it("missing tags → tags maps to empty array", async () => {
    fetchMock.mockResolvedValue({
      status: 200,
      text: async () =>
        JSON.stringify({
          album: {
            name: "NoTags",
            mbid: "",
            listeners: "0",
            playcount: "0",
            wiki: { summary: "" },
          },
        }),
    });
    const result = await makeClient().getAlbumInfo("Artist", "NoTags");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.tags).toEqual([]);
    }
  });

  it("NotFoundError: last.fm returns error code 6", async () => {
    fetchMock.mockResolvedValue({
      status: 200,
      text: async () =>
        JSON.stringify({ error: 6, message: "Album not found" }),
    });
    const result = await makeClient().getAlbumInfo("Artist", "Unknown Album");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.type).toBe("NotFoundError");
      if (result.error.type === "NotFoundError") {
        expect(result.error.code).toBe(6);
      }
    }
  });

  it("TimeoutError: fetch throws DOMException TimeoutError", async () => {
    fetchMock.mockRejectedValue(
      new DOMException("The operation was aborted", "TimeoutError"),
    );
    const result = await makeClient().getAlbumInfo("Artist", "Album");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.type).toBe("TimeoutError");
    }
  });

  it("NetworkError: fetch throws generic error", async () => {
    fetchMock.mockRejectedValue(new Error("ECONNREFUSED"));
    const result = await makeClient().getAlbumInfo("Artist", "Album");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.type).toBe("NetworkError");
    }
  });

  it("ApiError: last.fm returns non-6 error code", async () => {
    fetchMock.mockResolvedValue({
      status: 200,
      text: async () =>
        JSON.stringify({ error: 10, message: "Service offline" }),
    });
    const result = await makeClient().getAlbumInfo("Artist", "Album");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.type).toBe("ApiError");
    }
  });
});

describe("createLastFmClient - getTagTopTracks", () => {
  const makeClient = (): ReturnType<typeof createLastFmClient> =>
    createLastFmClient({
      apiKey: "testkey",
      timeout: 5000,
      baseUrl: "https://ws.audioscrobbler.com/2.0/",
      language: "en",
    });

  it("happy path: maps all fields correctly, non-empty mbid preserved", async () => {
    fetchMock.mockResolvedValue({
      status: 200,
      text: async () =>
        JSON.stringify({
          tracks: {
            track: [
              {
                name: "Jazz Track",
                artist: { name: "Jazz Artist" },
                mbid: "track-mbid-1",
                url: "https://www.last.fm/music/Jazz+Artist/_/Jazz+Track",
              },
            ],
          },
        }),
    });
    const result = await makeClient().getTagTopTracks("jazz");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toHaveLength(1);
      expect(result.value[0]?.name).toBe("Jazz Track");
      expect(result.value[0]?.artist).toBe("Jazz Artist");
      expect(result.value[0]?.mbid).toBe("track-mbid-1");
      expect(result.value[0]?.url).toBe(
        "https://www.last.fm/music/Jazz+Artist/_/Jazz+Track",
      );
    }
  });

  it("maps empty mbid string to undefined", async () => {
    fetchMock.mockResolvedValue({
      status: 200,
      text: async () =>
        JSON.stringify({
          tracks: {
            track: [
              {
                name: "Track",
                artist: { name: "Artist" },
                mbid: "",
                url: "https://last.fm",
              },
            ],
          },
        }),
    });
    const result = await makeClient().getTagTopTracks("rock");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value[0]?.mbid).toBeUndefined();
    }
  });

  it("missing top-level tracks key returns ok([])", async () => {
    fetchMock.mockResolvedValue({
      status: 200,
      text: async () => JSON.stringify({ something: "else" }),
    });
    const result = await makeClient().getTagTopTracks("jazz");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toHaveLength(0);
    }
  });

  it("non-array track value returns ok([])", async () => {
    fetchMock.mockResolvedValue({
      status: 200,
      text: async () => JSON.stringify({ tracks: { track: "not-an-array" } }),
    });
    const result = await makeClient().getTagTopTracks("jazz");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toHaveLength(0);
    }
  });

  it("non-record entry in track array is skipped", async () => {
    fetchMock.mockResolvedValue({
      status: 200,
      text: async () =>
        JSON.stringify({
          tracks: { track: ["not-a-record", null, 42] },
        }),
    });
    const result = await makeClient().getTagTopTracks("jazz");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toHaveLength(0);
    }
  });
});

describe("createLastFmClient - searchTags", () => {
  const makeClient = (): ReturnType<typeof createLastFmClient> =>
    createLastFmClient({
      apiKey: "testkey",
      timeout: 5000,
      baseUrl: "https://ws.audioscrobbler.com/2.0/",
      language: "en",
    });

  it("happy path: maps all fields correctly, count is parseInt'd", async () => {
    fetchMock.mockResolvedValue({
      status: 200,
      text: async () =>
        JSON.stringify({
          results: {
            tagmatches: {
              tag: [
                {
                  name: "rock",
                  count: "4567890",
                  url: "https://www.last.fm/tag/rock",
                },
              ],
            },
          },
        }),
    });
    const result = await makeClient().searchTags("rock");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toHaveLength(1);
      expect(result.value[0]?.name).toBe("rock");
      expect(result.value[0]?.count).toBe(4567890);
      expect(result.value[0]?.url).toBe("https://www.last.fm/tag/rock");
    }
  });

  it("missing results key returns ok([])", async () => {
    fetchMock.mockResolvedValue({
      status: 200,
      text: async () => JSON.stringify({ something: "else" }),
    });
    const result = await makeClient().searchTags("rock");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toHaveLength(0);
    }
  });

  it("non-array tag value returns ok([])", async () => {
    fetchMock.mockResolvedValue({
      status: 200,
      text: async () =>
        JSON.stringify({ results: { tagmatches: { tag: "not-an-array" } } }),
    });
    const result = await makeClient().searchTags("rock");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toHaveLength(0);
    }
  });
});

describe("createLastFmClient - getUserTopArtists", () => {
  const makeClient = (): ReturnType<typeof createLastFmClient> =>
    createLastFmClient({
      apiKey: "testkey",
      timeout: 5000,
      baseUrl: "https://ws.audioscrobbler.com/2.0/",
      language: "en",
    });

  it("happy path: maps all fields correctly, non-empty mbid preserved", async () => {
    fetchMock.mockResolvedValue({
      status: 200,
      text: async () =>
        JSON.stringify({
          topartists: {
            artist: [
              {
                name: "Radiohead",
                mbid: "artist-mbid",
                playcount: "9876",
                url: "https://www.last.fm/music/Radiohead",
              },
            ],
          },
        }),
    });
    const result = await makeClient().getUserTopArtists("johndoe");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toHaveLength(1);
      expect(result.value[0]?.name).toBe("Radiohead");
      expect(result.value[0]?.mbid).toBe("artist-mbid");
      expect(result.value[0]?.playcount).toBe(9876);
      expect(result.value[0]?.url).toBe("https://www.last.fm/music/Radiohead");
    }
  });

  it("maps empty mbid string to undefined", async () => {
    fetchMock.mockResolvedValue({
      status: 200,
      text: async () =>
        JSON.stringify({
          topartists: {
            artist: [
              {
                name: "Artist",
                mbid: "",
                playcount: "0",
                url: "https://last.fm",
              },
            ],
          },
        }),
    });
    const result = await makeClient().getUserTopArtists("johndoe");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value[0]?.mbid).toBeUndefined();
    }
  });

  it("missing topartists key returns ok([])", async () => {
    fetchMock.mockResolvedValue({
      status: 200,
      text: async () => JSON.stringify({ something: "else" }),
    });
    const result = await makeClient().getUserTopArtists("johndoe");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toHaveLength(0);
    }
  });

  it("non-array artist value returns ok([])", async () => {
    fetchMock.mockResolvedValue({
      status: 200,
      text: async () =>
        JSON.stringify({ topartists: { artist: "not-an-array" } }),
    });
    const result = await makeClient().getUserTopArtists("johndoe");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toHaveLength(0);
    }
  });
});

describe("createLastFmClient - getUserTopTracks", () => {
  const makeClient = (): ReturnType<typeof createLastFmClient> =>
    createLastFmClient({
      apiKey: "testkey",
      timeout: 5000,
      baseUrl: "https://ws.audioscrobbler.com/2.0/",
      language: "en",
    });

  it("happy path: maps all fields correctly", async () => {
    fetchMock.mockResolvedValue({
      status: 200,
      text: async () =>
        JSON.stringify({
          toptracks: {
            track: [
              {
                name: "Paranoid Android",
                artist: { name: "Radiohead" },
                mbid: "track-mbid",
                playcount: "1234",
                url: "https://www.last.fm/music/Radiohead/_/Paranoid+Android",
              },
            ],
          },
        }),
    });
    const result = await makeClient().getUserTopTracks("johndoe");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toHaveLength(1);
      expect(result.value[0]?.name).toBe("Paranoid Android");
      expect(result.value[0]?.artist).toBe("Radiohead");
      expect(result.value[0]?.mbid).toBe("track-mbid");
      expect(result.value[0]?.playcount).toBe(1234);
      expect(result.value[0]?.url).toBe(
        "https://www.last.fm/music/Radiohead/_/Paranoid+Android",
      );
    }
  });

  it("missing toptracks key returns ok([])", async () => {
    fetchMock.mockResolvedValue({
      status: 200,
      text: async () => JSON.stringify({ something: "else" }),
    });
    const result = await makeClient().getUserTopTracks("johndoe");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toHaveLength(0);
    }
  });

  it("non-array track value returns ok([])", async () => {
    fetchMock.mockResolvedValue({
      status: 200,
      text: async () =>
        JSON.stringify({ toptracks: { track: "not-an-array" } }),
    });
    const result = await makeClient().getUserTopTracks("johndoe");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toHaveLength(0);
    }
  });
});

describe("createLastFmClient - getUserLovedTracks", () => {
  const makeClient = (): ReturnType<typeof createLastFmClient> =>
    createLastFmClient({
      apiKey: "testkey",
      timeout: 5000,
      baseUrl: "https://ws.audioscrobbler.com/2.0/",
      language: "en",
    });

  it("happy path: maps all fields correctly", async () => {
    fetchMock.mockResolvedValue({
      status: 200,
      text: async () =>
        JSON.stringify({
          lovedtracks: {
            track: [
              {
                name: "Exit Music",
                artist: { name: "Radiohead" },
                mbid: "loved-mbid",
                url: "https://www.last.fm/music/Radiohead/_/Exit+Music",
              },
            ],
          },
        }),
    });
    const result = await makeClient().getUserLovedTracks("johndoe");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toHaveLength(1);
      expect(result.value[0]?.name).toBe("Exit Music");
      expect(result.value[0]?.artist).toBe("Radiohead");
      expect(result.value[0]?.mbid).toBe("loved-mbid");
      expect(result.value[0]?.url).toBe(
        "https://www.last.fm/music/Radiohead/_/Exit+Music",
      );
    }
  });

  it("maps empty mbid string to undefined", async () => {
    fetchMock.mockResolvedValue({
      status: 200,
      text: async () =>
        JSON.stringify({
          lovedtracks: {
            track: [
              {
                name: "Track",
                artist: { name: "Artist" },
                mbid: "",
                url: "https://last.fm",
              },
            ],
          },
        }),
    });
    const result = await makeClient().getUserLovedTracks("johndoe");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value[0]?.mbid).toBeUndefined();
    }
  });

  it("missing lovedtracks key returns ok([])", async () => {
    fetchMock.mockResolvedValue({
      status: 200,
      text: async () => JSON.stringify({ something: "else" }),
    });
    const result = await makeClient().getUserLovedTracks("johndoe");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toHaveLength(0);
    }
  });
});

describe("createLastFmClient - getUserRecentTracks", () => {
  const makeClient = (): ReturnType<typeof createLastFmClient> =>
    createLastFmClient({
      apiKey: "testkey",
      timeout: 5000,
      baseUrl: "https://ws.audioscrobbler.com/2.0/",
      language: "en",
    });

  it('happy path: maps artist["#text"] field correctly', async () => {
    fetchMock.mockResolvedValue({
      status: 200,
      text: async () =>
        JSON.stringify({
          recenttracks: {
            track: [
              {
                name: "Karma Police",
                artist: { "#text": "Radiohead" },
                url: "https://www.last.fm/music/Radiohead/_/Karma+Police",
              },
            ],
          },
        }),
    });
    const result = await makeClient().getUserRecentTracks("johndoe");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toHaveLength(1);
      expect(result.value[0]?.name).toBe("Karma Police");
      expect(result.value[0]?.artist).toBe("Radiohead");
      expect(result.value[0]?.url).toBe(
        "https://www.last.fm/music/Radiohead/_/Karma+Police",
      );
    }
  });

  it("missing recenttracks key returns ok([])", async () => {
    fetchMock.mockResolvedValue({
      status: 200,
      text: async () => JSON.stringify({ something: "else" }),
    });
    const result = await makeClient().getUserRecentTracks("johndoe");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toHaveLength(0);
    }
  });

  it("non-array track value returns ok([])", async () => {
    fetchMock.mockResolvedValue({
      status: 200,
      text: async () =>
        JSON.stringify({ recenttracks: { track: "not-an-array" } }),
    });
    const result = await makeClient().getUserRecentTracks("johndoe");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toHaveLength(0);
    }
  });

  it("non-record entry in track array is skipped", async () => {
    fetchMock.mockResolvedValue({
      status: 200,
      text: async () =>
        JSON.stringify({
          recenttracks: { track: ["not-a-record", null] },
        }),
    });
    const result = await makeClient().getUserRecentTracks("johndoe");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toHaveLength(0);
    }
  });
});

describe("createLastFmClient - getUserNeighbours", () => {
  const makeClient = (): ReturnType<typeof createLastFmClient> =>
    createLastFmClient({
      apiKey: "testkey",
      timeout: 5000,
      baseUrl: "https://ws.audioscrobbler.com/2.0/",
      language: "en",
    });

  it("happy path: maps all fields correctly, match is parseFloat'd", async () => {
    fetchMock.mockResolvedValue({
      status: 200,
      text: async () =>
        JSON.stringify({
          neighbours: {
            user: [
              {
                name: "neighbour1",
                url: "https://www.last.fm/user/neighbour1",
                match: "0.9123",
              },
            ],
          },
        }),
    });
    const result = await makeClient().getUserNeighbours("johndoe");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toHaveLength(1);
      expect(result.value[0]?.username).toBe("neighbour1");
      expect(result.value[0]?.url).toBe("https://www.last.fm/user/neighbour1");
      expect(result.value[0]?.match).toBeCloseTo(0.9123);
    }
  });

  it("missing neighbours key returns ok([])", async () => {
    fetchMock.mockResolvedValue({
      status: 200,
      text: async () => JSON.stringify({ something: "else" }),
    });
    const result = await makeClient().getUserNeighbours("johndoe");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toHaveLength(0);
    }
  });

  it("non-array user value returns ok([])", async () => {
    fetchMock.mockResolvedValue({
      status: 200,
      text: async () =>
        JSON.stringify({ neighbours: { user: "not-an-array" } }),
    });
    const result = await makeClient().getUserNeighbours("johndoe");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toHaveLength(0);
    }
  });

  it("non-record entry in user array is skipped", async () => {
    fetchMock.mockResolvedValue({
      status: 200,
      text: async () =>
        JSON.stringify({ neighbours: { user: ["not-a-record", null] } }),
    });
    const result = await makeClient().getUserNeighbours("johndoe");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toHaveLength(0);
    }
  });
});

describe("createLastFmClient - getRecommendedTracks", () => {
  const makeClient = (): ReturnType<typeof createLastFmClient> =>
    createLastFmClient({
      apiKey: "testkey",
      timeout: 5000,
      baseUrl: "https://ws.audioscrobbler.com/2.0/",
      language: "en",
    });

  it("happy path: maps all fields correctly", async () => {
    fetchMock.mockResolvedValue({
      status: 200,
      text: async () =>
        JSON.stringify({
          recommendations: {
            track: [
              {
                name: "How to Disappear Completely",
                artist: { name: "Radiohead" },
                url: "https://www.last.fm/music/Radiohead/_/How+to+Disappear",
              },
            ],
          },
        }),
    });
    const result = await makeClient().getRecommendedTracks(
      "session-key",
      "secret",
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toHaveLength(1);
      expect(result.value[0]?.name).toBe("How to Disappear Completely");
      expect(result.value[0]?.artist).toBe("Radiohead");
      expect(result.value[0]?.url).toBe(
        "https://www.last.fm/music/Radiohead/_/How+to+Disappear",
      );
    }
  });

  it("missing recommendations key returns ok([])", async () => {
    fetchMock.mockResolvedValue({
      status: 200,
      text: async () => JSON.stringify({ something: "else" }),
    });
    const result = await makeClient().getRecommendedTracks(
      "session-key",
      "secret",
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toHaveLength(0);
    }
  });

  it("non-array track value returns ok([])", async () => {
    fetchMock.mockResolvedValue({
      status: 200,
      text: async () =>
        JSON.stringify({ recommendations: { track: "not-an-array" } }),
    });
    const result = await makeClient().getRecommendedTracks(
      "session-key",
      "secret",
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toHaveLength(0);
    }
  });
});

describe("createLastFmClient - scrobble", () => {
  const makeClient = (): ReturnType<typeof createLastFmClient> =>
    createLastFmClient({
      apiKey: "testkey",
      timeout: 5000,
      baseUrl: "https://ws.audioscrobbler.com/2.0/",
      language: "en",
    });

  it("happy path: returns ok(undefined)", async () => {
    fetchMock.mockResolvedValue({
      status: 200,
      text: async () => JSON.stringify({}),
    });
    const result = await makeClient().scrobble({
      artist: "Radiohead",
      track: "Creep",
      timestamp: 1700000000,
      sessionKey: "session-key",
      sharedSecret: "secret",
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toBeUndefined();
    }
  });

  it("network failure returns err with NetworkError", async () => {
    fetchMock.mockRejectedValue(new Error("ECONNREFUSED"));
    const result = await makeClient().scrobble({
      artist: "Radiohead",
      track: "Creep",
      timestamp: 1700000000,
      sessionKey: "session-key",
      sharedSecret: "secret",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.type).toBe("NetworkError");
    }
  });

  it("scrobble with optional duration: returns ok(undefined)", async () => {
    fetchMock.mockResolvedValue({
      status: 200,
      text: async () => JSON.stringify({}),
    });
    const result = await makeClient().scrobble({
      artist: "Radiohead",
      track: "Creep",
      timestamp: 1700000000,
      duration: 238,
      sessionKey: "session-key",
      sharedSecret: "secret",
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toBeUndefined();
    }
  });
});

describe("createLastFmClient - love", () => {
  const makeClient = (): ReturnType<typeof createLastFmClient> =>
    createLastFmClient({
      apiKey: "testkey",
      timeout: 5000,
      baseUrl: "https://ws.audioscrobbler.com/2.0/",
      language: "en",
    });

  it("happy path: returns ok(undefined)", async () => {
    fetchMock.mockResolvedValue({
      status: 200,
      text: async () => JSON.stringify({}),
    });
    const result = await makeClient().love({
      artist: "Radiohead",
      track: "Creep",
      sessionKey: "session-key",
      sharedSecret: "secret",
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toBeUndefined();
    }
  });

  it("network failure returns err with NetworkError", async () => {
    fetchMock.mockRejectedValue(new Error("connection refused"));
    const result = await makeClient().love({
      artist: "Radiohead",
      track: "Creep",
      sessionKey: "session-key",
      sharedSecret: "secret",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.type).toBe("NetworkError");
    }
  });
});

describe("createLastFmClient - unlove", () => {
  const makeClient = (): ReturnType<typeof createLastFmClient> =>
    createLastFmClient({
      apiKey: "testkey",
      timeout: 5000,
      baseUrl: "https://ws.audioscrobbler.com/2.0/",
      language: "en",
    });

  it("happy path: returns ok(undefined)", async () => {
    fetchMock.mockResolvedValue({
      status: 200,
      text: async () => JSON.stringify({}),
    });
    const result = await makeClient().unlove({
      artist: "Radiohead",
      track: "Creep",
      sessionKey: "session-key",
      sharedSecret: "secret",
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toBeUndefined();
    }
  });

  it("network failure returns err with NetworkError", async () => {
    fetchMock.mockRejectedValue(new Error("connection refused"));
    const result = await makeClient().unlove({
      artist: "Radiohead",
      track: "Creep",
      sessionKey: "session-key",
      sharedSecret: "secret",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.type).toBe("NetworkError");
    }
  });
});
