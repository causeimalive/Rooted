export const YOUVERSION_API_BASE = 'https://rootedinchrist.faith/api/youversion/v1'
export const DEFAULT_YOUVERSION_LANGUAGE_RANGES = 'en'

export interface YouVersionVersion {
  id: number
  abbreviation?: string
  localized_abbreviation?: string
  title: string
  localized_title?: string
  language_tag?: string
  copyright?: string
  books?: string[]
  publisher_url?: string
  youversion_deep_link?: string
}

export interface YouVersionVerseRef {
  id: string
  passage_id?: string
  title: string
}

export interface YouVersionChapter {
  id: string
  passage_id?: string
  title: string
  verses?: YouVersionVerseRef[]
}

export interface YouVersionBook {
  id: string
  title: string
  full_title?: string
  abbreviation?: string
  canon?: string
  intro?: {
    id: string
    passage_id?: string
    title: string
  }
  chapters?: YouVersionChapter[]
}

export interface YouVersionPassage {
  id: string
  content: string
  reference: string
}

export interface YouVersionLanguage {
  id: string
  language: string
  script?: string
  script_name?: string
  localized_name?: string
  aliases?: string[]
  display_names?: Record<string, string>
  countries?: string[]
  text_direction?: 'ltr' | 'rtl'
  default_bible_id?: number
}

export interface YouVersionIndex {
  books: YouVersionBook[]
}

export interface YouVersionPassageOptions {
  format?: 'text' | 'html'
  includeHeadings?: boolean
  includeNotes?: boolean
}

export interface YouVersionLanguageOptions {
  country: string
  page_size?: number
  page_token?: string
}

function getAppKey(): string {
  const fromVite = typeof import.meta.env !== 'undefined' ? (import.meta.env.VITE_YVP_APP_KEY?.trim() as string | undefined) : undefined
  const fromProcess = typeof process !== 'undefined' ? process.env?.VITE_YVP_APP_KEY?.trim() : undefined
  const key = fromVite ?? fromProcess
  if (!key) {
    throw new Error('Missing VITE_YVP_APP_KEY. Add your YouVersion app key to the web app environment.')
  }
  return key
}

function buildUrl(path: string, query?: Record<string, string | number | boolean | undefined>): string {
  const url = new URL(path, YOUVERSION_API_BASE)
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value === undefined || value === '') continue
      url.searchParams.set(key, String(value))
    }
  }
  return url.toString()
}

function fetchWithTimeout(url: string, init: RequestInit & { timeoutMs?: number } = {}): Promise<Response> {
  const { timeoutMs = 15000, ...rest } = init
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)
  return fetch(url, { ...rest, signal: controller.signal })
    .finally(() => clearTimeout(timeout))
    .catch((error) => {
      if (error instanceof DOMException && error.name === 'AbortError') {
        throw new Error(`Request timed out after ${timeoutMs}ms`)
      }
      throw error
    })
}

async function requestYouVersion<T>(path: string, query?: Record<string, string | number | boolean | undefined>): Promise<T> {
  const response = await fetchWithTimeout(buildUrl(path, query), {
    headers: {
      'X-YVP-App-Key': getAppKey(),
    },
  })

  if (!response.ok) {
    const message = await response.text().catch(() => '')
    throw new Error(`YouVersion request failed (${response.status}): ${message || response.statusText}`)
  }

  return response.json() as Promise<T>
}

export async function fetchYouVersionVersions(languageRanges = DEFAULT_YOUVERSION_LANGUAGE_RANGES): Promise<YouVersionVersion[]> {
  const response = await requestYouVersion<{ data?: YouVersionVersion[] } | YouVersionVersion[]>('/bibles', {
    language_ranges: languageRanges,
  })
  return Array.isArray(response) ? response : response.data ?? []
}

export async function fetchYouVersionVersion(versionId: number): Promise<YouVersionVersion> {
  return requestYouVersion<YouVersionVersion>(`/bibles/${versionId}`)
}

export async function fetchYouVersionBooks(versionId: number): Promise<YouVersionBook[]> {
  const response = await requestYouVersion<{ data?: YouVersionBook[] } | YouVersionBook[]>(`/bibles/${versionId}/books`)
  return Array.isArray(response) ? response : response.data ?? []
}

export async function fetchYouVersionBook(versionId: number, book: string): Promise<YouVersionBook> {
  return requestYouVersion<YouVersionBook>(`/bibles/${versionId}/books/${encodeURIComponent(book)}`)
}

