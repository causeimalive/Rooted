import { FALLBACK_LANGUAGE_OPTIONS } from './languageFallback'
import { fetchYouVersionLanguages, type YouVersionLanguage } from './youversion'

export type LanguageOption = {
  tag: string
  label: string
  subtitle: string
  searchText: string
}

function normalizeTag(value: string): string {
  return value.trim().toLowerCase()
}

function displayNameForLanguage(language: YouVersionLanguage, uiLanguage: string): string {
  const preferred = language.display_names?.[uiLanguage.toLowerCase()]
  const english = language.display_names?.en
  return preferred || english || language.localized_name || language.script_name || language.language || language.id
}

let languageMetadataPromise: Promise<YouVersionLanguage[]> | null = null

function loadLanguageMetadata(): Promise<YouVersionLanguage[]> {
  if (!languageMetadataPromise) {
    languageMetadataPromise = fetchYouVersionLanguages({ country: 'US', page_size: 99 }).catch((error) => {
      languageMetadataPromise = null
      throw error
    })
  }
  return languageMetadataPromise
}

function fallbackLabel(tag: string): string {
  const normalized = tag.trim()
  return normalized ? normalized.toUpperCase() : tag
}

function languageKey(language: YouVersionLanguage): string[] {
  return Array.from(
    new Set(
      [language.id, language.language, ...(language.aliases ?? [])]
        .filter(Boolean)
        .map((value) => normalizeTag(value)),
    ),
  )
}

export async function buildLanguageOptions(
  _versions: readonly { language_tag?: string | null }[],
  uiLanguage: string,
): Promise<LanguageOption[]> {
  // Try the live YouVersion language metadata first. If the request fails
  // or returns empty (e.g. CORS/preflight/timeout), use the bundled fallback
  // snapshot so the picker is never empty and users can still search by
  // English name, code, or native name.
  let metadata: YouVersionLanguage[] = []
  try {
    metadata = await loadLanguageMetadata()
  } catch {
    // ignore; use fallback below
  }

  if (metadata.length === 0) {
    return FALLBACK_LANGUAGE_OPTIONS
  }

  const metadataByTag = new Map<string, YouVersionLanguage>()
  for (const language of metadata) {
    for (const key of languageKey(language)) {
      metadataByTag.set(key, language)
    }
  }

  const tags = Array.from(new Set(metadata.map((language) => (language.language ?? language.id).trim()).filter(Boolean)))

  return tags
    .map((tag) => {
      const meta = metadataByTag.get(normalizeTag(tag))
      const label = meta ? displayNameForLanguage(meta, uiLanguage) : fallbackLabel(tag)
      const subtitle = meta?.script_name ? `${tag.toUpperCase()} · ${meta.script_name}` : tag.toUpperCase()
      const allSearchTerms = [
        label,
        tag,
        meta?.language,
        meta?.localized_name,
        meta?.script_name,
        ...(meta?.aliases ?? []),
        ...(Object.values(meta?.display_names ?? {})),
        ...(meta?.countries ?? []),
      ]
        .filter(Boolean)
        .map((value) => value!.toLowerCase())
      const searchText = Array.from(new Set([...allSearchTerms, subtitle.toLowerCase()])).join(' ')
      return { tag, label, subtitle, searchText }
    })
    .sort((a, b) => a.label.localeCompare(b.label) || a.subtitle.localeCompare(b.subtitle) || a.tag.localeCompare(b.tag))
}
