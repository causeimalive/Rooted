import { canUseBibleApi, fetchBibleApiPassage, type VersionMenuEntry as BibleApiVersionMenuEntry } from './bibleApiFallback'
import { fetchApiBibleBibles, fetchApiBiblePassage, findApiBibleId, type ApiBibleVersionMatch } from './apiBible'

export type VersionMenuEntry = {
  id: number
  title: string
  localized_title?: string
  abbreviation?: string
  localized_abbreviation?: string
  language_tag?: string | null
  copyright?: string | null
  youversion_deep_link?: string | null
}

export type SourceEntry =
  | { kind: 'localKjv' }
  | { kind: 'localNlt' }
  | { kind: 'apiBible'; bibleId: string }
  | { kind: 'bibleApi' }
  | { kind: 'youversion' }

// Translations that cannot be served from any source currently wired in.
const UNAVAILABLE_TITLES: string[] = [
  'amplified bible',
  'the message',
  'new american standard bible',
  'nasb 1995',
  'new american standard bible 2020',
  'english standard version',
  'the passion translation',
  'easy english bible',
  'easy to read version',
]

function normalizeForMatch(value?: string | null): string {
  return (value ?? '').toLowerCase().replace(/[^a-z0-9]/g, '')
}

export function isKnownUnavailableVersion(version: VersionMenuEntry): boolean {
  const sources = [
    normalizeForMatch(version.title),
    normalizeForMatch(version.localized_title),
    normalizeForMatch(version.abbreviation),
    normalizeForMatch(version.localized_abbreviation),
  ].filter(Boolean)

  for (const source of sources) {
    for (const unavailable of UNAVAILABLE_TITLES) {
      const normalizedUnavailable = normalizeForMatch(unavailable)
      if (source === normalizedUnavailable || source.includes(normalizedUnavailable)) return true
    }
  }
  return false
}

export async function resolveVersionSources(version: VersionMenuEntry): Promise<SourceEntry[]> {
  if (isKnownUnavailableVersion(version)) return []

  const sources: SourceEntry[] = []

  if (version.id === -1) {
    sources.push({ kind: 'localKjv' })
    if (canUseBibleApi(version as BibleApiVersionMenuEntry)) {
      sources.push({ kind: 'bibleApi' })
    }
    return sources
  }

  if (version.id === -2) {
    sources.push({ kind: 'localNlt' })
    return sources
  }

  const bibles = await fetchApiBibleBibles()
  const apiBibleId = findApiBibleId(version as ApiBibleVersionMatch, bibles)
  if (apiBibleId) {
    sources.push({ kind: 'apiBible', bibleId: apiBibleId })
  }

  if (canUseBibleApi(version as BibleApiVersionMenuEntry)) {
    sources.push({ kind: 'bibleApi' })
  }

  if (version.id > 0) {
    sources.push({ kind: 'youversion' })
  }

  return sources
}
