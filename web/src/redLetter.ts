// Red-letter data sourced from kjvstudy.org (KJV red letter edition).
// Used as a fallback to mark Jesus' words when the Bible version itself does not.
import redLetterData from './data/red-letter-verses.json'

const { verses: redLetterVerses } = redLetterData as { verses: Record<string, string | 'full'> }

const USFM_TO_NAME: Record<string, string> = {
  MAT: 'Matthew',
  MATT: 'Matthew',
  MATTHEW: 'Matthew',
  MRK: 'Mark',
  MARK: 'Mark',
  LUK: 'Luke',
  LUKE: 'Luke',
  JHN: 'John',
  JOHN: 'John',
  ACT: 'Acts',
  ACTS: 'Acts',
  REV: 'Revelation',
  REVELATION: 'Revelation',
  APOCALYPSE: 'Revelation',
}

function isRedLetterBook(bookId: string): string | undefined {
  return USFM_TO_NAME[bookId.toUpperCase()]
}

function wrapFullVerse(verse: HTMLElement, doc: Document): void {
  if (verse.querySelector('.wj')) return
  const wj = doc.createElement('span')
  wj.className = 'wj'
  const label = verse.querySelector('.yv-vlbl')
  const start = label ? label.nextSibling : verse.firstChild
  if (!start) return

  verse.insertBefore(wj, start)
  let current: Node | null = start
  while (current) {
    const next: Node | null = current.nextSibling
    wj.appendChild(current)
    current = next
  }
}

export interface TextRange {
  node: Text
  text: string
  start: number
}

export function collectTextRanges(verse: HTMLElement): TextRange[] {
  const ranges: TextRange[] = []
  const walker = verse.ownerDocument.createTreeWalker(verse, NodeFilter.SHOW_TEXT)
  let node = walker.nextNode() as Text | null
  let start = 0
  while (node) {
    const parent = node.parentElement
    if (
      !parent ||
      parent.classList.contains('yv-vlbl') ||
      parent.closest('.yv-vlbl') ||
      parent.classList.contains('yv-n') ||
      parent.closest('.yv-n')
    ) {
      node = walker.nextNode() as Text | null
      continue
    }

    const text = node.textContent ?? ''
    ranges.push({ node, text, start })
    start += text.length
    node = walker.nextNode() as Text | null
  }
  return ranges
}

function wrapPartialVerse(verse: HTMLElement, target: string, doc: Document): void {
  if (verse.querySelector('.wj')) return
  const ranges = collectTextRanges(verse)
  if (!ranges.length) return

  const search = ranges.map((r) => r.text).join('')
  const normalizedSearch = search.replace(/\u00A0/g, ' ')
  const normalizedTarget = target.replace(/\u00A0/g, ' ')

  const matchIndex = normalizedSearch.toLowerCase().indexOf(normalizedTarget.toLowerCase())
  if (matchIndex === -1) return

  const matchEnd = matchIndex + normalizedTarget.length

  for (const range of ranges) {
    const { node, text } = range
    const nodeEnd = range.start + text.length
    const segStart = Math.max(matchIndex - range.start, 0)
    const segEnd = Math.min(matchEnd - range.start, text.length)
    if (segStart >= segEnd) continue

    const parent = node.parentNode
    if (!parent) continue

    const before = text.slice(0, segStart)
    const middle = text.slice(segStart, segEnd)
    const after = text.slice(segEnd)

    if (before) parent.insertBefore(doc.createTextNode(before), node)
    const wj = doc.createElement('span')
    wj.className = 'wj'
    wj.textContent = middle
    parent.insertBefore(wj, node)
    if (after) parent.insertBefore(doc.createTextNode(after), node)
    parent.removeChild(node)
  }
}

function escapeHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

export function redLetterVerseHtml(text: string, bookId: string, chapter: number, verse: number): string {
  const bookName = isRedLetterBook(bookId)
  if (!bookName) return escapeHtml(text)

  const key = `${bookName} ${chapter}:${verse}`
  const target = redLetterVerses[key]
  if (!target) return escapeHtml(text)

  if (target === 'full') {
    return `<span class="wj">${escapeHtml(text)}</span>`
  }

  const normalizedTarget = target.replace(/\u00A0/g, ' ')
  const pattern = normalizedTarget.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const match = text.match(new RegExp(pattern, 'i'))
  if (!match || match.index === undefined) return escapeHtml(text)

  const start = match.index
  const matched = match[0]
  return `${escapeHtml(text.slice(0, start))}<span class="wj">${escapeHtml(matched)}</span>${escapeHtml(text.slice(start + matched.length))}`
}

export function applyRedLetterMarkup(html: string, bookId: string, chapter: number): string {
  const bookName = isRedLetterBook(bookId)
  if (!bookName) return html

  const doc = new DOMParser().parseFromString(html, 'text/html')
  const verseElements = Array.from(doc.querySelectorAll<HTMLElement>('.yv-v[v]'))

  for (const verse of verseElements) {
    const v = verse.getAttribute('v')
    if (!v || v.includes('-')) continue
    const verseNum = Number(v)
    if (Number.isNaN(verseNum)) continue

    const key = `${bookName} ${chapter}:${verseNum}`
    const target = redLetterVerses[key]
    if (!target) continue

    if (target === 'full') {
      wrapFullVerse(verse, doc)
    } else {
      wrapPartialVerse(verse, target, doc)
    }
  }

  return doc.body.innerHTML
}
