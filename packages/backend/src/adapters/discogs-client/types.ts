import type { Result } from "@signalform/shared";

export type DiscogsSearchResult = {
  readonly title: string;
  readonly year?: number;
  readonly coverImageUrl?: string;
};

export type DiscogsError =
  | { readonly type: "NetworkError"; readonly message: string }
  | { readonly type: "TimeoutError"; readonly message: string }
  | { readonly type: "ParseError"; readonly message: string }
  | {
      readonly type: "HttpError";
      readonly status: number;
      readonly message: string;
    };

export type DiscogsClient = {
  readonly searchReleases: (
    query: string,
  ) => Promise<Result<readonly DiscogsSearchResult[], DiscogsError>>;
};
