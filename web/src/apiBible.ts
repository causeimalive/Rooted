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

const OSIS_TO_API_BIBLE: Record<string, string> = {
  Gen: 'GEN', Exod: 'EXO', Exo: 'EXO', Lev: 'LEV', Num: 'NUM', Deut: 'DEU', Deu: 'DEU',
  Josh: 'JOS', Jos: 'JOS', Judg: 'JDG', Jdg: 'JDG', Ruth: 'RUT', Rut: 'RUT',
  '1Sam': '1SA', '1Sa': '1SA', '2Sam': '2SA', '2Sa': '2SA',
  '1Kgs': '1KI', '1Ki': '1KI', '2Kgs': '2KI', '2Ki': '2KI',
  '1Chr': '1CH', '1Ch': '1CH', '2Chr': '2CH', '2Ch': '2CH',
  Ezra: 'EZR', Ezr: 'EZR', Neh: 'NEH', Esth: 'EST', Est: 'EST', Job: 'JOB',
  Ps: 'PSA', Psa: 'PSA', Prov: 'PRO', Pro: 'PRO', Eccl: 'ECC', Ecc: 'ECC',
  Song: 'SNG', Sng: 'SNG', Cant: 'SNG', Isa: 'ISA', Jer: 'JER', Lam: 'LAM',
  Ezek: 'EZE', Eze: 'EZE', Dan: 'DAN', Hos: 'HOS', Joel: 'JOL', Joe: 'JOL',
  Amos: 'AMO', Amo: 'AMO', Obad: 'OBA', Oba: 'OBA', Jonah: 'JON', Jon: 'JON',
  Mic: 'MIC', Micah: 'MIC', Nah: 'NAH', Hab: 'HAB', Zeph: 'ZEP', Zep: 'ZEP',
  Hag: 'HAG', Zech: 'ZEC', Zec: 'ZEC', Mal: 'MAL', Malachi: 'MAL',
  Matt: 'MAT', Mat: 'MAT', Mark: 'MRK', Mar: 'MRK', Luke: 'LUK', Luk: 'LUK',
  John: 'JHN', Joh: 'JHN', Jn: 'JHN', Acts: 'ACT', Act: 'ACT', Rom: 'ROM',
  '1Cor': '1CO', '1Co': '1CO', '2Cor': '2CO', '2Co': '2CO', Gal: 'GAL',
  Eph: 'EPH', Phil: 'PHP', Php: 'PHP', Phi: 'PHP', Col: 'COL',
  '1Thess': '1TH', '1Th': '1TH', '2Thess': '2TH', '2Th': '2TH',
  '1Tim': '1TI', '1Ti': '1TI', '2Tim': '2TI', '2Ti': '2TI',
  Titus: 'TIT', Tit: 'TIT', Phlm: 'PHM', Phm: 'PHM',
  Heb: 'HEB', Jas: 'JAS', '1Pet': '1PE', '1Pe': '1PE', '2Pet': '2PE', '2Pe': '2PE',
  '1John': '1JN', '1Jo': '1JN', '1Jn': '1JN', '2John': '2JN', '2Jo': '2JN', '2Jn': '2JN',
  '3John': '3JN', '3Jo': '3JN', '3Jn': '3JN', Jude: 'JUD', Jud: 'JUD', Rev: 'REV',
}

function getApiBibleBookCode(bookId: string): string {
  return OSIS_TO_API_BIBLE[bookId] ?? bookId.toUpperCase()
}

export async function fetchApiBiblePassage(
  bibleId: string,
  reference: ApiBibleReference,
): Promise<BiblePassage | null> {
  const chapterId = `${getApiBibleBookCode(reference.bookId)}.${reference.chapter}`
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
