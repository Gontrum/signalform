import { ok, err, fromThrowable, type Result } from "@signalform/shared";
import type { FanartClient, FanartError } from "./types.js";

const FANART_BASE_URL = "https://webservice.fanart.tv/v3/music";
const REQUEST_TIMEOUT_MS = 5000;

type FanartImage = {
  readonly url: string;
  readonly likes: string;
};

type FanartArtistResponse = {
  readonly artistbackground?: readonly FanartImage[];
  readonly artistthumb?: readonly FanartImage[];
};

const isRecord = (
  value: unknown,
): value is Readonly<Record<string, unknown>> => {
  return typeof value === "object" && value !== null && !Array.isArray(value);
};

const parseImages = (value: unknown): readonly FanartImage[] => {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((entry): readonly FanartImage[] => {
    if (
      !isRecord(entry) ||
      typeof entry["url"] !== "string" ||
      typeof entry["likes"] !== "string"
    ) {
      return [];
    }

    return [{ url: entry["url"], likes: entry["likes"] }];
  });
};

const parseFanartArtistResponse = (value: unknown): FanartArtistResponse => {
  if (!isRecord(value)) {
    return {};
  }

  return {
    artistbackground: parseImages(value["artistbackground"]),
    artistthumb: parseImages(value["artistthumb"]),
  };
};

const parseJson = (text: string): Result<unknown, FanartError> => {
  return fromThrowable(
    () => JSON.parse(text),
    () => ({
      type: "ParseError",
      message: `Invalid JSON: ${text.slice(0, 100)}`,
    }),
  );
};

const pickBestBackground = (
  backgrounds: readonly FanartImage[],
): string | null => {
  if (backgrounds.length === 0) {
    return null;
  }
  const sorted = [...backgrounds].sort(
    (a, b) => parseInt(b.likes, 10) - parseInt(a.likes, 10),
  );
  const first = sorted[0];
  return first !== undefined ? first.url : null;
};

export const createFanartClient = (apiKey: string): FanartClient => {
  return {
    getArtistImages: async (
      mbid: string,
    ): Promise<Result<string | null, FanartError>> => {
      const url = `${FANART_BASE_URL}/${mbid}?api_key=${apiKey}`;
      const responseResult = await fetch(url, {
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      })
        .then<Result<Response, FanartError>>((response) => ok(response))
        .catch<Result<Response, FanartError>>((cause: unknown) => {
          if (cause instanceof DOMException && cause.name === "TimeoutError") {
            return err({
              type: "TimeoutError",
              message: "Fanart.tv request timed out",
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

      if (response.status === 404) {
        return err({
          type: "NotFoundError",
          message: "Artist not found on Fanart.tv",
        });
      }

      const text = await response.text();
      const parseResult = parseJson(text);
      if (!parseResult.ok) {
        return parseResult;
      }

      const data = parseFanartArtistResponse(parseResult.value);

      const backgrounds = data.artistbackground ?? [];
      const thumbs = data.artistthumb ?? [];

      const backgroundUrl = pickBestBackground(backgrounds);
      if (backgroundUrl !== null) {
        return ok(backgroundUrl);
      }

      if (thumbs.length > 0) {
        const firstThumb = thumbs[0];
        return ok(firstThumb !== undefined ? firstThumb.url : null);
      }

      return ok(null);
    },
  };
};
