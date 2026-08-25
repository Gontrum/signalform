export type SearchRouteState = {
  readonly text: string
  readonly tagId?: string
}

export type SearchRouteQuery = {
  readonly q?: string
  readonly tag?: string
  readonly full?: string
}

export const buildSearchRouteQuery = (state: SearchRouteState): SearchRouteQuery => {
  const q = state.text.trim()
  const tag = state.tagId ?? ''
  const hasText = q !== ''
  const hasTag = tag !== ''

  return {
    ...(hasText ? { q } : {}),
    ...(hasTag ? { tag } : {}),
    ...(hasText || hasTag ? { full: 'true' } : {}),
  }
}
