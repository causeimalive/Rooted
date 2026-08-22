// Client for Tyndale's official NLT.TO API (https://api.nlt.to), used to
// render the New Living Translation in the reader. NLT is copyrighted by
// Tyndale House Foundation and cannot be bundled locally the way the
// public-domain KJV is -- every chapter is fetched live from Tyndale's API
// under the terms of the NLT.TO API key below.
const NLT_API_BASE = 'https://api.nlt.to/api'

// Tyndale's required attribution notice. This must be shown wherever NLT
// text is displayed -- see https://www.biblegateway.com/versions/New-Living-Translation-NLT-Bible/
export const NLT_ATTRIBUTION =
  'Scripture quotations are taken from the Holy Bible, New Living Translation, copyright \u00A9 1996, 2004, 2015 by Tyndale House Foundation. Used by permission of Tyndale House Publishers, Inc., Carol Stream, Illinois 60188. All rights reserved.'

export interface NltPassage {
  id: string
  content: string
  reference: string
}

function getNltApiKey(): string {
  const fromVite = typeof import.meta.env !== 'undefined' ? (import.meta.env.VITE_NLT_API_KEY?.trim() as string | undefined) : undefined
  const fromProcess = typeof process !== 'undefined' ? process.env?.VITE_NLT_API_KEY?.trim() : undefined
  const key = fromVite ?? fromProcess
  if (!key) {
    throw new Error('Missing VITE_NLT_API_KEY. Add your Tyndale NLT.TO API key to the web app environment.')
  }
  return key
}

// The app's internal book ids match the OSIS-style codes used throughout
// bible.ts (e.g. "Gen", "1Sam", "John"). The NLT.TO API doesn't reliably
// recognize those or plain USFM codes for every book (numbered epistles in
// particular), but it does reliably resolve full English book names, so map
// to those instead. Verified against the live API for all 66 books.
const NLT_BOOK_NAMES: Record<string, string> = {
  Gen: 'Genesis', Exod: 'Exodus', Exo: 'Exodus', Lev: 'Leviticus', Num: 'Numbers', Deut: 'Deuteronomy', Deu: 'Deuteronomy',
  Josh: 'Joshua', Jos: 'Joshua', Judg: 'Judges', Jdg: 'Judges', Ruth: 'Ruth', Rut: 'Ruth', '1Sam': '1 Samuel', '1Sa': '1 Samuel', '2Sam': '2 Samuel', '2Sa': '2 Samuel',
  '1Kgs': '1 Kings', '1Ki': '1 Kings', '2Kgs': '2 Kings', '2Ki': '2 Kings', '1Chr': '1 Chronicles', '1Ch': '1 Chronicles', '2Chr': '2 Chronicles', '2Ch': '2 Chronicles',
  Ezra: 'Ezra', Ezr: 'Ezra', Neh: 'Nehemiah', Esth: 'Esther', Est: 'Esther', Job: 'Job', Ps: 'Psalm', Psa: 'Psalm', Prov: 'Proverbs', Pro: 'Proverbs',
  Eccl: 'Ecclesiastes', Ecc: 'Ecclesiastes', Song: 'Song of Songs', Sng: 'Song of Songs', Son: 'Song of Songs', Isa: 'Isaiah', Jer: 'Jeremiah', Lam: 'Lamentations',
  Ezek: 'Ezekiel', Eze: 'Ezekiel', Dan: 'Daniel', Hos: 'Hosea', Joel: 'Joel', Joe: 'Joel', Amos: 'Amos', Amo: 'Amos', Obad: 'Obadiah', Oba: 'Obadiah',
  Jonah: 'Jonah', Jon: 'Jonah', Mic: 'Micah', Nah: 'Nahum', Hab: 'Habakkuk', Zeph: 'Zephaniah', Zep: 'Zephaniah', Hag: 'Haggai', Zech: 'Zechariah', Zec: 'Zechariah', Mal: 'Malachi',
  Matt: 'Matthew', Mat: 'Matthew', Mark: 'Mark', Mar: 'Mark', Luke: 'Luke', Luk: 'Luke', John: 'John', Joh: 'John', Jn: 'John', Acts: 'Acts', Act: 'Acts', Rom: 'Romans',
  '1Cor': '1 Corinthians', '1Co': '1 Corinthians', '2Cor': '2 Corinthians', '2Co': '2 Corinthians', Gal: 'Galatians', Eph: 'Ephesians', Phil: 'Philippians', Php: 'Philippians', Phi: 'Philippians', Col: 'Colossians',
  '1Thess': '1 Thessalonians', '1Th': '1 Thessalonians', '2Thess': '2 Thessalonians', '2Th': '2 Thessalonians',
  '1Tim': '1 Timothy', '1Ti': '1 Timothy', '2Tim': '2 Timothy', '2Ti': '2 Timothy',
  Titus: 'Titus', Tit: 'Titus', Phlm: 'Philemon', Phm: 'Philemon', Heb: 'Hebrews', Jas: 'James', Jam: 'James',
  '1Pet': '1 Peter', '1Pe': '1 Peter', '2Pet': '2 Peter', '2Pe': '2 Peter',
  '1John': '1 John', '1Jo': '1 John', '1Jn': '1 John', '2John': '2 John', '2Jo': '2 John', '2Jn': '2 John',
  '3John': '3 John', '3Jo': '3 John', '3Jn': '3 John', Jude: 'Jude', Jud: 'Jude', Rev: 'Revelation',
}

