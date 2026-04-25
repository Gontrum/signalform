import { ref, type Ref } from 'vue'
import { getArtistHeroImage } from '@/platform/api/heroImageApi'

const imageCache = ref<Readonly<Record<string, string | null>>>({})
const pendingRequests = ref<Readonly<Record<string, Promise<string | null>>>>({})

export const clearArtistImageCache = (): void => {
  imageCache.value = {}
  pendingRequests.value = {}
}

const fetchArtistImage = (artistName: string): Promise<string | null> => {
  const cacheKey = artistName.trim().toLowerCase()
  const cachedImage = imageCache.value[cacheKey]

  if (cachedImage !== undefined) {
    return Promise.resolve(cachedImage)
  }

  const existing = pendingRequests.value[cacheKey]
  if (existing !== undefined) {
    return existing
  }

  const fetchPromise = getArtistHeroImage(artistName).then((result) => {
    const url = result.ok ? result.value : null
    const { [cacheKey]: _resolvedRequest, ...remainingRequests } = pendingRequests.value
    imageCache.value = { ...imageCache.value, [cacheKey]: url }
    pendingRequests.value = remainingRequests
    return url
  })
  pendingRequests.value = {
    ...pendingRequests.value,
    [cacheKey]: fetchPromise,
  }

  return fetchPromise
}

export const useArtistImage = (artistName: string): { readonly imageUrl: Ref<string | null> } => {
  const imageUrl = ref<string | null>(null)

  if (artistName.trim() !== '') {
    void fetchArtistImage(artistName).then((url) => {
      imageUrl.value = url
    })
  }

  return { imageUrl }
}

export const useArtistImages = (
  artistNames: readonly string[],
): { readonly getImage: (name: string) => string | null } => {
  const images = ref<Record<string, string | null>>({})

  artistNames
    .filter((name) => name.trim() !== '')
    .forEach((name) => {
      void fetchArtistImage(name).then((url) => {
        images.value = { ...images.value, [name.trim().toLowerCase()]: url }
      })
    })

  const getImage = (name: string): string | null => images.value[name.trim().toLowerCase()] ?? null

  return { getImage }
}
