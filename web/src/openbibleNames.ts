import Fuse from 'fuse.js'
import { getAllVerses, loadBible } from './bible'
import { fetchCachedText } from './indexedStorage'
import { getTestamentForBook, type Testament } from './bookTaxonomy'

type OpenBibleNameSource = 'ot' | 'nt'

export type OpenBibleReference = {
  verseId: string
  label: string
  bookCode: string
}

export type OpenBibleNameEntry = {
  id: string
  source: OpenBibleNameSource
  language: 'Hebrew' | 'Greek' | string
  word: string
  glosses: string[]
  definition: string
  alternate?: string
  form?: string
  domain?: string
  references: OpenBibleReference[]
}

const SOURCES: Array<{ path: string; source: OpenBibleNameSource }> = [
  { path: '/data/openbible/ubs-names-ot.xml', source: 'ot' },
  { path: '/data/openbible/ubs-names-nt.xml', source: 'nt' },
]

const CACHE_PREFIX = 'openbible-names'
const MAX_RESULTS = 20

let loadPromise: Promise<OpenBibleNameEntry[]> | null = null
let entries: OpenBibleNameEntry[] = []
let fuse: Fuse<OpenBibleNameEntry> | null = null

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function decodeXmlEntities(value: string): string {
  return value
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCharCode(Number.parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCharCode(Number.parseInt(dec, 10)))
}

function extractTagValues(block: string, tag: string): string[] {
  const pattern = new RegExp(`<${escapeRegex(tag)}>([\\s\\S]*?)<\/${escapeRegex(tag)}>`, 'g')
  return Array.from(block.matchAll(pattern), (match) => decodeXmlEntities(match[1].trim())).filter(Boolean)
}

function extractTagValue(block: string, tag: string): string {
  return extractTagValues(block, tag)[0] ?? ''
}

function buildBookMaps() {
  const verses = getAllVerses()
  const bookCodeByNumber = new Map<number, string>()
  const bookNameByCode = new Map<string, string>()
  for (const verse of verses) {
    if (!bookCodeByNumber.has(bookCodeByNumber.size + 1)) {
      bookCodeByNumber.set(bookCodeByNumber.size + 1, verse.book)
    }
    if (!bookNameByCode.has(verse.book)) {
      bookNameByCode.set(verse.book, verse.bookName)
    }
  }
  return { bookCodeByNumber, bookNameByCode }
}

function decodeReference(raw: string, bookCodeByNumber: Map<number, string>, bookNameByCode: Map<string, string>): OpenBibleReference | null {
  const trimmed = raw.trim()
  if (!/^\d{8,11}$/.test(trimmed)) return null
  const bookNumber = Number(trimmed.slice(0, 2))
  const chapter = Number(trimmed.slice(2, 5))
  const verse = Number(trimmed.slice(5, 8))
  const bookCode = bookCodeByNumber.get(bookNumber)
  if (!bookCode || !Number.isFinite(chapter) || !Number.isFinite(verse)) return null
  const bookName = bookNameByCode.get(bookCode) ?? bookCode
  return {
    verseId: `${bookCode}.${chapter}.${verse}`,
    label: `${bookName} ${chapter}:${verse}`,
    bookCode,
  }
}

function parseXml(text: string, source: OpenBibleNameSource): OpenBibleNameEntry[] {
  const { bookCodeByNumber, bookNameByCode } = buildBookMaps()
  const parsed: OpenBibleNameEntry[] = []
  const entryPattern = /<Entry>([\s\S]*?)<\/Entry>/g
  const entriesInXml = Array.from(text.matchAll(entryPattern))

  for (const [entryIndex, entryMatch] of entriesInXml.entries()) {
    const entryBlock = entryMatch[1]
    const baseId = extractTagValue(entryBlock, 'ID') || `${source}-${entryIndex + 1}`
    const language = extractTagValue(entryBlock, 'Language')
    const word = extractTagValue(entryBlock, 'Word')
    const subentries = Array.from(entryBlock.matchAll(/<Subentry>([\s\S]*?)<\/Subentry>/g))

    for (const [subIndex, subentryMatch] of subentries.entries()) {
      const subBlock = subentryMatch[1]
      const glosses = extractTagValues(subBlock, 'Gloss-EN')
      const definition = extractTagValue(subBlock, 'Definition-EN')
      const alternate = extractTagValue(subBlock, 'Alternate')
      const form = extractTagValue(subBlock, 'Form')
      const domain = extractTagValue(subBlock, 'Domain')
      const references = extractTagValues(subBlock, 'Verse')
        .map((raw) => decodeReference(raw, bookCodeByNumber, bookNameByCode))
        .filter((ref): ref is OpenBibleReference => Boolean(ref))

      parsed.push({
        id: `${source}:${baseId}:${subIndex}`,
        source,
        language,
        word,
        glosses,
        definition,
        alternate: alternate || undefined,
        form: form || undefined,
        domain: domain || undefined,
        references,
      })
    }
  }

  return parsed
}

function buildIndex(value: OpenBibleNameEntry[]) {
  fuse = new Fuse(value, {
    keys: [
      { name: 'word', weight: 0.35 },
      { name: 'glosses', weight: 0.25 },
      { name: 'definition', weight: 0.2 },
      { name: 'alternate', weight: 0.1 },
      { name: 'form', weight: 0.05 },
      { name: 'domain', weight: 0.05 },
    ],
    threshold: 0.32,
    ignoreLocation: true,
    includeScore: true,
    minMatchCharLength: 2,
  })
}

function scoreEntry(entry: OpenBibleNameEntry, query: string): number {
  const normalized = query.toLowerCase().trim()
  if (!normalized) return 0
  const fields = [entry.word, ...entry.glosses, entry.definition, entry.alternate ?? '', entry.form ?? '', entry.domain ?? '']
    .map((value) => value.toLowerCase())
  if (entry.word.toLowerCase() === normalized) return 100
  if (fields.some((value) => value.includes(normalized))) return 50
  return 0
}

export async function loadOpenBibleNames(): Promise<OpenBibleNameEntry[]> {
  if (loadPromise) return loadPromise

  loadPromise = (async () => {
    await loadBible()
    const collected: OpenBibleNameEntry[] = []
    for (const { path, source } of SOURCES) {
      const text = await fetchCachedText(path, `${CACHE_PREFIX}-${source}`)
      collected.push(...parseXml(text, source))
    }
    entries = collected
    buildIndex(entries)
    return entries
  })().catch((error) => {
    console.error('Failed to load OpenBible names', error)
    entries = []
    fuse = null
    return entries
  })

  return loadPromise
}

export function searchOpenBibleNames(query: string, options: { limit?: number; testament?: 'all' | Testament } = {}): OpenBibleNameEntry[] {
  const trimmed = query.trim()
  if (!trimmed || entries.length === 0) return []

  const limit = options.limit ?? MAX_RESULTS
  const candidateEntries = fuse
    ? fuse.search(trimmed).map((result) => result.item)
    : entries
        .filter((entry) => scoreEntry(entry, trimmed) > 0)
        .sort((a, b) => scoreEntry(b, trimmed) - scoreEntry(a, trimmed) || a.word.localeCompare(b.word))

  return candidateEntries
    .filter((entry) => {
      if (options.testament === undefined || options.testament === 'all') return true
      return entry.references.some((reference) => getTestamentForBook(reference.bookCode) === options.testament)
    })
    .slice(0, limit)
}

export function getOpenBibleNameEntries(): OpenBibleNameEntry[] {
  return entries
}
