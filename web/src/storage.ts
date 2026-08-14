import { Bookmark, Memory, Note, RecentSearch, Verse } from './types'
import { getAllVerses } from './bible'
import {
  ApiClient,
  BibleClient,
  HighlightsClient,
  YouVersionPlatformConfiguration,
} from '@youversion/platform-core'
import {
  clearRecentSearchesDB,
  deleteBookmarkDB,
  deleteNoteDB,
  getBookmarksDB,
  getNotesDB,
  getRecentSearchesDB,
  saveBookmarkDB,
  saveNoteDB,
  saveRecentSearchDB,
} from './indexedStorage'
import {
  clearUserRecentSearches,
  deleteUserBookmark,
  deleteUserNote,
  deleteUserRecentSearch,
  getUserBookmarks,
  getUserNotes,
  getUserRecentSearches,
  saveUserBookmark,
  saveUserNote,
  saveUserRecentSearch,
} from './cloudStorage'

const NOTES_KEY = 'bible.notes'
const BOOKMARKS_KEY = 'bible.bookmarks'
const MEMORIES_KEY = 'bible.memories'
const USER_KEY = 'bible.user'
const RECENT_SEARCHES_KEY = 'bible.recentSearches'
const MAX_RECENT_SEARCHES = 25

let currentUserId: string | null = null

export function getCurrentUserId(): string | null {
  return currentUserId
}

function itemTimestamp(item: { createdAt?: string; updatedAt?: string }): number {
  return new Date(item.updatedAt || item.createdAt || 0).getTime()
}

function mergeById<T extends { id: string; createdAt?: string; updatedAt?: string }>(
  local: T[],
  cloud: T[],
): T[] {
  const map = new Map<string, T>()
  for (const item of cloud) {
    map.set(item.id, item)
  }
  for (const item of local) {
    const existing = map.get(item.id)
    if (!existing || itemTimestamp(item) > itemTimestamp(existing)) {
      map.set(item.id, item)
    }
  }
  return Array.from(map.values())
}

function normalizeRecentSearches(searches: RecentSearch[]): RecentSearch[] {
  const seen = new Set<string>()
  const unique: RecentSearch[] = []
  const sorted = [...searches].sort((a, b) => itemTimestamp(b) - itemTimestamp(a))
  for (const search of sorted) {
    const key = `${search.verseId}:${search.versionId ?? ''}` || search.query
    if (seen.has(key)) continue
    seen.add(key)
    unique.push(search)
  }
  return unique.slice(0, MAX_RECENT_SEARCHES)
}

function normalizeBookmarks(bookmarks: Bookmark[]): Bookmark[] {
  const seen = new Set<string>()
  const unique: Bookmark[] = []
  const sorted = [...bookmarks].sort((a, b) => itemTimestamp(b) - itemTimestamp(a))
  for (const bm of sorted) {
    const key = `${bm.verseId}:${bm.versionId ?? ''}`
    if (seen.has(key)) continue
    seen.add(key)
    unique.push(bm)
  }
  return unique
}

export async function syncUserData(userId: string) {
  currentUserId = userId
  let cloudBookmarks: Bookmark[] = []
  let cloudNotes: Note[] = []
  let cloudRecent: RecentSearch[] = []
  try {
    ;[cloudBookmarks, cloudNotes, cloudRecent] = await Promise.all([
      getUserBookmarks(userId),
      getUserNotes(userId),
      getUserRecentSearches(userId),
    ])
  } catch {
    // If cloud access is not permitted, fall back to local-only sync.
  }

  const mergedBookmarks = normalizeBookmarks(
    mergeById(get<Bookmark>(BOOKMARKS_KEY), cloudBookmarks),
  )
  const mergedNotes = mergeById(getNotes(), cloudNotes).sort(
    (a, b) => itemTimestamp(b) - itemTimestamp(a),
  )
  const mergedRecent = normalizeRecentSearches(
    mergeById(get<RecentSearch>(RECENT_SEARCHES_KEY), cloudRecent),
  )

  set(BOOKMARKS_KEY, mergedBookmarks)
  set(NOTES_KEY, mergedNotes)
  set(RECENT_SEARCHES_KEY, mergedRecent)

  try {
    await Promise.all([
      Promise.all(mergedBookmarks.map((b) => saveUserBookmark(userId, b))),
      Promise.all(mergedNotes.map((n) => saveUserNote(userId, n))),
      Promise.all(mergedRecent.map((r) => saveUserRecentSearch(userId, r))),
    ])
  } catch {
    // Cloud write may fail for users without the right permissions; local data is already in sync.
  }

  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event('bible-study-storage-hydrated'))
  }
}

