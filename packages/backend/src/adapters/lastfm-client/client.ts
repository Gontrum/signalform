import { createHash } from "node:crypto";
import { ok, err, fromThrowable, type Result } from "@signalform/shared";
import type {
  LastFmConfig,
  LastFmError,
  SimilarTrack,
  SimilarArtist,
  ArtistInfo,
  AlbumInfo,
  ArtistTopTrack,
  ArtistTopAlbum,
  TagTopTrack,
  TagSearchResult,
  LastFmPeriod,
  UserTopArtist,
  UserTopTrack,
  UserLovedTrack,
  UserRecentTrack,
  UserNeighbour,
  RecommendedTrack,
  LastFmClient,
} from "./types.js";

// 50 is intentionally lower than last.fm's API default (100) to limit
// radio seed list size; callers can override via the limit parameter.
const DEFAULT_LIMIT = 50;
const LASTFM_NOT_FOUND_CODE = 6;

type JsonRecord = Readonly<Record<string, unknown>>;

const isRecord = (value: unknown): value is JsonRecord => {
  return typeof value === "object" && value !== null && !Array.isArray(value);
};

const getNestedRecord = (
  record: JsonRecord,
  key: string,
): JsonRecord | undefined => {
  const value = record[key];
  return isRecord(value) ? value : undefined;
};

const getApiError = (
  value: unknown,
): { readonly error: number; readonly message?: string } | null => {
  if (!isRecord(value) || typeof value["error"] !== "number") {
    return null;
  }

  return {
    error: value["error"],
    message:
      typeof value["message"] === "string" ? value["message"] : undefined,
  };
};

const extractTagNames = (value: unknown): readonly string[] => {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((entry): readonly string[] => {
    if (!isRecord(entry)) {
      return [];
    }

    return [String(entry["name"] ?? "")];
  });
};

const parseJson = (text: string): Result<unknown, LastFmError> => {
  return fromThrowable(
    () => JSON.parse(text),
    () => ({
      type: "ParseError",
      message: `Invalid JSON: ${text.slice(0, 100)}`,
    }),
  );
};

