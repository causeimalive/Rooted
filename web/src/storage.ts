import { Bookmark, Note, RecentSearch } from './types'
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
const USER_KEY = 'bible.user'
const RECENT_SEARCHES_KEY = 'bible.recentSearches'
const MAX_RECENT_SEARCHES = 25

let currentUserId: string | null = null

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
    const key = search.verseId || search.query
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
    if (seen.has(bm.verseId)) continue
    seen.add(bm.verseId)
    unique.push(bm)
  }
  return unique
}

export async function syncUserData(userId: string) {
  currentUserId = userId
  const [cloudBookmarks, cloudNotes, cloudRecent] = await Promise.all([
    getUserBookmarks(userId),
    getUserNotes(userId),
    getUserRecentSearches(userId),
  ])

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

  await Promise.all([
    Promise.all(mergedBookmarks.map((b) => saveUserBookmark(userId, b))),
    Promise.all(mergedNotes.map((n) => saveUserNote(userId, n))),
    Promise.all(mergedRecent.map((r) => saveUserRecentSearch(userId, r))),
  ])

  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event('bible-study-storage-hydrated'))
  }
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

export function toggleBookmark(verseId: string, label?: string): boolean {
  const bookmarks = getBookmarks()
  const exists = bookmarks.find((b) => b.verseId === verseId)
  if (exists) {
    set(BOOKMARKS_KEY, bookmarks.filter((b) => b.verseId !== verseId))
    void deleteBookmarkDB(exists.id).catch(() => {})
    if (currentUserId) void deleteUserBookmark(currentUserId, exists.id).catch(() => {})
    return false
  }
  const bm: Bookmark = {
    id: crypto.randomUUID(),
    verseId,
    label: label || 'Bookmarked',
    createdAt: new Date().toISOString(),
  }
  set(BOOKMARKS_KEY, [bm, ...bookmarks])
  void saveBookmarkDB(bm).catch(() => {})
  if (currentUserId) void saveUserBookmark(currentUserId, bm).catch(() => {})
  return true
}

export function isBookmarked(verseId: string): boolean {
  return getBookmarks().some((b) => b.verseId === verseId)
}

export function getRecentSearches(): RecentSearch[] {
  return normalizeRecentSearches(get<RecentSearch>(RECENT_SEARCHES_KEY))
}

export function addRecentSearch(entry: { query: string; verseId: string; reference: string }) {
  const query = entry.query.trim()
  if (!query || !entry.verseId) return
  const existing = getRecentSearches().filter((r) => r.verseId !== entry.verseId)
  const recent: RecentSearch = {
    id: crypto.randomUUID(),
    query,
    verseId: entry.verseId,
    reference: entry.reference,
    createdAt: new Date().toISOString(),
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