export function importYouVersionHighlights(
  items: { verseId: string; color?: string }[],
  versionId: string,
  versionAbbreviation: string,
) {
  const existing = getBookmarks()
  const additions: Bookmark[] = []
  for (const item of items) {
    if (existing.some((b) => b.verseId === item.verseId && b.versionId === versionId)) continue
    const bookmark: Bookmark = {
      id: crypto.randomUUID(),
      verseId: item.verseId,
      label: item.color ? `#${item.color}` : versionAbbreviation || 'Bookmarked',
      createdAt: new Date().toISOString(),
      versionId,
      versionAbbreviation,
      color: item.color,
    }
    additions.push(bookmark)
  }
  if (!additions.length) return
  const next = normalizeBookmarks([...additions, ...existing])
  set(BOOKMARKS_KEY, next)
  for (const bookmark of additions) {
    void saveBookmarkDB(bookmark).catch(() => {})
    if (currentUserId) void saveUserBookmark(currentUserId, bookmark).catch(() => {})
  }
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event('bible-study-storage-hydrated'))
  }
}

export async function importAllYouVersionHighlights(
  versionId: number,
  onProgress?: (done: number, total: number, current: string) => void,
  bookIds?: string[],
): Promise<number> {
  const all = getAllVerses()
  if (!all.length) throw new Error('Bible data is not loaded yet')

  const appKey = YouVersionPlatformConfiguration.appKey
  if (!appKey) throw new Error('YouVersion app key is not configured')

  const lat = YouVersionPlatformConfiguration.accessToken
  if (!lat) throw new Error('YouVersion token is missing. Please sign in again.')

  const apiClient = new ApiClient({
    appKey,
    apiHost: YouVersionPlatformConfiguration.apiHost,
    installationId: YouVersionPlatformConfiguration.installationId,
    timeout: 15000,
  })
  const bibleClient = new BibleClient(apiClient)
  const highlightsClient = new HighlightsClient(apiClient)

  const books = await bibleClient.getBooks(versionId)
  const targetBooks = bookIds?.length ? books.data.filter((b) => bookIds.includes(b.id)) : books.data
  const nameToCode = new Map<string, string>()
  const usfmToCode = new Map<string, string>()
  const verseByRef = new Map<string, Verse>()
  for (const v of all) {
    if (!nameToCode.has(v.bookName)) nameToCode.set(v.bookName, v.book)
    if (!usfmToCode.has(v.book.toUpperCase())) usfmToCode.set(v.book.toUpperCase(), v.book)
    verseByRef.set(`${v.book}:${v.chapter}:${v.verse}`, v)
  }
  const bookCodeById: Record<string, string> = {}
  for (const book of targetBooks) {
    const code =
      nameToCode.get(book.title) ||
      (book.abbreviation ? nameToCode.get(book.abbreviation) : undefined) ||
      usfmToCode.get(book.id.toUpperCase()) ||
      book.id
    bookCodeById[book.id.toUpperCase()] = code
  }

  const chapterInfos: { bookId: string; passageId: string }[] = []
  for (const book of targetBooks) {
    const chapters = await bibleClient.getChapters(versionId, book.id)
    for (const chapter of chapters.data) {
      chapterInfos.push({ bookId: book.id, passageId: chapter.passage_id })
    }
  }

  const REQUEST_DELAY_MS = 1200
  const MAX_RETRIES = 2
  const delay = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))
  let done = 0
  let imported = 0
  for (const info of chapterInfos) {
    let retries = 0
    let items: { verseId: string; color?: string }[] = []
    while (retries <= MAX_RETRIES) {
      try {
        const { data } = await highlightsClient.getHighlights(
          { version_id: versionId, passage_id: info.passageId },
          lat,
        )
        for (const h of data) {
          const parts = h.passage_id.split('.')
          const bookId = parts[0]
          const chapter = Number(parts[1])
          const versePart = parts[2]
          if (!bookId || !Number.isFinite(chapter) || !versePart) continue
          const localBookCode = bookCodeById[bookId.toUpperCase()] ?? bookId.toUpperCase()
          const [firstStr, lastStr] = versePart.split('-')
          const first = Number(firstStr)
          const last = lastStr ? Number(lastStr) : first
          if (!Number.isFinite(first)) continue
          const end = Number.isFinite(last) ? last : first
          for (let v = first; v <= end; v++) {
            const match = verseByRef.get(`${localBookCode}:${chapter}:${v}`)
            if (match) items.push({ verseId: match.id, color: h.color })
          }
        }
        break
      } catch (error: any) {
        const status = error?.status ?? error?.response?.status
        if (status === 429) {
          const retryAfter = Number(error?.headers?.['retry-after'] ?? error?.response?.headers?.['retry-after'] ?? 60)
          onProgress?.(done, chapterInfos.length, `throttled - waiting ${retryAfter}s`)
          await delay(retryAfter * 1000)
          retries++
          continue
        }
        console.warn('YouVersion highlights fetch failed for', info.passageId, error)
        break
      }
    }
    done++
    onProgress?.(done, chapterInfos.length, info.passageId)
    if (items.length) {
      importYouVersionHighlights(items, String(versionId), 'YouVersion')
      imported += items.length
    }
    if (done < chapterInfos.length) {
      await delay(REQUEST_DELAY_MS)
    }
  }
  return imported
}

