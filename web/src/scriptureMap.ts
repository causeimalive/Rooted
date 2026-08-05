import { Verse } from './types'

export interface PassageMatch {
  book: string
  startChapter: number
  endChapter?: number
  startVerse?: number
  endVerse?: number
}

export interface ScriptureLocation {
  id: string
  name: string
  region: string
  description: string
  x: number
  y: number
  passages: PassageMatch[]
}

export const SCRIPTURE_LOCATIONS: ScriptureLocation[] = [
  {
    id: 'eden',
    name: 'Garden of Eden',
    region: 'Mesopotamia',
    description: 'The opening chapters of Genesis place humanity\'s earliest story here.',
    x: 900,
    y: 420,
    passages: [{ book: 'Genesis', startChapter: 2, endChapter: 3 }],
  },
  {
    id: 'ur',
    name: 'Ur of the Chaldeans',
    region: 'Mesopotamia',
    description: 'Abram begins in Ur before God calls him toward Canaan.',
    x: 850,
    y: 370,
    passages: [{ book: 'Genesis', startChapter: 11, endChapter: 15 }],
  },
  {
    id: 'haran',
    name: 'Haran',
    region: 'Syria',
    description: 'A key stopping point for the patriarchal family on the way west.',
    x: 720,
    y: 240,
    passages: [{ book: 'Genesis', startChapter: 11, endChapter: 12 }],
  },
  {
    id: 'canaan',
    name: 'Canaan / Hebron',
    region: 'Hill Country',
    description: 'The promised land becomes the stage for the patriarchs, judges, and kings.',
    x: 470,
    y: 430,
    passages: [
      { book: 'Genesis', startChapter: 12, endChapter: 50 },
      { book: 'Ruth', startChapter: 1, endChapter: 4 },
    ],
  },
  {
    id: 'egypt',
    name: 'Egypt',
    region: 'Nile Valley',
    description: 'Joseph rises here, Israel is enslaved here, and Jesus is sheltered here as a child.',
    x: 260,
    y: 510,
    passages: [
      { book: 'Genesis', startChapter: 37, endChapter: 50 },
      { book: 'Exodus', startChapter: 1, endChapter: 14 },
      { book: 'Matthew', startChapter: 2, endChapter: 2 },
    ],
  },
  {
    id: 'sinai',
    name: 'Mount Sinai / Horeb',
    region: 'Wilderness',
    description: 'The covenant, law, and wilderness formation happen on this rugged peninsula.',
    x: 360,
    y: 470,
    passages: [
      { book: 'Exodus', startChapter: 3, endChapter: 40 },
      { book: 'Numbers', startChapter: 10, endChapter: 14 },
    ],
  },
  {
    id: 'jericho',
    name: 'Jericho',
    region: 'Jordan Valley',
    description: 'Israel crosses into the land near Jericho, and Jesus later passes through the city.',
    x: 500,
    y: 375,
    passages: [
      { book: 'Joshua', startChapter: 2, endChapter: 6 },
      { book: 'Luke', startChapter: 18, endChapter: 19 },
    ],
  },
  {
    id: 'shiloh',
    name: 'Shiloh',
    region: 'Ephraim',
    description: 'A worship center in the days of Joshua and Samuel.',
    x: 495,
    y: 320,
    passages: [
      { book: 'Joshua', startChapter: 18, endChapter: 21 },
      { book: '1 Samuel', startChapter: 1, endChapter: 3 },
    ],
  },
  {
    id: 'bethlehem',
    name: 'Bethlehem',
    region: 'Judah',
    description: 'The city of David, Ruth, and the birth of Jesus.',
    x: 495,
    y: 405,
    passages: [
      { book: 'Ruth', startChapter: 1, endChapter: 4 },
      { book: '1 Samuel', startChapter: 16, endChapter: 17 },
      { book: 'Matthew', startChapter: 1, endChapter: 2 },
      { book: 'Luke', startChapter: 2, endChapter: 2 },
    ],
  },
  {
    id: 'jerusalem',
    name: 'Jerusalem',
    region: 'Judah',
    description: 'The center of temple worship, kingdom events, and the Passion narrative.',
    x: 500,
    y: 385,
    passages: [
      { book: '2 Samuel', startChapter: 5, endChapter: 24 },
      { book: '1 Kings', startChapter: 8, endChapter: 22 },
      { book: 'Nehemiah', startChapter: 1, endChapter: 13 },
      { book: 'Matthew', startChapter: 21, endChapter: 28 },
      { book: 'Acts', startChapter: 1, endChapter: 7 },
    ],
  },
  {
    id: 'nazareth',
    name: 'Nazareth',
    region: 'Galilee',
    description: 'Jesus grows up here and returns to teach in his hometown.',
    x: 520,
    y: 285,
    passages: [
      { book: 'Matthew', startChapter: 2, endChapter: 4 },
      { book: 'Luke', startChapter: 1, endChapter: 4 },
      { book: 'John', startChapter: 1, endChapter: 1 },
    ],
  },
  {
    id: 'galilee',
    name: 'Sea of Galilee',
    region: 'Galilee',
    description: 'Much of Jesus\' ministry unfolds around this lake and its fishing towns.',
    x: 545,
    y: 270,
    passages: [
      { book: 'Matthew', startChapter: 4, endChapter: 18 },
      { book: 'Mark', startChapter: 1, endChapter: 9 },
      { book: 'Luke', startChapter: 4, endChapter: 9 },
      { book: 'John', startChapter: 1, endChapter: 6 },
    ],
  },
  {
    id: 'samaria',
    name: 'Samaria',
    region: 'Central Highlands',
    description: 'A disputed region that becomes central in Jesus\' conversation with the Samaritan woman.',
    x: 500,
    y: 340,
    passages: [
      { book: 'John', startChapter: 4, endChapter: 4 },
      { book: 'Acts', startChapter: 8, endChapter: 8 },
    ],
  },
  {
    id: 'jordan',
    name: 'Jordan River',
    region: 'Jordan Valley',
    description: 'The river marks baptisms, crossings, and boundary moments throughout Scripture.',
    x: 565,
    y: 365,
    passages: [
      { book: 'Joshua', startChapter: 3, endChapter: 4 },
      { book: 'Matthew', startChapter: 3, endChapter: 3 },
      { book: 'Mark', startChapter: 1, endChapter: 1 },
      { book: 'John', startChapter: 1, endChapter: 1 },
    ],
  },
  {
    id: 'caesarea',
    name: 'Caesarea',
    region: 'Mediterranean Coast',
    description: 'An important Roman port where Peter, Cornelius, Paul, and others appear.',
    x: 525,
    y: 350,
    passages: [
      { book: 'Acts', startChapter: 10, endChapter: 28 },
    ],
  },
  {
    id: 'damascus',
    name: 'Damascus',
    region: 'Aram',
    description: 'The road to Damascus becomes a defining place in Paul\'s conversion story.',
    x: 650,
    y: 270,
    passages: [
      { book: 'Acts', startChapter: 9, endChapter: 26 },
      { book: 'Galatians', startChapter: 1, endChapter: 1 },
    ],
  },
  {
    id: 'antioch',
    name: 'Antioch',
    region: 'Syria',
    description: 'A missionary hub for the early church and a launching point for Paul\'s journeys.',
    x: 695,
    y: 205,
    passages: [
      { book: 'Acts', startChapter: 11, endChapter: 18 },
    ],
  },
  {
    id: 'ephesus',
    name: 'Ephesus',
    region: 'Asia Minor',
    description: 'A major city of the Roman world where Paul teaches and writes.',
    x: 470,
    y: 220,
    passages: [
      { book: 'Acts', startChapter: 18, endChapter: 20 },
      { book: 'Ephesians', startChapter: 1, endChapter: 6 },
      { book: 'Revelation', startChapter: 2, endChapter: 2 },
    ],
  },
  {
    id: 'corinth',
    name: 'Corinth',
    region: 'Greece',
    description: 'A bustling port city where Paul spends significant ministry time.',
    x: 235,
    y: 235,
    passages: [
      { book: 'Acts', startChapter: 18, endChapter: 18 },
      { book: '1 Corinthians', startChapter: 1, endChapter: 16 },
      { book: '2 Corinthians', startChapter: 1, endChapter: 13 },
    ],
  },
  {
    id: 'rome',
    name: 'Rome',
    region: 'Italy',
    description: 'The capital of the empire and the destination of Paul\'s journey in Acts.',
    x: 135,
    y: 140,
    passages: [
      { book: 'Romans', startChapter: 1, endChapter: 16 },
      { book: 'Acts', startChapter: 27, endChapter: 28 },
    ],
  },
  {
    id: 'nineveh',
    name: 'Nineveh',
    region: 'Assyria',
    description: 'The great city Jonah is sent to warn.',
    x: 850,
    y: 170,
    passages: [{ book: 'Jonah', startChapter: 1, endChapter: 4 }],
  },
  {
    id: 'babylon',
    name: 'Babylon',
    region: 'Babylonia',
    description: 'A key place of exile, imperial power, and prophetic witness.',
    x: 820,
    y: 295,
    passages: [
      { book: '2 Kings', startChapter: 24, endChapter: 25 },
      { book: 'Daniel', startChapter: 1, endChapter: 6 },
      { book: 'Ezra', startChapter: 1, endChapter: 7 },
    ],
  },
  {
    id: 'patmos',
    name: 'Patmos',
    region: 'Aegean Sea',
    description: 'John receives the Revelation while exiled on this island.',
    x: 545,
    y: 305,
    passages: [{ book: 'Revelation', startChapter: 1, endChapter: 1 }],
  },
]

