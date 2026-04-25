import type { ArtistApiError, ArtistByNameAlbum } from './types'

export const getArtistIdParam = (value: unknown): string => (typeof value === 'string' ? value : '')

export const isTidalArtistMode = (value: unknown): boolean => value === 'tidal'

export const getArtistNameQuery = (value: unknown): string =>
  typeof value === 'string' ? value : ''

export const getHistoryArtistName = (value: unknown): string =>
  typeof value === 'string' ? value : ''

export const getArtistErrorStatus = (error: ArtistApiError): 'error-not-found' | 'error-server' =>
  error.type === 'NOT_FOUND' ? 'error-not-found' : 'error-server'

export const getAlbumDetailId = (album: ArtistByNameAlbum): string => album.albumId ?? album.id

export const setCoverError = (
  current: Readonly<Record<string, boolean>>,
  albumId: string,
): Record<string, boolean> => ({
  ...current,
  [albumId]: true,
})