export const createLastFmClient = (config: LastFmConfig): LastFmClient => {
  const buildUrl = (
    params: Readonly<Record<string, string | number>>,
  ): string => {
    const base = new URL(config.baseUrl);
    Object.entries(params).forEach(([key, value]) => {
      base.searchParams.set(key, String(value));
    });
    base.searchParams.set("api_key", config.apiKey);
    base.searchParams.set("format", "json");
    return base.toString();
  };

  const buildSignedUrl = (
    params: Readonly<Record<string, string | number>>,
    sessionKey: string,
    sharedSecret: string,
  ): string => {
    const allParams: Readonly<Record<string, string>> = {
      ...Object.fromEntries(
        Object.entries(params).map(([k, v]) => [k, String(v)]),
      ),
      api_key: config.apiKey,
      sk: sessionKey,
    };
    const sigStr =
      Object.entries(allParams)
        .filter(([k]) => k !== "format" && k !== "callback")
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, v]) => `${k}${v}`)
        .join("") + sharedSecret;
    const sig = createHash("md5").update(sigStr).digest("hex");

    const base = new URL(config.baseUrl);
    Object.entries(allParams).forEach(([key, value]) => {
      base.searchParams.set(key, value);
    });
    base.searchParams.set("api_sig", sig);
    base.searchParams.set("format", "json");
    return base.toString();
  };

  const postSigned = async (
    params: Readonly<Record<string, string | number>>,
    sessionKey: string,
    sharedSecret: string,
  ): Promise<Result<unknown, LastFmError>> => {
    const allParams: Record<string, string> = {
      ...Object.fromEntries(
        Object.entries(params).map(([k, v]) => [k, String(v)]),
      ),
      api_key: config.apiKey,
      sk: sessionKey,
    };
    const sigStr =
      Object.entries(allParams)
        .filter(([k]) => k !== "format" && k !== "callback")
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, v]) => `${k}${v}`)
        .join("") + sharedSecret;
    const sig = createHash("md5").update(sigStr).digest("hex");

    const body = new URLSearchParams({
      ...allParams,
      api_sig: sig,
      format: "json",
    });

    const responseResult = await fetch(config.baseUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
      signal: AbortSignal.timeout(config.timeout),
    })
      .then<Result<Response, LastFmError>>((response) => ok(response))
      .catch<Result<Response, LastFmError>>((cause: unknown) => {
        if (cause instanceof DOMException && cause.name === "TimeoutError") {
          return err({
            type: "TimeoutError",
            message: "last.fm request timed out",
          });
        }
        const message =
          cause instanceof Error ? cause.message : "Unknown network error";
        return err({ type: "NetworkError", message });
      });

    if (!responseResult.ok) {
      return responseResult;
    }
    const response = responseResult.value;
    if (response.status === 429) {
      return err({
        type: "RateLimitError",
        message: "last.fm rate limit exceeded",
      });
    }
    const text = await response.text();
    const parseResult = parseJson(text);
    if (!parseResult.ok) {
      return parseResult;
    }
    const maybeError = getApiError(parseResult.value);
    if (maybeError !== null) {
      if (maybeError.error === LASTFM_NOT_FOUND_CODE) {
        return err({
          type: "NotFoundError",
          code: maybeError.error,
          message: maybeError.message ?? "Not found",
        });
      }
      return err({
        type: "ApiError",
        code: maybeError.error,
        message: maybeError.message ?? "Unknown last.fm error",
      });
    }
    return ok(parseResult.value);
  };

  const fetchJson = async (
    url: string,
  ): Promise<Result<unknown, LastFmError>> => {
    const responseResult = await fetch(url, {
      signal: AbortSignal.timeout(config.timeout),
    })
      .then<Result<Response, LastFmError>>((response) => ok(response))
      .catch<Result<Response, LastFmError>>((cause: unknown) => {
        if (cause instanceof DOMException && cause.name === "TimeoutError") {
          return err({
            type: "TimeoutError",
            message: "last.fm request timed out",
          });
        }

        const message =
          cause instanceof Error ? cause.message : "Unknown network error";
        return err({ type: "NetworkError", message });
      });

    if (!responseResult.ok) {
      return responseResult;
    }

    const response = responseResult.value;

    if (response.status === 429) {
      return err({
        type: "RateLimitError",
        message: "last.fm rate limit exceeded",
      });
    }

    const text = await response.text();
    const parseResult = parseJson(text);
    if (!parseResult.ok) {
      return parseResult;
    }

    const maybeError = getApiError(parseResult.value);
    if (maybeError !== null) {
      if (maybeError.error === LASTFM_NOT_FOUND_CODE) {
        return err({
          type: "NotFoundError",
          code: maybeError.error,
          message: maybeError.message ?? "Not found",
        });
      }

      return err({
        type: "ApiError",
        code: maybeError.error,
        message: maybeError.message ?? "Unknown last.fm error",
      });
    }

    return ok(parseResult.value);
  };

  return {
    getSimilarTracks: async (
      artist,
      track,
      limit = DEFAULT_LIMIT,
    ): Promise<Result<readonly SimilarTrack[], LastFmError>> => {
      const url = buildUrl({
        method: "track.getSimilar",
        artist,
        track,
        limit,
      });
      const result = await fetchJson(url);
      if (!result.ok) {
        return result;
      }

      const similarTracksRecord = isRecord(result.value)
        ? getNestedRecord(result.value, "similartracks")
        : undefined;
      const tracks = similarTracksRecord?.["track"];
      if (!Array.isArray(tracks)) {
        return ok([]);
      }

      const mapped: readonly SimilarTrack[] = tracks.flatMap(
        (trackValue): readonly SimilarTrack[] => {
          if (!isRecord(trackValue)) {
            return [];
          }

          const artistRecord = getNestedRecord(trackValue, "artist");
          const mbidStr = String(trackValue["mbid"] ?? "");
          const duration = Number(trackValue["duration"] ?? 0);

          return [
            {
              name: String(trackValue["name"] ?? ""),
              artist: String(artistRecord?.["name"] ?? ""),
              mbid: mbidStr !== "" ? mbidStr : undefined,
              match: Number(trackValue["match"] ?? 0),
              duration: duration > 0 ? duration : undefined,
              url: String(trackValue["url"] ?? ""),
            },
          ];
        },
      );

      return ok(mapped);
    },

    getSimilarArtists: async (
      artist,
      limit = DEFAULT_LIMIT,
    ): Promise<Result<readonly SimilarArtist[], LastFmError>> => {
      const url = buildUrl({ method: "artist.getSimilar", artist, limit });
      const result = await fetchJson(url);
      if (!result.ok) {
        return result;
      }

      const similarArtistsRecord = isRecord(result.value)
        ? getNestedRecord(result.value, "similarartists")
        : undefined;
      const artists = similarArtistsRecord?.["artist"];
      if (!Array.isArray(artists)) {
        return ok([]);
      }

      const mapped: readonly SimilarArtist[] = artists.flatMap(
        (artistValue): readonly SimilarArtist[] => {
          if (!isRecord(artistValue)) {
            return [];
          }

          const mbidStr = String(artistValue["mbid"] ?? "");
          return [
            {
              name: String(artistValue["name"] ?? ""),
              mbid: mbidStr !== "" ? mbidStr : undefined,
              match: Number(artistValue["match"] ?? 0),
              url: String(artistValue["url"] ?? ""),
            },
          ];
        },
      );

      return ok(mapped);
    },

    getArtistInfo: async (
      artist,
      language,
    ): Promise<Result<ArtistInfo, LastFmError>> => {
      const url = buildUrl({
        method: "artist.getInfo",
        artist,
        ...(language ? { lang: language } : {}),
      });
      const result = await fetchJson(url);
      if (!result.ok) {
        return result;
      }

      const artistRecord = isRecord(result.value)
        ? getNestedRecord(result.value, "artist")
        : undefined;
      if (artistRecord === undefined) {
        return err({
          type: "NotFoundError",
          code: 0,
          message: "Artist not found in response",
        });
      }

      const statsRecord = getNestedRecord(artistRecord, "stats");
      const tagsRecord = getNestedRecord(artistRecord, "tags");
      const bioRecord = getNestedRecord(artistRecord, "bio");
      const mbidStr = String(artistRecord["mbid"] ?? "");

      return ok({
        name: String(artistRecord["name"] ?? ""),
        mbid: mbidStr !== "" ? mbidStr : undefined,
        listeners: parseInt(String(statsRecord?.["listeners"] ?? "0"), 10),
        playcount: parseInt(String(statsRecord?.["playcount"] ?? "0"), 10),
        tags: extractTagNames(tagsRecord?.["tag"]),
        bio: String(bioRecord?.["summary"] ?? ""),
      });
    },

    getAlbumInfo: async (
      artist,
      album,
      language,
    ): Promise<Result<AlbumInfo, LastFmError>> => {
      const url = buildUrl({
        method: "album.getInfo",
        artist,
        album,
        ...(language ? { lang: language } : {}),
      });
      const result = await fetchJson(url);
      if (!result.ok) {
        return result;
      }

      const albumRecord = isRecord(result.value)
        ? getNestedRecord(result.value, "album")
        : undefined;
      if (albumRecord === undefined) {
        return err({
          type: "NotFoundError",
          code: 0,
          message: "Album not found in response",
        });
      }

      const tagsRecord = getNestedRecord(albumRecord, "tags");
      const wikiRecord = getNestedRecord(albumRecord, "wiki");
      const mbidStr = String(albumRecord["mbid"] ?? "");

      return ok({
        name: String(albumRecord["name"] ?? ""),
        mbid: mbidStr !== "" ? mbidStr : undefined,
        listeners: parseInt(String(albumRecord["listeners"] ?? "0"), 10),
        playcount: parseInt(String(albumRecord["playcount"] ?? "0"), 10),
        tags: extractTagNames(tagsRecord?.["tag"]),
        wiki: String(wikiRecord?.["summary"] ?? ""),
      });
    },

    getArtistTopTracks: async (
      artist,
      limit = DEFAULT_LIMIT,
    ): Promise<Result<readonly ArtistTopTrack[], LastFmError>> => {
      const url = buildUrl({ method: "artist.getTopTracks", artist, limit });
      const result = await fetchJson(url);
      if (!result.ok) {
        return result;
      }

      const topTracksRecord = isRecord(result.value)
        ? getNestedRecord(result.value, "toptracks")
        : undefined;
      const tracks = topTracksRecord?.["track"];
      if (!Array.isArray(tracks)) {
        return ok([]);
      }

      const mapped: readonly ArtistTopTrack[] = tracks.flatMap(
        (trackValue): readonly ArtistTopTrack[] => {
          if (!isRecord(trackValue)) {
            return [];
          }

          const artistRecord = getNestedRecord(trackValue, "artist");
          const mbidStr = String(trackValue["mbid"] ?? "");
          return [
            {
              name: String(trackValue["name"] ?? ""),
              artist: String(artistRecord?.["name"] ?? artist),
              mbid: mbidStr !== "" ? mbidStr : undefined,
              playcount: parseInt(String(trackValue["playcount"] ?? "0"), 10),
              listeners: parseInt(String(trackValue["listeners"] ?? "0"), 10),
              url: String(trackValue["url"] ?? ""),
            },
          ];
        },
      );

      return ok(mapped);
    },

    getArtistTopAlbums: async (
      artist,
      limit = DEFAULT_LIMIT,
    ): Promise<Result<readonly ArtistTopAlbum[], LastFmError>> => {
      const url = buildUrl({ method: "artist.getTopAlbums", artist, limit });
      const result = await fetchJson(url);
      if (!result.ok) {
        return result;
      }

      const topAlbumsRecord = isRecord(result.value)
        ? getNestedRecord(result.value, "topalbums")
        : undefined;
      const albums = topAlbumsRecord?.["album"];
      if (!Array.isArray(albums)) {
        return ok([]);
      }

      const mapped: readonly ArtistTopAlbum[] = albums.flatMap(
        (albumValue): readonly ArtistTopAlbum[] => {
          if (!isRecord(albumValue)) {
            return [];
          }

          const artistRecord = getNestedRecord(albumValue, "artist");
          const mbidStr = String(albumValue["mbid"] ?? "");
          return [
            {
              name: String(albumValue["name"] ?? ""),
              artist: String(artistRecord?.["name"] ?? artist),
              mbid: mbidStr !== "" ? mbidStr : undefined,
              playcount: parseInt(String(albumValue["playcount"] ?? "0"), 10),
              url: String(albumValue["url"] ?? ""),
            },
          ];
        },
      );

      return ok(mapped);
    },

    getTagTopTracks: async (
      tag,
      page = 1,
      limit = DEFAULT_LIMIT,
    ): Promise<Result<readonly TagTopTrack[], LastFmError>> => {
      const url = buildUrl({ method: "tag.getTopTracks", tag, page, limit });
      const result = await fetchJson(url);
      if (!result.ok) {
        return result;
      }

      const topTracksRecord = isRecord(result.value)
        ? getNestedRecord(result.value, "tracks")
        : undefined;
      const tracks = topTracksRecord?.["track"];
      if (!Array.isArray(tracks)) {
        return ok([]);
      }

      const mapped: readonly TagTopTrack[] = tracks.flatMap(
        (trackValue): readonly TagTopTrack[] => {
          if (!isRecord(trackValue)) {
            return [];
          }
          const artistRecord = getNestedRecord(trackValue, "artist");
          const mbidStr = String(trackValue["mbid"] ?? "");
          return [
            {
              name: String(trackValue["name"] ?? ""),
              artist: String(artistRecord?.["name"] ?? ""),
              mbid: mbidStr !== "" ? mbidStr : undefined,
              url: String(trackValue["url"] ?? ""),
            },
          ];
        },
      );

      return ok(mapped);
    },

    searchTags: async (
      query,
      limit = 10,
    ): Promise<Result<readonly TagSearchResult[], LastFmError>> => {
      const url = buildUrl({ method: "tag.search", tag: query, limit });
      const result = await fetchJson(url);
      if (!result.ok) {
        return result;
      }

      const resultsRecord = isRecord(result.value)
        ? getNestedRecord(result.value, "results")
        : undefined;
      const tagMatchesRecord = resultsRecord
        ? getNestedRecord(resultsRecord, "tagmatches")
        : undefined;
      const tags = tagMatchesRecord?.["tag"];
      if (!Array.isArray(tags)) {
        return ok([]);
      }

      const mapped: readonly TagSearchResult[] = tags.flatMap(
        (tagValue): readonly TagSearchResult[] => {
          if (!isRecord(tagValue)) {
            return [];
          }
          return [
            {
              name: String(tagValue["name"] ?? ""),
              count: parseInt(String(tagValue["count"] ?? "0"), 10),
              url: String(tagValue["url"] ?? ""),
            },
          ];
        },
      );

      return ok(mapped);
    },

    getUserTopArtists: async (
      username,
      period: LastFmPeriod = "overall",
      limit = DEFAULT_LIMIT,
    ): Promise<Result<readonly UserTopArtist[], LastFmError>> => {
      const url = buildUrl({
        method: "user.getTopArtists",
        user: username,
        period,
        limit,
      });
      const result = await fetchJson(url);
      if (!result.ok) {
        return result;
      }

      const topArtistsRecord = isRecord(result.value)
        ? getNestedRecord(result.value, "topartists")
        : undefined;
      const artists = topArtistsRecord?.["artist"];
      if (!Array.isArray(artists)) {
        return ok([]);
      }

      const mapped: readonly UserTopArtist[] = artists.flatMap(
        (entry): readonly UserTopArtist[] => {
          if (!isRecord(entry)) {
            return [];
          }
          const mbidStr = String(entry["mbid"] ?? "");
          return [
            {
              name: String(entry["name"] ?? ""),
              mbid: mbidStr !== "" ? mbidStr : undefined,
              playcount: parseInt(String(entry["playcount"] ?? "0"), 10),
              url: String(entry["url"] ?? ""),
            },
          ];
        },
      );

      return ok(mapped);
    },

    getUserTopTracks: async (
      username,
      period: LastFmPeriod = "overall",
      limit = DEFAULT_LIMIT,
    ): Promise<Result<readonly UserTopTrack[], LastFmError>> => {
      const url = buildUrl({
        method: "user.getTopTracks",
        user: username,
        period,
        limit,
      });
      const result = await fetchJson(url);
      if (!result.ok) {
        return result;
      }

      const topTracksRecord = isRecord(result.value)
        ? getNestedRecord(result.value, "toptracks")
        : undefined;
      const tracks = topTracksRecord?.["track"];
      if (!Array.isArray(tracks)) {
        return ok([]);
      }

      const mapped: readonly UserTopTrack[] = tracks.flatMap(
        (entry): readonly UserTopTrack[] => {
          if (!isRecord(entry)) {
            return [];
          }
          const artistRecord = getNestedRecord(entry, "artist");
          const mbidStr = String(entry["mbid"] ?? "");
          return [
            {
              name: String(entry["name"] ?? ""),
              artist: String(artistRecord?.["name"] ?? ""),
              mbid: mbidStr !== "" ? mbidStr : undefined,
              playcount: parseInt(String(entry["playcount"] ?? "0"), 10),
              url: String(entry["url"] ?? ""),
            },
          ];
        },
      );

      return ok(mapped);
    },

    getUserLovedTracks: async (
      username,
      limit = DEFAULT_LIMIT,
    ): Promise<Result<readonly UserLovedTrack[], LastFmError>> => {
      const url = buildUrl({
        method: "user.getLovedTracks",
        user: username,
        limit,
      });
      const result = await fetchJson(url);
      if (!result.ok) {
        return result;
      }

      const lovedTracksRecord = isRecord(result.value)
        ? getNestedRecord(result.value, "lovedtracks")
        : undefined;
      const tracks = lovedTracksRecord?.["track"];
      if (!Array.isArray(tracks)) {
        return ok([]);
      }

      const mapped: readonly UserLovedTrack[] = tracks.flatMap(
        (entry): readonly UserLovedTrack[] => {
          if (!isRecord(entry)) {
            return [];
          }
          const artistRecord = getNestedRecord(entry, "artist");
          const mbidStr = String(entry["mbid"] ?? "");
          return [
            {
              name: String(entry["name"] ?? ""),
              artist: String(artistRecord?.["name"] ?? ""),
              mbid: mbidStr !== "" ? mbidStr : undefined,
              url: String(entry["url"] ?? ""),
            },
          ];
        },
      );

      return ok(mapped);
    },

    getUserRecentTracks: async (
      username,
      limit = DEFAULT_LIMIT,
    ): Promise<Result<readonly UserRecentTrack[], LastFmError>> => {
      const url = buildUrl({
        method: "user.getRecentTracks",
        user: username,
        limit,
      });
      const result = await fetchJson(url);
      if (!result.ok) {
        return result;
      }

      const recentTracksRecord = isRecord(result.value)
        ? getNestedRecord(result.value, "recenttracks")
        : undefined;
      const tracks = recentTracksRecord?.["track"];
      if (!Array.isArray(tracks)) {
        return ok([]);
      }

      // recentTracks artist field uses "#text" key, not "name"
      const mapped: readonly UserRecentTrack[] = tracks.flatMap(
        (entry): readonly UserRecentTrack[] => {
          if (!isRecord(entry)) {
            return [];
          }
          const artistRecord = getNestedRecord(entry, "artist");
          const artistName = String(
            artistRecord?.["#text"] ?? artistRecord?.["name"] ?? "",
          );
          return [
            {
              name: String(entry["name"] ?? ""),
              artist: artistName,
              url: String(entry["url"] ?? ""),
            },
          ];
        },
      );

      return ok(mapped);
    },

    getUserNeighbours: async (
      username,
      limit = 10,
    ): Promise<Result<readonly UserNeighbour[], LastFmError>> => {
      const url = buildUrl({
        method: "user.getNeighbours",
        user: username,
        limit,
      });
      const result = await fetchJson(url);
      if (!result.ok) {
        return result;
      }

      const neighboursRecord = isRecord(result.value)
        ? getNestedRecord(result.value, "neighbours")
        : undefined;
      const users = neighboursRecord?.["user"];
      if (!Array.isArray(users)) {
        return ok([]);
      }

      const mapped: readonly UserNeighbour[] = users.flatMap(
        (entry): readonly UserNeighbour[] => {
          if (!isRecord(entry)) {
            return [];
          }
          return [
            {
              username: String(entry["name"] ?? ""),
              url: String(entry["url"] ?? ""),
              match: parseFloat(String(entry["match"] ?? "0")),
            },
          ];
        },
      );

      return ok(mapped);
    },

    getRecommendedTracks: async (
      sessionKey,
      sharedSecret,
      limit = DEFAULT_LIMIT,
    ): Promise<Result<readonly RecommendedTrack[], LastFmError>> => {
      const url = buildSignedUrl(
        { method: "user.getRecommendedTracks", limit },
        sessionKey,
        sharedSecret,
      );
      const result = await fetchJson(url);
      if (!result.ok) {
        return result;
      }

      const recommendationsRecord = isRecord(result.value)
        ? getNestedRecord(result.value, "recommendations")
        : undefined;
      const tracks = recommendationsRecord?.["track"];
      if (!Array.isArray(tracks)) {
        return ok([]);
      }

      const mapped: readonly RecommendedTrack[] = tracks.flatMap(
        (entry): readonly RecommendedTrack[] => {
          if (!isRecord(entry)) {
            return [];
          }
          const artistRecord = getNestedRecord(entry, "artist");
          return [
            {
              name: String(entry["name"] ?? ""),
              artist: String(artistRecord?.["name"] ?? ""),
              url: String(entry["url"] ?? ""),
            },
          ];
        },
      );

      return ok(mapped);
    },

    nowPlaying: async ({
      artist,
      track,
      duration,
      sessionKey,
      sharedSecret,
    }): Promise<Result<void, LastFmError>> => {
      const params: Record<string, string | number> = {
        method: "track.updateNowPlaying",
        artist,
        track,
        ...(duration !== undefined ? { duration } : {}),
      };
      const result = await postSigned(params, sessionKey, sharedSecret);
      return result.ok ? ok(undefined) : result;
    },

    scrobble: async ({
      artist,
      track,
      timestamp,
      duration,
      sessionKey,
      sharedSecret,
    }): Promise<Result<void, LastFmError>> => {
      const params: Record<string, string | number> = {
        method: "track.scrobble",
        artist,
        track,
        timestamp,
        ...(duration !== undefined ? { duration } : {}),
      };
      const result = await postSigned(params, sessionKey, sharedSecret);
      return result.ok ? ok(undefined) : result;
    },

    love: async ({
      artist,
      track,
      sessionKey,
      sharedSecret,
    }): Promise<Result<void, LastFmError>> => {
      const result = await postSigned(
        { method: "track.love", artist, track },
        sessionKey,
        sharedSecret,
      );
      return result.ok ? ok(undefined) : result;
    },

    unlove: async ({
      artist,
      track,
      sessionKey,
      sharedSecret,
    }): Promise<Result<void, LastFmError>> => {
      const result = await postSigned(
        { method: "track.unlove", artist, track },
        sessionKey,
        sharedSecret,
      );
      return result.ok ? ok(undefined) : result;
    },

    getCircuitState: () => "CLOSED" as const,
  };
};
