import { ref, watch } from 'vue'
import type { Ref } from 'vue'
import { usePlaybackStore } from '@/domains/playback/shell/usePlaybackStore'
import { useTransientSet } from '@/app/useTransientSet'
import { playTrackList, playTidalSearchAlbum } from '@/platform/api/playbackApi'
import {
  addToQueue,
  addAlbumToQueue,
  addTrackListToQueue,
  addTidalSearchAlbumToQueue,
} from '@/platform/api/queueApi'
import { useArtistImages } from '@/domains/enrichment/shell/useArtistImage'
import { searchTidalArtists } from '@/platform/api/tidalArtistsApi'
import type { AlbumResult, ArtistResult, TrackResult } from '../core/types'

type UseSearchResultsActionsArgs = {
  readonly artists?: ReadonlyArray<ArtistResult>
}

type UseSearchResultsActionsResult = {
  readonly playbackStore: ReturnType<typeof usePlaybackStore>
  readonly selectedTrack: Ref<TrackResult | null>
  readonly coverErrors: Ref<Record<string, boolean>>
  readonly tidalFallbackCovers: Ref<Record<string, string>>
  readonly trackQueueSuccess: ReturnType<typeof useTransientSet<string>>
  readonly trackQueueError: ReturnType<typeof useTransientSet<string>>
  readonly albumQueueSuccess: ReturnType<typeof useTransientSet<string>>
  readonly albumQueueError: ReturnType<typeof useTransientSet<string>>
  readonly playTrackListSuccess: ReturnType<typeof useTransientSet<string>>
  readonly playTrackListError: ReturnType<typeof useTransientSet<string>>
  readonly addTrackListQueueSuccess: ReturnType<typeof useTransientSet<string>>
  readonly addTrackListQueueError: ReturnType<typeof useTransientSet<string>>
  readonly artistImageState: Ref<{ readonly getImage: (name: string) => string | null }>
  readonly isTrackPlaying: (track: TrackResult) => boolean
  readonly onAlbumCoverError: (albumId: string) => void
  readonly onAlbumCoverLoad: (event: Event, album: AlbumResult) => void
  readonly handleAddToQueue: (result: TrackResult) => Promise<void>
  readonly handleAddAlbumToQueue: (albumId: string, resultId: string) => Promise<void>
  readonly handlePlayTrackList: (
    trackUrls: ReadonlyArray<string> | undefined,
    albumId: string,
  ) => Promise<void>
  readonly handlePlayTidalSearchAlbum: (
    albumTitle: string,
    artist: string,
    trackUrls: ReadonlyArray<string> | undefined,
    albumId: string,
  ) => Promise<void>
  readonly handleAddTrackListToQueue: (
    trackUrls: ReadonlyArray<string> | undefined,
    albumId: string,
  ) => Promise<void>
  readonly handleAddTidalSearchAlbumToQueue: (
    albumTitle: string,
    artist: string,
    trackUrls: ReadonlyArray<string> | undefined,
    albumId: string,
  ) => Promise<void>
  readonly handleSelect: (track: TrackResult, onPlay: (track: TrackResult) => void) => void
}

const LMS_PLACEHOLDER_SIZE = 512