export function clearCurrentUser() {
  currentUserId = null
}

let indexedDBHydrated = false

async function hydrateFromIndexedDB() {
  if (indexedDBHydrated) return
  indexedDBHydrated = true
  try {
    const needsNotes = localStorage.getItem(NOTES_KEY) === null
    const needsBookmarks = localStorage.getItem(BOOKMARKS_KEY) === null
    const needsRecentSearches = localStorage.getItem(RECENT_SEARCHES_KEY) === null
    const [notes, bookmarks, recent] = await Promise.all([
      getNotesDB(),
      getBookmarksDB(),
      getRecentSearchesDB(),
    ])
    if (needsNotes && notes.length) localStorage.setItem(NOTES_KEY, JSON.stringify(notes))
    if (needsBookmarks && bookmarks.length) localStorage.setItem(BOOKMARKS_KEY, JSON.stringify(normalizeBookmarks(bookmarks)))
    if (needsRecentSearches && recent.length) localStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(normalizeRecentSearches(recent)))
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new Event('bible-study-storage-hydrated'))
    }
  } catch {
    // IndexedDB is optional; localStorage remains authoritative.
  }
}

void hydrateFromIndexedDB()

export interface User {
  id: string
  name: string
  email: string
}

export function getUser(): User | null {
  const raw = localStorage.getItem(USER_KEY)
  return raw ? JSON.parse(raw) : null
}

export function setUser(user: User) {
  localStorage.setItem(USER_KEY, JSON.stringify(user))
}

export function clearUser() {
  localStorage.removeItem(USER_KEY)
}

function get<T>(key: string): T[] {
  try {
    return JSON.parse(localStorage.getItem(key) || '[]')
  } catch {
    return []
  }
}

function set<T>(key: string, value: T[]) {
  localStorage.setItem(key, JSON.stringify(value))
}

export function getNotes(): Note[] {
  return get<Note>(NOTES_KEY)
}

export function getBookmarks(): Bookmark[] {
  return normalizeBookmarks(get<Bookmark>(BOOKMARKS_KEY))
}