function resolveNltBookName(bookId: string): string {
  return NLT_BOOK_NAMES[bookId] ?? bookId
}

function extractBibleTextHtml(document: string): string {
  const match = document.match(/<div id="bibletext"[^>]*>([\s\S]*?)<\/div>\s*(?:<script|<\/body)/i)
  return match ? match[1] : document
}

// The NLT.TO API's source HTML is print typesetting, not a clean per-verse
// structure: a <p> commonly opens inside one <verse_export> and doesn't
// close until a later one, so that a whole paragraph (e.g. three verses of
// dialogue) is one print paragraph. A real HTML parse of the whole chapter
// at once would (per the HTML5 <p> auto-close rules) turn those dangling
// <p> tags into deep, incorrect *nesting* of subsequent verse_export
// elements inside earlier ones -- producing duplicated/garbled content when
// each verse is later extracted independently. verse_export boundaries in
// the raw text are still well-formed and sequential, though, so this parses
// verses directly out of the raw string with a regex instead of trusting a
// DOM parse of the whole thing.
//
// Rather than try to faithfully reproduce NLT's print paragraph grouping
// (which would require tracking open/close state across verse
// boundaries), every verse's own <p>/</p> markup is stripped and each verse
// is rendered as an inline .yv-v span, the same shape every other
// translation's verses take in this reader (inline spans that flow
// together within the chapter, not one block per verse). This keeps verse
// boundaries correct for compare/hover/bookmark without any risk of the
// nesting bug above, at the cost of NLT's exact print paragraph breaks.
function normalizeNltHtml(html: string): string {
  // NLT varies which heading level it uses for these by book/genre (e.g.
  // Genesis uses <h2 class="chapter-number">/<h3 class="subhead">, Psalms
  // uses <h3 class="chapter-number">/<h4 class="subhead">) -- match any
  // heading level rather than hardcoding one, or the wrong-leveled heading
  // leaks into the verse text unstripped.
  const cleaned = html
    .replace(/<h[1-6] class="chapter-number">[\s\S]*?<\/h[1-6]>/gi, '')
    .replace(/<h[1-6] class="bk_ch_vs_header">[\s\S]*?<\/h[1-6]>/gi, '')

  const blocks: string[] = []
  const verseExportPattern = /<verse_export\b[^>]*vn="(\d+)"[^>]*>([\s\S]*?)<\/verse_export>/gi
  let match: RegExpExecArray | null
  while ((match = verseExportPattern.exec(cleaned))) {
    const verseNumber = match[1].trim()
    let inner = match[2]

    // NLT occasionally places a new section subheading mid-chapter, inside
    // whichever verse it precedes. Pull it out as its own heading block
    // rather than nesting a block-level heading inside the inline verse
    // span below (which HTML doesn't allow and browsers render
    // inconsistently).
    inner = inner.replace(/<(h[1-6]) class="subhead">([\s\S]*?)<\/\1>/gi, (_full, _tag: string, headingHtml: string) => {
      blocks.push(`<h3 class="yv-nlt-subhead">${headingHtml}</h3>`)
      return ''
    })

    // Turn paragraph markup into line breaks instead of real <p> elements --
    // see comment above for why real paragraphs aren't safe here. This still
    // keeps multi-line poetry (e.g. Genesis 1:27) readable as separate
    // lines instead of one run-on sentence.
    inner = inner
      .replace(/<p\b[^>]*>/gi, '<br>')
      .replace(/<\/p>/gi, '')
      .replace(/^(?:\s*<br>)+/i, '')
      .replace(/(?:<br>\s*)+$/i, '')
      .replace(/(?:<br>\s*){2,}/gi, '<br>')

    inner = inner
      .replace(/<span\b([^>]*?)class="vn"([^>]*?)>/gi, '<span$1class="yv-vlbl"$2>')
      .replace(/class="vn"/gi, 'class="yv-vlbl"')
      .trim()

    blocks.push(`<span class="yv-v yv-v-nlt" v="${verseNumber}">${inner}</span>`)
  }

  return blocks.join(' ')
}

