import { useEffect, useMemo, useState } from 'react'
import { loadBible } from './bible'

export type EntityTagCounts = Record<string, number>

export type EntityTagPosition = {
  wordIndex: number
  tag: string
}

export type EntityData = {
  tagsByVerseId: Record<string, EntityTagCounts>
  tagPositionsByVerseId: Record<string, EntityTagPosition[]>
  loading: boolean
  error: string | null
}

function parseTagList(raw: string): Record<string, number> {
  const counts: Record<string, number> = {}
  for (const piece of raw.split(',')) {
    const trimmed = piece.trim()
    if (!trimmed) continue
    const colonIndex = trimmed.lastIndexOf(':')
    if (colonIndex === -1) continue
    const tag = trimmed.slice(colonIndex + 1).trim()
    if (!tag) continue
    counts[tag] = (counts[tag] ?? 0) + 1
  }
  return counts
}

let dataCache: Promise<EntityData> | null = null

async function loadEntityData(): Promise<EntityData> {
  const [verses, response] = await Promise.all([
    loadBible(),
    fetch('/data/sentences.tsv'),
  ])
  if (!response.ok) throw new Error(`Failed to load sentences.tsv: ${response.status}`)
  const text = await response.text()

  const bookCodeByNumber = new Map<number, string>()
  const seen = new Set<string>()
  for (const v of verses) {
    if (seen.has(v.book)) continue
    seen.add(v.book)
    bookCodeByNumber.set(seen.size, v.book)
  }

  const tagsByVerseId: Record<string, EntityTagCounts> = {}
  const tagPositionsByVerseId: Record<string, EntityTagPosition[]> = {}
  let first = true
  let currentVerse = ''
  let sentenceOffset = 0

  for (const line of text.split(/\r?\n/)) {
    if (first) {
      first = false
      continue
    }
    if (!line.trim()) continue
    const parts = line.split('\t')
    if (parts.length < 3) continue
    const verseId = parts[0].trim()
    const wordCount = Number(parts[1].trim()) || 0
    if (verseId !== currentVerse) {
      currentVerse = verseId
      sentenceOffset = 0
    }
    const bookNumber = Number(verseId.slice(0, 2))
    const chapter = Number(verseId.slice(2, 5))
    const verse = Number(verseId.slice(5, 8))
    const bookCode = bookCodeByNumber.get(bookNumber)
    const refKey = bookCode ? `${bookCode}.${chapter}.${verse}` : ''

    for (const piece of parts[2].split(',')) {
      const trimmed = piece.trim()
      if (!trimmed) continue
      const colonIndex = trimmed.lastIndexOf(':')
      if (colonIndex === -1) continue
      const pos = Number(trimmed.slice(0, colonIndex).trim())
      const tag = trimmed.slice(colonIndex + 1).trim()
      if (!tag || Number.isNaN(pos)) continue
      const wordIndex = sentenceOffset + (pos - 1)

      const positions = (tagPositionsByVerseId[verseId] ??= [])
      positions.push({ wordIndex, tag })
      const numericCounts = (tagsByVerseId[verseId] ??= {})
      numericCounts[tag] = (numericCounts[tag] ?? 0) + 1

      if (refKey) {
        const refPositions = (tagPositionsByVerseId[refKey] ??= [])
        refPositions.push({ wordIndex, tag })
        const refCounts = (tagsByVerseId[refKey] ??= {})
        refCounts[tag] = (refCounts[tag] ?? 0) + 1
      }
    }

    sentenceOffset += wordCount
  }

  return { tagsByVerseId, tagPositionsByVerseId, loading: false, error: null }
}

export function useEntityData(): EntityData {
  const [data, setData] = useState<EntityData>({ tagsByVerseId: {}, tagPositionsByVerseId: {}, loading: true, error: null })

  useEffect(() => {
    let cancelled = false
    if (!dataCache) {
      dataCache = loadEntityData()
    }
    dataCache
      .then((result) => {
        if (!cancelled) setData(result)
      })
      .catch((err) => {
        if (!cancelled) {
          setData({
            tagsByVerseId: {},
            tagPositionsByVerseId: {},
            loading: false,
            error: err instanceof Error ? err.message : String(err),
          })
        }
      })
    return () => {
      cancelled = true
    }
  }, [])

  return useMemo(() => data, [data])
}
