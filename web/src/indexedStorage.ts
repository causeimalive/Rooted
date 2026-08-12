import { Bookmark, Note } from './types'

interface RecentSearch {
  id: string
  query: string
  verseId: string
  reference: string
  createdAt: string
}

const DB_NAME = 'rooted-bible-study'
const DB_VERSION = 1

const STORE_NOTES = 'notes'
const STORE_BOOKMARKS = 'bookmarks'
const STORE_RECENT = 'recentSearches'
const STORE_DATA_CACHE = 'dataCache'
const DATA_CACHE_VERSION = '20260811b'

let dbPromise: Promise<IDBDatabase> | null = null

function openDB(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise
  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)
    request.onerror = () => reject(request.error)
    request.onsuccess = () => resolve(request.result)
    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result
      if (!db.objectStoreNames.contains(STORE_NOTES)) db.createObjectStore(STORE_NOTES, { keyPath: 'id' })
      if (!db.objectStoreNames.contains(STORE_BOOKMARKS)) db.createObjectStore(STORE_BOOKMARKS, { keyPath: 'id' })
      if (!db.objectStoreNames.contains(STORE_RECENT)) db.createObjectStore(STORE_RECENT, { keyPath: 'id' })
      if (!db.objectStoreNames.contains(STORE_DATA_CACHE)) db.createObjectStore(STORE_DATA_CACHE, { keyPath: 'key' })
    }
  })
  return dbPromise
}

function isAvailable(): boolean {
  return typeof indexedDB !== 'undefined'
}

async function getAll<T>(storeName: string): Promise<T[]> {
  if (!isAvailable()) return []
  try {
    const db = await openDB()
    return await new Promise<T[]>((resolve, reject) => {
      const transaction = db.transaction(storeName, 'readonly')
      const store = transaction.objectStore(storeName)
      const request = store.getAll()
      request.onerror = () => reject(request.error)
      request.onsuccess = () => resolve((request.result as T[]) ?? [])
    })
  } catch {
    return []
  }
}

async function put<T extends { id: string }>(storeName: string, item: T): Promise<T> {
  if (!isAvailable()) return item
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(storeName, 'readwrite')
    const store = transaction.objectStore(storeName)
    const request = store.put(item)
    request.onerror = () => reject(request.error)
    request.onsuccess = () => resolve(item)
  })
}

async function remove(storeName: string, id: string): Promise<void> {
  if (!isAvailable()) return
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(storeName, 'readwrite')
    const store = transaction.objectStore(storeName)
    const request = store.delete(id)
    request.onerror = () => reject(request.error)
    request.onsuccess = () => resolve()
  })
}

async function clearStore(storeName: string): Promise<void> {
  if (!isAvailable()) return
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(storeName, 'readwrite')
    const store = transaction.objectStore(storeName)
    const request = store.clear()
    request.onerror = () => reject(request.error)
    request.onsuccess = () => resolve()
  })
}

export async function getNotesDB(): Promise<Note[]> {
  const notes = await getAll<Note>(STORE_NOTES)
  return notes.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
}

export async function saveNoteDB(note: Note): Promise<Note> {
  return put(STORE_NOTES, note)
}

export async function deleteNoteDB(id: string): Promise<void> {
  return remove(STORE_NOTES, id)
}

export async function getBookmarksDB(): Promise<Bookmark[]> {
  const bookmarks = await getAll<Bookmark>(STORE_BOOKMARKS)
  return bookmarks.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
}

export async function saveBookmarkDB(bookmark: Bookmark): Promise<Bookmark> {
  return put(STORE_BOOKMARKS, bookmark)
}

export async function deleteBookmarkDB(id: string): Promise<void> {
  return remove(STORE_BOOKMARKS, id)
}

export async function getRecentSearchesDB(): Promise<RecentSearch[]> {
  const searches = await getAll<RecentSearch>(STORE_RECENT)
  return searches.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
}

export async function saveRecentSearchDB(search: RecentSearch): Promise<RecentSearch> {
  return put(STORE_RECENT, search)
}

export async function clearRecentSearchesDB(): Promise<void> {
  return clearStore(STORE_RECENT)
}

export interface DataCacheEntry<T = unknown> {
  key: string
  data: T
  cachedAt: string
}

export async function getCachedData<T = unknown>(key: string): Promise<T | null> {
  if (!isAvailable()) return null
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_DATA_CACHE, 'readonly')
    const store = transaction.objectStore(STORE_DATA_CACHE)
    const request = store.get(key)
    request.onerror = () => reject(request.error)
    request.onsuccess = () => {
      const result = request.result as DataCacheEntry<T> | undefined
      resolve(result?.data ?? null)
    }
  })
}

export async function setCachedData<T = unknown>(key: string, data: T): Promise<void> {
  if (!isAvailable()) return
  const entry: DataCacheEntry<T> = { key, data, cachedAt: new Date().toISOString() }
  await put(STORE_DATA_CACHE, entry as unknown as { id: string })
}

export async function clearDataCache(): Promise<void> {
  return clearStore(STORE_DATA_CACHE)
}

export async function fetchCachedJson<T = unknown>(url: string, key: string): Promise<T> {
  const cacheKey = `${key}@${DATA_CACHE_VERSION}`
  const cached = await getCachedData<T>(cacheKey)
  if (cached !== null) return cached
  const response = await fetch(url, { cache: 'no-store' })
  if (!response.ok) throw new Error(`Failed to fetch ${url}: ${response.statusText}`)
  const data = (await response.json()) as T
  void setCachedData(cacheKey, data).catch(() => {})
  return data
}

export async function fetchCachedText(url: string, key: string): Promise<string> {
  const cacheKey = `${key}@${DATA_CACHE_VERSION}`
  const cached = await getCachedData<string>(cacheKey)
  if (cached !== null) return cached
  const response = await fetch(url, { cache: 'no-store' })
  if (!response.ok) throw new Error(`Failed to fetch ${url}: ${response.statusText}`)
  const data = await response.text()
  void setCachedData(cacheKey, data).catch(() => {})
  return data
}
