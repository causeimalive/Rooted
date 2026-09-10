import { getAllVerses } from './bible'
import type { NetworkNode, NetworkEdge, NetworkKind } from './NetworkThreeScene'
import type { Verse, KnowledgeGraphAnchor } from './types'
import type { NetworkTheme, VerseMatch } from './bible'
import { getCharactersForVerse } from './characters'
import { getPlacesForVerse } from './places'

// Canonical Bible book order (Protestant canon, 66 books). Used to sort the
// network map hierarchy by book -> chapter -> verse instead of alphabetically.
export const CANONICAL_BOOK_ORDER = [
  'Gen', 'Exod', 'Lev', 'Num', 'Deut', 'Josh', 'Judg', 'Ruth', '1Sam', '2Sam',
  '1Kgs', '2Kgs', '1Chr', '2Chr', 'Ezra', 'Neh', 'Esth', 'Job', 'Ps', 'Prov',
  'Eccl', 'Song', 'Isa', 'Jer', 'Lam', 'Ezek', 'Dan', 'Hos', 'Joel', 'Amos',
  'Obad', 'Jonah', 'Mic', 'Nah', 'Hab', 'Zeph', 'Hag', 'Zech', 'Mal',
  'Matt', 'Mark', 'Luke', 'John', 'Acts', 'Rom', '1Cor', '2Cor', 'Gal', 'Eph',
  'Phil', 'Col', '1Thess', '2Thess', '1Tim', '2Tim', 'Titus', 'Phlm', 'Heb',
  'Jas', '1Pet', '2Pet', '1John', '2John', '3John', 'Jude', 'Rev',
]

