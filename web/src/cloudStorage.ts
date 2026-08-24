import { collection, deleteDoc, doc, getDoc, getDocs, setDoc } from 'firebase/firestore'
import { db } from './firebase'
import { Bookmark, Comment, Friend, Highlight, Note, PublicMemory, Reaction, ReactionType, RecentSearch } from './types'

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

type UserProfileDoc = {
  id: string
  pinnedVersionIds: number[]
}

const USER_PROFILE_COLLECTION = 'profile'
const USER_PROFILE_DOC_ID = 'settings'

export async function getUserPinnedVersionIds(userId: string): Promise<number[] | null> {
  const snap = await getDoc(doc(db, 'users', userId, USER_PROFILE_COLLECTION, USER_PROFILE_DOC_ID))
  if (!snap.exists()) return null
  const data = snap.data() as Partial<UserProfileDoc> | undefined
  const ids = Array.from(new Set((data?.pinnedVersionIds ?? []).map((item) => Number(item)).filter((item) => Number.isFinite(item))))
  return ids
}

export async function saveUserPinnedVersionIds(userId: string, ids: number[]): Promise<void> {
  const pinnedVersionIds = Array.from(new Set(ids.map((item) => Number(item)).filter((item) => Number.isFinite(item))))
  await setDoc(doc(db, 'users', userId, USER_PROFILE_COLLECTION, USER_PROFILE_DOC_ID), {
    id: USER_PROFILE_DOC_ID,
    pinnedVersionIds,
  } satisfies UserProfileDoc)
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

export function getUserHighlights(userId: string): Promise<Highlight[]> {
  return getCollection<Highlight>(userId, 'highlights')
}

export function saveUserHighlight(userId: string, highlight: Highlight): Promise<void> {
  return saveDoc(userId, 'highlights', highlight)
}

export function deleteUserHighlight(userId: string, id: string): Promise<void> {
  return deleteItem(userId, 'highlights', id)
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

export async function getPublicMemories(): Promise<PublicMemory[]> {
  const snap = await getDocs(collection(db, 'publicMemories'))
  return snap.docs.map((d) => d.data() as PublicMemory)
}

export async function savePublicMemory(userId: string, memory: PublicMemory): Promise<void> {
  await setDoc(doc(db, 'publicMemories', memory.id), { ...memory, ownerUserId: userId })
}

export async function deletePublicMemory(memoryId: string): Promise<void> {
  await deleteDoc(doc(db, 'publicMemories', memoryId))
}

export function getUserFriends(userId: string): Promise<Friend[]> {
  return getCollection<Friend>(userId, 'friends')
}

export function saveUserFriend(userId: string, friend: Friend): Promise<void> {
  return saveDoc(userId, 'friends', friend)
}

export function deleteUserFriend(userId: string, id: string): Promise<void> {
  return deleteItem(userId, 'friends', id)
}

export function getMemoryComments(memoryId: string): Promise<Comment[]> {
  return new Promise(async (resolve, reject) => {
    try {
      const snap = await getDocs(collection(db, 'publicMemories', memoryId, 'comments'))
      resolve(snap.docs.map((d) => d.data() as Comment))
    } catch (e) {
      reject(e)
    }
  })
}

export function saveMemoryComment(memoryId: string, comment: Comment): Promise<void> {
  return setDoc(doc(db, 'publicMemories', memoryId, 'comments', comment.id), comment)
}

export function deleteMemoryComment(memoryId: string, commentId: string): Promise<void> {
  return deleteDoc(doc(db, 'publicMemories', memoryId, 'comments', commentId))
}

export function getMemoryReactions(memoryId: string): Promise<Reaction[]> {
  return new Promise(async (resolve, reject) => {
    try {
      const snap = await getDocs(collection(db, 'publicMemories', memoryId, 'reactions'))
      resolve(snap.docs.map((d) => d.data() as Reaction))
    } catch (e) {
      reject(e)
    }
  })
}

export function saveMemoryReaction(memoryId: string, reaction: Reaction): Promise<void> {
  return setDoc(doc(db, 'publicMemories', memoryId, 'reactions', `${memoryId}_${reaction.userId}`), reaction)
}

export function deleteMemoryReaction(memoryId: string, userId: string): Promise<void> {
  return deleteDoc(doc(db, 'publicMemories', memoryId, 'reactions', `${memoryId}_${userId}`))
}
