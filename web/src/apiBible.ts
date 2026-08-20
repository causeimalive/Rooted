import type { BiblePassage } from '@youversion/platform-core'

export type ApiBibleReference = {
  bookId: string
  chapter: number
}

export type ApiBibleVersionMatch = {
  title: string
  localized_title?: string
  abbreviation?: string
  localized_abbreviation?: string
  language_tag?: string | null
}

type ApiBible = {
  id: string
  dblId: string
  name: string
  abbreviation: string
  language: {
    id: string
    name: string
    script: string
  }
  countries?: Array<{ id: string; name: string }>
}

type ApiBibleList = {
  data: ApiBible[]
}

type ApiBibleChapter = {
  data: {
    id: string
    number: string
    reference: string
    content: string
  }
}

const API_BASE = 'https://rest.api.bible/v1'

let biblesCache: ApiBible[] | null = null
let biblesPromise: Promise<ApiBible[]> | null = null

function getApiKey(): string | null {
  return import.meta.env?.VITE_API_BIBLE_KEY ?? null
}

async function fetchWithKey<T>(path: string, init?: RequestInit): Promise<T | null> {
  const apiKey = getApiKey()
  if (!apiKey) return null

  const response = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      'api-key': apiKey,
      Accept: 'application/json',
      ...(init?.headers ?? {}),
    },
  })

  if (!response.ok) return null
  return (await response.json()) as T
}

export async function fetchApiBibleBibles(): Promise<ApiBible[]> {
  if (biblesCache) return biblesCache
  if (biblesPromise) return biblesPromise

  biblesPromise = fetchWithKey<ApiBibleList>('/bibles').then((result) => {
    biblesCache = result?.data ?? []
    return biblesCache
  })

  return biblesPromise
}

function normalizeForMatch(value?: string | null): string {
  return (value ?? '').toLowerCase().replace(/[^a-z0-9]/g, '')
}

export function findApiBibleId(
  version: ApiBibleVersionMatch,
  bibles: readonly ApiBible[],
): string | null {
  const targets = [
    normalizeForMatch(version.abbreviation),
    normalizeForMatch(version.localized_abbreviation),
    normalizeForMatch(version.title),
    normalizeForMatch(version.localized_title),
  ].filter(Boolean)

  const names = [
    normalizeForMatch(version.title),
    normalizeForMatch(version.localized_title),
  ].filter(Boolean)

  for (const bible of bibles) {
    const bibleAbbr = normalizeForMatch(bible.abbreviation)
    const bibleName = normalizeForMatch(bible.name)
    if (targets.some((target) => target === bibleAbbr)) return bible.id
    if (names.some((name) => bibleName.includes(name) || name.includes(bibleName))) return bible.id
  }

  return null
}

function normalizeApiBibleContent(html: string): string {
  const parser = new DOMParser()
  const doc = parser.parseFromString(html, 'text/html')

  const verseSpans = Array.from(doc.querySelectorAll<HTMLElement>('span.v'))
  for (const span of verseSpans) {
    const verseNumber = span.getAttribute('data-number')?.trim() ?? span.textContent?.trim() ?? ''
    if (!verseNumber || !/^\d+$/.test(verseNumber)) continue

    const wrapper = doc.createElement('span')
    wrapper.className = 'yv-v'
    wrapper.setAttribute('v', verseNumber)

    const label = doc.createElement('span')
    label.className = 'yv-vlbl'
    label.textContent = verseNumber
    wrapper.appendChild(label)

    let current: Node | null = span.nextSibling
    while (current) {
      const next = current.nextSibling
      const isNextVerse =
        current instanceof HTMLElement && current.classList.contains('v')
      if (isNextVerse) break
      wrapper.appendChild(current)
      current = next
    }

    span.replaceWith(wrapper)
  }

  return doc.body.innerHTML
}

export async function fetchApiBiblePassage(
  bibleId: string,
  reference: ApiBibleReference,
): Promise<BiblePassage | null> {
  const chapterId = `${reference.bookId.toUpperCase()}.${reference.chapter}`
  const result = await fetchWithKey<ApiBibleChapter>(`/bibles/${bibleId}/chapters/${chapterId}`)
  if (!result?.data?.content) return null

  return {
    id: result.data.id,
    content: normalizeApiBibleContent(result.data.content),
    reference: result.data.reference,
  }
}

export async function canUseApiBible(
  version: ApiBibleVersionMatch,
): Promise<{ bibleId: string; bibles: ApiBible[] } | null> {
  const bibles = await fetchApiBibleBibles()
  const bibleId = findApiBibleId(version, bibles)
  if (!bibleId) return null
  return { bibleId, bibles }
}
