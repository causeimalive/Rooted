export function applyHighlightsToHtml(
  html: string,
  bookId: string,
  chapter: number,
  bookCodeById: Record<string, string> | undefined,
  highlightedVerseIds: Set<string> | undefined,
  bookmarkedVerseIds: Set<string> | undefined,
  highlightColors: Record<string, string> | undefined,
): string {
  const doc = new DOMParser().parseFromString(html, 'text/html')
  const verseEls = Array.from(doc.querySelectorAll('.yv-v[v]')) as HTMLElement[]
  for (const el of verseEls) {
    const v = el.getAttribute('v')
    if (!v) continue
    const yvVerseId = `${bookId}.${chapter}.${v}`
    const localBookCode = bookCodeById?.[bookId] ?? bookId
    const localVerseId = `${localBookCode}.${chapter}.${v}`
    const isHighlighted = highlightedVerseIds?.has(yvVerseId) || highlightedVerseIds?.has(localVerseId)
    if (isHighlighted) {
      const color = highlightColors?.[yvVerseId] ?? highlightColors?.[localVerseId] ?? '#F5E98A'
      el.setAttribute('data-highlighted', 'true')
      el.style.setProperty('--yv-verse-highlight', color)
    }
    const isBookmarked = bookmarkedVerseIds?.has(yvVerseId) || bookmarkedVerseIds?.has(localVerseId)
    if (isBookmarked) {
      el.setAttribute('data-bookmarked', 'true')
    }
  }
  return doc.body.innerHTML
}
