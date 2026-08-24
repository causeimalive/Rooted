import { onRequest } from 'firebase-functions/v2/https'
import type { Request, Response } from 'express'
import { logger } from 'firebase-functions'
import { isAllowedOrigin, setCorsHeaders } from './cors'

type VerseRecord = {
  id: string
  book: string
  bookName: string
  chapter: number
  verse: number
  text: string
}

type GraphAnalysisTopItem = {
  label: string
  count: number
}

export type GraphAnalysisSummary = {
  computedAt: string
  verseCount: number
  bookCount: number
  uniqueTermCount: number
  averageUniqueTermsPerVerse: number
  topBooks: GraphAnalysisTopItem[]
  topTerms: GraphAnalysisTopItem[]
  topVerses: Array<{
    verseId: string
    reference: string
    score: number
  }>
}

const STOPWORDS = new Set([
  'the', 'and', 'that', 'with', 'from', 'have', 'this', 'unto', 'they', 'there', 'their', 'shall', 'which', 'will',
  'were', 'when', 'then', 'them', 'into', 'upon', 'what', 'your', 'thou', 'thee', 'his', 'her', 'for', 'but', 'not',
  'are', 'all', 'had', 'has', 'was', 'who', 'out', 'him', 'she', 'our', 'you', 'its', 'thy', 'may', 'one', 'two',
  'god', 'lord', 'jesus', 'christ', 'said', 'say', 'saith', 'also', 'can', 'could', 'would', 'should', 'been', 'being',
  'here', 'very', 'more', 'most', 'much', 'many', 'after', 'before', 'over', 'under',
])

let cachedSummaryPromise: Promise<GraphAnalysisSummary> | null = null
let cachedSummary: GraphAnalysisSummary | null = null

function resolveBaseUrl(req: Request): string {
  const forwardedProto = typeof req.headers['x-forwarded-proto'] === 'string' ? req.headers['x-forwarded-proto'] : undefined
  const proto = forwardedProto ?? 'https'
  const forwardedHost = typeof req.headers['x-forwarded-host'] === 'string' ? req.headers['x-forwarded-host'] : undefined
  const host = forwardedHost ?? (typeof req.headers.host === 'string' ? req.headers.host : 'rootedinchrist-faith-2026.web.app')
  return `${proto}://${host}`
}

function tokenize(text: string): string[] {
  return (text.toLowerCase().match(/\b[a-z]{4,}\b/g) ?? []).filter((word) => !STOPWORDS.has(word))
}

async function loadBible(baseUrl: string): Promise<VerseRecord[]> {
  const response = await fetch(`${baseUrl}/data/bible.json`, { cache: 'no-store' })
  if (!response.ok) {
    throw new Error(`Failed to load bible.json: ${response.status} ${response.statusText}`)
  }
  return (await response.json()) as VerseRecord[]
}

async function computeGraphSummary(req: Request): Promise<GraphAnalysisSummary> {
  const baseUrl = resolveBaseUrl(req)
  const verses = await loadBible(baseUrl)

  const bookCounts = new Map<string, number>()
  const termCounts = new Map<string, number>()
  const verseTerms = new Map<string, string[]>()
  const totalUniqueTerms = new Set<string>()

  for (let i = 0; i < verses.length; i += 1) {
    const verse = verses[i]
    bookCounts.set(verse.bookName, (bookCounts.get(verse.bookName) ?? 0) + 1)

    const uniqueTerms = Array.from(new Set(tokenize(verse.text)))
    verseTerms.set(verse.id, uniqueTerms)
    uniqueTerms.forEach((term) => {
      totalUniqueTerms.add(term)
      termCounts.set(term, (termCounts.get(term) ?? 0) + 1)
    })

    if (i > 0 && i % 1024 === 0) {
      await new Promise<void>((resolve) => setTimeout(resolve, 0))
    }
  }

  const topTerms = Array.from(termCounts.entries())
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 12)
    .map(([label, count]) => ({ label, count }))

  const topBooks = Array.from(bookCounts.entries())
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 10)
    .map(([label, count]) => ({ label, count }))

  const verseScores = verses
    .map((verse) => {
      const terms = verseTerms.get(verse.id) ?? []
      const score = terms.reduce((total, term) => total + 1 / Math.sqrt((termCounts.get(term) ?? 1) || 1), 0)
      return {
        verseId: verse.id,
        reference: `${verse.bookName} ${verse.chapter}:${verse.verse}`,
        score,
      }
    })
    .sort((a, b) => b.score - a.score || a.reference.localeCompare(b.reference))
    .slice(0, 10)

  return {
    computedAt: new Date().toISOString(),
    verseCount: verses.length,
    bookCount: bookCounts.size,
    uniqueTermCount: totalUniqueTerms.size,
    averageUniqueTermsPerVerse: verses.length ? Number((Array.from(verseTerms.values()).reduce((sum, terms) => sum + terms.length, 0) / verses.length).toFixed(2)) : 0,
    topBooks,
    topTerms,
    topVerses: verseScores,
  }
}

export const analyzeBibleGraph = onRequest({ region: 'us-central1' }, async (req: Request, res: Response) => {
  const origin = typeof req.headers.origin === 'string' ? req.headers.origin : undefined
  const allowedOrigin = isAllowedOrigin(origin)
  setCorsHeaders(res, allowedOrigin, 'GET, OPTIONS')

  if (req.method === 'OPTIONS') {
    res.status(204).end()
    return
  }

  try {
    if (!cachedSummaryPromise) {
      cachedSummaryPromise = computeGraphSummary(req).then((summary) => {
        cachedSummary = summary
        return summary
      })
    }
    const summary = cachedSummary ?? (await cachedSummaryPromise)
    cachedSummary = summary
    res.setHeader('Content-Type', 'application/json; charset=utf-8')
    res.status(200).send(summary)
  } catch (error) {
    logger.error('Graph analysis failed', error)
    cachedSummaryPromise = null
    res.status(502).send({ error: 'Graph analysis failed' })
  }
})
