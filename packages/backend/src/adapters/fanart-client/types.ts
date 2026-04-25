import type { Result } from "@signalform/shared";

export type FanartError =
  | { readonly type: "NetworkError"; readonly message: string }
  | { readonly type: "TimeoutError"; readonly message: string }
  | { readonly type: "ParseError"; readonly message: string }
  | { readonly type: "NotFoundError"; readonly message: string };

export type FanartClient = {
  readonly getArtistImages: (
    mbid: string,
  ) => Promise<Result<string | null, FanartError>>;
};