function fetchWithTimeout(url: string, init: RequestInit & { timeoutMs?: number } = {}): Promise<Response> {
  const { timeoutMs = 15000, ...rest } = init
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)
  return fetch(url, { ...rest, signal: controller.signal })
    .finally(() => clearTimeout(timeout))
    .catch((error) => {
      if (error instanceof DOMException && error.name === 'AbortError') {
        throw new Error(`Request timed out after ${timeoutMs}ms`)
      }
      throw error
    })
}

export async function probeNltPassage(bookId: string, chapter: number): Promise<boolean> {
  try {
    const key = getNltApiKey()
    const ref = `${resolveNltBookName(bookId)}.${chapter}`
    const url = new URL(`${NLT_API_BASE}/passages`)
    url.searchParams.set('ref', ref)
    url.searchParams.set('version', 'NLT')
    url.searchParams.set('key', key)

    const response = await fetchWithTimeout(url.toString())
    if (!response.ok) return false

    const document = await response.text()
    const bibleTextHtml = extractBibleTextHtml(document)
    const headerMatch = bibleTextHtml.match(/<h2 class="bk_ch_vs_header">([^<]*)<\/h2>/)
    return Boolean(headerMatch)
  } catch {
    return false
  }
}

export async function fetchNltPassage(bookId: string, chapter: number): Promise<NltPassage> {
  const key = getNltApiKey()
  const ref = `${resolveNltBookName(bookId)}.${chapter}`
  const url = new URL(`${NLT_API_BASE}/passages`)
  url.searchParams.set('ref', ref)
  url.searchParams.set('version', 'NLT')
  url.searchParams.set('key', key)

  const response = await fetchWithTimeout(url.toString())
  if (!response.ok) {
    const message = await response.text().catch(() => '')
    throw new Error(`NLT API request failed (${response.status}): ${message || response.statusText}`)
  }

  const document = await response.text()
  const bibleTextHtml = extractBibleTextHtml(document)
  const headerMatch = bibleTextHtml.match(/<h2 class="bk_ch_vs_header">([^<]*)<\/h2>/)
  const reference = headerMatch ? headerMatch[1].replace(/,\s*NLT\s*$/i, '').trim() : `${bookId} ${chapter}`

  if (!bibleTextHtml.trim() || !headerMatch) {
    throw new Error(`NLT passage not found for ${ref}`)
  }

  return {
    id: `${bookId}.${chapter}`,
    content: normalizeNltHtml(bibleTextHtml),
    reference,
  }
}
