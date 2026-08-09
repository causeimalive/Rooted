import { fetchCachedText } from './indexedStorage'

export type CuratedCrossReference = {
  verse: string
  votes: number
}

const SOURCE_URL = '/data/openbible/cross_references.txt'
const CACHE_KEY = 'openbible-cross-references'
const MAX_REFS_PER_VERSE = 30

let loadPromise: Promise<void> | null = null
let curatedCrossReferencesByVerse = new Map<string, CuratedCrossReference[]>()

function parseLine(line: string): { fromVerse: string; toVerse: string; votes: number } | null {
  const parts = line.split('\t')
  if (parts.length < 3) return null
  const fromVerse = parts[0]?.trim()
  const toVerse = parts[1]?.trim()
  const votes = Number(parts[2])
  if (!fromVerse || !toVerse || !Number.isFinite(votes) || votes <= 0) return null
  return { fromVerse, toVerse, votes }
}

export async function loadOpenBibleCrossReferences(): Promise<void> {
  if (loadPromise) return loadPromise

  loadPromise = (async () => {
    try {
      const text = await fetchCachedText(SOURCE_URL, CACHE_KEY)
      const aggregated = new Map<string, Map<string, number>>()

      for (const rawLine of text.split(/\r?\n/)) {
        const line = rawLine.trim()
        if (!line || line.startsWith('#') || line.startsWith('From Verse')) continue
        const parsed = parseLine(line)
        if (!parsed) continue

        const targetMap = aggregated.get(parsed.fromVerse) ?? new Map<string, number>()
        const existing = targetMap.get(parsed.toVerse) ?? 0
        targetMap.set(parsed.toVerse, Math.max(existing, parsed.votes))
        aggregated.set(parsed.fromVerse, targetMap)
      }

      curatedCrossReferencesByVerse = new Map(
        Array.from(aggregated.entries()).map(([fromVerse, targets]) => [
          fromVerse,
          Array.from(targets.entries())
            .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
            .slice(0, MAX_REFS_PER_VERSE)
            .map(([verse, votes]) => ({ verse, votes })),
        ]),
      )
    } catch (error) {
      console.error('Failed to load OpenBible cross references', error)
      curatedCrossReferencesByVerse = new Map()
    }
  })()

  return loadPromise
}

export function getCuratedCrossReferences(verseId: string): CuratedCrossReference[] {
  return curatedCrossReferencesByVerse.get(verseId) ?? []
}
