import { collection, deleteDoc, doc, getDocs, setDoc } from 'firebase/firestore'
import { db } from './firebase'
import { Bookmark, Note, RecentSearch } from './types'

async function getCollection<T>(userId: string, name: string): Promise<T[]> {
  const snap = await getDocs(collection(db, 'users', userId, name))
  return snap.docs.map((d) => d.data() as T)
}

async function saveDoc<T extends { id: string }>(
  userId: string,
  name: string,
  item: T,
): Promise<void> {
  await setDoc(doc(db, 'users', userId, name, item.id), item)
}

async function deleteItem(userId: string, name: string, id: string): Promise<void> {
  await deleteDoc(doc(db, 'users', userId, name, id))
}

async function clearCollection(userId: string, name: string): Promise<void> {
  const snap = await getDocs(collection(db, 'users', userId, name))
  await Promise.all(snap.docs.map((d) => deleteDoc(d.ref)))
}

export function getUserBookmarks(userId: string): Promise<Bookmark[]> {
  return getCollection<Bookmark>(userId, 'bookmarks')
}

export function saveUserBookmark(userId: string, bookmark: Bookmark): Promise<void> {
  return saveDoc(userId, 'bookmarks', bookmark)
}

export function deleteUserBookmark(userId: string, id: string): Promise<void> {
  return deleteItem(userId, 'bookmarks', id)
}

export function getUserNotes(userId: string): Promise<Note[]> {
  return getCollection<Note>(userId, 'notes')
}

export function saveUserNote(userId: string, note: Note): Promise<void> {
  return saveDoc(userId, 'notes', note)
}

export function deleteUserNote(userId: string, id: string): Promise<void> {
  return deleteItem(userId, 'notes', id)
}

export function getUserRecentSearches(userId: string): Promise<RecentSearch[]> {
  return getCollection<RecentSearch>(userId, 'recentSearches')
}

export function saveUserRecentSearch(userId: string, search: RecentSearch): Promise<void> {
  return saveDoc(userId, 'recentSearches', search)
}

export function deleteUserRecentSearch(userId: string, id: string): Promise<void> {
  return deleteItem(userId, 'recentSearches', id)
}

export function clearUserRecentSearches(userId: string): Promise<void> {
  return clearCollection(userId, 'recentSearches')
}
