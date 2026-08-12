import Fuse from 'fuse.js'
import { LexiconEntry, Verse } from './types'
import { getAllCharacters } from './characters'
import { matchesPassage } from './places'
import { fetchCachedJson } from './indexedStorage'
import { getCuratedCrossReferences, loadOpenBibleCrossReferences } from './openbibleCrossReferences'

let verses: Verse[] = []
let fuse: Fuse<Verse> | null = null
let bookMeta: { code: string; name: string }[] = []
let bookFuse: Fuse<{ code: string; name: string }> | null = null
let wordIndex: Map<string, Verse[]> = new Map()

let lexicon: Record<string, LexiconEntry> = {}
let lexiconFuse: Fuse<LexiconEntry> | null = null

const verseNetworkTerms = new Map<string, Set<string>>()

const NETWORK_STOPWORDS = new Set([
  'the', 'and', 'that', 'with', 'from', 'have', 'this', 'unto', 'they', 'there', 'their', 'shall', 'which', 'will',
  'were', 'when', 'then', 'them', 'into', 'upon', 'what', 'your', 'thou', 'thee', 'his', 'her', 'for', 'but', 'not',
  'are', 'all', 'had', 'has', 'was', 'who', 'out', 'him', 'she', 'our', 'you', 'its', 'thy', 'may', 'one', 'two',
  'god', 'lord', 'jesus', 'christ', 'said', 'say', 'saith', 'also', 'can', 'could', 'would', 'should', 'been', 'being',
  'shall', 'will', 'here', 'there', 'then', 'very', 'more', 'most', 'much', 'many', 'after', 'before', 'over', 'under',
])

function tokenizeNetworkTerms(text: string): string[] {
  return (text.toLowerCase().match(/\b[a-z]{4,}\b/g) ?? []).filter((word) => !NETWORK_STOPWORDS.has(word))
}

export async function precomputeNetworkTerms(versesToIndex: Verse[]): Promise<void> {
  verseNetworkTerms.clear()
  for (const v of versesToIndex) {
    verseNetworkTerms.set(v.id, new Set(tokenizeNetworkTerms(v.text)))
  }
}

function getCachedNetworkTerms(verse: Verse): Set<string> {
  let terms = verseNetworkTerms.get(verse.id)
  if (!terms) {
    terms = new Set(tokenizeNetworkTerms(verse.text))
    verseNetworkTerms.set(verse.id, terms)
  }
  return terms
}

function sharedNetworkTerms(source: Verse, candidate: Verse): string[] {
  const sourceTerms = getCachedNetworkTerms(source)
  const candidateTerms = getCachedNetworkTerms(candidate)
  const shared: string[] = []
  for (const term of sourceTerms) {
    if (candidateTerms.has(term)) shared.push(term)
  }
  return shared
}

export type VerseMatch = {
  verse: Verse
  score: number
  sharedTerms: string[]
  source?: 'curated' | 'heuristic'
}

export type NetworkTheme = {
  label: string
  count: number
  weight: number
}

