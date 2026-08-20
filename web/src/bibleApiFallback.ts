import type { BiblePassage } from '@youversion/platform-core'

export type ReaderReference = {
  bookId: string
  chapter: number
}

export type VersionMenuEntry = {
  id: number
  title: string
  localized_title?: string
  abbreviation?: string
  localized_abbreviation?: string
  language_tag?: string | null
  copyright?: string | null
  youversion_deep_link?: string | null
}

const BIBLE_API_TRANSLATIONS: Record<string, string> = {
  'american standard version': 'asv',
  'asv': 'asv',
  'king james version': 'kjv',
  'kjv': 'kjv',
  'world english bible': 'web',
  'web': 'web',
  'bible in basic english': 'bbe',
  'bbe': 'bbe',
  "young's literal translation": 'ylt',
  'ylt': 'ylt',
  'open english bible': 'oeb-us',
  'oeb': 'oeb-us',
  'douay-rheims 1899 american edition': 'dra',
  'dra': 'dra',
  'darby bible': 'darby',
  'darby': 'darby',
}

const BOOK_NAMES: Record<string, string> = {
  Gen: 'Genesis',
  Exo: 'Exodus',
  Lev: 'Leviticus',
  Num: 'Numbers',
  Deu: 'Deuteronomy',
  Jos: 'Joshua',
  Jdg: 'Judges',
  Rut: 'Ruth',
  '1Sa': '1 Samuel',
  '2Sa': '2 Samuel',
  '1Ki': '1 Kings',
  '2Ki': '2 Kings',
  '1Ch': '1 Chronicles',
  '2Ch': '2 Chronicles',
  Ezr: 'Ezra',
  Neh: 'Nehemiah',
  Est: 'Esther',
  Job: 'Job',
  Psa: 'Psalms',
  Pro: 'Proverbs',
  Ecc: 'Ecclesiastes',
  Son: 'Song of Solomon',
  Isa: 'Isaiah',
  Jer: 'Jeremiah',
  Lam: 'Lamentations',
  Eze: 'Ezekiel',
  Dan: 'Daniel',
  Hos: 'Hosea',
  Joe: 'Joel',
  Amo: 'Amos',
  Oba: 'Obadiah',
  Jon: 'Jonah',
  Mic: 'Micah',
  Nah: 'Nahum',
  Hab: 'Habakkuk',
  Zep: 'Zephaniah',
  Hag: 'Haggai',
  Zec: 'Zechariah',
  Mal: 'Malachi',
  Mat: 'Matthew',
  Mar: 'Mark',
  Luk: 'Luke',
  Joh: 'John',
  Act: 'Acts',
  Rom: 'Romans',
  '1Co': '1 Corinthians',
  '2Co': '2 Corinthians',
  Gal: 'Galatians',
  Eph: 'Ephesians',
  Php: 'Philippians',
  Col: 'Colossians',
  '1Th': '1 Thessalonians',
  '2Th': '2 Thessalonians',
  '1Ti': '1 Timothy',
  '2Ti': '2 Timothy',
  Tit: 'Titus',
  Phm: 'Philemon',
  Heb: 'Hebrews',
  Jam: 'James',
  '1Pe': '1 Peter',
  '2Pe': '2 Peter',
  '1Jo': '1 John',
  '2Jo': '2 John',
  '3Jo': '3 John',
  Jud: 'Jude',
  Rev: 'Revelation',
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

function getBibleApiTranslation(version: VersionMenuEntry): string | null {
  const keys = [
    version.title,
    version.localized_title,
    version.abbreviation,
    version.localized_abbreviation,
  ]
  for (const key of keys) {
    if (!key) continue
    const normalized = key.toLowerCase().trim()
    if (BIBLE_API_TRANSLATIONS[normalized]) return BIBLE_API_TRANSLATIONS[normalized]
  }
  return null
}

export function canUseBibleApi(version: VersionMenuEntry): boolean {
  return getBibleApiTranslation(version) !== null
}

export async function fetchBibleApiPassage(
  version: VersionMenuEntry,
  reference: ReaderReference,
): Promise<BiblePassage | null> {
  const translation = getBibleApiTranslation(version)
  if (!translation) return null

  const bookName = BOOK_NAMES[reference.bookId]
  if (!bookName) return null

  const url = `https://bible-api.com/${encodeURIComponent(bookName)}+${reference.chapter}?translation=${translation}`

  const response = await fetch(url)
  if (!response.ok) return null

  const data = await response.json() as {
    reference?: string
    verses?: Array<{ book_name?: string; chapter?: number; verse?: number; text?: string }>
    translation_id?: string
    translation_name?: string
  } | null

  if (!data || !Array.isArray(data.verses) || !data.verses.length) return null

  const content = data.verses
    .map((verse) => {
      const verseNumber = Number(verse.verse)
      const text = escapeHtml(String(verse.text ?? '').trim())
      if (!Number.isFinite(verseNumber) || !text) return ''
      return `<div class="yv-v" v="${verseNumber}"><span class="yv-vlbl">${verseNumber}</span>${text} </div>`
    })
    .filter(Boolean)
    .join('')

  if (!content) return null

  return {
    id: `${reference.bookId}.${reference.chapter}`,
    content,
    reference: data.reference || `${bookName} ${reference.chapter}`,
  }
}