export const useSearchResultsActions = ({
  artists,
}: UseSearchResultsActionsArgs): UseSearchResultsActionsResult => {
  const playbackStore = usePlaybackStore()
  const selectedTrack = ref<TrackResult | null>(null)
  const coverErrors = ref<Record<string, boolean>>({})
  const tidalFallbackCovers = ref<Record<string, string>>({})
  const tidalArtistSearchCache = ref<Record<string, string>>({})

  const trackQueueSuccess = useTransientSet<string>(1500)
  const trackQueueError = useTransientSet<string>(2000)
  const albumQueueSuccess = useTransientSet<string>(1500)
  const albumQueueError = useTransientSet<string>(2000)
  const playTrackListSuccess = useTransientSet<string>(1500)
  const playTrackListError = useTransientSet<string>(2000)
  const addTrackListQueueSuccess = useTransientSet<string>(1500)
  const addTrackListQueueError = useTransientSet<string>(2000)

  const artistImageState = ref<{ readonly getImage: (name: string) => string | null }>({
    getImage: () => null,
  })

  watch(
    () => artists,
    (nextArtists): void => {
      if (nextArtists !== undefined && nextArtists.length > 0) {
        artistImageState.value = useArtistImages(nextArtists.map((artist) => artist.name))
      }
    },
    { immediate: true },
  )

  const isTrackPlaying = (track: TrackResult): boolean =>
    playbackStore.isCurrentlyPlaying && playbackStore.currentTrack?.id === track.id

  const onAlbumCoverError = (albumId: string): void => {
    coverErrors.value = { ...coverErrors.value, [albumId]: true }
  }

  const onAlbumCoverLoad = (event: Event, album: AlbumResult): void => {
    if (!(event.target instanceof HTMLImageElement)) {
      return
    }

    const image = event.target
    if (
      image.naturalWidth !== LMS_PLACEHOLDER_SIZE ||
      image.naturalHeight !== LMS_PLACEHOLDER_SIZE
    ) {
      return
    }

    const artistKey = album.artist.toLowerCase()
    if (artistKey in tidalArtistSearchCache.value) {
      const cachedUrl = tidalArtistSearchCache.value[artistKey]
      if (cachedUrl !== undefined && cachedUrl !== '') {
        tidalFallbackCovers.value = { ...tidalFallbackCovers.value, [album.id]: cachedUrl }
      }
      return
    }

    tidalArtistSearchCache.value = { ...tidalArtistSearchCache.value, [artistKey]: '' }
    void searchTidalArtists(album.artist).then((result): void => {
      if (!result.ok) {
        return
      }

      const firstWithImage = result.value.artists.find((artist) => artist.coverArtUrl !== '')
      const url = firstWithImage?.coverArtUrl ?? ''
      tidalArtistSearchCache.value = { ...tidalArtistSearchCache.value, [artistKey]: url }
      if (url !== '') {
        tidalFallbackCovers.value = { ...tidalFallbackCovers.value, [album.id]: url }
      }
    })
  }

  const handleAddToQueue = async (result: TrackResult): Promise<void> => {
    const response = await addToQueue(result.url)
    if (response.ok) {
      trackQueueSuccess.add(result.id)
    } else {
      trackQueueError.add(result.id)
    }
  }

  const handleAddAlbumToQueue = async (albumId: string, resultId: string): Promise<void> => {
    const response = await addAlbumToQueue(albumId)
    if (response.ok) {
      albumQueueSuccess.add(resultId)
    } else {
      albumQueueError.add(resultId)
    }
  }

  const handlePlayTrackList = async (
    trackUrls: ReadonlyArray<string> | undefined,
    albumId: string,
  ): Promise<void> => {
    if (!trackUrls?.length) {
      return
    }

    const response = await playTrackList(trackUrls)
    if (response.ok) {
      playTrackListSuccess.add(albumId)
    } else {
      playTrackListError.add(albumId)
    }
  }

  const handlePlayTidalSearchAlbum = async (
    albumTitle: string,
    artist: string,
    trackUrls: ReadonlyArray<string> | undefined,
    albumId: string,
  ): Promise<void> => {
    if (!trackUrls?.length) {
      return
    }

    const response = await playTidalSearchAlbum(albumTitle, artist, trackUrls)
    if (response.ok) {
      playTrackListSuccess.add(albumId)
    } else {
      playTrackListError.add(albumId)
    }
  }

  const handleAddTrackListToQueue = async (
    trackUrls: ReadonlyArray<string> | undefined,
    albumId: string,
  ): Promise<void> => {
    if (!trackUrls?.length) {
      return
    }

    const response = await addTrackListToQueue(trackUrls)
    if (response.ok) {
      addTrackListQueueSuccess.add(albumId)
    } else {
      addTrackListQueueError.add(albumId)
    }
  }

  const handleAddTidalSearchAlbumToQueue = async (
    albumTitle: string,
    artist: string,
    trackUrls: ReadonlyArray<string> | undefined,
    albumId: string,
  ): Promise<void> => {
    if (!trackUrls?.length) {
      return
    }

    const response = await addTidalSearchAlbumToQueue(albumTitle, artist, trackUrls)
    if (response.ok) {
      addTrackListQueueSuccess.add(albumId)
    } else {
      addTrackListQueueError.add(albumId)
    }
  }

  const handleSelect = (track: TrackResult, onPlay: (track: TrackResult) => void): void => {
    selectedTrack.value = track
    onPlay(track)
  }

  return {
    playbackStore,
    selectedTrack,
    coverErrors,
    tidalFallbackCovers,
    trackQueueSuccess,
    trackQueueError,
    albumQueueSuccess,
    albumQueueError,
    playTrackListSuccess,
    playTrackListError,
    addTrackListQueueSuccess,
    addTrackListQueueError,
    artistImageState,
    isTrackPlaying,
    onAlbumCoverError,
    onAlbumCoverLoad,
    handleAddToQueue,
    handleAddAlbumToQueue,
    handlePlayTrackList,
    handlePlayTidalSearchAlbum,
    handleAddTrackListToQueue,
    handleAddTidalSearchAlbumToQueue,
    handleSelect,
  }
}
