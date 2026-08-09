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

function getTextContent(parent: ParentNode, selector: string): string {
  return parent.querySelector(selector)?.textContent?.trim() ?? ''
}

function getTextContents(parent: ParentNode, selector: string): string[] {
  return Array.from(parent.querySelectorAll(selector))
    .map((node) => node.textContent?.trim() ?? '')
    .filter(Boolean)
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
  const xml = new DOMParser().parseFromString(text, 'application/xml')
  const parserError = xml.querySelector('parsererror')
  if (parserError) {
    throw new Error(`Failed to parse ${source} UBS names XML`)
  }

  const { bookCodeByNumber, bookNameByCode } = buildBookMaps()
  const parsed: OpenBibleNameEntry[] = []
  const entries = Array.from(xml.querySelectorAll('Entry'))

  for (const entry of entries) {
    const baseId = getTextContent(entry, 'ID') || `${source}-${parsed.length + 1}`
    const language = getTextContent(entry, 'Language')
    const word = getTextContent(entry, 'Word')
    const subentries = Array.from(entry.children).filter((child) => child.tagName === 'Subentry')
    for (const [index, subentry] of subentries.entries()) {
      const glosses = getTextContents(subentry, 'Gloss-EN')
      const definition = getTextContent(subentry, 'Definition-EN')
      const alternate = getTextContent(subentry, 'Alternate')
      const form = getTextContent(subentry, 'Form')
      const domain = getTextContent(subentry, 'Domain')
      const references = getTextContents(subentry, 'References > Verse')
        .map((raw) => decodeReference(raw, bookCodeByNumber, bookNameByCode))
        .filter((ref): ref is OpenBibleReference => Boolean(ref))

      parsed.push({
        id: `${source}:${baseId}:${index}`,
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
  if (!trimmed || !fuse) return []
  const limit = options.limit ?? MAX_RESULTS
  return fuse
    .search(trimmed)
    .map((result) => result.item)
    .filter((entry) => {
      if (options.testament === undefined || options.testament === 'all') return true
      return entry.references.some((reference) => getTestamentForBook(reference.bookCode) === options.testament)
    })
    .slice(0, limit)
}

export function getOpenBibleNameEntries(): OpenBibleNameEntry[] {
  return entries
}
