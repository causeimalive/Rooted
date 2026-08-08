import { useCallback, useEffect, useMemo, useState } from 'react'
import { useBibleClient, useBooks, useChapters, useVersion } from '@youversion/platform-react-hooks'

export type NetworkNodeType = 'version' | 'book' | 'chapter' | 'verse'

export type NetworkNode = {
  id: string
  type: NetworkNodeType
  label: string
  detail?: string
  parentId?: string
  languageTag?: string
  versionId?: number
  bookId?: string
  chapter?: number
  verse?: number
}

export type NetworkFocus = {
  versionId: number
  bookId: string | null
  chapter: number | null
}

function formatReference(bookId: string, chapter: number, verse?: number) {
  const base = `${bookId}.${chapter}`
  return verse === undefined ? base : `${base}.${verse}`
}

export function useRootedNetwork(language: string, versionId: number) {
  const { version, loading: versionLoading } = useVersion(versionId, { enabled: true })
  const { books, loading: booksLoading } = useBooks(versionId, { enabled: true })
  const [focus, setFocus] = useState<NetworkFocus>({ versionId, bookId: null, chapter: null })
  const [verseCache, setVerseCache] = useState<Record<string, NetworkNode[]>>({})
  const [versesLoading, setVersesLoading] = useState(false)
  const bibleClient = useBibleClient()

  const { chapters, loading: chaptersLoading } = useChapters(versionId, focus.bookId ?? '', {
    enabled: focus.bookId !== null,
  })

  const cacheKey = useMemo(() => {
    if (!focus.bookId || !focus.chapter) return null
    return formatReference(focus.bookId, focus.chapter)
  }, [focus.bookId, focus.chapter])

  const loadVerses = useCallback(
    async (bookId: string, chapter: number) => {
      if (!bibleClient) return
      const key = formatReference(bookId, chapter)
      if (verseCache[key]) return
      setVersesLoading(true)
      try {
        const passage = await bibleClient.getPassage(versionId, key, 'html', true, true)
        const html = passage.content ?? ''
        const doc = new DOMParser().parseFromString(html, 'text/html')
        const items: NetworkNode[] = []
        doc.querySelectorAll('.yv-v').forEach((el) => {
          const verse = el.getAttribute('v') ?? ''
          if (!verse) return
          const raw = el.textContent?.trim() ?? ''
          const escaped = verse.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
          const text = raw.replace(new RegExp(`^\\s*${escaped}\\s*`, ''), '').trim()
          items.push({
            id: `${bookId}.${chapter}.${verse}`,
            type: 'verse',
            label: verse,
            detail: text,
            parentId: `${bookId}.${chapter}`,
            versionId,
            bookId,
            chapter,
            verse: Number(verse),
          })
        })
        setVerseCache((prev) => ({ ...prev, [key]: items }))
      } catch (e) {
        setVerseCache((prev) => ({ ...prev, [key]: [] }))
      } finally {
        setVersesLoading(false)
      }
    },
    [bibleClient, verseCache, versionId],
  )

  useEffect(() => {
    if (focus.bookId && focus.chapter) {
      void loadVerses(focus.bookId, focus.chapter)
    }
  }, [focus.bookId, focus.chapter, loadVerses])

  const verses = useMemo(() => (cacheKey ? verseCache[cacheKey] ?? [] : []), [cacheKey, verseCache])

  const nodes = useMemo<NetworkNode[]>(() => {
    const list: NetworkNode[] = []
    if (version) {
      list.push({
        id: `v-${version.id}`,
        type: 'version',
        label: version.localized_title || version.title || version.abbreviation || String(version.id),
        detail: version.abbreviation,
        versionId: version.id,
      })
    }
    if (books?.data) {
      books.data.forEach((b) => {
        list.push({
          id: `b-${b.id}`,
          type: 'book',
          label: b.title || b.abbreviation || b.id,
          detail: b.id,
          parentId: `v-${versionId}`,
          versionId,
          bookId: b.id,
        })
      })
    }
    if (focus.bookId && chapters?.data) {
      chapters.data.forEach((c) => {
        const chapter = Number(c.id || c.title)
        list.push({
          id: `${focus.bookId}.${chapter}`,
          type: 'chapter',
          label: String(chapter),
          detail: c.title,
          parentId: focus.bookId ? `b-${focus.bookId}` : undefined,
          versionId,
          bookId: focus.bookId ?? undefined,
          chapter,
        })
      })
    }
    if (focus.bookId && focus.chapter) {
      list.push(...verses)
    }
    return list
  }, [books, chapters, focus.bookId, focus.chapter, version, versionId, verses])

  const loading = versionLoading || booksLoading || chaptersLoading || versesLoading

  const drillIn = useCallback((node: NetworkNode) => {
    if (node.type === 'book' && node.bookId) {
      setFocus({ versionId, bookId: node.bookId, chapter: null })
    } else if (node.type === 'chapter' && node.bookId && node.chapter) {
      setFocus({ versionId, bookId: node.bookId, chapter: node.chapter })
    }
  }, [versionId])

  const drillOut = useCallback(() => {
    setFocus((prev) => {
      if (prev.chapter) return { versionId, bookId: prev.bookId, chapter: null }
      if (prev.bookId) return { versionId, bookId: null, chapter: null }
      return prev
    })
  }, [versionId])

  const reset = useCallback(() => {
    setFocus({ versionId, bookId: null, chapter: null })
  }, [versionId])

  return { nodes, focus, loading, drillIn, drillOut, reset, version }
}
