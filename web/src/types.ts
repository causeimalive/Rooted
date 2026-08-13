export interface Verse {
  id: string
  book: string
  bookName: string
  chapter: number
  verse: number
  text: string
  translation: string
}
export interface Keyword {
  term: string
  meaning: string
}

export type Tab = 'search' | 'reader' | 'wayfinder' | 'map'
export type ReaderView = 'html' | 'chapter' | 'verse'

export interface Verse {
  id: string
  verseId: string
  body: string
  updatedAt: string
}

export interface SearchResult {
  verse: Verse
  score: number
}

export interface Note {
  id: string
  verseId: string
  body: string
  updatedAt: string
}

export interface Bookmark {
  id: string
  verseId: string
  label: string
  createdAt: string
  versionId?: string
  versionAbbreviation?: string
  color?: string
}

export type MemoryType = 'note' | 'prayer' | 'highlight' | 'photo' | 'bookmark'
export type ShareLevel = 'private' | 'friends' | 'public'

export interface Memory {
  id: string
  verseId: string
  type: MemoryType
  body?: string
  color?: string
  tags?: string[]
  mood?: string
  photoUrl?: string
  shareLevel: ShareLevel
  createdAt: string
  updatedAt?: string
}

export interface RecentSearch {
  id: string
  query: string
  verseId: string
  reference: string
  createdAt: string
  versionId?: string
  versionAbbreviation?: string
}

export interface LexiconEntry {
  word: string
  kjvMeaning: string
  modernMeaning: string
  historicalContext: string
}

export interface PassageMatch {
  book: string
  startChapter: number
  endChapter?: number
  startVerse?: number
  endVerse?: number
}

export interface Place {
  id: string
  name: string
  aliases?: string[]
  region: string
  lat: number
  lng: number
  description: string
  passages: PassageMatch[]
  category?: 'settlement' | 'region' | 'natural' | 'road' | 'uncertain' | string
  modernName?: string
  uncertainty?: number
  sources?: string[]
  openbibleId?: string
  pleiadesId?: string
}

export interface CharacterEventDateView {
  label: string
  approxDate: string
  notes?: string
}

export interface CharacterEvent {
  order: number
  placeId: string
  passages: PassageMatch[]
  label: string
  approxDate?: string
  dateViews?: CharacterEventDateView[]
}

export interface Character {
  id: string
  name: string
  aliases?: string[]
  era: string
  approxDateRange?: string
  summary: string
  events: CharacterEvent[]
}
