import { onMounted, ref } from 'vue'
import type { Ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { isTidalAlbumId } from '@signalform/shared'
import type { AlbumEnrichment, EnrichmentErrorState } from '@/platform/api/enrichmentApi'
import { getAlbumEnrichment, mapEnrichmentError } from '@/platform/api/enrichmentApi'
import { playAlbum, playTidalSearchAlbum, playTrack } from '@/platform/api/playbackApi'
import { getTidalAlbumTracks, resolveAlbum } from '@/platform/api/tidalAlbumsApi'
import { useTransientSet } from '@/app/useTransientSet'
import { addAlbumToQueue, addTidalSearchAlbumToQueue, addToQueue } from '@/platform/api/queueApi'
import { getAlbumDetail } from '@/platform/api/albumApi'
import { getHistoryStateValue } from '@/utils/historyState'
import {
  detectSource,
  formatDuration,
  getAlbumErrorStatus,
  getAlbumIdParam,
  getHistoryString,
  getHistoryStringArray,
  parseTidalAudioQuality,
  toTidalSearchFallbackAlbum,
} from '../core/service'
import type { AlbumDetailResponse, AlbumDetailStatus } from '../core/types'

type UseAlbumDetailViewResult = {
  readonly albumId: string
  readonly status: Ref<AlbumDetailStatus>
  readonly album: Ref<AlbumDetailResponse | null>
  readonly errorMessage: Ref<string>
  readonly coverError: Ref<boolean>
  readonly enrichment: Ref<AlbumEnrichment | null>
  readonly albumEnrichmentLoading: Ref<boolean>
  readonly albumEnrichmentError: Ref<EnrichmentErrorState>
  readonly queueSuccessUrls: ReturnType<typeof useTransientSet<string>>
  readonly queueErrorUrls: ReturnType<typeof useTransientSet<string>>
  readonly albumQueueSuccessFlag: ReturnType<typeof useTransientSet<string>>
  readonly albumQueueErrorFlag: ReturnType<typeof useTransientSet<string>>
  readonly albumQueueKey: 'album'
  readonly onCoverError: () => void
  readonly handlePlayAlbum: () => Promise<void>
  readonly handlePlayTrack: (trackUrl: string) => Promise<void>
  readonly handleAddTrackToQueue: (url: string) => Promise<void>
  readonly handleAddAlbumToQueue: () => Promise<void>
  readonly goBack: () => void
  readonly handleArtistClick: () => void
  readonly formatDuration: (seconds: number) => string
  readonly detectSource: (url: string) => 'local' | 'qobuz' | 'tidal' | 'unknown'
}

export const useAlbumDetailView = (): UseAlbumDetailViewResult => {
  const route = useRoute()
  const router = useRouter()

  const albumId = getAlbumIdParam(route.params['albumId'])
  const tidalArtistId = getHistoryString(getHistoryStateValue('tidalArtistId'))
  const isTidalSearchPath = route.name === 'tidal-search-album'
  const resolvedAlbumId = ref<string | null>(null)

  const tidalSearchTitle = getHistoryString(getHistoryStateValue('title'))
  const tidalSearchArtist = getHistoryString(getHistoryStateValue('artist'))
  const tidalSearchCoverArtUrlRaw = getHistoryStateValue('coverArtUrl')
  const tidalSearchCoverArtUrl =
    typeof tidalSearchCoverArtUrlRaw === 'string' ? tidalSearchCoverArtUrlRaw : null
  const tidalSearchTrackUrls = getHistoryStringArray(getHistoryStateValue('trackUrls'))
  const tidalSearchTrackTitles = getHistoryStringArray(getHistoryStateValue('trackTitles'))

  const status = ref<AlbumDetailStatus>('loading')
  const album = ref<AlbumDetailResponse | null>(null)
  const errorMessage = ref('')
  const coverError = ref(false)
  const enrichment = ref<AlbumEnrichment | null>(null)
  const albumEnrichmentLoading = ref(false)
  const albumEnrichmentError = ref<EnrichmentErrorState>({ kind: 'none' })

  const queueSuccessUrls = useTransientSet<string>(1500)
  const queueErrorUrls = useTransientSet<string>(2000)
  const albumQueueSuccessFlag = useTransientSet<string>(1500)
  const albumQueueErrorFlag = useTransientSet<string>(2000)
  const albumQueueKey = 'album' as const

  const loadEnrichment = async (artist: string, title: string): Promise<void> => {
    if (artist === '' || title === '') {
      return
    }
    albumEnrichmentLoading.value = true
    albumEnrichmentError.value = { kind: 'none' }
    const enrichmentResult = await getAlbumEnrichment(artist, title)
    if (enrichmentResult.ok) {
      enrichment.value = enrichmentResult.value
      albumEnrichmentError.value = { kind: 'none' }
    } else {
      enrichment.value = null
      albumEnrichmentError.value = mapEnrichmentError(enrichmentResult.error)
    }
    albumEnrichmentLoading.value = false
  }

  onMounted(async () => {
    if (isTidalSearchPath) {
      const resolveResult = await resolveAlbum(tidalSearchTitle, tidalSearchArtist)
      if (resolveResult.ok && resolveResult.value.albumId !== null) {
        resolvedAlbumId.value = resolveResult.value.albumId
        const tracksResult = await getTidalAlbumTracks(resolveResult.value.albumId)
        if (tracksResult.ok) {
          album.value = {
            id: resolveResult.value.albumId,
            title: tidalSearchTitle,
            artist: tidalSearchArtist,
            releaseYear: null,
            coverArtUrl: tidalSearchCoverArtUrl,
            tracks: tracksResult.value.tracks.map((track) => ({
              id: track.id,
              trackNumber: track.trackNumber,
              title: track.title,
              artist: '',
              duration: track.duration,
              url: track.url,
              audioQuality: parseTidalAudioQuality(track.url),
            })),
          }
          status.value = 'success'
          void loadEnrichment(tidalSearchArtist, tidalSearchTitle)
        } else {
          errorMessage.value = tracksResult.error.message
          status.value = 'error-server'
        }
      } else {
        album.value = toTidalSearchFallbackAlbum({
          title: tidalSearchTitle,
          artist: tidalSearchArtist,
          coverArtUrl: tidalSearchCoverArtUrl,
          trackUrls: tidalSearchTrackUrls,
          trackTitles: tidalSearchTrackTitles,
        })
        status.value = 'success'
        void loadEnrichment(tidalSearchArtist, tidalSearchTitle)
      }
      return
    }

    if (isTidalAlbumId(albumId)) {
      const tracksResult = await getTidalAlbumTracks(albumId)
      if (tracksResult.ok) {
        const tidalTitle = getHistoryString(getHistoryStateValue('tidalTitle'))
        const tidalArtist = getHistoryString(getHistoryStateValue('tidalArtist'))
        const tidalCoverArtUrlValue = getHistoryStateValue('tidalCoverArtUrl')
        album.value = {
          id: albumId,
          title: tidalTitle,
          artist: tidalArtist,
          releaseYear: null,
          coverArtUrl: typeof tidalCoverArtUrlValue === 'string' ? tidalCoverArtUrlValue : null,
          tracks: tracksResult.value.tracks.map((track) => ({
            id: track.id,
            trackNumber: track.trackNumber,
            title: track.title,
            artist: '',
            duration: track.duration,
            url: track.url,
            audioQuality: parseTidalAudioQuality(track.url),
          })),
        }
        status.value = 'success'
        void loadEnrichment(tidalArtist, tidalTitle)
      } else {
        errorMessage.value = tracksResult.error.message
        status.value = 'error-server'
      }
      return
    }

    const albumResult = await getAlbumDetail(albumId)
    if (albumResult.ok) {
      album.value = albumResult.value
      status.value = 'success'
      void loadEnrichment(albumResult.value.artist, albumResult.value.title)
      return
    }

    errorMessage.value = albumResult.error.message
    status.value = getAlbumErrorStatus(albumResult.error.type)
  })

  const onCoverError = (): void => {
    coverError.value = true
  }

  const handlePlayAlbum = async (): Promise<void> => {
    if (isTidalSearchPath) {
      const playResult =
        resolvedAlbumId.value !== null
          ? await playAlbum(resolvedAlbumId.value)
          : await playTidalSearchAlbum(tidalSearchTitle, tidalSearchArtist, tidalSearchTrackUrls)
      if (!playResult.ok) {
        return
      }
      return
    }

    const playResult = await playAlbum(albumId)
    if (!playResult.ok) {
      return
    }
  }

  const handlePlayTrack = async (trackUrl: string): Promise<void> => {
    if (trackUrl === '') {
      return
    }
    const playResult = await playTrack(trackUrl)
    if (!playResult.ok) {
      return
    }
  }

  const handleAddTrackToQueue = async (url: string): Promise<void> => {
    if (url === '') {
      return
    }
    const queueResult = await addToQueue(url)
    if (queueResult.ok) {
      queueSuccessUrls.add(url)
    } else {
      queueErrorUrls.add(url)
    }
  }

  const handleAddAlbumToQueue = async (): Promise<void> => {
    const queueResult =
      isTidalSearchPath && resolvedAlbumId.value === null
        ? await addTidalSearchAlbumToQueue(
            tidalSearchTitle,
            tidalSearchArtist,
            tidalSearchTrackUrls,
          )
        : await addAlbumToQueue(isTidalSearchPath ? (resolvedAlbumId.value ?? albumId) : albumId)

    if (queueResult.ok) {
      albumQueueSuccessFlag.add(albumQueueKey)
    } else {
      albumQueueErrorFlag.add(albumQueueKey)
    }
  }

  const goBack = (): void => {
    router.back()
  }

  const handleArtistClick = (): void => {
    if (tidalArtistId !== '') {
      const tidalArtistNameRaw = getHistoryStateValue('tidalArtistName')
      const tidalArtistNameForNav =
        typeof tidalArtistNameRaw === 'string' ? tidalArtistNameRaw : (album.value?.artist ?? '')
      void router.push({
        name: 'artist-detail',
        params: { artistId: tidalArtistId },
        query: { source: 'tidal' },
        state: { tidalArtistName: tidalArtistNameForNav },
      })
      return
    }

    void router.push({
      name: 'unified-artist',
      query: { name: album.value?.artist ?? '' },
    })
  }

  return {
    albumId,
    status,
    album,
    errorMessage,
    coverError,
    enrichment,
    albumEnrichmentLoading,
    albumEnrichmentError,
    queueSuccessUrls,
    queueErrorUrls,
    albumQueueSuccessFlag,
    albumQueueErrorFlag,
    albumQueueKey,
    onCoverError,
    handlePlayAlbum,
    handlePlayTrack,
    handleAddTrackToQueue,
    handleAddAlbumToQueue,
    goBack,
    handleArtistClick,
    formatDuration,
    detectSource,
  }
}
