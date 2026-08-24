import { Bookmark, Friend, Highlight, Memory, Note, RecentSearch, Verse } from './types'
import { findVerse, getAllVerses } from './bible'
import {
  ApiClient,
  BibleClient,
  HighlightsClient,
  YouVersionPlatformConfiguration,
} from '@youversion/platform-core'
import {
  clearRecentSearchesDB,
  deleteBookmarkDB,
  deleteHighlightDB,
  deleteNoteDB,
  getBookmarksDB,
  getHighlightsDB,
  getNotesDB,
  getRecentSearchesDB,
  saveBookmarkDB,
  saveHighlightDB,
  saveNoteDB,
  saveRecentSearchDB,
} from './indexedStorage'
import {
  clearUserRecentSearches,
  deleteUserBookmark,
  deleteUserFriend,
  deleteUserHighlight,
  deleteUserNote,
  deleteUserRecentSearch,
  deletePublicMemory,
  getPublicMemories,
  getUserBookmarks,
  getUserFriends,
  getUserHighlights,
  getUserNotes,
  getUserPinnedVersionIds,
  getUserRecentSearches,
  savePublicMemory,
  saveUserBookmark,
  saveUserFriend,
  saveUserHighlight,
  saveUserNote,
  saveUserRecentSearch,
} from './cloudStorage'

import { getPinnedVersionIds, setPinnedVersionIds } from './userProfile'
import { osisToUsfm } from './usfm'

function normalizePassageId(passageId: string): string {
  const parts = passageId.split('.')
  if (!parts[0]) return passageId
  parts[0] = osisToUsfm(parts[0])
  return parts.join('.')
}

const NOTES_KEY = 'bible.notes'
const BOOKMARKS_KEY = 'bible.bookmarks'
const HIGHLIGHTS_KEY = 'bible.highlights'
const MEMORIES_KEY = 'bible.memories'
const FRIENDS_KEY = 'bible.friends'
const USER_KEY = 'bible.user'
const RECENT_SEARCHES_KEY = 'bible.recentSearches'
const MAX_RECENT_SEARCHES = 25

let currentUserId: string | null = null

export function getCurrentUserId(): string | null {
  return currentUserId
}

