import type { EnrichmentApiError, EnrichmentErrorState } from './types'

export const mapEnrichmentError = (error: EnrichmentApiError): EnrichmentErrorState => {
  if (error.type === 'NOT_FOUND') {
    return { kind: 'not-found' }
  }

  return { kind: 'unavailable' }
}

export const stripHtml = (html: string): string => html.replace(/<[^>]*>/g, '').trim()

// The catalog carries no plural rules, so the count picks between two forms —
// English splits "listener"/"listeners", German only "Wiedergabe"/"Wiedergaben"
// and never "Hörer", so the split has to be decided by the count alone.
// Takes the translated forms rather than returning their keys: check:i18n
// refuses a key carrying {count} that is named without being filled, and the
// filling belongs to the caller, whose locale formats the number.
export const pluralByCount = (count: number, one: string, other: string): string =>
  count === 1 ? one : other

const COUNT_PLACEHOLDER = '{count}'

// Locale stays optional so the host default keeps grouping the number, which is
// what every call site did before they shared one formatter; a caller that knows
// the display language passes it and gets 1.234.567 instead of 1,234,567.
export const buildCountLabel = (
  count: number,
  one: string,
  other: string,
  locale?: string,
): string =>
  pluralByCount(count, one, other).replace(COUNT_PLACEHOLDER, count.toLocaleString(locale))
