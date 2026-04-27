import { computed, ref, watch } from 'vue'
import type { ComputedRef, Ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import type { ArtistEnrichment, EnrichmentErrorState } from '@/platform/api/enrichmentApi'
import {
  getArtistEnrichment,
  getSimilarArtists,
  mapEnrichmentError,
} from '@/platform/api/enrichmentApi'
import { useArtistImages } from '@/domains/enrichment/shell/useArtistImage'
import { getArtistByName } from '@/platform/api/artistApi'
import { getAlbumDetailId, getArtistNameQuery, setCoverError } from '../core/service'
import type { ArtistByNameAlbum, SimilarArtistMatch, UnifiedArtistStatus } from '../core/types'
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
  readonly goBack: () => void
  readonly handleLocalAlbumClick: (album: ArtistByNameAlbum) => void
  readonly handleTidalAlbumClick: (album: ArtistByNameAlbum) => void
  readonly handleSimilarArtistClick: (similarArtist: SimilarArtistMatch) => void
  readonly onCoverError: (id: string) => void
}

export const useUnifiedArtistView = (errorNotFoundMessage: string): UseUnifiedArtistViewResult => {
  const route = useRoute()
  const router = useRouter()

  const status = ref<UnifiedArtistStatus>('loading')
  const data = ref<ArtistByNameResponse | null>(null)
  const errorMessage = ref('')
  const enrichment = ref<ArtistEnrichment | null>(null)
  const enrichmentLoading = ref(false)
  const enrichmentError = ref<EnrichmentErrorState>({ kind: 'none' })
  const heroImageUrl = ref<string | null>(null)
  const similarArtists = ref<ReadonlyArray<SimilarArtistMatch>>([])
  const coverErrors = ref<Record<string, boolean>>({})

  const loadGeneration = ref(0)

  const artistName = computed(() => getArtistNameQuery(route.query['name']))
  const { getImage: getArtistImageUrl } = useArtistImages(
    artistName.value === '' ? [] : [artistName.value],
  )

  watch(
    () => getArtistImageUrl(artistName.value),
    (url) => {
      heroImageUrl.value = url
    },
    { immediate: true },
  )

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

  const goBack = (): void => {
    router.back()
  }

  const handleLocalAlbumClick = (album: ArtistByNameAlbum): void => {
    void router.push({ name: 'album-detail', params: { albumId: getAlbumDetailId(album) } })
  }

  const handleTidalAlbumClick = (album: ArtistByNameAlbum): void => {
    void router.push({
      name: 'tidal-search-album',
      state: {
        title: album.title,
        artist: album.artist,
        coverArtUrl: album.coverArtUrl ?? '',
        trackUrls: [...(album.trackUrls ?? [])],
      },
    })
  }

  const handleSimilarArtistClick = (similarArtist: SimilarArtistMatch): void => {
    void router.push({ name: 'unified-artist', query: { name: similarArtist.name } })
  }

  const onCoverError = (id: string): void => {
    coverErrors.value = setCoverError(coverErrors.value, id)
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
    goBack,
    handleLocalAlbumClick,
    handleTidalAlbumClick,
    handleSimilarArtistClick,
    onCoverError,
  }
}
