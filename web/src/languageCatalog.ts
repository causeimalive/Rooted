// Builds human-readable language options from the live Bible version
// catalog's `language_tag` values (e.g. "en", "es", "fr", "swh"), using the
// browser's built-in Intl.DisplayNames instead of hand-maintaining a name
// table for every language YouVersion might return.
export type LanguageOption = { tag: string; label: string }

let displayNames: Intl.DisplayNames | null | undefined

function getDisplayNames(): Intl.DisplayNames | null {
  if (displayNames !== undefined) return displayNames
  try {
    displayNames = new Intl.DisplayNames(['en'], { type: 'language' })
  } catch {
    displayNames = null
  }
  return displayNames
}

export function labelForLanguageTag(tag: string): string {
  const normalized = tag.trim()
  if (!normalized) return tag
  try {
    const name = getDisplayNames()?.of(normalized)
    if (name && name.toLowerCase() !== normalized.toLowerCase()) return name
  } catch {
    // Intl.DisplayNames throws (RangeError) for codes it doesn't recognize --
    // fall back to the raw tag below.
  }
  return normalized.toUpperCase()
}

export function buildLanguageOptions(versions: readonly { language_tag?: string | null }[]): LanguageOption[] {
  const tags = new Set<string>()
  for (const version of versions) {
    const tag = version.language_tag?.trim()
    if (tag) tags.add(tag)
  }
  return Array.from(tags)
    .map((tag) => ({ tag, label: labelForLanguageTag(tag) }))
    .sort((a, b) => a.label.localeCompare(b.label))
}
