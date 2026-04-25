import type { EnrichmentApiError, EnrichmentErrorState } from './types'

export const mapEnrichmentError = (error: EnrichmentApiError): EnrichmentErrorState => {
  if (error.type === 'NOT_FOUND') {
    return { kind: 'not-found' }
  }

  return { kind: 'unavailable' }
}

export const stripHtml = (html: string): string => html.replace(/<[^>]*>/g, '').trim()
