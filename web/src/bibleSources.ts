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

// Known major English translations that cannot currently be served from any
// licensed source wired into the app. Keeping this list means the UI can hide
// these versions from the dropdown instead of letting the user select a
// translation that will 404 from every source.
export const UNAVAILABLE_VERSION_TITLES: string[] = [
  'amplified bible',
  'amplified',
  'the amplified bible',
  'the message',
  'message',
  'new american standard bible',
  'nasb',
  'nasb 1995',
  'nasb2020',
  'new american standard bible 2020',
  'english standard version',
  'esv',
  'the passion translation',
  'tpt',
  'passion translation',
  'easy english bible',
  'easy',
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
    for (const unavailable of UNAVAILABLE_VERSION_TITLES) {
      const normalizedUnavailable = normalizeForMatch(unavailable)
      if (source === normalizedUnavailable || source.includes(normalizedUnavailable)) return true
    }
  }
  return false
}
