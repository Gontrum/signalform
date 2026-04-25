export type SimilarArtist = {
  readonly name: string;
  readonly mbid?: string;
  readonly match: number;
  readonly url: string;
};

export type ArtistEnrichment = {
  readonly name: string;
  readonly mbid?: string;
  readonly listeners: number;
  readonly playcount: number;
  readonly tags: readonly string[];
  /** Raw HTML from last.fm bio.summary — may contain <a> tags */
  readonly bio: string;
};

export type AlbumEnrichment = {
  readonly name: string;
  readonly mbid?: string;
  readonly listeners: number;
  readonly playcount: number;
  readonly tags: readonly string[];
  /** Raw HTML from last.fm wiki.summary */
  readonly wiki: string;
};

export type EnrichmentError =
  | { readonly type: "NotFound"; readonly message: string }
  | { readonly type: "Unavailable"; readonly message: string };

export type LastFmArtistInfo = {
  readonly name: string;
  readonly mbid?: string;
  readonly listeners: number;
  readonly playcount: number;
  readonly tags: readonly string[];
  readonly bio: string;
};

export type LastFmAlbumInfo = {
  readonly name: string;
  readonly mbid?: string;
  readonly listeners: number;
  readonly playcount: number;
  readonly tags: readonly string[];
  readonly wiki: string;
};

export type LastFmServiceError = {
  readonly type: string;
  readonly message: string;
};
