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
  const key = import.meta.env.VITE_NLT_API_KEY?.trim()
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
  Gen: 'Genesis', Exod: 'Exodus', Lev: 'Leviticus', Num: 'Numbers', Deut: 'Deuteronomy',
  Josh: 'Joshua', Judg: 'Judges', Ruth: 'Ruth', '1Sam': '1 Samuel', '2Sam': '2 Samuel',
  '1Kgs': '1 Kings', '2Kgs': '2 Kings', '1Chr': '1 Chronicles', '2Chr': '2 Chronicles',
  Ezra: 'Ezra', Neh: 'Nehemiah', Esth: 'Esther', Job: 'Job', Ps: 'Psalm', Prov: 'Proverbs',
  Eccl: 'Ecclesiastes', Song: 'Song of Songs', Isa: 'Isaiah', Jer: 'Jeremiah', Lam: 'Lamentations',
  Ezek: 'Ezekiel', Dan: 'Daniel', Hos: 'Hosea', Joel: 'Joel', Amos: 'Amos', Obad: 'Obadiah',
  Jonah: 'Jonah', Mic: 'Micah', Nah: 'Nahum', Hab: 'Habakkuk', Zeph: 'Zephaniah', Hag: 'Haggai',
  Zech: 'Zechariah', Mal: 'Malachi', Matt: 'Matthew', Mark: 'Mark', Luke: 'Luke', John: 'John',
  Acts: 'Acts', Rom: 'Romans', '1Cor': '1 Corinthians', '2Cor': '2 Corinthians', Gal: 'Galatians',
  Eph: 'Ephesians', Phil: 'Philippians', Col: 'Colossians', '1Thess': '1 Thessalonians',
  '2Thess': '2 Thessalonians', '1Tim': '1 Timothy', '2Tim': '2 Timothy', Titus: 'Titus',
  Phlm: 'Philemon', Heb: 'Hebrews', Jas: 'James', '1Pet': '1 Peter', '2Pet': '2 Peter',
  '1John': '1 John', '2John': '2 John', '3John': '3 John', Jude: 'Jude', Rev: 'Revelation',
}

function resolveNltBookName(bookId: string): string {
  return NLT_BOOK_NAMES[bookId] ?? bookId
}

function extractBibleTextHtml(document: string): string {
  const match = document.match(/<div id="bibletext"[^>]*>([\s\S]*?)<\/div>\s*(?:<script|<\/body)/i)
  return match ? match[1] : document
}

// The NLT.TO API wraps each verse in a non-standard <verse_export> tag and
// uses its own verse-label markup. Rewrite it into the same empty marker +
// visible label structure the YouVersion HTML transformer expects, so the
// rest of the reader pipeline (chapter / verse / compare cards) can extract
// verse blocks the same way it does for live YouVersion content.
function normalizeNltHtml(html: string): string {
  const doc = new DOMParser().parseFromString(html, 'text/html')
  const bibleText = doc.body
  if (!bibleText) return html

  bibleText.querySelectorAll('h2.chapter-number').forEach((node) => node.remove())

  bibleText.querySelectorAll('verse_export').forEach((verseExport) => {
    const verseNumber = verseExport.getAttribute('vn')?.trim() ?? ''
    const marker = doc.createElement('span')
    marker.className = 'yv-v'
    if (verseNumber) marker.setAttribute('v', verseNumber)

    const vn = verseExport.querySelector<HTMLElement>('.vn')
    if (vn) {
      vn.classList.remove('vn')
      vn.classList.add('yv-vlbl')
      vn.before(marker)
    } else if (verseNumber) {
      const label = doc.createElement('span')
      label.className = 'yv-vlbl'
      label.textContent = verseNumber
      verseExport.insertBefore(marker, verseExport.firstChild)
      verseExport.insertBefore(label, marker.nextSibling)
    }

    const parent = verseExport.parentNode
    if (!parent) return
    while (verseExport.firstChild) {
      parent.insertBefore(verseExport.firstChild, verseExport)
    }
    parent.removeChild(verseExport)
  })

  bibleText.querySelector('h2.bk_ch_vs_header')?.remove()
  return bibleText.innerHTML
}

export async function fetchNltPassage(bookId: string, chapter: number): Promise<NltPassage> {
  const key = getNltApiKey()
  const ref = `${resolveNltBookName(bookId)}.${chapter}`
  const url = new URL(`${NLT_API_BASE}/passages`)
  url.searchParams.set('ref', ref)
  url.searchParams.set('version', 'NLT')
  url.searchParams.set('key', key)

  const response = await fetch(url.toString())
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