function matchesPassage(verse: Verse, passage: PassageMatch): boolean {
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

export function getScriptureLocationsForVerse(verse?: Verse, limit = 6): ScriptureLocation[] {
  if (!verse) return SCRIPTURE_LOCATIONS.slice(0, limit)
  const matches = SCRIPTURE_LOCATIONS.filter((location) => location.passages.some((passage) => matchesPassage(verse, passage)))
  return matches.length ? matches.slice(0, limit) : SCRIPTURE_LOCATIONS.slice(0, limit)
}

export function getFeaturedScriptureLocations(limit = 8): ScriptureLocation[] {
  return SCRIPTURE_LOCATIONS.slice(0, limit)
}

export function getPassagesForLocation(location: ScriptureLocation, verses: Verse[], limit = 8): Verse[] {
  const matched = verses.filter((verse) => location.passages.some((passage) => matchesPassage(verse, passage)))
  return matched.slice(0, limit)
}

export function formatPassage(passage: PassageMatch): string {
  const start = passage.startVerse ? `${passage.startChapter}:${passage.startVerse}` : `${passage.startChapter}`
  const endChapter = passage.endChapter ?? passage.startChapter
  const end = passage.endVerse ? `${endChapter}:${passage.endVerse}` : `${endChapter}`
  return start === end ? `${passage.book} ${start}` : `${passage.book} ${start}–${end}`
}

export function formatVerseReference(verse: Verse): string {
  return `${verse.bookName} ${verse.chapter}:${verse.verse}`
}
