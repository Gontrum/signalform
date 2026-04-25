import { computed, onMounted, ref, watch } from 'vue'
import type { ComputedRef, Ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import type { TidalArtistAlbum } from '@/platform/api/tidalArtistsApi'
import { getTidalArtistAlbums } from '@/platform/api/tidalArtistsApi'
import type { ArtistEnrichment } from '@/platform/api/enrichmentApi'
import { getArtistEnrichment, getSimilarArtists } from '@/platform/api/enrichmentApi'
import { useArtistImage } from '@/domains/enrichment/shell/useArtistImage'
import { getHistoryStateValue } from '@/utils/historyState'
import { getArtistByName, getArtistDetail } from '@/platform/api/artistApi'
import {
  getArtistErrorStatus,
  getArtistIdParam,
  getHistoryArtistName,
  isTidalArtistMode,
  setCoverError,
} from '../core/service'
import type {
  ArtistAlbum,
  ArtistDetailResponse,
  ArtistDetailStatus,
  SimilarArtistMatch,
} from '../core/types'

type UseArtistDetailViewResult = {
  readonly artistId: string
  readonly isTidalMode: boolean
  readonly status: Ref<ArtistDetailStatus>
  readonly artist: Ref<ArtistDetailResponse | null>
  readonly enrichment: Ref<ArtistEnrichment | null>
  readonly tidalArtistName: Ref<string>
  readonly tidalAlbums: Ref<ReadonlyArray<TidalArtistAlbum>>
  readonly errorMessage: Ref<string>
  readonly similarArtists: Ref<ReadonlyArray<SimilarArtistMatch>>
  readonly enrichmentLoading: Ref<boolean>
  readonly heroImageUrl: Ref<string | null>
  readonly artistNameForImage: ComputedRef<string>
  readonly coverErrors: Ref<Record<string, boolean>>
  readonly handleAlbumClick: (album: ArtistAlbum) => void
  readonly handleTidalAlbumClick: (album: TidalArtistAlbum) => void
  readonly handleSimilarArtistClick: (similarArtist: SimilarArtistMatch) => void
  readonly goBack: () => void
  readonly onCoverError: (albumId: string) => void
}

export const useArtistDetailView = (): UseArtistDetailViewResult => {
  const route = useRoute()
  const router = useRouter()

  const artistId = getArtistIdParam(route.params['artistId'])
  const isTidalMode = isTidalArtistMode(route.query['source'])

  const status = ref<ArtistDetailStatus>('loading')
  const artist = ref<ArtistDetailResponse | null>(null)
  const enrichment = ref<ArtistEnrichment | null>(null)
  const tidalArtistName = ref('')
  const tidalAlbums = ref<ReadonlyArray<TidalArtistAlbum>>([])
  const errorMessage = ref('')
  const similarArtists = ref<ReadonlyArray<SimilarArtistMatch>>([])
  const enrichmentLoading = ref(false)
  const heroImageUrl = ref<string | null>(null)
  const coverErrors = ref<Record<string, boolean>>({})

  const artistNameForImage = computed(() => artist.value?.name ?? tidalArtistName.value)

  watch(artistNameForImage, (name) => {
    if (name === '') {
      return
    }

    const { imageUrl } = useArtistImage(name)
    watch(
      imageUrl,
      (url) => {
        heroImageUrl.value = url
      },
      { immediate: true },
    )
  })

  onMounted(async () => {
    if (isTidalMode) {
      tidalArtistName.value = getHistoryArtistName(getHistoryStateValue('tidalArtistName'))

      const result = await getTidalArtistAlbums(artistId)
      if (result.ok) {
        tidalAlbums.value = result.value.albums
        status.value = 'success'
      } else {
        errorMessage.value = result.error.message
        status.value = 'error-server'
      }
      return
    }

    const result = await getArtistDetail(artistId)
    if (!result.ok) {
      errorMessage.value = result.error.message
      status.value = getArtistErrorStatus(result.error)
      return
    }

    artist.value = result.value
    status.value = 'success'
    enrichmentLoading.value = true

    const enrichmentResult = await getArtistEnrichment(result.value.name)
    if (enrichmentResult.ok) {
      enrichment.value = enrichmentResult.value
    }
    enrichmentLoading.value = false

    const similarArtistsResult = await getSimilarArtists(result.value.name)
    if (!similarArtistsResult.ok || similarArtistsResult.value.length === 0) {
      return
    }

    const withLibraryFlags = await Promise.all(
      similarArtistsResult.value.map(async (candidate) => {
        const artistResult = await getArtistByName(candidate.name)
        return {
          name: candidate.name,
          match: candidate.match,
          inLibrary: artistResult.ok && artistResult.value.localAlbums.length > 0,
        }
      }),
    )
    similarArtists.value = withLibraryFlags
  })

  const handleAlbumClick = (album: ArtistAlbum): void => {
    void router.push({ name: 'album-detail', params: { albumId: album.id } })
  }

  const handleTidalAlbumClick = (album: TidalArtistAlbum): void => {
    void router.push({
      name: 'album-detail',
      params: { albumId: album.id },
      state: {
        tidalTitle: album.title,
        tidalArtist: tidalArtistName.value,
        tidalCoverArtUrl: album.coverArtUrl,
        tidalArtistId: artistId,
        tidalArtistName: tidalArtistName.value,
      },
    })
  }

  const handleSimilarArtistClick = (similarArtist: SimilarArtistMatch): void => {
    void router.push({ name: 'unified-artist', query: { name: similarArtist.name } })
  }

  const goBack = (): void => {
    router.back()
  }

  const onCoverError = (albumId: string): void => {
    coverErrors.value = setCoverError(coverErrors.value, albumId)
  }

  return {
    artistId,
    isTidalMode,
    status,
    artist,
    enrichment,
    tidalArtistName,
    tidalAlbums,
    errorMessage,
    similarArtists,
    enrichmentLoading,
    heroImageUrl,
    artistNameForImage,
    coverErrors,
    handleAlbumClick,
    handleTidalAlbumClick,
    handleSimilarArtistClick,
    goBack,
    onCoverError,
  }
}
