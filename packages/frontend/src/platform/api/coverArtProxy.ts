const playbackCoverProxyPrefix = '/api/playback/cover?src='

export function proxyCoverArtUrl(coverArtUrl: string): string
export function proxyCoverArtUrl(coverArtUrl: string | null): string | null
export function proxyCoverArtUrl(coverArtUrl: string | undefined): string | undefined
export function proxyCoverArtUrl(coverArtUrl: null): null
export function proxyCoverArtUrl(coverArtUrl: undefined): undefined
export function proxyCoverArtUrl(
  coverArtUrl: string | null | undefined,
): string | null | undefined {
  if (
    coverArtUrl === undefined ||
    coverArtUrl === null ||
    coverArtUrl === '' ||
    coverArtUrl.startsWith(playbackCoverProxyPrefix) ||
    !coverArtUrl.startsWith('http://')
  ) {
    return coverArtUrl
  }

  return `${playbackCoverProxyPrefix}${encodeURIComponent(coverArtUrl)}`
}
