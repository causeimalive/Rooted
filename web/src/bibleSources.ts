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

export async function resolveVersionSources(version: VersionMenuEntry): Promise<SourceEntry[]> {
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
