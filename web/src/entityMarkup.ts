import { collectTextRanges, type TextRange } from './redLetter'
import { type EntityTagPosition } from './useEntityData'

type WordRange = {
  index: number
  start: number
  end: number
}

function getWordRanges(text: string): WordRange[] {
  const words: WordRange[] = []
  let i = 0
  let index = 0
  while (i < text.length) {
    while (i < text.length && /\s/.test(text[i])) i += 1
    if (i >= text.length) break
    const start = i
    while (i < text.length && !/\s/.test(text[i])) i += 1
    words.push({ index, start, end: i })
    index += 1
  }
  return words
}

function getClassesForTags(tags: string[]): string {
  const classes = new Set<string>()
  for (const tag of tags) {
    classes.add(`entity-${tag}`)
    if (tag === 'dq' || tag === 'ndq') classes.add('wj')
  }
  return Array.from(classes).join(' ')
}

function applyNodeMarkup(
  node: Node,
  text: string,
  nodeStart: number,
  words: WordRange[],
  byWord: Record<number, string[]>,
  doc: Document,
): void {
  const parent = node.parentNode
  if (!parent) return
  const nodeEnd = nodeStart + text.length
  const nodeWords = words.filter((w) => w.start >= nodeStart && w.end <= nodeEnd && byWord[w.index])
  if (nodeWords.length === 0) return

  let cursor = 0
  const firstStart = nodeWords[0].start - nodeStart
  if (firstStart > 0) {
    parent.insertBefore(doc.createTextNode(text.slice(0, firstStart)), node)
    cursor = firstStart
  }

  for (let i = 0; i < nodeWords.length; i += 1) {
    const w = nodeWords[i]
    const wordText = text.slice(w.start - nodeStart, w.end - nodeStart)
    const span = doc.createElement('span')
    span.className = getClassesForTags(byWord[w.index])
    span.textContent = wordText
    parent.insertBefore(span, node)
    cursor = w.end - nodeStart
    const nextStart = i < nodeWords.length - 1 ? nodeWords[i + 1].start - nodeStart : text.length
    if (cursor < nextStart) {
      parent.insertBefore(doc.createTextNode(text.slice(cursor, nextStart)), node)
      cursor = nextStart
    }
  }

  parent.removeChild(node)
}

export function applyEntityMarkup(
  html: string,
  bookId: string,
  chapter: number,
  tagPositionsByVerseId: Record<string, EntityTagPosition[]>,
  bookNumberById: Record<string, number> = {},
): string {
  const doc = new DOMParser().parseFromString(html, 'text/html')
  const verseElements = Array.from(doc.querySelectorAll<HTMLElement>('.yv-v[v]'))

  for (const verse of verseElements) {
    const v = verse.getAttribute('v')
    if (!v || v.includes('-')) continue
    const verseNum = Number(v)
    if (Number.isNaN(verseNum)) continue

    const bookNumber = bookNumberById[bookId]
    if (!bookNumber) continue
    const key = `${String(bookNumber).padStart(2, '0')}${String(chapter).padStart(3, '0')}${String(verseNum).padStart(3, '0')}`
    const positions = tagPositionsByVerseId[key]
    if (!positions || positions.length === 0) continue

    const ranges = collectTextRanges(verse)
    if (ranges.length === 0) continue
    const fullText = ranges.map((r) => r.text).join('')
    const words = getWordRanges(fullText)
    const byWord: Record<number, string[]> = {}
    for (const p of positions) {
      ;(byWord[p.wordIndex] ??= []).push(p.tag)
    }

    for (const range of ranges) {
      applyNodeMarkup(range.node, range.text, range.start, words, byWord, doc)
    }
  }

  return doc.body.innerHTML
}
