import { computed, ref, watch } from 'vue'
import type { ComputedRef, Ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import type { ArtistEnrichment, EnrichmentErrorState } from '@/platform/api/enrichmentApi'
import {
  getArtistEnrichment,
  getSimilarArtists,
  mapEnrichmentError,
} from '@/platform/api/enrichmentApi'
import { isTidalAlbumId } from '@signalform/shared'
import { useArtistImages } from '@/domains/enrichment/shell/useArtistImage'
import {
  getArtistByName,
  getArtistTopAlbums,
  getArtistTopTracks,
  startArtistRadio,
} from '@/platform/api/artistApi'
import { startGenreRadio } from '@/platform/api/genreRadioApi'
import { addToQueue, addTrackListToQueue } from '@/platform/api/queueApi'
import { resolveAlbum } from '@/platform/api/tidalAlbumsApi'
import { usePlaybackStore } from '@/domains/playback/shell/usePlaybackStore'
import {
  getAlbumDetailId,
  getArtistNameQuery,
  setCoverError,
  sortArtistAlbums,
} from '../core/service'
import type {
  ArtistAlbumPopularity,
  ArtistAlbumSortOption,
  ArtistByNameAlbum,
  ArtistTopTrack,
  SimilarArtistMatch,
  UnifiedArtistStatus,
} from '../core/types'
import type { ArtistByNameResponse } from '../core/types'

type UseUnifiedArtistViewResult = {
  readonly status: Ref<UnifiedArtistStatus>
  readonly data: Ref<ArtistByNameResponse | null>
  readonly errorMessage: Ref<string>
  readonly enrichment: Ref<ArtistEnrichment | null>
  readonly enrichmentLoading: Ref<boolean>
  readonly enrichmentError: Ref<EnrichmentErrorState>
  readonly heroImageUrl: Ref<string | null>
  readonly similarArtists: Ref<ReadonlyArray<SimilarArtistMatch>>
  readonly artistName: ComputedRef<string>
  readonly coverErrors: Ref<Record<string, boolean>>
  readonly topTracks: Ref<ReadonlyArray<ArtistTopTrack>>
  readonly topTracksLoading: Ref<boolean>
  readonly albumSort: Ref<ArtistAlbumSortOption>
  readonly sortedLocalAlbums: ComputedRef<ReadonlyArray<ArtistByNameAlbum>>
  readonly sortedTidalAlbums: ComputedRef<ReadonlyArray<ArtistByNameAlbum>>
  readonly handleLocalAlbumClick: (album: ArtistByNameAlbum) => void
  readonly handleTidalAlbumClick: (album: ArtistByNameAlbum) => Promise<void>
  readonly handleSimilarArtistClick: (similarArtist: SimilarArtistMatch) => void
  readonly handleTopTrackPlay: (track: ArtistTopTrack) => Promise<void>
  readonly handleTopTrackAddToQueue: (track: ArtistTopTrack) => Promise<void>
  readonly handleAllTopTracksAddToQueue: () => Promise<void>
  readonly onCoverError: (id: string) => void
  readonly setAlbumSort: (sort: ArtistAlbumSortOption) => void
  readonly radioLoading: Ref<boolean>
  readonly radioError: Ref<boolean>
  readonly handleStartArtistRadio: () => Promise<void>
  readonly genreRadioLoading: Ref<boolean>
  readonly genreRadioError: Ref<boolean>
  readonly genreRadioActiveTag: Ref<string | null>
  readonly handleGenreRadioStart: (tag: string) => Promise<void>
}

export const useUnifiedArtistView = (errorNotFoundMessage: string): UseUnifiedArtistViewResult => {
  const route = useRoute()
  const router = useRouter()
  const playbackStore = usePlaybackStore()

  const status = ref<UnifiedArtistStatus>('loading')
  const data = ref<ArtistByNameResponse | null>(null)
  const errorMessage = ref('')
  const enrichment = ref<ArtistEnrichment | null>(null)
  const enrichmentLoading = ref(false)
  const enrichmentError = ref<EnrichmentErrorState>({ kind: 'none' })
  const heroImageUrl = ref<string | null>(null)
  const similarArtists = ref<ReadonlyArray<SimilarArtistMatch>>([])
  const coverErrors = ref<Record<string, boolean>>({})
  const topTracks = ref<ReadonlyArray<ArtistTopTrack>>([])
  const topTracksLoading = ref(false)
  const albumPopularity = ref<ReadonlyArray<ArtistAlbumPopularity>>([])
  const albumSort = ref<ArtistAlbumSortOption>('year')
  const radioLoading = ref(false)
  const radioError = ref(false)
  const genreRadioLoading = ref(false)
  const genreRadioError = ref(false)
  const genreRadioActiveTag = ref<string | null>(null)

  const loadGeneration = ref(0)

  const artistName = computed(() => getArtistNameQuery(route.query['name']))
  const { getImage: getArtistImageUrl } = useArtistImages(
    artistName.value === '' ? [] : [artistName.value],
  )

  const sortedLocalAlbums = computed(() =>
    sortArtistAlbums(data.value?.localAlbums ?? [], albumSort.value, albumPopularity.value),
  )

  const sortedTidalAlbums = computed(() =>
    sortArtistAlbums(data.value?.tidalAlbums ?? [], albumSort.value, albumPopularity.value),
  )

  watch(
    () => getArtistImageUrl(artistName.value),
    (url) => {
      heroImageUrl.value = url
    },
    { immediate: true },
  )

  const loadArtistPopularity = async (name: string): Promise<void> => {
    if (name.trim() === '') return
    topTracksLoading.value = true
    const [tracksResult, albumsResult] = await Promise.all([
      getArtistTopTracks(name, 15),
      getArtistTopAlbums(name),
    ])
    if (tracksResult.ok) topTracks.value = tracksResult.value.tracks
    if (albumsResult.ok) albumPopularity.value = albumsResult.value.albums
    topTracksLoading.value = false
  }

  const loadArtist = async (name: string): Promise<void> => {
    loadGeneration.value += 1
    const generation = loadGeneration.value

    status.value = 'loading'
    data.value = null
    enrichment.value = null
    heroImageUrl.value = null
    similarArtists.value = []
    enrichmentLoading.value = false
    enrichmentError.value = { kind: 'none' }

    if (name === '') {
      errorMessage.value = errorNotFoundMessage
      status.value = 'error'
      return
    }

    const artistResult = await getArtistByName(name)
    if (generation !== loadGeneration.value) {
      return
    }

    if (!artistResult.ok) {
      errorMessage.value = artistResult.error.message
      status.value = 'error'
      return
    }

    data.value = artistResult.value
    status.value = 'success'

    void loadArtistPopularity(name)

    enrichmentLoading.value = true
    const enrichmentResult = await getArtistEnrichment(name)
    if (generation !== loadGeneration.value) {
      return
    }

    if (enrichmentResult.ok) {
      enrichment.value = enrichmentResult.value
      enrichmentError.value = { kind: 'none' }
    } else {
      enrichment.value = null
      enrichmentError.value = mapEnrichmentError(enrichmentResult.error)
    }
    enrichmentLoading.value = false

    const similarArtistsResult = await getSimilarArtists(name)
    if (
      generation !== loadGeneration.value ||
      !similarArtistsResult.ok ||
      similarArtistsResult.value.length === 0
    ) {
      return
    }

    const withLibraryFlags = await Promise.all(
      similarArtistsResult.value.map(async (candidate) => {
        const artistByNameResult = await getArtistByName(candidate.name)
        return {
          name: candidate.name,
          match: candidate.match,
          inLibrary: artistByNameResult.ok && artistByNameResult.value.localAlbums.length > 0,
        }
      }),
    )

    if (generation !== loadGeneration.value) {
      return
    }

    similarArtists.value = withLibraryFlags
  }

  watch(
    () => route.query['name'],
    (name) => {
      void loadArtist(getArtistNameQuery(name))
    },
    { immediate: true },
  )

  const handleLocalAlbumClick = (album: ArtistByNameAlbum): void => {
    void router.push({ name: 'album-detail', params: { albumId: getAlbumDetailId(album) } })
  }

  const handleTidalAlbumClick = async (album: ArtistByNameAlbum): Promise<void> => {
    if (isTidalAlbumId(album.id)) {
      void router.push({
        name: 'album-detail',
        params: { albumId: album.id },
        state: {
          tidalTitle: album.title,
          tidalArtist: album.artist,
          tidalCoverArtUrl: album.coverArtUrl ?? '',
        },
      })
      return
    }

    const resolveResult = await resolveAlbum(album.title, album.artist)
    const resolvedId = resolveResult.ok ? resolveResult.value.albumId : null

    if (resolvedId !== null) {
      void router.push({
        name: 'album-detail',
        params: { albumId: resolvedId },
        state: {
          tidalTitle: album.title,
          tidalArtist: album.artist,
          tidalCoverArtUrl: album.coverArtUrl ?? '',
        },
      })
    } else {
      void router.push({
        name: 'tidal-search-album',
        query: {
          title: album.title,
          artist: album.artist,
        },
        state: {
          coverArtUrl: album.coverArtUrl ?? '',
          trackUrls: [...(album.trackUrls ?? [])],
          trackTitles: [...(album.trackTitles ?? [])],
        },
      })
    }
  }

  const handleSimilarArtistClick = (similarArtist: SimilarArtistMatch): void => {
    void router.push({ name: 'unified-artist', query: { name: similarArtist.name } })
  }

  const handleTopTrackPlay = async (track: ArtistTopTrack): Promise<void> => {
    await playbackStore.play({
      id: track.id,
      title: track.title,
      artist: track.artist,
      album: track.album,
      url: track.url,
      source: track.source,
      coverArtUrl: track.coverArtUrl,
    })
  }

  const handleTopTrackAddToQueue = async (track: ArtistTopTrack): Promise<void> => {
    await addToQueue(track.url)
  }

  const handleAllTopTracksAddToQueue = async (): Promise<void> => {
    const urls = topTracks.value.filter((t) => t.url !== '').map((t) => t.url)
    await addTrackListToQueue(urls)
  }

  const onCoverError = (id: string): void => {
    coverErrors.value = setCoverError(coverErrors.value, id)
  }

  const handleStartArtistRadio = async (): Promise<void> => {
    radioLoading.value = true
    radioError.value = false
    const result = await startArtistRadio(artistName.value)
    radioLoading.value = false
    if (!result.ok) {
      radioError.value = true
    }
  }

  const handleGenreRadioStart = async (tag: string): Promise<void> => {
    genreRadioLoading.value = true
    genreRadioError.value = false
    genreRadioActiveTag.value = tag
    const result = await startGenreRadio(tag)
    if (result === null) {
      genreRadioError.value = true
    }
    genreRadioLoading.value = false
  }

  const setAlbumSort = (sort: ArtistAlbumSortOption): void => {
    albumSort.value = sort
  }

  return {
    status,
    data,
    errorMessage,
    enrichment,
    enrichmentLoading,
    enrichmentError,
    heroImageUrl,
    similarArtists,
    artistName,
    coverErrors,
    topTracks,
    topTracksLoading,
    albumSort,
    sortedLocalAlbums,
    sortedTidalAlbums,
    handleLocalAlbumClick,
    handleTidalAlbumClick,
    handleSimilarArtistClick,
    handleTopTrackPlay,
    handleTopTrackAddToQueue,
    handleAllTopTracksAddToQueue,
    onCoverError,
    setAlbumSort,
    radioLoading,
    radioError,
    handleStartArtistRadio,
    genreRadioLoading,
    genreRadioError,
    genreRadioActiveTag,
    handleGenreRadioStart,
  }
}
