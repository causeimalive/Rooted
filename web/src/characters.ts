import Fuse from 'fuse.js'
import { Character, CharacterEvent, Place, Verse } from './types'
import { getPlace, matchesPassage } from './places'
import { fetchCachedJson } from './indexedStorage'

let characters: Character[] = []
let charactersById: Map<string, Character> = new Map()
let fuse: Fuse<Character> | null = null

export async function loadCharacters(): Promise<Character[]> {
  try {
    characters = await fetchCachedJson<Character[]>('/data/characters.json', 'characters')
  } catch (e) {
    console.error('Failed to load characters', e)
    characters = []
  }
  charactersById = new Map(characters.map((c) => [c.id, c]))
  fuse = new Fuse(characters, {
    keys: [
      { name: 'name', weight: 0.6 },
      { name: 'aliases', weight: 0.3 },
      { name: 'era', weight: 0.1 },
    ],
    threshold: 0.32,
    ignoreLocation: true,
    includeScore: true,
    minMatchCharLength: 2,
  })
  return characters
}

export function getAllCharacters(): Character[] {
  return characters
}

export function getCharacter(id: string): Character | undefined {
  return charactersById.get(id)
}

export function searchCharacters(query: string, limit = 8): Character[] {
  const trimmed = query.trim()
  if (!trimmed) return []
  if (!fuse) return []
  return fuse.search(trimmed).slice(0, limit).map((r) => r.item)
}

export function getCharactersForVerse(verse?: Verse, limit = 6): Character[] {
  if (!verse) return []
  const matches = characters.filter((character) =>
    character.events.some((event) => event.passages.some((passage) => matchesPassage(verse, passage))),
  )
  return matches.slice(0, limit)
}

export interface CharacterPathStop {
  event: CharacterEvent
  place?: Place
}

export function getCharacterPath(character: Character): CharacterPathStop[] {
  return character.events
    .slice()
    .sort((a, b) => a.order - b.order)
    .map((event) => ({ event, place: getPlace(event.placeId) }))
}
