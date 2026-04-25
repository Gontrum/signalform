import { ok, err, fromThrowable, type Result } from "@signalform/shared";
import type {
  LastFmConfig,
  LastFmError,
  SimilarTrack,
  SimilarArtist,
  ArtistInfo,
  AlbumInfo,
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

    getCircuitState: () => "CLOSED" as const,
  };
};
