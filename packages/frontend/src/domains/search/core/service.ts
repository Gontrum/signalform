import { rankByRelevance } from '@/utils/searchRanking'
import type {
  AlbumResult,
  ArtistResult,
  SearchApiError,
  SearchResultsResponse,
  TrackResult,
} from './types'

const TRACK_LIMIT = 20
const ALBUM_LIMIT = 5
const ARTIST_LIMIT = 5

export const mapSearchErrorMessage = (error: SearchApiError): string => {
  switch (error.type) {
    case 'TIMEOUT_ERROR':
      return 'Request timed out - music server may be slow'
    case 'NETWORK_ERROR':
      return 'Cannot connect to server'
    case 'SERVER_ERROR':
      if (error.message.includes('LMS not reachable')) {
        return 'Music server not reachable'
      }
      return error.message
    case 'ABORT_ERROR':
      return 'Request was cancelled'
    default:
      return 'An error occurred'
  }
}

export const getDisplayedTrackResults = (
  query: string,
  fullResults: SearchResultsResponse | null,
): readonly TrackResult[] =>
  rankByRelevance(query, fullResults?.tracks ?? [], (track) => track.title).slice(0, TRACK_LIMIT)

export const getDisplayedAlbumResults = (
  query: string,
  fullResults: SearchResultsResponse | null,
): readonly AlbumResult[] =>
  rankByRelevance(query, fullResults?.albums ?? [], (album) => album.title).slice(0, ALBUM_LIMIT)

export const getDisplayedArtistResults = (
  query: string,
  fullResults: SearchResultsResponse | null,
): readonly ArtistResult[] =>
  rankByRelevance(query, fullResults?.artists ?? [], (artist) => artist.name).slice(0, ARTIST_LIMIT)
