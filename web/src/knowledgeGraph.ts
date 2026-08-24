import { getVersesWithWord, lookupLexicon, type NetworkTheme, type VerseMatch } from './bible'
import type { KnowledgeGraphAnchor, Verse } from './types'

export interface KnowledgeGraphSeed {
  originalWords: KnowledgeGraphAnchor[]
  topics: KnowledgeGraphAnchor[]
  doctrines: KnowledgeGraphAnchor[]
}

const STOP_WORDS = new Set([
  'a', 'an', 'and', 'as', 'at', 'be', 'but', 'by', 'for', 'from', 'he', 'her', 'him', 'his', 'i', 'in', 'is', 'it', 'me', 'my',
  'of', 'on', 'or', 'our', 'she', 'so', 'that', 'the', 'their', 'them', 'then', 'there', 'these', 'they', 'this', 'to', 'was', 'we',
  'were', 'with', 'you', 'your', 'shall', 'will', 'not', 'thy', 'thou', 'ye', 'unto', 'said', 'say', 'saying', 'says', 'lord', 'god',
])

const DOCTRINE_BUCKETS = [
  {
    id: 'grace',
    label: 'Grace',
    keywords: ['grace', 'mercy', 'favor'],
    detail: 'Unmerited favor, kindness, and covenant mercy.',
  },
  {
    id: 'faith',
    label: 'Faith',
    keywords: ['faith', 'believe', 'trust'],
    detail: 'Trusting God and acting on his promises.',
  },
  {
    id: 'love',
    label: 'Love',
    keywords: ['love', 'charity', 'loveth'],
    detail: 'Covenant devotion, care, and sacrificial love.',
  },
  {
    id: 'salvation',
    label: 'Salvation',
    keywords: ['save', 'salvation', 'redeem', 'deliver'],
    detail: 'Deliverance, rescue, and restoration by God.',
  },
  {
    id: 'kingdom',
    label: 'Kingdom',
    keywords: ['kingdom', 'king', 'reign', 'throne'],
    detail: 'God’s reign, rule, and people under his authority.',
  },
  {
    id: 'covenant',
    label: 'Covenant',
    keywords: ['covenant', 'promise', 'testament', 'oath'],
    detail: 'Binding promises and the story of God’s commitment.',
  },
  {
    id: 'resurrection',
    label: 'Resurrection',
    keywords: ['resurrection', 'rise', 'raised', 'alive'],
    detail: 'New life, restoration, and victory over death.',
  },
  {
    id: 'prayer',
    label: 'Prayer',
    keywords: ['pray', 'prayer', 'supplication', 'intercession'],
    detail: 'Conversation with God, asking and listening in faith.',
  },
]

function tokenize(text: string) {
  return (text.toLowerCase().match(/[a-z']+/g) ?? []).map((token) => token.replace(/^'+|'+$/g, ''))
}

function unique(values: string[]) {
  return Array.from(new Set(values.filter(Boolean)))
}

function verseIdsForWord(word: string, centerVerse: Verse) {
  const verses = getVersesWithWord(word)
  return unique([centerVerse.id, ...verses.slice(0, 5).map((verse) => verse.id)])
}

function makeOriginalWordAnchors(centerVerse: Verse): KnowledgeGraphAnchor[] {
  const seen = new Set<string>()
  const anchors: KnowledgeGraphAnchor[] = []

  for (const token of tokenize(centerVerse.text)) {
    if (seen.has(token) || token.length < 4 || STOP_WORDS.has(token)) continue
    const entry = lookupLexicon(token)
    if (!entry) continue

    const verseIds = verseIdsForWord(token, centerVerse)
    seen.add(token)
    anchors.push({
      id: `originalWord-${token}`,
      kind: 'originalWord',
      label: token,
      detail: entry.kjvMeaning || entry.modernMeaning || entry.historicalContext,
      count: verseIds.length,
      verseIds,
    })

    if (anchors.length >= 4) break
  }

  return anchors
}

function makeTopicAnchors(themes: NetworkTheme[], relatedMatches: VerseMatch[]): KnowledgeGraphAnchor[] {
  return themes.slice(0, 5).map((theme) => {
    const verseIds = unique(
      relatedMatches
        .filter((match) => match.sharedTerms.includes(theme.label))
        .map((match) => match.verse.id),
    )

    return {
      id: `topic-${theme.label}`,
      kind: 'topic',
      label: theme.label,
      detail: `${theme.count} verses in the current graph`,
      count: theme.count,
      verseIds,
    }
  })
}

function makeDoctrineAnchors(centerVerse: Verse, relatedMatches: VerseMatch[]): KnowledgeGraphAnchor[] {
  const contextVerses = [centerVerse, ...relatedMatches.slice(0, 8).map((match) => match.verse)]
  const contextText = contextVerses.map((verse) => verse.text.toLowerCase())
  const anchors: KnowledgeGraphAnchor[] = []

  for (const bucket of DOCTRINE_BUCKETS) {
    const verseIds = unique(
      contextVerses
        .filter((verse) => bucket.keywords.some((keyword) => new RegExp(`\\b${keyword}\\b`, 'i').test(verse.text)))
        .map((verse) => verse.id),
    )
    const keywordHits = contextText.reduce((total, text) => {
      return total + bucket.keywords.reduce((hits, keyword) => hits + (new RegExp(`\\b${keyword}\\b`, 'i').test(text) ? 1 : 0), 0)
    }, 0)

    if (!keywordHits && verseIds.length === 0) continue

    const entry = lookupLexicon(bucket.label)
    anchors.push({
      id: `doctrine-${bucket.id}`,
      kind: 'doctrine',
      label: bucket.label,
      detail: entry ? `${entry.kjvMeaning} ${entry.modernMeaning ? `· ${entry.modernMeaning}` : ''}`.trim() : bucket.detail,
      count: Math.max(keywordHits, verseIds.length),
      verseIds: verseIds.length ? verseIds : [centerVerse.id],
    })
  }

  return anchors.sort((a, b) => b.count - a.count || a.label.localeCompare(b.label)).slice(0, 4)
}

export function buildKnowledgeGraphSeed(centerVerse: Verse, relatedMatches: VerseMatch[], themes: NetworkTheme[]): KnowledgeGraphSeed {
  return {
    originalWords: makeOriginalWordAnchors(centerVerse),
    topics: makeTopicAnchors(themes, relatedMatches),
    doctrines: makeDoctrineAnchors(centerVerse, relatedMatches),
  }
}