// Exposes the live YouVersion OAuth access token so it can be sent to the
// mintYouVersionFirebaseToken Cloud Function, which verifies it against
// YouVersion's API before bridging the sign-in into a real Firebase Auth
// session (see youversionFirebaseBridge.ts).
export function getYouVersionAccessToken(): string | null {
  return YouVersionPlatformConfiguration.accessToken ?? null
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

function canonicalVersionKey(versionId?: string, versionAbbreviation?: string): string {
  const abbr = versionAbbreviation?.trim().toLowerCase()
  if (abbr) return abbr
  const id = versionId?.trim().toLowerCase() ?? ''
  if (id === '-1' || id === 'kjv') return 'kjv'
  if (id === '-2' || id === 'nlt') return 'nlt'
  return id
}

function recentSearchKey(search: Pick<RecentSearch, 'verseId' | 'versionId' | 'versionAbbreviation'>): string {
  return `${search.verseId}:${canonicalVersionKey(search.versionId, search.versionAbbreviation)}`
}

function normalizeRecentSearches(searches: RecentSearch[]): RecentSearch[] {
  const seen = new Set<string>()
  const unique: RecentSearch[] = []
  const sorted = [...searches].sort((a, b) => itemTimestamp(b) - itemTimestamp(a))
  for (const search of sorted) {
    const key = recentSearchKey(search)
    if (seen.has(key)) continue
    seen.add(key)
    unique.push(search)
  }
  return unique.slice(0, MAX_RECENT_SEARCHES)
}

function bookmarkKey(bookmark: Pick<Bookmark, 'verseId' | 'versionId' | 'versionAbbreviation'>): string {
  return `${bookmark.verseId}:${canonicalVersionKey(bookmark.versionId, bookmark.versionAbbreviation)}`
}

function normalizeBookmarks(bookmarks: Bookmark[]): Bookmark[] {
  const seen = new Set<string>()
  const unique: Bookmark[] = []
  const sorted = [...bookmarks].sort((a, b) => itemTimestamp(b) - itemTimestamp(a))
  for (const bm of sorted) {
    const key = bookmarkKey(bm)
    if (seen.has(key)) continue
    seen.add(key)
    unique.push(bm)
  }
  return unique
}

function highlightKey(highlight: Pick<Highlight, 'verseId' | 'versionId' | 'versionAbbreviation'>): string {
  return `${highlight.verseId}:${canonicalVersionKey(highlight.versionId, highlight.versionAbbreviation)}`
}

export function normalizeHighlights(highlights: Highlight[]): Highlight[] {
  const seen = new Set<string>()
  const unique: Highlight[] = []
  const sorted = [...highlights].sort((a, b) => itemTimestamp(b) - itemTimestamp(a))
  for (const h of sorted) {
    const key = highlightKey(h)
    if (seen.has(key)) continue
    seen.add(key)
    unique.push(h)
  }
  return unique
}

export async function syncUserData(userId: string) {
  currentUserId = userId
  let cloudBookmarks: Bookmark[] = []
  let cloudFriends: Friend[] = []
  let cloudHighlights: Highlight[] = []
  let cloudNotes: Note[] = []
  let cloudRecent: RecentSearch[] = []
  let cloudPinnedVersionIds: number[] | null = null
  try {
    ;[cloudBookmarks, cloudFriends, cloudHighlights, cloudNotes, cloudRecent, cloudPinnedVersionIds] = await Promise.all([
      getUserBookmarks(userId),
      getUserFriends(userId),
      getUserHighlights(userId),
      getUserNotes(userId),
      getUserRecentSearches(userId),
      getUserPinnedVersionIds(userId),
    ])
  } catch {
    // If cloud access is not permitted, fall back to local-only sync.
  }

  const mergedBookmarks = normalizeBookmarks(
    mergeById(get<Bookmark>(BOOKMARKS_KEY), cloudBookmarks),
  )
  const mergedFriends = mergeById(getFriends(), cloudFriends)
  const mergedHighlights = normalizeHighlights(
    mergeById(get<Highlight>(HIGHLIGHTS_KEY), cloudHighlights),
  )
  const mergedNotes = mergeById(getNotes(), cloudNotes).sort(
    (a, b) => itemTimestamp(b) - itemTimestamp(a),
  )
  const mergedRecent = normalizeRecentSearches(
    mergeById(get<RecentSearch>(RECENT_SEARCHES_KEY), cloudRecent),
  )

  set(BOOKMARKS_KEY, mergedBookmarks)
  set(FRIENDS_KEY, mergedFriends)
  set(HIGHLIGHTS_KEY, mergedHighlights)
  set(NOTES_KEY, mergedNotes)
  set(RECENT_SEARCHES_KEY, mergedRecent)

  const localPinnedVersionIds = getPinnedVersionIds(userId)
  const mergedPinnedVersionIds = Array.from(
    new Set([...localPinnedVersionIds, ...(cloudPinnedVersionIds ?? [])]),
  )
  if (mergedPinnedVersionIds.length || cloudPinnedVersionIds !== null || localPinnedVersionIds.length) {
    setPinnedVersionIds(userId, mergedPinnedVersionIds)
  }

  try {
    await Promise.all([
      Promise.all(mergedBookmarks.map((b) => saveUserBookmark(userId, b))),
      Promise.all(mergedFriends.map((f) => saveUserFriend(userId, f))),
      Promise.all(mergedHighlights.map((h) => saveUserHighlight(userId, h))),
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
  const existing = getHighlights()
  const additions: Highlight[] = []
  for (const item of items) {
    if (existing.some((h) => h.verseId === item.verseId && h.versionId === versionId)) continue
    const color = item.color ? (item.color.startsWith('#') ? item.color : `#${item.color}`) : '#F5E98A'
    const highlight: Highlight = {
      id: crypto.randomUUID(),
      verseId: item.verseId,
      createdAt: new Date().toISOString(),
      versionId,
      versionAbbreviation,
      color,
    }
    additions.push(highlight)
  }
  if (!additions.length) return
  const next = normalizeHighlights([...additions, ...existing])
  set(HIGHLIGHTS_KEY, next)
  for (const highlight of additions) {
    void saveHighlightDB(highlight).catch(() => {})
    if (currentUserId) void saveUserHighlight(currentUserId, highlight).catch(() => {})
  }
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event('bible-study-storage-hydrated'))
  }
}

export async function importAllYouVersionHighlights(
  versionId: number,
  onProgress?: (done: number, total: number, current: string) => void,
  bookIds?: string[],
  onlySavedChapters?: boolean,
): Promise<number> {
  const all = getAllVerses()
  if (!all.length) throw new Error('Bible data is not loaded yet')

  const appKey = YouVersionPlatformConfiguration.appKey
  if (!appKey) throw new Error('YouVersion app key is not configured')

  const lat = YouVersionPlatformConfiguration.accessToken
  if (!lat) throw new Error('YouVersion token is missing. Please sign in again.')

  const apiClient = new ApiClient({
    appKey,
    apiHost: 'rootedinchrist.faith/api/youversion',
    installationId: YouVersionPlatformConfiguration.installationId,
    timeout: 15000,
  })
  const bibleClient = new BibleClient(apiClient)
  const highlightsClient = new HighlightsClient(apiClient)

  const verseByRef = new Map<string, Verse>()
  const usfmToCode: Record<string, string> = {}
  for (const v of all) {
    const usfm = osisToUsfm(v.book)
    if (!usfmToCode[usfm]) usfmToCode[usfm] = v.book
    verseByRef.set(`${v.book}:${v.chapter}:${v.verse}`, v)
  }

  const bookCodeById: Record<string, string> = { ...usfmToCode }
  const localToYouVersionId: Record<string, string> = {}
  for (const v of all) {
    localToYouVersionId[v.book] = osisToUsfm(v.book)
  }

  const chapterInfos: { bookId: string; passageId: string }[] = []

  if (onlySavedChapters) {
    const saved = new Set<string>()
    for (const b of getBookmarks()) {
      const verse = findVerse(b.verseId)
      if (!verse) continue
      const youVersionBookId = localToYouVersionId[verse.book]
      if (!youVersionBookId) continue
      saved.add(`${youVersionBookId}.${verse.chapter}`)
    }
    for (const passageId of saved) {
      const parts = passageId.split('.')
      const bookId = parts[0]
      if (!bookId) continue
      chapterInfos.push({ bookId, passageId })
    }
  } else if (bookIds?.length) {
    for (const bookId of bookIds) {
      const chapters = await bibleClient.getChapters(versionId, bookId)
      for (const chapter of chapters.data) {
        chapterInfos.push({ bookId, passageId: chapter.passage_id })
      }
    }
  } else {
    const books = await bibleClient.getBooks(versionId)
    for (const book of books.data) {
      const code = usfmToCode[book.id.toUpperCase()] ?? book.id
      bookCodeById[book.id.toUpperCase()] = code
    }
    for (const book of books.data) {
      const chapters = await bibleClient.getChapters(versionId, book.id)
      for (const chapter of chapters.data) {
        chapterInfos.push({ bookId: book.id, passageId: chapter.passage_id })
      }
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
          { version_id: versionId, passage_id: normalizePassageId(info.passageId) },
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
    const needsHighlights = localStorage.getItem(HIGHLIGHTS_KEY) === null
    const needsRecentSearches = localStorage.getItem(RECENT_SEARCHES_KEY) === null
    const [notes, bookmarks, highlights, recent] = await Promise.all([
      getNotesDB(),
      getBookmarksDB(),
      getHighlightsDB(),
      getRecentSearchesDB(),
    ])
    if (needsNotes && notes.length) localStorage.setItem(NOTES_KEY, JSON.stringify(notes))
    if (needsBookmarks && bookmarks.length) localStorage.setItem(BOOKMARKS_KEY, JSON.stringify(normalizeBookmarks(bookmarks)))
    if (needsHighlights && highlights.length) localStorage.setItem(HIGHLIGHTS_KEY, JSON.stringify(normalizeHighlights(highlights)))
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

export function setHighlights(value: Highlight[]) {
  set(HIGHLIGHTS_KEY, normalizeHighlights(value))
}

export function getHighlights(): Highlight[] {
  return normalizeHighlights(get<Highlight>(HIGHLIGHTS_KEY))
}

export function saveHighlight(highlight: Highlight): Highlight {
  const highlights = getHighlights()
  const next = [highlight, ...highlights.filter((h) => h.id !== highlight.id)]
  setHighlights(next)
  void saveHighlightDB(highlight).catch(() => {})
  if (currentUserId) void saveUserHighlight(currentUserId, highlight).catch(() => {})
  return highlight
}

export function deleteHighlight(id: string) {
  setHighlights(getHighlights().filter((h) => h.id !== id))
  void deleteHighlightDB(id).catch(() => {})
  if (currentUserId) void deleteUserHighlight(currentUserId, id).catch(() => {})
}

export function isHighlighted(verseId: string, versionId?: string, versionAbbreviation?: string): { id: string; color: string } | undefined {
  const key = `${verseId}:${canonicalVersionKey(versionId, versionAbbreviation)}`
  return getHighlights().find((h) => highlightKey(h) === key)
}

export function toggleHighlight(
  verseId: string,
  versionId?: string,
  versionAbbreviation?: string,
  color?: string,
): boolean {
  const highlights = getHighlights()
  const incomingKey = `${verseId}:${canonicalVersionKey(versionId, versionAbbreviation)}`
  const exists = highlights.find((h) => highlightKey(h) === incomingKey)
  const existingColor = exists?.color
  if (exists) {
    deleteHighlight(exists.id)
  }
  if (!color || (existingColor && color === existingColor)) {
    return false
  }
  const h: Highlight = {
    id: crypto.randomUUID(),
    verseId,
    createdAt: new Date().toISOString(),
    versionId,
    versionAbbreviation,
    color,
  }
  saveHighlight(h)
  return true
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
  const incomingKey = `${verseId}:${canonicalVersionKey(versionId, versionAbbreviation)}`
  const exists = bookmarks.find((b) => bookmarkKey(b) === incomingKey)
  if (exists) {
    const next = bookmarks.filter((b) => b.id !== exists.id)
    set(BOOKMARKS_KEY, next)
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
  const key = bookmarkKey(bm)
  const next = [bm, ...bookmarks.filter((b) => bookmarkKey(b) !== key)]
  set(BOOKMARKS_KEY, normalizeBookmarks(next))
  void saveBookmarkDB(bm).catch(() => {})
  if (currentUserId) void saveUserBookmark(currentUserId, bm).catch(() => {})
  return true
}

export function isBookmarked(verseId: string, versionId?: string, versionAbbreviation?: string): boolean {
  const key = `${verseId}:${canonicalVersionKey(versionId, versionAbbreviation)}`
  return getBookmarks().some((b) => bookmarkKey(b) === key)
}

export function getRecentSearches(): RecentSearch[] {
  return normalizeRecentSearches(get<RecentSearch>(RECENT_SEARCHES_KEY))
}

export function addRecentSearch(entry: { query: string; verseId: string; reference: string; versionId?: string; versionAbbreviation?: string }) {
  const query = entry.query?.trim()
  if (!query || !entry.verseId) return
  const recent: RecentSearch = {
    id: crypto.randomUUID(),
    query,
    verseId: entry.verseId,
    reference: entry.reference,
    createdAt: new Date().toISOString(),
    versionId: entry.versionId,
    versionAbbreviation: entry.versionAbbreviation,
  }
  const existing = getRecentSearches()
  const key = recentSearchKey(recent)
  const next = [recent, ...existing.filter((item) => recentSearchKey(item) !== key)].slice(0, MAX_RECENT_SEARCHES)
  set(RECENT_SEARCHES_KEY, next)
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
  if (currentUserId) {
    if (memory.shareLevel === 'public') {
      void savePublicMemory(currentUserId, { ...memory, ownerUserId: currentUserId }).catch(() => {})
    } else {
      void deletePublicMemory(memory.id).catch(() => {})
    }
  }
  return next
}

export function deleteMemory(id: string): Memory[] {
  const next = getMemories().filter((m) => m.id !== id)
  set(MEMORIES_KEY, next)
  if (currentUserId) void deletePublicMemory(id).catch(() => {})
  return next
}

export function getFriends(): Friend[] {
  return get<Friend>(FRIENDS_KEY)
}

export function saveFriend(friend: Friend): Friend[] {
  const friends = getFriends()
  const existing = friends.find((f) => f.id === friend.id)
  const next = existing
    ? friends.map((f) => (f.id === friend.id ? friend : f))
    : [friend, ...friends]
  set(FRIENDS_KEY, next)
  if (currentUserId) void saveUserFriend(currentUserId, friend).catch(() => {})
  return next
}

export function deleteFriend(id: string): Friend[] {
  const next = getFriends().filter((f) => f.id !== id)
  set(FRIENDS_KEY, next)
  if (currentUserId) void deleteUserFriend(currentUserId, id).catch(() => {})
  return next
}
