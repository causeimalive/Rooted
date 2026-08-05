import { Bookmark, Note } from './types'
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

const NOTES_KEY = 'bible.notes'
const BOOKMARKS_KEY = 'bible.bookmarks'
const USER_KEY = 'bible.user'
const RECENT_SEARCHES_KEY = 'bible.recentSearches'
const MAX_RECENT_SEARCHES = 10

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
    if (needsBookmarks && bookmarks.length) localStorage.setItem(BOOKMARKS_KEY, JSON.stringify(bookmarks))
    if (needsRecentSearches && recent.length) localStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(recent))
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
  return get<Bookmark>(BOOKMARKS_KEY)
}

export function saveNote(verseId: string, body: string): Note {
  const notes = getNotes()
  const existing = notes.find((n) => n.verseId === verseId)
  const id = existing ? existing.id : crypto.randomUUID()
  const note: Note = { id, verseId, body, updatedAt: new Date().toISOString() }
  const next = [note, ...notes.filter((n) => n.verseId !== verseId)]
  set(NOTES_KEY, next)
  void saveNoteDB(note).catch(() => {})
  return note
}

export function deleteNote(id: string) {
  set(NOTES_KEY, getNotes().filter((n) => n.id !== id))
  void deleteNoteDB(id).catch(() => {})
}

export function toggleBookmark(verseId: string, label?: string): boolean {
  const bookmarks = getBookmarks()
  const exists = bookmarks.find((b) => b.verseId === verseId)
  if (exists) {
    set(BOOKMARKS_KEY, bookmarks.filter((b) => b.verseId !== verseId))
    void deleteBookmarkDB(exists.id).catch(() => {})
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
  return true
}

export function isBookmarked(verseId: string): boolean {
  return getBookmarks().some((b) => b.verseId === verseId)
}

export interface RecentSearch {
  id: string
  query: string
  verseId: string
  reference: string
  createdAt: string
}

export function getRecentSearches(): RecentSearch[] {
  return get<RecentSearch>(RECENT_SEARCHES_KEY)
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
}

export function clearRecentSearches() {
  localStorage.removeItem(RECENT_SEARCHES_KEY)
  void clearRecentSearchesDB().catch(() => {})
}