export async function fetchYouVersionChapters(versionId: number, book: string): Promise<YouVersionChapter[]> {
  const response = await requestYouVersion<{ data?: YouVersionChapter[] } | YouVersionChapter[]>(
    `/bibles/${versionId}/books/${encodeURIComponent(book)}/chapters`,
  )
  return Array.isArray(response) ? response : response.data ?? []
}

export async function fetchYouVersionChapter(versionId: number, book: string, chapter: number): Promise<YouVersionChapter> {
  return requestYouVersion<YouVersionChapter>(`/bibles/${versionId}/books/${encodeURIComponent(book)}/chapters/${chapter}`)
}

export async function fetchYouVersionVerses(versionId: number, book: string, chapter: number): Promise<YouVersionVerseRef[]> {
  const response = await requestYouVersion<{ data?: YouVersionVerseRef[] } | YouVersionVerseRef[]>(
    `/bibles/${versionId}/books/${encodeURIComponent(book)}/chapters/${chapter}/verses`,
  )
  return Array.isArray(response) ? response : response.data ?? []
}

export async function fetchYouVersionVerse(versionId: number, book: string, chapter: number, verse: number): Promise<YouVersionVerseRef> {
  return requestYouVersion<YouVersionVerseRef>(
    `/bibles/${versionId}/books/${encodeURIComponent(book)}/chapters/${chapter}/verses/${verse}`,
  )
}

export async function fetchYouVersionPassage(
  versionId: number,
  usfm: string,
  options: YouVersionPassageOptions = {},
): Promise<YouVersionPassage> {
  return requestYouVersion<YouVersionPassage>(`/bibles/${versionId}/passages/${encodeURIComponent(usfm)}`, {
    format: options.format ?? 'html',
    include_headings: options.includeHeadings ?? true,
    include_notes: options.includeNotes ?? true,
  })
}

export async function fetchYouVersionIndex(versionId: number): Promise<YouVersionIndex> {
  return requestYouVersion<YouVersionIndex>(`/bibles/${versionId}/index`)
}

export async function fetchYouVersionLanguages(options: YouVersionLanguageOptions): Promise<YouVersionLanguage[]> {
  const all: YouVersionLanguage[] = []
  let pageToken: string | undefined = options.page_token
  do {
    const response = await requestYouVersion<{ data?: YouVersionLanguage[]; next_page_token?: string | null } | YouVersionLanguage[]>('/languages', {
      country: options.country,
      page_size: options.page_size ?? 99,
      page_token: pageToken,
    } as unknown as Record<string, string | number | boolean | undefined>)
    if (Array.isArray(response)) {
      all.push(...response)
      break
    }
    all.push(...(response.data ?? []))
    pageToken = response.next_page_token ?? undefined
  } while (pageToken)
  return all
}

async function requestYouVersionLegacy<T>(
  base: string,
  path: string,
  query?: Record<string, string | number | boolean | undefined>,
): Promise<T> {
  const host = new URL(base).host
  const url = new URL('/api/youversion' + path, 'https://rootedinchrist.faith')
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value === undefined || value === '') continue
      url.searchParams.set(key, String(value))
    }
  }
  url.searchParams.set('host', host)
  const response = await fetchWithTimeout(url.toString(), {
    timeoutMs: 10000,
    headers: { 'X-YVP-App-Key': getAppKey() },
  })
  if (!response.ok) {
    const message = await response.text().catch(() => '')
    throw new Error(`YouVersion request failed (${response.status}): ${message || response.statusText}`)
  }
  return response.json() as Promise<T>
}

export interface YouVersionAudioDownloadUrls {
  format_mp3_32k?: string
  format_mp3_64k?: string
  format_mp3_128k?: string
  format_aac_32k?: string
  format_aac_64k?: string
  format_aac_128k?: string
}

export interface YouVersionAudioChapter {
  reference?: {
    usfm?: string[]
    human?: string
    version_id?: number
  }
  audio?: Array<{
    id: number
    version_id: number
    title?: string
    download_urls?: YouVersionAudioDownloadUrls
  }>
}

interface YouVersionLegacyEnvelope<T> {
  response: {
    code: number
    data: T
    buildtime?: string
  }
}

export async function fetchYouVersionAudioChapter(
  versionId: number,
  reference: string,
): Promise<YouVersionAudioChapter> {
  const result = await requestYouVersionLegacy<YouVersionLegacyEnvelope<YouVersionAudioChapter>>(
    'https://audio-bible.youversionapi.com',
    '/3.1/chapter.json',
    { version_id: versionId, reference },
  )
  if (result.response.code !== 200) {
    throw new Error(`Audio request failed: ${result.response.code}`)
  }
  return result.response.data
}