export async function loadBible(): Promise<Verse[]> {
  await Promise.all([loadLexicon(), loadOpenBibleCrossReferences()])
  try {
    verses = await fetchCachedJson<Verse[]>('/data/bible.json', 'bible')
  } catch (e) {
    console.error('Failed to load Bible data', e)
    verses = []
  }
  const seenBooks = new Set<string>()
  bookMeta = []
  wordIndex = new Map()
  for (const v of verses) {
    if (!seenBooks.has(v.book)) {
      seenBooks.add(v.book)
      bookMeta.push({ code: v.book, name: v.bookName })
    }
    const seenWords = new Set<string>()
    for (const word of v.text.toLowerCase().match(/[a-z']+/g) ?? []) {
      if (seenWords.has(word)) continue
      seenWords.add(word)
      const bucket = wordIndex.get(word)
      if (bucket) bucket.push(v)
      else wordIndex.set(word, [v])
    }
  }
  await precomputeNetworkTerms(verses)
  fuse = new Fuse(verses, {
    keys: [
      { name: 'text', weight: 0.7 },
      { name: 'bookName', weight: 0.2 },
      { name: 'book', weight: 0.1 },
    ],
    threshold: 0.32,
    ignoreLocation: true,
    includeScore: true,
    minMatchCharLength: 2,
  })
  bookFuse = new Fuse(bookMeta, {
    keys: ['name', 'code'],
    threshold: 0.4,
    ignoreLocation: true,
    includeScore: true,
    minMatchCharLength: 2,
  })
  return verses
}

// Lets users type/say chapter and verse numbers as words, e.g. "john three
// sixteen" -> "john 3 16", or "first john four eight" -> "1 john 4 8".
const NUMBER_WORDS: Record<string, number> = {
  first: 1, second: 2, third: 3,
  zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17,
  eighteen: 18, nineteen: 19, twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70,
  eighty: 80, ninety: 90, hundred: 100,
}

export function normalizeSpokenNumbers(query: string): string {
  const words = query.split(/\s+/)
  const out: string[] = []
  for (let i = 0; i < words.length; i++) {
    const raw = words[i]
    const n = NUMBER_WORDS[raw.toLowerCase()]
    if (n === undefined) {
      out.push(raw)
      continue
    }
    if (n >= 20 && n % 10 === 0 && i + 1 < words.length) {
      const next = NUMBER_WORDS[words[i + 1].toLowerCase()]
      if (next !== undefined && next >= 1 && next <= 9) {
        out.push(String(n + next))
        i++
        continue
      }
    }
    out.push(String(n))
  }
  return out.join(' ')
}

const QUESTION_WORDS = /^(who|what|where|when|why|how|which|whom)\b\s*/i

// Strips leading question words ('who baptized jesus' -> 'baptized jesus')
// and trailing punctuation so natural-language questions still resolve to
// useful keyword/character search terms.
export function stripQuestionWords(query: string): string {
  return query.trim().replace(QUESTION_WORDS, '').replace(/\?+$/, '').trim()
}

export function isQuestionQuery(query: string): boolean {
  const trimmed = query.trim()
  return /\?$/.test(trimmed) || QUESTION_WORDS.test(trimmed)
}

// Resolves natural-language questions like "who baptized Jesus" by matching
// the question's keywords against known character names and the labels of
// their life events, then returning the scripture passages for those events
// so the user is directed straight to the correct verses.
function questionAnswerVerses(query: string): Verse[] {
  const terms = new Set(query.toLowerCase().match(/[a-z']{3,}/g) ?? [])
  if (!terms.size) return []

  const scored: { verse: Verse; score: number }[] = []
  const seen = new Set<string>()

  for (const character of getAllCharacters()) {
    const nameTerms = new Set(
      [character.name, ...(character.aliases ?? [])].join(' ').toLowerCase().match(/[a-z']{3,}/g) ?? [],
    )
    const nameOverlap = Array.from(nameTerms).filter((term) => terms.has(term)).length

    for (const event of character.events) {
      const labelTerms = new Set(event.label.toLowerCase().match(/[a-z']{3,}/g) ?? [])
      const labelOverlap = Array.from(labelTerms).filter((term) => terms.has(term)).length
      const overlap = nameOverlap + labelOverlap
      if (overlap === 0) continue

      for (const passage of event.passages) {
        for (const verse of verses) {
          if (seen.has(verse.id) || !matchesPassage(verse, passage)) continue
          seen.add(verse.id)
          scored.push({ verse, score: overlap })
        }
      }
    }
  }

  return scored.sort((a, b) => b.score - a.score).map((s) => s.verse)
}

function matchBook(bookQuery: string): { code: string; name: string } | undefined {
  const q = bookQuery.trim().toLowerCase().replace(/\s+/g, ' ')
  if (!q) return undefined

  const exact = bookMeta.find((b) => b.code.toLowerCase() === q || b.name.toLowerCase() === q)
  if (exact) return exact

  const startsWith = bookMeta.filter((b) => b.name.toLowerCase().startsWith(q) || b.code.toLowerCase().startsWith(q))
  if (startsWith.length === 1) return startsWith[0]
  if (startsWith.length > 1) {
    return startsWith.sort((a, b) => a.name.length - b.name.length)[0]
  }

  // Tolerate typos in the book name (e.g. "jhon" -> "john").
  if (bookFuse) {
    const [best] = bookFuse.search(q)
    if (best && (best.score ?? 1) <= 0.4) return best.item
  }

  return undefined
}

// Chapter/verse can be separated by a colon ("John 3:16") or a space
// ("John 3 16", which is what spoken/typed-number queries normalize to).
const REFERENCE_PATTERN = /^([1-3]?\s?[a-zA-Z][a-zA-Z\s]*?)\s+(\d{1,3})(?:[:\s]\s*(\d{1,3})(?:\s?-\s?(\d{1,3}))?)?$/

// Parses direct scripture references like "John 3:16", "Gen 1:1-3", or
// "1 Cor 13" so they resolve instantly and precisely instead of relying on
// fuzzy text search.
export function parseVerseReference(rawQuery: string): Verse[] | undefined {
  const query = normalizeSpokenNumbers(rawQuery)
  const match = query.trim().match(REFERENCE_PATTERN)
  if (!match) return undefined

  const [, bookPart, chapterStr, verseStartStr, verseEndStr] = match
  const book = matchBook(bookPart)
  if (!book) return undefined

  const chapter = Number(chapterStr)
  let matches = verses.filter((v) => v.book === book.code && v.chapter === chapter)
  if (verseStartStr) {
    const verseStart = Number(verseStartStr)
    const verseEnd = verseEndStr ? Number(verseEndStr) : verseStart
    matches = matches.filter((v) => v.verse >= verseStart && v.verse <= verseEnd)
  }

  return matches.length ? matches.slice().sort((a, b) => a.verse - b.verse) : undefined
}

async function loadLexicon() {
  try {
    const entries = await fetchCachedJson<LexiconEntry[]>('/data/lexicon.json', 'lexicon')
    lexicon = Object.fromEntries(entries.map((entry) => [entry.word.toLowerCase(), entry]))
    lexiconFuse = new Fuse(entries, {
      keys: ['word', 'kjvMeaning', 'modernMeaning', 'historicalContext'],
      threshold: 0.3,
      includeScore: true,
      minMatchCharLength: 2,
    })
  } catch (e) {
    console.error('Failed to load lexicon', e)
  }
}

export function getAllVerses(): Verse[] {
  return verses
}

export function searchBible(q: string): { verse: Verse; score: number }[] {
  const trimmed = q.trim()
  if (!trimmed) return []

  const referenceMatches = parseVerseReference(trimmed)
  if (referenceMatches) {
    return referenceMatches.map((verse) => ({ verse, score: 0 }))
  }

  const question = isQuestionQuery(trimmed)
  const core = question ? stripQuestionWords(trimmed) : trimmed
  if (!core) return []

  const results: { verse: Verse; score: number }[] = []
  const seen = new Set<string>()

  // Natural-language questions ('who baptized Jesus') resolve to the right
  // scripture directly via character/event matching before falling back to
  // general text search.
  if (question) {
    for (const verse of questionAnswerVerses(core)) {
      if (seen.has(verse.id)) continue
      seen.add(verse.id)
      results.push({ verse, score: -1 })
    }
  }

  // Exact phrase matches are both faster and more precise than fuzzy
  // matching, so surface them first.
  for (const verse of getVersesWithWord(core)) {
    if (seen.has(verse.id)) continue
    seen.add(verse.id)
    results.push({ verse, score: 0 })
  }

  if (fuse) {
    for (const r of fuse.search(core)) {
      if (seen.has(r.item.id)) continue
      seen.add(r.item.id)
      results.push({ verse: r.item, score: r.score ?? 1 })
    }
  }

  return results.sort((a, b) => a.score - b.score)
}

export function findVerse(id: string): Verse | undefined {
  return verses.find((v) => v.id === id)
}

export function getCrossReferences(verse: Verse, all: Verse[] = verses, limit = 15): Verse[] {
  return getCrossReferenceMatches(verse, all, limit).map((match) => match.verse)
}

export function getCrossReferenceMatches(verse: Verse, all: Verse[] = verses, limit = 15): VerseMatch[] {
  const scored = new Map<string, VerseMatch>()
  const verseById = new Map(all.map((entry) => [entry.id, entry]))

  for (const curated of getCuratedCrossReferences(verse.id)) {
    const candidate = verseById.get(curated.verse)
    if (!candidate || candidate.id === verse.id) continue
    scored.set(candidate.id, {
      verse: candidate,
      score: curated.votes,
      sharedTerms: sharedNetworkTerms(verse, candidate),
      source: 'curated',
    })
  }

  for (const candidate of all) {
    if (candidate.id === verse.id || scored.has(candidate.id)) continue

    const sharedTerms = sharedNetworkTerms(verse, candidate)
    if (!sharedTerms.length) continue

    const sameBook = verse.book === candidate.book
    const sameChapter = sameBook && verse.chapter === candidate.chapter
    const chapterDistance = sameBook ? Math.abs(verse.chapter - candidate.chapter) : 0

    let score = sharedTerms.length * 8
    score += sharedTerms.reduce((total, term) => total + Math.min(term.length, 10) / 4, 0)
    if (sameBook) score += 6
    if (sameChapter) score += 10
    if (sameBook && !sameChapter) score += Math.max(0, 5 - Math.min(chapterDistance, 5))
    if (sharedTerms.some((term) => term.length >= 8)) score += 2
    if (sharedTerms.length >= 4) score += 3

    scored.set(candidate.id, { verse: candidate, score, sharedTerms, source: 'heuristic' })
  }

  return Array.from(scored.values())
    .sort((a, b) => b.score - a.score || a.verse.book.localeCompare(b.verse.book) || a.verse.chapter - b.verse.chapter || a.verse.verse - b.verse.verse)
    .slice(0, limit)
}

export function extractNetworkThemes(verses: Verse[], limit = 6): NetworkTheme[] {
  const counts = new Map<string, { count: number; longest: number }>()

  for (const verse of verses) {
    const seen = getCachedNetworkTerms(verse)
    for (const term of seen) {
      const entry = counts.get(term) ?? { count: 0, longest: 0 }
      entry.count += 1
      entry.longest = Math.max(entry.longest, term.length)
      counts.set(term, entry)
    }
  }

  return Array.from(counts.entries())
    .filter(([, entry]) => entry.count > 1)
    .sort((a, b) => b[1].count - a[1].count || b[1].longest - a[1].longest || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([label, entry]) => ({
      label,
      count: entry.count,
      weight: entry.count * 2 + entry.longest / 10,
    }))
}

const DEFINITIONS: Record<string, string> = {
  grace: 'Unmerited divine assistance given to humans for their regeneration or sanctification.',
  faith: 'Complete trust or confidence in God; a central biblical virtue.',
  love: 'Selfless, unconditional devotion; in Greek, agape.',
  light: 'That which makes things visible; in scripture, truth, holiness, and God’s presence.',
  world: 'The earth and its inhabitants; sometimes the sinful order opposed to God.',
  sin: 'A transgression of divine law; missing the mark of God’s standard.',
  peace: 'Inner rest and harmony; in Hebrew shalom, in Greek eirene.',
  hope: 'Confident expectation of good, rooted in God’s promises.',
  truth: 'Reality as God sees it; the quality of being faithful and reliable.',
  spirit: 'The immaterial part of a person; also the Holy Spirit.',
  word: 'A spoken or written utterance; in John, the divine self-expression (Logos).',
  god: 'The creator and sustainer of the universe, revealed in the Bible.',
}

export function getCuratedMeaning(term: string): string {
  const entry = lexicon[term.toLowerCase()]
  if (entry) return `${entry.kjvMeaning} (modern: ${entry.modernMeaning}). ${entry.historicalContext}`
  return DEFINITIONS[term.toLowerCase()] ?? `${term} is used here; study its original language context for a fuller sense.`
}

// Common English suffixes to strip when looking for a base dictionary form
// (e.g. "loved"/"loving"/"loves" -> "love").
const WORD_SUFFIXES = ['ing', 'edly', 'ed', 'es', 's']

function lexiconVariants(term: string): string[] {
  const base = term.toLowerCase().trim()
  const variants = [base]
  for (const suffix of WORD_SUFFIXES) {
    if (base.length > suffix.length + 2 && base.endsWith(suffix)) {
      variants.push(base.slice(0, -suffix.length))
    }
  }
  return variants
}

export function lookupLexicon(term: string): LexiconEntry | undefined {
  const q = term.toLowerCase().trim()
  if (!q) return undefined

  for (const variant of lexiconVariants(q)) {
    if (lexicon[variant]) return lexicon[variant]
  }

  // Fall back to a strict fuzzy match so small typos or case differences
  // still resolve to a dictionary entry.
  if (lexiconFuse) {
    const [best] = lexiconFuse.search(q)
    if (best && (best.score ?? 1) <= 0.2) return best.item
  }

  return undefined
}

export function searchLexicon(q: string): LexiconEntry[] {
  const trimmed = q.trim()
  if (!trimmed) return Object.values(lexicon).slice(0, 50)
  if (!lexiconFuse) return Object.values(lexicon).slice(0, 50)

  const results = lexiconFuse.search(trimmed).map((r) => r.item)
  const lower = trimmed.toLowerCase()
  // Surface exact-prefix matches first (e.g. typing "lov" should rank
  // "love" above loosely related fuzzy matches).
  return results.sort((a, b) => {
    const aStarts = a.word.toLowerCase().startsWith(lower) ? 0 : 1
    const bStarts = b.word.toLowerCase().startsWith(lower) ? 0 : 1
    return aStarts - bStarts
  })
}

export function getVersesWithWord(word: string): Verse[] {
  const trimmed = word.trim()
  if (!trimmed) return []

  // Single-word queries resolve instantly via the prebuilt index.
  if (!/\s/.test(trimmed)) {
    return wordIndex.get(trimmed.toLowerCase()) ?? []
  }

  // Multi-word phrases fall back to a direct scan.
  const safe = trimmed.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+')
  const re = new RegExp(`\\b${safe}\\b`, 'i')
  return verses.filter((v) => re.test(v.text))
}

export function generateInsight(verse: Verse, related: Verse[]): string {
  const top = related.slice(0, 5).map((v) => `${v.bookName} ${v.chapter}:${v.verse}`).join(', ')
  return `This verse connects to ${related.length} related passages${top ? `, including ${top}` : ''}. Repeated themes and terms can help illuminate its meaning.`
}

export function getLexicon(): Record<string, LexiconEntry> {
  return lexicon
}