export function canonicalBookIndex(book: string): number {
  const index = CANONICAL_BOOK_ORDER.indexOf(book)
  return index === -1 ? CANONICAL_BOOK_ORDER.length : index
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

export function clampScale(scale: number): number {
  return clamp(scale, 0.72, 4.2)
}

export function hashString(input: string): number {
  let hash = 0
  for (let i = 0; i < input.length; i += 1) {
    const char = input.charCodeAt(i)
    hash = (hash << 5) - hash + char
    hash |= 0
  }
  return Math.abs(hash)
}

export function fibonacciSpherePoint(index: number, total: number, radius: number) {
  if (total <= 1) return { x: 0, y: 0, z: radius }
  const goldenAngle = Math.PI * (3 - Math.sqrt(5))
  const t = index / (total - 1)
  const yUnit = 1 - t * 2
  const radiusAtY = Math.sqrt(Math.max(0, 1 - yUnit * yUnit))
  const theta = goldenAngle * index
  return {
    x: Math.cos(theta) * radiusAtY * radius,
    y: yUnit * radius,
    z: Math.sin(theta) * radiusAtY * radius,
  }
}

export type AmbientBibleData = {
  bookNodes: NetworkNode[]
  chapterNodes: NetworkNode[]
  chapterByKey: Map<string, NetworkNode>
  verseByChapter: Map<string, Verse[]>
}

export function buildBibleHierarchyNodes(allVerses: Verse[]): AmbientBibleData {
  if (!allVerses.length) {
    return { bookNodes: [], chapterNodes: [], chapterByKey: new Map(), verseByChapter: new Map() }
  }

  const bookOrder: string[] = []
  const bookSeen = new Set<string>()
  const bookNames = new Map<string, string>()
  const chaptersByBook = new Map<string, number[]>()
  const versesByBookChapter = new Map<string, Verse[]>()

  allVerses.forEach((verse) => {
    if (!bookSeen.has(verse.book)) {
      bookSeen.add(verse.book)
      bookOrder.push(verse.book)
      bookNames.set(verse.book, verse.bookName)
    }
    const chapters = chaptersByBook.get(verse.book) ?? []
    if (!chapters.includes(verse.chapter)) chapters.push(verse.chapter)
    chaptersByBook.set(verse.book, chapters)

    const key = `${verse.book}-${verse.chapter}`
    const verses = versesByBookChapter.get(key) ?? []
    verses.push(verse)
    versesByBookChapter.set(key, verses)
  })

  // Enforce canonical book order and numeric chapter/verse order regardless
  // of the order verses were loaded in.
  bookOrder.sort((a, b) => canonicalBookIndex(a) - canonicalBookIndex(b))
  chaptersByBook.forEach((chapters) => chapters.sort((a, b) => a - b))
  versesByBookChapter.forEach((verses) => verses.sort((a, b) => a.verse - b.verse))

  const bookNodes: NetworkNode[] = []
  const chapterNodes: NetworkNode[] = []
  const chapterByKey = new Map<string, NetworkNode>()
  const verseByChapter = new Map<string, Verse[]>()
  const bookRadius = 480
  const chapterRadius = 90

  bookOrder.forEach((book, bookIndex) => {
    const bookPos = fibonacciSpherePoint(bookIndex, bookOrder.length, bookRadius)
    const bookName = bookNames.get(book) ?? book
    const chapters = chaptersByBook.get(book) ?? []

    bookNodes.push({
      id: `book-${book}`,
      kind: 'book' as NetworkKind,
      label: bookName,
      detail: `${chapters.length} chapters`,
      x: bookPos.x,
      y: bookPos.y,
      z: bookPos.z,
      size: 40,
      bookId: book,
      bookName,
    })

    chapters.forEach((chapter, chapterIndex) => {
      const chapterPos = fibonacciSpherePoint(chapterIndex, Math.max(chapters.length, 1), chapterRadius)
      const key = `${book}-${chapter}`
      const chapterNode: NetworkNode = {
        id: `chapter-${key}`,
        kind: 'chapter' as NetworkKind,
        label: `${bookName} ${chapter}`,
        detail: `${(versesByBookChapter.get(key) ?? []).length} verses`,
        x: bookPos.x + chapterPos.x,
        y: bookPos.y + chapterPos.y,
        z: bookPos.z + chapterPos.z,
        size: 18,
        bookId: book,
        bookName,
        chapterNumber: chapter,
        parentId: `book-${book}`,
      }
      chapterNodes.push(chapterNode)
      chapterByKey.set(key, chapterNode)
      verseByChapter.set(key, versesByBookChapter.get(key) ?? [])
    })
  })

  return { bookNodes, chapterNodes, chapterByKey, verseByChapter }
}

export function buildNetworkNodes(
  centerVerse: Verse,
  relatedMatches: VerseMatch[],
  themes: NetworkTheme[],
  selectedPersonId?: string,
  knowledgeGraphSeed?: {
    originalWords: KnowledgeGraphAnchor[]
    topics: KnowledgeGraphAnchor[]
    doctrines: KnowledgeGraphAnchor[]
  },
): NetworkNode[] {
  const nodes: NetworkNode[] = [
    {
      id: `center-${centerVerse.id}`,
      kind: 'center' as NetworkKind,
      label: `${centerVerse.bookName} ${centerVerse.chapter}:${centerVerse.verse}`,
      detail: centerVerse.text.slice(0, 150),
      x: 50,
      y: 50,
      z: 0,
      size: 234,
      verse: centerVerse,
    },
  ]

  const relatedCount = Math.max(relatedMatches.length, 1)
  relatedMatches.forEach((match, index) => {
    const verse = match.verse
    const tier = match.score >= 32 ? 'strong' : match.score >= 24 ? 'medium' : 'soft'
    const baseAngle = (hashString(verse.id) / 3600) * Math.PI * 2
    const spread = (index / relatedCount) * Math.PI * 1.15
    const angle = baseAngle + spread
    const radius = tier === 'strong' ? 18 : tier === 'medium' ? 27 : 38
    const x = clamp(50 + Math.cos(angle) * radius, 10, 90)
    const y = clamp(50 + Math.sin(angle) * radius * (tier === 'soft' ? 0.9 : 1.03), 10, 90)

    nodes.push({
      id: verse.id,
      kind: 'related' as NetworkKind,
      label: `${verse.bookName} ${verse.chapter}:${verse.verse}`,
      detail: match.sharedTerms.slice(0, 3).join(' • ') || `${Math.round(match.score)} strength`,
      x,
      y,
      z: clamp(42 - index * 2.5, 12, 42),
      size: clamp(158 - index * 7, 102, 158),
      verse,
      score: match.score,
      tier,
    })
  })

  themes.forEach((theme, index) => {
    const angle = -Math.PI / 2 + (index / Math.max(themes.length, 1)) * Math.PI * 2
    const radius = 44 + Math.min(index * 2.2, 10)
    const jumpVerseId = relatedMatches.find((match) => match.sharedTerms.includes(theme.label))?.verse.id

    nodes.push({
      id: `theme-${theme.label}`,
      kind: 'theme' as NetworkKind,
      label: theme.label,
      detail: `${theme.count} verses`,
      x: clamp(50 + Math.cos(angle) * radius, 8, 92),
      y: clamp(50 + Math.sin(angle) * radius, 8, 92),
      z: clamp(24 + index * 3, 10, 48),
      size: clamp(118 - index * 5, 84, 118),
      score: theme.weight,
      jumpVerseId,
    })
  })

  const addAnchorNodes = (anchors: KnowledgeGraphAnchor[], kind: 'originalWord' | 'topic' | 'doctrine', radius: number, zBase: number) => {
    anchors.forEach((anchor, index) => {
      const angle = (hashString(anchor.id) / 3600) * Math.PI * 2 + index * 0.28
      const x = clamp(50 + Math.cos(angle) * radius, 6, 94)
      const y = clamp(50 + Math.sin(angle) * radius * 0.88, 6, 94)
      nodes.push({
        id: anchor.id,
        kind,
        label: anchor.label,
        detail: anchor.detail,
        x,
        y,
        z: clamp(zBase + index * 4, 8, 56),
        size: kind === 'doctrine' ? 118 : kind === 'topic' ? 104 : 92,
        score: anchor.count,
        jumpVerseId: anchor.verseIds[0],
      })
    })
  }

  if (knowledgeGraphSeed) {
    addAnchorNodes(knowledgeGraphSeed.originalWords, 'originalWord', 62, 18)
    addAnchorNodes(knowledgeGraphSeed.topics, 'topic', 74, 26)
    addAnchorNodes(knowledgeGraphSeed.doctrines, 'doctrine', 58, 34)
  }

  const people = getCharactersForVerse(centerVerse, 3)
  const places = getPlacesForVerse(centerVerse, 3)

  people.forEach((person, index) => {
    const angle = Math.PI + (index / Math.max(people.length, 1)) * Math.PI + (hashString(person.id) / 3600) * Math.PI * 0.2
    const radius = 52
    const x = clamp(50 + Math.cos(angle) * radius, 5, 95)
    const y = clamp(50 + Math.sin(angle) * radius * 0.9, 5, 95)

    nodes.push({
      id: `person-${person.id}`,
      kind: 'person' as NetworkKind,
      label: person.name,
      detail: person.era || 'Person',
      x,
      y,
      z: clamp(20 + index * 8, 10, 44),
      size: 72,
      score: 0,
    })
  })

  places.forEach((place, index) => {
    const angle = (index / Math.max(places.length, 1)) * Math.PI * 2 + (hashString(place.id) / 3600) * Math.PI * 0.2
    const radius = 62
    const x = clamp(50 + Math.cos(angle) * radius, 5, 95)
    const y = clamp(50 + Math.sin(angle) * radius * 0.9, 5, 95)

    nodes.push({
      id: `place-${place.id}`,
      kind: 'place' as NetworkKind,
      label: place.name,
      detail: place.region || 'Place',
      x,
      y,
      z: clamp(20 + index * 8, 10, 44),
      size: 72,
      score: 0,
    })
  })

  return nodes
}

export function buildNetworkEdges(
  centerVerse: Verse,
  relatedMatches: VerseMatch[],
  themes: NetworkTheme[],
  knowledgeGraphSeed?: {
    originalWords: KnowledgeGraphAnchor[]
    topics: KnowledgeGraphAnchor[]
    doctrines: KnowledgeGraphAnchor[]
  },
): NetworkEdge[] {
  const centerId = `center-${centerVerse.id}`
  const edges: NetworkEdge[] = []

  relatedMatches.forEach((match) => {
    edges.push({
      id: `${centerId}-${match.verse.id}`,
      source: centerId,
      target: match.verse.id,
      weight: clamp(match.score / 40, 0.3, 1),
      kind: 'spoke' as const,
    })
  })

  themes.forEach((theme) => {
    const themeId = `theme-${theme.label}`
    const connected = relatedMatches.filter((match) => match.sharedTerms.includes(theme.label))
    connected.forEach((match) => {
      edges.push({
        id: `${themeId}-${match.verse.id}`,
        source: themeId,
        target: match.verse.id,
        weight: 0.4,
        kind: 'theme' as const,
      })
    })
  })

  if (knowledgeGraphSeed) {
    const addAnchorEdges = (anchors: KnowledgeGraphAnchor[]) => {
      anchors.forEach((anchor) => {
        anchor.verseIds.slice(0, 3).forEach((verseId) => {
          if (verseId !== centerVerse.id && !edges.some((e) => e.source === anchor.id && e.target === verseId)) {
            edges.push({
              id: `${anchor.id}-${verseId}`,
              source: anchor.id,
              target: verseId,
              weight: 0.5,
              kind: 'bridge' as const,
            })
          }
        })
      })
    }

    addAnchorEdges(knowledgeGraphSeed.originalWords)
    addAnchorEdges(knowledgeGraphSeed.topics)
    addAnchorEdges(knowledgeGraphSeed.doctrines)
  }

  return edges
}
