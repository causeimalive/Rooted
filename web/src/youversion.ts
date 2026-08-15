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
  const key = import.meta.env.VITE_YVP_APP_KEY?.trim()
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

async function requestYouVersion<T>(path: string, query?: Record<string, string | number | boolean | undefined>): Promise<T> {
  const response = await fetch(buildUrl(path, query), {
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
  const response = await requestYouVersion<{ data?: YouVersionLanguage[] } | YouVersionLanguage[]>('/languages', options as unknown as Record<string, string | number | boolean | undefined>)
  return Array.isArray(response) ? response : response.data ?? []
}

export interface YouVersionSearchHit {
  id: string
  reference: string
  text: string
  url?: string
}

export interface YouVersionSearchResponse {
  data?: YouVersionSearchHit[]
  hits?: YouVersionSearchHit[]
  total?: number
}

const YOUVERSION_LEGACY_SEARCH_BASE = 'https://search.youversionapi.com'

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
  const response = await fetch(url.toString(), {
    headers: { 'X-YVP-App-Key': getAppKey() },
  })
  if (!response.ok) {
    const message = await response.text().catch(() => '')
    throw new Error(`YouVersion request failed (${response.status}): ${message || response.statusText}`)
  }
  return response.json() as Promise<T>
}

export async function fetchYouVersionSearch(
  query: string,
  versionId: number,
  options: { page?: number; perPage?: number } = {},
): Promise<YouVersionSearchHit[]> {
  const response = await requestYouVersionLegacy<YouVersionSearchResponse>(
    YOUVERSION_LEGACY_SEARCH_BASE,
    '/3.1/bible.json',
    {
      query,
      version_id: versionId,
      page: options.page ?? 1,
    },
  )
  return response.data ?? response.hits ?? []
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
