import type { Result, TagDescriptor } from "@signalform/shared";

export type DiscogsSearchResult = {
  readonly title: string;
  readonly year?: number;
  readonly coverImageUrl?: string;
};

export type DiscogsQuery = {
  readonly tag: TagDescriptor;
  readonly text?: string;
};

// totalItems is Discogs' own corpus total, not the length of results —
// results stays capped by the client's page limit.
export type DiscogsSearchPage = {
  readonly results: readonly DiscogsSearchResult[];
  readonly totalItems: number;
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
    query: DiscogsQuery,
  ) => Promise<Result<DiscogsSearchPage, DiscogsError>>;
};
