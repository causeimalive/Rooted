import Fuse from 'fuse.js'
import { PassageMatch, Place, Verse } from './types'
import { fetchCachedJson } from './indexedStorage'

let places: Place[] = []
let placesById: Map<string, Place> = new Map()
let fuse: Fuse<Place> | null = null

export async function loadPlaces(): Promise<Place[]> {
  try {
    places = await fetchCachedJson<Place[]>('/data/places.json', 'places')
  } catch (e) {
    console.error('Failed to load places', e)
    places = []
  }
  placesById = new Map(places.map((p) => [p.id, p]))
  fuse = new Fuse(places, {
    keys: [
      { name: 'name', weight: 0.6 },
      { name: 'aliases', weight: 0.25 },
      { name: 'region', weight: 0.15 },
    ],
    threshold: 0.32,
    ignoreLocation: true,
    includeScore: true,
    minMatchCharLength: 2,
  })
  return places
}

export function getAllPlaces(): Place[] {
  return places
}

export function getPlace(id: string): Place | undefined {
  return placesById.get(id)
}

export function searchPlaces(query: string, limit = 12): Place[] {
  const trimmed = query.trim()
  if (!trimmed) return []
  if (!fuse) return []
  return fuse.search(trimmed).slice(0, limit).map((r) => r.item)
}

export function matchesPassage(verse: Verse, passage: PassageMatch): boolean {
  if (verse.bookName !== passage.book) return false

  const afterStart =
    verse.chapter > passage.startChapter ||
    (verse.chapter === passage.startChapter && (passage.startVerse === undefined || verse.verse >= passage.startVerse))
  const beforeEnd =
    passage.endChapter === undefined ||
    verse.chapter < passage.endChapter ||
    (verse.chapter === passage.endChapter && (passage.endVerse === undefined || verse.verse <= passage.endVerse))

  return afterStart && beforeEnd
}

export function getPlacesForVerse(verse?: Verse, limit = 6): Place[] {
  if (!verse) return places.slice(0, limit)
  const matches = places.filter((place) => place.passages.some((passage) => matchesPassage(verse, passage)))
  return matches.length ? matches.slice(0, limit) : places.slice(0, limit)
}

export function getFeaturedPlaces(limit = 8): Place[] {
  return places.slice(0, limit)
}

export function getPassagesForPlace(place: Place, verses: Verse[], limit = 8): Verse[] {
  const matched = verses.filter((verse) => place.passages.some((passage) => matchesPassage(verse, passage)))
  return matched.slice(0, limit)
}

export function formatPassage(passage: PassageMatch): string {
  const start = passage.startVerse ? `${passage.startChapter}:${passage.startVerse}` : `${passage.startChapter}`
  const endChapter = passage.endChapter ?? passage.startChapter
  const end = passage.endVerse ? `${endChapter}:${passage.endVerse}` : `${endChapter}`
  return start === end ? `${passage.book} ${start}` : `${passage.book} ${start}\u2013${end}`
}

export function formatVerseReference(verse: Verse): string {
  return `${verse.bookName} ${verse.chapter}:${verse.verse}`
}

export function bibleGatewayLink(passage: PassageMatch): string {
  const endChapter = passage.endChapter ?? passage.startChapter
  const range = passage.startChapter === endChapter
    ? `${passage.book} ${passage.startChapter}`
    : `${passage.book} ${passage.startChapter}-${endChapter}`
  return `https://www.biblegateway.com/passage/?search=${encodeURIComponent(range)}&version=KJV`
}