export function saveNote(verseId: string, body: string): Note {
  const notes = getNotes()
  const existing = notes.find((n) => n.verseId === verseId)
  const id = existing ? existing.id : crypto.randomUUID()
  const note: Note = { id, verseId, body, updatedAt: new Date().toISOString() }
  const next = [note, ...notes.filter((n) => n.verseId !== verseId)]
  set(NOTES_KEY, next)
  void saveNoteDB(note).catch(() => {})
  if (currentUserId) void saveUserNote(currentUserId, note).catch(() => {})
  return note
}

export function deleteNote(id: string) {
  set(NOTES_KEY, getNotes().filter((n) => n.id !== id))
  void deleteNoteDB(id).catch(() => {})
  if (currentUserId) void deleteUserNote(currentUserId, id).catch(() => {})
}

export function toggleBookmark(verseId: string, versionId?: string, versionAbbreviation?: string): boolean {
  const bookmarks = getBookmarks()
  const exists = bookmarks.find((b) => b.verseId === verseId && (!versionId || !b.versionId || b.versionId === versionId))
  if (exists) {
    set(BOOKMARKS_KEY, bookmarks.filter((b) => b.id !== exists.id))
    void deleteBookmarkDB(exists.id).catch(() => {})
    if (currentUserId) void deleteUserBookmark(currentUserId, exists.id).catch(() => {})
    return false
  }
  const bm: Bookmark = {
    id: crypto.randomUUID(),
    verseId,
    label: versionAbbreviation || 'Bookmarked',
    createdAt: new Date().toISOString(),
    versionId,
    versionAbbreviation,
  }
  set(BOOKMARKS_KEY, [bm, ...bookmarks])
  void saveBookmarkDB(bm).catch(() => {})
  if (currentUserId) void saveUserBookmark(currentUserId, bm).catch(() => {})
  return true
}

export function isBookmarked(verseId: string, versionId?: string): boolean {
  return getBookmarks().some((b) => b.verseId === verseId && (!versionId || !b.versionId || b.versionId === versionId))
}

export function getRecentSearches(): RecentSearch[] {
  return normalizeRecentSearches(get<RecentSearch>(RECENT_SEARCHES_KEY))
}

export function addRecentSearch(entry: { query: string; verseId: string; reference: string; versionId?: string; versionAbbreviation?: string }) {
  const query = entry.query.trim()
  if (!query || !entry.verseId) return
  const existing = getRecentSearches().filter((r) => r.verseId !== entry.verseId || (entry.versionId ? r.versionId !== entry.versionId : false))
  const recent: RecentSearch = {
    id: crypto.randomUUID(),
    query,
    verseId: entry.verseId,
    reference: entry.reference,
    createdAt: new Date().toISOString(),
    versionId: entry.versionId,
    versionAbbreviation: entry.versionAbbreviation,
  }
  set(RECENT_SEARCHES_KEY, [recent, ...existing].slice(0, MAX_RECENT_SEARCHES))
  void saveRecentSearchDB(recent).catch(() => {})
  if (currentUserId) void saveUserRecentSearch(currentUserId, recent).catch(() => {})
}

export function clearRecentSearches() {
  localStorage.removeItem(RECENT_SEARCHES_KEY)
  void clearRecentSearchesDB().catch(() => {})
  if (currentUserId) void clearUserRecentSearches(currentUserId).catch(() => {})
}

export function getMemories(): Memory[] {
  return get<Memory>(MEMORIES_KEY)
}

export function saveMemory(memory: Memory): Memory[] {
  const memories = getMemories()
  const existing = memories.find((m) => m.id === memory.id)
  const next = existing
    ? memories.map((m) => (m.id === memory.id ? { ...memory, updatedAt: new Date().toISOString() } : m))
    : [memory, ...memories]
  set(MEMORIES_KEY, next)
  return next
}

export function deleteMemory(id: string): Memory[] {
  const next = getMemories().filter((m) => m.id !== id)
  set(MEMORIES_KEY, next)
  return next
}
