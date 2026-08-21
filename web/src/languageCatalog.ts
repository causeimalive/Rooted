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
  versions: readonly { language_tag?: string | null }[],
  uiLanguage: string,
): Promise<LanguageOption[]> {
  const metadata = await loadLanguageMetadata()
  const metadataByTag = new Map<string, YouVersionLanguage>()
  for (const language of metadata) {
    for (const key of languageKey(language)) {
      metadataByTag.set(key, language)
    }
  }

  // If the version catalog hasn't been loaded yet (e.g. the user opened
  // Settings before the Bible reader), fall back to showing every language
  // returned by YouVersion's language metadata rather than an empty list.
  // Once the version catalog is cached, the next load will show only the
  // languages actually represented in the catalog.
  // The language picker is the *browse* control: users pick a Bible
  // language they want to read in, and the version dropdowns then filter
  // to versions actually available in that language from the live catalog.
  // Always derive the picker list from YouVersion's language metadata
  // (not from the version cache), so the control is usable immediately on
  // first open of Settings before the Bible reader has loaded and cached
  // the version catalog.
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
