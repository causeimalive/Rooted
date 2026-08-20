import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react'
import { ChevronLeft, ChevronRight, GripVertical, Highlighter, Loader2, Pin, PinOff } from 'lucide-react'
import { findVerse, getAllVerses } from './bible'
import { 
  fetchYouVersionPassage, 
  type YouVersionBook, 
  type YouVersionPassage, 
  type YouVersionVersion, 
} from './youversion'
import { fetchNltPassage, NLT_ATTRIBUTION } from './nlt'
import { fetchBibleApiPassage } from './bibleApiFallback'
import { fetchApiBiblePassage } from './apiBible'
import { resolveVersionSources } from './bibleSources'
import { EXCLUDED_VERSION_IDS } from './workingVersionIds'
import { Capacitor } from '@capacitor/core'
import { useBibleClient, useBooks, useChapters, useHighlights, useVersion, useYVAuth } from '@youversion/platform-react-hooks'
import {
  getPinnedVersionIds,
  getUserPreference,
  removeUserPreference,
  resolveVersionBrowseLanguagePreference,
  setPinnedVersionIds,
  setUserPreference,
  VERSION_BROWSE_LANGUAGE_CHANGED_EVENT,
  VERSION_PINNED_CHANGED_EVENT,
  getVersionBrowseLanguagePreference,
  setVersionBrowseLanguagePreference as persistVersionBrowseLanguagePreference,
} from './userProfile'
import { buildLanguageOptions } from './languageCatalog'
import { transformBibleHtml, getHttpStatus, type BiblePassage, type BibleVersion } from '@youversion/platform-core'
import { getCachedData, setCachedData } from './indexedStorage'
import { getTestamentForBook, type Testament } from './bookTaxonomy'
import { beginYouVersionSignIn, getYouVersionRedirectUrl } from './youversionRedirect'
import { applyRedLetterMarkup } from './redLetter'
import { applyEntityMarkup } from './entityMarkup'
import { useEntityData } from './useEntityData'
import ComparePaneFrame from './ComparePaneFrame'
import ReaderBookList from './ReaderBookList'
import ReaderChapterList from './ReaderChapterList'
import ReaderPassageStack from './ReaderPassageStack'
import ReaderToolButtons from './ReaderToolButtons'
import ReaderVersionSelector from './ReaderVersionSelector'
import MobileReaderNav from './MobileReaderNav'
import { useI18n } from './i18n'
import { importYouVersionHighlights } from './storage'
import { osisToUsfm } from './usfm'
import type { Bookmark, ReaderView } from './types'

const READER_VERSION_KEY = 'bible-study-yv-version'
const READER_COMPARE_KEY = 'bible-study-yv-compare'
const READER_COMPARE_OPEN_KEY = 'bible-study-yv-compare-open'
const READER_BOOK_KEY = 'bible-study-yv-book'
const READER_CHAPTER_KEY = 'bible-study-yv-chapter'
const READER_VIEW_KEY = 'bible-study-yv-view'
const READER_INPUT_KEY = 'bible-study-yv-input'
const READER_COMMITTED_KEY = 'bible-study-yv-committed'
const READER_NAV_WIDTH_KEY = 'bible-study-yv-nav-width'
const READER_AUTOSCROLL_KEY = 'bible-study-yv-autoscroll'
const READER_RED_LETTER_KEY = 'bible-study-yv-red-letter'
const READER_ENTITY_HIGHLIGHTS_KEY = 'bible-study-yv-entity-highlights'
const READER_HOVER_HIGHLIGHT_KEY = 'bible-study-yv-hover-highlight'
const READER_FONT_SIZE_KEY = 'bible-study-yv-font-size'
const DEFAULT_NAV_WIDTH = 300
const MIN_NAV_WIDTH = 220
const MAX_NAV_WIDTH = 460
const INITIAL_BUFFER_SIZE = 3
const SCROLL_LOAD_THRESHOLD = 280
const COMPARE_SCROLL_LOAD_THRESHOLD = 120
const COMPARE_FOCUS_LINE = 140

// The full YouVersion Bible catalog (all languages) is ~1,500 versions,
// which takes ~15 paginated requests to fetch in full. Cache the merged
// result across sessions so this only ever runs once per browser instead
// of on every reader visit -- bump the version suffix if the shape of
// what's cached ever needs to change.
export const ALL_VERSIONS_CACHE_KEY = 'youversion-all-bible-versions@2'
// Dispatched whenever the cached catalog is updated so other components
// (e.g. the settings menu's version count) can refresh without re-fetching.
export const ALL_VERSIONS_CACHE_UPDATED_EVENT = 'youversion-all-bible-versions-updated'
// Local fallback versions (KJV + NLT) that always exist regardless of what
// YouVersion's catalog returns for this app key -- see LOCAL_KJV_VERSION and
// LOCAL_NLT_VERSION below.
export const LOCAL_FALLBACK_VERSION_COUNT = 2
const VERSION_PAGE_DELAY_MS = 300
// YouVersion's rate limit for the Bibles endpoint is shared across every
// user of this app's key, not per-browser. It responded with a 300s
// Retry-After the first time it was tripped, so back off for noticeably
// longer than that -- and, critically, do NOT retry on 429. Retrying
// (even with exponential backoff) just adds more requests while the
// whole app is already locked out, which can keep re-extending the
// lockout window indefinitely. Instead, record a cooldown in
// localStorage (shared by every tab in this browser) and skip the
// network entirely until it passes.
const RATE_LIMIT_COOLDOWN_KEY = 'youversion-versions-rate-limited-until'
const RATE_LIMIT_COOLDOWN_MS = 10 * 60 * 1000

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function getRateLimitCooldownUntil(): number {
  const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(RATE_LIMIT_COOLDOWN_KEY) : null
  const parsed = raw ? Number(raw) : 0
  return Number.isFinite(parsed) ? parsed : 0
}

function setRateLimitCooldown(): void {
  try {
    localStorage.setItem(RATE_LIMIT_COOLDOWN_KEY, String(Date.now() + RATE_LIMIT_COOLDOWN_MS))
  } catch {
    // best-effort only
  }
}

class YouVersionRateLimitedError extends Error {
  constructor() {
    super('YouVersion is temporarily rate-limiting this app. Please try again in a few minutes.')
  }
}

async function fetchVersionsPage(
  bibleClient: ReturnType<typeof useBibleClient>,
  pageToken: string | undefined,
): Promise<{ data: BibleVersion[]; next_page_token?: string | null }> {
  const cooldownUntil = getRateLimitCooldownUntil()
  if (Date.now() < cooldownUntil) {
    throw new YouVersionRateLimitedError()
  }
  try {
    return await bibleClient.getVersions(['*'], undefined, { page_size: 99, page_token: pageToken, all_available: true })
  } catch (error) {
    if (getHttpStatus(error) === 429) {
      setRateLimitCooldown()
      throw new YouVersionRateLimitedError()
    }
    throw error
  }
}

// Fetches every page of the full (wildcard-language) version catalog,
// pausing briefly between requests so a single reader load doesn't burst
// ~15 requests at once against YouVersion's shared, app-key-wide rate
// limit. Calls onPage after each page so callers can render
// progressively instead of waiting for the entire (multi-second) fetch
// to finish.
async function fetchAllBibleVersions(
  bibleClient: ReturnType<typeof useBibleClient>,
  onPage?: (versionsSoFar: BibleVersion[]) => void,
): Promise<BibleVersion[]> {
  const results: BibleVersion[] = []
  let pageToken: string | undefined
  let isFirstPage = true
  do {
    if (!isFirstPage) await sleep(VERSION_PAGE_DELAY_MS)
    isFirstPage = false
    const page = await fetchVersionsPage(bibleClient, pageToken)
    results.push(...page.data)
    onPage?.(results.slice())
    pageToken = page.next_page_token ?? undefined
  } while (pageToken)
  return results
}

type TestamentFilter = 'all' | Testament

type ReaderReference = {
  bookId: string
  chapter: number
  verse?: number
  verseEnd?: number
}

type ReaderSection = {
  key: string
  bookId: string
  chapter: number
  reference: string
  passageId: string
  content: string
  plainText: string
  verses: VerseBlock[]
}

type VerseBlock = {
  verse: string
  html: string
  text: string
  strippedHtml: string
}

type CompareSection = {
  key: string
  bookId: string
  chapter: number
  reference: string
  currentPassage: BiblePassage
  comparePassage: BiblePassage | null
  compareSourceVersionId?: number
  compareUnavailable?: boolean
  currentHtml: string
  compareHtml: string
  currentVerses: VerseBlock[]
  compareVerses: VerseBlock[]
}

type ComparePaneSide = 'current' | 'compare'

function normalizeBookLabel(value: string): string {
  return value.toLowerCase().replace(/\./g, '').replace(/\s+/g, ' ').trim()
}

function getBookTitle(book: YouVersionBook): string {
  return book.full_title || book.title || book.abbreviation || book.id
}

function getBookSubtitle(book: YouVersionBook): string {
  const primary = getBookTitle(book)
  const subtitle = book.title && book.title !== primary ? book.title : book.abbreviation
  return subtitle && subtitle !== primary ? subtitle : ''
}

function getBookLabel(book: YouVersionBook): string {
  return book.title || book.abbreviation || book.full_title || book.id
}

function resolveBook(input: string, books: YouVersionBook[]): YouVersionBook | undefined {
  const target = normalizeBookLabel(input)
  if (!target) return undefined
  return books.find((book) => {
    const labels = [book.id, book.title, book.full_title, book.abbreviation].filter(Boolean) as string[]
    return labels.some((label) => normalizeBookLabel(label) === target || normalizeBookLabel(label).startsWith(target))
  })
}

function parseReaderReference(input: string, books: YouVersionBook[]): ReaderReference | undefined {
  const trimmed = input.trim()
  if (!trimmed) return undefined

  const usfm = trimmed.match(/^([1-3]?[A-Z]{2,3})\.(\d{1,3})(?:[.:](\d{1,3})(?:-(\d{1,3}))?)?$/)
  if (usfm) {
    const book = resolveBook(usfm[1], books)
    if (!book) return undefined
    const chapter = Number(usfm[2])
    const verse = usfm[3] ? Number(usfm[3]) : undefined
    const verseEnd = usfm[4] ? Number(usfm[4]) : verse
    return { bookId: book.id, chapter, verse, verseEnd }
  }

  const natural = trimmed.match(/^(.+?)\s+(\d{1,3})(?:[:.\s](\d{1,3})(?:\s?-\s?(\d{1,3}))?)?$/)
  if (natural) {
    const book = resolveBook(natural[1], books)
    if (!book) return undefined
    const chapter = Number(natural[2])
    const verse = natural[3] ? Number(natural[3]) : undefined
    const verseEnd = natural[4] ? Number(natural[4]) : verse
    return { bookId: book.id, chapter, verse, verseEnd }
  }

  return undefined
}

function parsePassageId(passageId: string): { bookId: string; chapter: number } | undefined {
  const match = passageId.match(/^([A-Z0-9]+)\.(\d+)(?:\..*)?$/)
  if (!match) return undefined
  return { bookId: match[1], chapter: Number(match[2]) }
}

const ACCESS_DENIED_MESSAGE =
  'This translation requires a YouVersion account or is not available in your region. Sign in to read it.'
const PASSAGE_NOT_FOUND_MESSAGE =
  "This passage isn't available in the selected version. Try a different version, book, or chapter."

function isAccessDeniedError(error: unknown): boolean {
  const text = error instanceof Error ? error.message : String(error)
  return text.includes('403') || /access denied/i.test(text) || /forbidden/i.test(text)
}

function isPassageNotFoundError(error: unknown): boolean {
  const text = error instanceof Error ? error.message : String(error)
  return text.includes('404') || /not found/i.test(text) || /no such/i.test(text)
}

function formatPassageError(error: unknown): string {
  if (isAccessDeniedError(error)) {
    return ACCESS_DENIED_MESSAGE
  }
  if (isPassageNotFoundError(error)) {
    return PASSAGE_NOT_FOUND_MESSAGE
  }
  return error instanceof Error ? error.message : String(error)
}

function isLocalVersionId(versionId: number | null): boolean {
  return versionId === LOCAL_KJV_VERSION_ID || versionId === LOCAL_NLT_VERSION_ID
}

function transformPassageForBrowser(
  content: string,
  bookId?: string,
  chapter?: number,
  tagPositionsByVerseId: Record<string, { wordIndex: number; tag: string }[]> = {},
  bookNumberById: Record<string, number> = {},
  entityHighlightsEnabled = false,
  isLocal = false,
): { html: string; text: string } {
  if (/^\s*Access denied/i.test(content)) {
    return {
      html: '<p style="padding: 1.5rem; text-align: center; color: var(--text-muted);">This translation requires a YouVersion account or is not available in your region. Sign in to read it.</p>',
      text: 'This translation requires a YouVersion account or is not available in your region. Sign in to read it.',
    }
  }
  let html = content
  if (!isLocal) {
    html = transformBibleHtml(content, {
      parseHtml: (value) => new DOMParser().parseFromString(value, 'text/html'),
      serializeHtml: (doc) => doc.body.innerHTML,
    }).html
  }
  let marked = bookId && chapter !== undefined ? applyRedLetterMarkup(html, bookId, chapter) : html
  if (bookId && chapter !== undefined && entityHighlightsEnabled && Object.keys(tagPositionsByVerseId).length > 0) {
    marked = applyEntityMarkup(marked, bookId, chapter, tagPositionsByVerseId, bookNumberById)
  }
  const text = new DOMParser().parseFromString(marked, 'text/html').body.textContent ?? ''
  return { html: marked, text }
}

function extractVerseBlocks(content: string): VerseBlock[] {
  const doc = new DOMParser().parseFromString(content, 'text/html')
  const verses = Array.from(doc.querySelectorAll<HTMLElement>('.yv-v'))

  return verses
    .map((verse) => {
      const html = verse.innerHTML.trim()
      const label = verse.querySelector<HTMLElement>('.yv-vlbl, .vn')?.textContent?.trim() ?? ''
      const verseNumber = (verse.getAttribute('v')?.trim() ?? label).replace(/\D+/g, '')
      return {
        verse: verseNumber,
        html,
        text: verse.textContent?.trim() ?? '',
        strippedHtml: stripVerseLabel(html),
      }
    })
    .filter((verse) => verse.verse)
    .reduce<VerseBlock[]>((blocks, verse) => {
      const last = blocks[blocks.length - 1]
      if (last && last.verse === verse.verse) {
        last.html += ` ${verse.html}`
        last.text += ` ${verse.text}`
        last.strippedHtml += ` ${verse.strippedHtml}`
      } else {
        blocks.push(verse)
      }
      return blocks
    }, [])
}

function getCompareScrollTop(pane: HTMLElement, target: HTMLElement, focusLine = COMPARE_FOCUS_LINE): number {
  const paneRect = pane.getBoundingClientRect()
  const targetRect = target.getBoundingClientRect()
  const targetTop = pane.scrollTop + (targetRect.top - paneRect.top) + targetRect.height / 2 - focusLine
  const maxScrollTop = Math.max(0, pane.scrollHeight - pane.clientHeight)
  return Math.max(0, Math.min(maxScrollTop, targetTop))
}

function splitVerseKey(activeKey: string): { section: string; verse: string } | null {
  const idx = activeKey.lastIndexOf(':')
  if (idx <= 0) return null
  return { section: activeKey.slice(0, idx), verse: activeKey.slice(idx + 1) }
}

type VersionMenuEntry = {
  id: number
  title: string
  localized_title?: string
  abbreviation?: string
  localized_abbreviation?: string
  language_tag?: string | null
  copyright?: string | null
  youversion_deep_link?: string | null
}

function findCompareTarget(pane: HTMLElement, section: string, verse: string): HTMLElement | null {
  const exact = pane.querySelector(`[data-section="${CSS.escape(section)}"][data-verse="${CSS.escape(verse)}"]`) as HTMLElement | null
  if (exact) return exact

  const targetNumber = Number(verse)
  if (Number.isNaN(targetNumber)) return null

  const candidates = Array.from(pane.querySelectorAll(`[data-section="${CSS.escape(section)}"][data-verse]`)) as HTMLElement[]
  let closest: HTMLElement | null = null
  let closestDistance = Number.POSITIVE_INFINITY

  for (const candidate of candidates) {
    const candidateVerse = candidate.dataset.verse
    if (!candidateVerse) continue
    const candidateNumber = Number(candidateVerse)
    if (Number.isNaN(candidateNumber)) continue
    const distance = Math.abs(candidateNumber - targetNumber)
    if (distance < closestDistance) {
      closestDistance = distance
      closest = candidate
    }
  }

  return closest
}

function findVerseTarget(pane: HTMLElement, section: string, verse: string): HTMLElement | null {
  const article = pane.querySelector(`article[data-section="${CSS.escape(section)}"]`) as HTMLElement | null
  if (!article) return null

  const exact = article.querySelector(`.yv-v[v="${CSS.escape(verse)}"]`) as HTMLElement | null
  if (exact) return exact

  const targetNumber = Number(verse)
  if (Number.isNaN(targetNumber)) return null

  const candidates = Array.from(article.querySelectorAll('.yv-v[v]')) as HTMLElement[]
  let closest: HTMLElement | null = null
  let closestDistance = Number.POSITIVE_INFINITY

  for (const candidate of candidates) {
    const candidateVerse = candidate.getAttribute('v')
    if (!candidateVerse) continue
    const candidateNumber = Number(candidateVerse)
    if (Number.isNaN(candidateNumber)) continue
    const distance = Math.abs(candidateNumber - targetNumber)
    if (distance < closestDistance) {
      closestDistance = distance
      closest = candidate
    }
  }

  return closest
}

function findCompareVerseAtFocus(
  pane: HTMLElement,
  readerView: ReaderView,
  focusLine: number,
): { section: string; verse: string } | null {
  const paneRect = pane.getBoundingClientRect()
  const focusY = paneRect.top + focusLine

  const candidates =
    readerView === 'html'
      ? (Array.from(pane.querySelectorAll('.yv-v[v]')) as HTMLElement[])
      : (Array.from(pane.querySelectorAll('article[data-verse]')) as HTMLElement[])

  let best: HTMLElement | null = null
  let bestDistance = Number.POSITIVE_INFINITY

  for (const candidate of candidates) {
    const rect = candidate.getBoundingClientRect()
    const distance = Math.abs(rect.top + rect.height / 2 - focusY)
    if (distance < bestDistance) {
      bestDistance = distance
      best = candidate
    }
  }

  if (!best) return null

  const verse = readerView === 'html' ? best.getAttribute('v') ?? '' : best.dataset.verse ?? ''
  const section =
    readerView === 'html'
      ? best.closest('article[data-section]')?.getAttribute('data-section') ?? ''
      : best.dataset.section ?? ''

  return { section, verse }
}

function stripVerseLabel(html: string): string {
  const doc = new DOMParser().parseFromString(`<div>${html}</div>`, 'text/html')
  const root = doc.body.firstElementChild
  if (!root) return html

  root.querySelectorAll('.yv-vlbl, .vn, .yv-v-num').forEach((node) => node.remove())
  return root.innerHTML.trim()
}

function formatChapterMarker(book: YouVersionBook | undefined, chapter: number): string {
  const label = (book?.id || book?.abbreviation || '').trim().replace(/\./g, '').replace(/\s+/g, '')
  return label ? `${label.toUpperCase()}.${chapter}` : String(chapter)
}

function formatReference(bookId: string, chapter: number, verse?: number, verseEnd?: number): string {
  const chapterPart = `${bookId}.${chapter}`
  if (verse === undefined) return chapterPart
  if (verseEnd !== undefined && verseEnd !== verse) return `${chapterPart}.${verse}-${verseEnd}`
  return `${chapterPart}.${verse}`
}

function clampChapter(book: YouVersionBook | undefined, requested: number): number {
  const chapters = book?.chapters ?? []
  if (!chapters.length) return requested
  const chapterIds = chapters
    .map((chapter) => Number(chapter.id || chapter.title))
    .filter((value) => Number.isFinite(value))
  if (!chapterIds.length) return requested
  const min = Math.min(...chapterIds)
  const max = Math.max(...chapterIds)
  return Math.min(Math.max(requested, min), max)
}

function getChapterTitle(book: YouVersionBook | undefined, chapter: number): string {
  if (!book) return String(chapter)
  const match = book.chapters?.find((entry) => Number(entry.id || entry.title) === chapter)
  return match?.title || String(chapter)
}

function chapterNumbers(book: YouVersionBook | undefined): number[] {
  return (book?.chapters ?? [])
    .map((chapter) => Number(chapter.id || chapter.title))
    .filter((value) => Number.isFinite(value))
}

function formatVersionLabel(version: { title: string; localized_title?: string; abbreviation?: string; localized_abbreviation?: string; language_tag?: string | null } | undefined): { title: string; subtitle: string } {
  if (!version) {
    return { title: 'Choose a Bible version', subtitle: 'Open the menu to switch translations' }
  }

  const subtitleParts = [version.localized_abbreviation || version.abbreviation || '', version.language_tag || ''].filter(Boolean)

  return {
    title: version.localized_title || version.title,
    subtitle: subtitleParts.join(' · '),
  }
}

const LOCAL_KJV_VERSION_ID = -1
const LOCAL_KJV_VERSION: VersionMenuEntry = {
  id: LOCAL_KJV_VERSION_ID,
  title: 'King James Version',
  localized_title: 'King James Version',
  abbreviation: 'KJV',
  localized_abbreviation: 'KJV',
  language_tag: 'en',
  copyright: 'Public domain',
}

// NLT text is copyrighted, so unlike KJV it can't be bundled locally -- it's
// fetched live from Tyndale's NLT.TO API (see ./nlt.ts) using this synthetic
// version id. It still needs a stable local entry so it always shows up in
// the picker even if YouVersion's catalog doesn't include it for this app key.
const LOCAL_NLT_VERSION_ID = -2
const LOCAL_NLT_VERSION: VersionMenuEntry = {
  id: LOCAL_NLT_VERSION_ID,
  title: 'New Living Translation',
  localized_title: 'New Living Translation',
  abbreviation: 'NLT',
  localized_abbreviation: 'NLT',
  language_tag: 'en',
  copyright: NLT_ATTRIBUTION,
}

// CSB and NKJV aren't in YouVersion's catalog for this app key at all, but
// both are licensed and available through API.Bible, so they get their own
// synthetic negative ids (like KJV/NLT above) routed entirely through
// resolveVersionSources' generic API.Bible matching.
const CSB_VERSION_ID = -3
const CSB_VERSION: VersionMenuEntry = {
  id: CSB_VERSION_ID,
  title: 'Christian Standard Bible',
  localized_title: 'Christian Standard Bible',
  abbreviation: 'CSB',
  localized_abbreviation: 'CSB',
  language_tag: 'en',
  copyright: '© 2017 Holman Bible Publishers. Used by permission. Christian Standard Bible®, and CSB® are federally registered trademarks of Holman Bible Publishers.',
}

const NKJV_VERSION_ID = -4
const NKJV_VERSION: VersionMenuEntry = {
  id: NKJV_VERSION_ID,
  title: 'New King James Version',
  localized_title: 'New King James Version',
  abbreviation: 'NKJV',
  localized_abbreviation: 'NKJV',
  language_tag: 'en',
  copyright: '© 1982 Thomas Nelson. Used by permission. All rights reserved.',
}

type VersionLike = {
  id: number
  title?: string
  abbreviation?: string
  localized_title?: string
  localized_abbreviation?: string
  language_tag?: string | null
}

function isKjvVersion(version: VersionLike | undefined): boolean {
  if (!version) return false
  const title = `${version.localized_title || version.title || ''} ${version.abbreviation || ''} ${version.localized_abbreviation || ''}`.toLowerCase()
  return version.id === LOCAL_KJV_VERSION_ID || /king james version/.test(title) || /\bkjv\b/.test(title)
}

function isNltVersion(version: VersionLike | undefined): boolean {
  if (!version) return false
  const title = `${version.localized_title || version.title || ''} ${version.abbreviation || ''} ${version.localized_abbreviation || ''}`.toLowerCase()
  return version.id === LOCAL_NLT_VERSION_ID || /living translation/.test(title) || /\bnlt\b/.test(title)
}

// Any synthetic (non-YouVersion) catalog entry uses a negative id -- KJV,
// NLT, and the API.Bible-only extras below (CSB, NKJV). These have no
// YouVersion book/chapter list to fetch, so they all use the shared local
// book navigation data instead.
function isLocalFallbackVersion(version: VersionLike | undefined): boolean {
  return typeof version?.id === 'number' && version.id < 0
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

// KJV and NLT share the same standard versification, so both local
// fallbacks can reuse this same book/chapter structure derived from the
// app's bundled KJV corpus.
function buildLocalFallbackBooks(): YouVersionBook[] {
  const books = new Map<string, { title: string; chapters: Map<number, string[]> }>()
  for (const verse of getAllVerses()) {
    const entry = books.get(verse.book) ?? { title: verse.bookName || verse.book, chapters: new Map<number, string[]>() }
    const chapterVerses = entry.chapters.get(verse.chapter) ?? []
    chapterVerses.push(verse.text)
    entry.chapters.set(verse.chapter, chapterVerses)
    books.set(verse.book, entry)
  }

  return Array.from(books.entries()).map(([id, entry]) => ({
    id,
    title: entry.title,
    full_title: entry.title,
    abbreviation: id,
    chapters: Array.from(entry.chapters.keys())
      .sort((a, b) => a - b)
      .map((chapter) => ({ id: String(chapter), title: String(chapter) })),
  }))
}

function buildLocalKjvPassage(reference: ReaderReference, books: YouVersionBook[]): BiblePassage | null {
  const verses = getAllVerses().filter((verse) => verse.book === reference.bookId && verse.chapter === reference.chapter)
  if (!verses.length) return null

  const book = books.find((entry) => entry.id === reference.bookId)
  const referenceLabel = `${book?.title || book?.full_title || reference.bookId} ${reference.chapter}`
  const content = verses
    .map(
      (verse) =>
        `<div class="yv-v" v="${verse.verse}"><span class="yv-vlbl">${verse.verse}</span>${escapeHtml(verse.text)} </div>`,
    )
    .join('')

  return {
    id: `${reference.bookId}.${reference.chapter}`,
    content,
    reference: referenceLabel,
  }
}

// Filters the version picker down to exactly the selected browse language
// (an exact language_tag match -- not a prefix match, since prefix matching
// on codes like "en" would also match unrelated tags such as "ena"/"enq").
// `language === null` means "all languages", so no filtering happens. The
// currently active version and any pinned versions always stay visible so
// switching the language filter never hides what's already selected/pinned.
function orderVersionsForBrowse(
  versions: readonly VersionMenuEntry[],
  language: string | null,
  activeVersionId?: number | null,
  pinnedVersionIds: readonly number[] = [],
): VersionMenuEntry[] {
  const preferred = language?.toLowerCase().trim() ?? ''
  const pinned = new Set(pinnedVersionIds)

  const matchesLanguage = (entry: VersionMenuEntry): boolean => {
    if (!preferred) return true
    if (entry.id === activeVersionId || pinned.has(entry.id)) return true
    return (entry.language_tag?.toLowerCase().trim() ?? '') === preferred
  }

  const score = (entry: VersionMenuEntry): number => {
    if (isLocalFallbackVersion(entry)) return 0
    if (pinned.has(entry.id)) return 1
    if (entry.id === activeVersionId) return 2
    return 3
  }

  return versions
    .filter(matchesLanguage)
    .sort((a, b) => {
      const groupDiff = score(a) - score(b)
      if (groupDiff !== 0) return groupDiff
      const titleA = (a.localized_title || a.title || a.abbreviation || '').toLowerCase()
      const titleB = (b.localized_title || b.title || b.abbreviation || '').toLowerCase()
      return titleA.localeCompare(titleB) || String(a.id).localeCompare(String(b.id))
    })
}

function formatChapterNavDestination(book: YouVersionBook | undefined, reference: ReaderReference | undefined, fallback: string): string {
  if (!reference || !book) return fallback
  return `${getBookLabel(book)} ${getChapterTitle(book, reference.chapter)}`
}

function ChapterNavButton({
  direction,
  label,
  destination,
  disabled,
  onClick,
  compact = false,
}: {
  direction: 'previous' | 'next'
  label: string
  destination: string
  disabled?: boolean
  onClick: () => void
  compact?: boolean
}) {
  const isPrevious = direction === 'previous'
  const MainIcon = isPrevious ? ChevronLeft : ChevronRight

  return (
    <button
      type="button"
      className={`yv-reader-chapter-nav-button ${isPrevious ? 'previous' : 'next'} ${compact ? 'compact' : ''}`}
      onClick={onClick}
      disabled={disabled}
      aria-label={`${label}: ${destination}`}
    >
      <span className="yv-reader-chapter-nav-icon" aria-hidden="true">
        <MainIcon size={16} />
      </span>
      {!compact ? (
        <>
          <span className="yv-reader-chapter-nav-copy">
            <small>{label}</small>
            <strong>{destination}</strong>
          </span>
          <span className="yv-reader-chapter-nav-chevron" aria-hidden="true">
            {isPrevious ? <ChevronLeft size={15} /> : <ChevronRight size={15} />}
          </span>
        </>
      ) : null}
    </button>
  )
}

function nextOrPreviousChapter(
  books: YouVersionBook[],
  currentBookId: string,
  currentChapter: number,
  direction: 'previous' | 'next',
  resolveChapterNumbers: (book: YouVersionBook) => Promise<number[]>,
): Promise<ReaderReference | undefined> {
  const bookIndex = books.findIndex((book) => book.id === currentBookId)
  if (bookIndex < 0) return Promise.resolve(undefined)

  const currentBook = books[bookIndex]
  return resolveChapterNumbers(currentBook).then(async (numbers) => {
    const chapterIndex = numbers.indexOf(currentChapter)

    if (direction === 'previous') {
      if (chapterIndex > 0) {
        return { bookId: currentBook.id, chapter: numbers[chapterIndex - 1] }
      }
      if (bookIndex > 0) {
        const previousBook = books[bookIndex - 1]
        const previousNumbers = await resolveChapterNumbers(previousBook)
        const last = previousNumbers[previousNumbers.length - 1]
        if (last !== undefined) {
          return { bookId: previousBook.id, chapter: last }
        }
      }
    } else {
      if (chapterIndex >= 0 && chapterIndex < numbers.length - 1) {
        return { bookId: currentBook.id, chapter: numbers[chapterIndex + 1] }
      }
      if (bookIndex >= 0 && bookIndex < books.length - 1) {
        const nextBook = books[bookIndex + 1]
        return { bookId: nextBook.id, chapter: 1 }
      }
    }

    return undefined
  })
}

export default function YouVersionReaderTab({
  selectedId,
  onSelect,
  bookmarks,
  onToggleBookmark,
  audioUrl,
  audioPlaying,
  audioLoading,
  audioTitle,
  onToggleAudio,
  onVersionChange,
  onLastReadChange,
}: {
  selectedId: string | null
  onSelect: (id: string) => void
  bookmarks: Bookmark[]
  onToggleBookmark: (verseId: string, versionId?: string, versionAbbreviation?: string) => void
  audioUrl?: string
  audioPlaying?: boolean
  audioLoading?: boolean
  audioTitle?: string
  onToggleAudio?: () => void
  onVersionChange?: (version: { id: number; name: string; abbreviation: string }) => void
  onLastReadChange?: (bookId: string, chapter: number, bookName: string) => void
}) {
  const { t, language } = useI18n()
  const { tagPositionsByVerseId } = useEntityData()
  const hasEntityData = Object.keys(tagPositionsByVerseId).length > 0
  const { auth, signOut, userInfo } = useYVAuth()

  useEffect(() => {
    if (hasEntityData) {
      sectionCacheRef.current.clear()
    }
  }, [hasEntityData])
  const userId = userInfo?.userId
  const userIdRef = useRef<string | undefined>(userId)
  const [versionBrowseLanguagePreference, setVersionBrowseLanguagePreference] = useState(() => getVersionBrowseLanguagePreference(userId))
  const [pinnedVersionIds, setPinnedVersionIdsState] = useState<number[]>(() => getPinnedVersionIds(userId))

  useEffect(() => {
    userIdRef.current = userInfo?.userId
  }, [userInfo])

  useEffect(() => {
    const syncLanguagePreference = () => setVersionBrowseLanguagePreference(getVersionBrowseLanguagePreference(userIdRef.current))
    syncLanguagePreference()
    window.addEventListener(VERSION_BROWSE_LANGUAGE_CHANGED_EVENT, syncLanguagePreference as EventListener)
    window.addEventListener('storage', syncLanguagePreference)
    return () => {
      window.removeEventListener(VERSION_BROWSE_LANGUAGE_CHANGED_EVENT, syncLanguagePreference as EventListener)
      window.removeEventListener('storage', syncLanguagePreference)
    }
  }, [])

  const handleSelectBrowseLanguage = useCallback(
    (tag: string) => {
      setVersionBrowseLanguagePreference(tag)
      persistVersionBrowseLanguagePreference(userIdRef.current, tag)
    },
    [],
  )

  useEffect(() => {
    const syncPinnedVersions = (event?: Event) => {
      if (event && event.type !== 'storage') {
        const detail = (event as CustomEvent<number[]>).detail
        if (Array.isArray(detail)) {
          setPinnedVersionIdsState(detail.filter((value) => Number.isFinite(value)))
          return
        }
      }
      setPinnedVersionIdsState(getPinnedVersionIds(userIdRef.current))
    }
    syncPinnedVersions()
    window.addEventListener(VERSION_PINNED_CHANGED_EVENT, syncPinnedVersions as EventListener)
    window.addEventListener('storage', syncPinnedVersions)
    return () => {
      window.removeEventListener(VERSION_PINNED_CHANGED_EVENT, syncPinnedVersions as EventListener)
      window.removeEventListener('storage', syncPinnedVersions)
    }
  }, [userId])

  const readerBodyRef = useRef<HTMLDivElement | null>(null)
  const versionMenuRef = useRef<HTMLDivElement | null>(null)
  const [localError, setLocalError] = useState('')
  const [versionId, setVersionId] = useState<number | null>(() => {
    const saved = Number(getUserPreference(userId, READER_VERSION_KEY))
    return Number.isFinite(saved) && saved !== 0 ? saved : null
  })
  const [bookId, setBookId] = useState(() => getUserPreference(userId, READER_BOOK_KEY) ?? '')
  const [chapter, setChapter] = useState(() => {
    const saved = Number(getUserPreference(userId, READER_CHAPTER_KEY))
    return Number.isFinite(saved) && saved > 0 ? saved : 1
  })
  const [readerView, setReaderView] = useState<ReaderView>(() => {
    const saved = getUserPreference(userId, READER_VIEW_KEY) ?? getUserPreference(userId, 'bible-study-yv-mode')
    if (saved === 'html' || saved === 'chapter' || saved === 'verse') return saved
    if (saved === 'verseFlow') return 'verse'
    if (saved === 'text') return 'chapter'
    return 'html'
  })
  const [testamentFilter, setTestamentFilter] = useState<TestamentFilter>('all')
  const [referenceInput, setReferenceInput] = useState(() => getUserPreference(userId, READER_INPUT_KEY) ?? '')
  const [navWidth, setNavWidth] = useState<number>(() => {
    const saved = Number(getUserPreference(userId, READER_NAV_WIDTH_KEY))
    return Number.isFinite(saved) && saved >= MIN_NAV_WIDTH ? saved : DEFAULT_NAV_WIDTH
  })
  const [versionMenuOpen, setVersionMenuOpen] = useState(false)
  const [versionSearchQuery, setVersionSearchQuery] = useState('')
  const [compareVersionSearchQuery, setCompareVersionSearchQuery] = useState('')
  const [hoveredVerse, setHoveredVerse] = useState<{ section: string; verse: string } | null>(null)
  const [compareOpen, setCompareOpen] = useState(() => getUserPreference(userId, READER_COMPARE_OPEN_KEY) === 'true')
  const [autoScrollEnabled, setAutoScrollEnabled] = useState(() => {
    const saved = getUserPreference(userId, READER_AUTOSCROLL_KEY)
    return saved === null ? !compareOpen : saved === 'true'
  })
  const [redLetterEnabled, setRedLetterEnabled] = useState(() => {
    const saved = getUserPreference(userId, READER_RED_LETTER_KEY)
    return saved === null ? true : saved === 'true'
  })
  const [entityHighlightsEnabled, setEntityHighlightsEnabled] = useState(() => {
    const saved = getUserPreference(userId, READER_ENTITY_HIGHLIGHTS_KEY)
    return saved === null ? false : saved === 'true'
  })
  useEffect(() => {
    const saved = getUserPreference(userId, READER_ENTITY_HIGHLIGHTS_KEY)
    setEntityHighlightsEnabled(saved === null ? false : saved === 'true')
  }, [userId])
  const [hoverHighlightEnabled, setHoverHighlightEnabled] = useState(() => {
    const saved = getUserPreference(userId, READER_HOVER_HIGHLIGHT_KEY)
    return saved === 'true'
  })
  const [compareVersionMenuOpen, setCompareVersionMenuOpen] = useState(false)
  const [compareVersionId, setCompareVersionId] = useState<number | null>(() => {
    const saved = Number(getUserPreference(userId, READER_COMPARE_KEY))
    return Number.isFinite(saved) && saved !== 0 ? saved : null
  })

  useEffect(() => {
    const savedVersion = Number(getUserPreference(userId, READER_VERSION_KEY))
    setVersionId(Number.isFinite(savedVersion) && savedVersion !== 0 ? savedVersion : null)
    setBookId(getUserPreference(userId, READER_BOOK_KEY) ?? '')
    const savedChapter = Number(getUserPreference(userId, READER_CHAPTER_KEY))
    setChapter(Number.isFinite(savedChapter) && savedChapter > 0 ? savedChapter : 1)
    const savedView = getUserPreference(userId, READER_VIEW_KEY) ?? getUserPreference(userId, 'bible-study-yv-mode')
    setReaderView(
      savedView === 'html' || savedView === 'chapter' || savedView === 'verse'
        ? savedView
        : savedView === 'verseFlow'
          ? 'verse'
          : savedView === 'text'
            ? 'chapter'
            : 'html',
    )
    setReferenceInput(getUserPreference(userId, READER_INPUT_KEY) ?? '')
    const savedNavWidth = Number(getUserPreference(userId, READER_NAV_WIDTH_KEY))
    setNavWidth(Number.isFinite(savedNavWidth) && savedNavWidth >= MIN_NAV_WIDTH ? savedNavWidth : DEFAULT_NAV_WIDTH)
    const savedCompareOpen = getUserPreference(userId, READER_COMPARE_OPEN_KEY) === 'true'
    setCompareOpen(savedCompareOpen)
    const savedAutoScroll = getUserPreference(userId, READER_AUTOSCROLL_KEY)
    setAutoScrollEnabled(savedAutoScroll === null ? !savedCompareOpen : savedAutoScroll === 'true')
    const savedRedLetter = getUserPreference(userId, READER_RED_LETTER_KEY)
    setRedLetterEnabled(savedRedLetter === null ? true : savedRedLetter === 'true')
    const savedEntity = getUserPreference(userId, READER_ENTITY_HIGHLIGHTS_KEY)
    setEntityHighlightsEnabled(savedEntity === null ? false : savedEntity === 'true')
    const savedHover = getUserPreference(userId, READER_HOVER_HIGHLIGHT_KEY)
    setHoverHighlightEnabled(savedHover === 'true')
    const savedCompareVersion = Number(getUserPreference(userId, READER_COMPARE_KEY))
    setCompareVersionId(Number.isFinite(savedCompareVersion) ? savedCompareVersion : null)
  }, [userId])

  const [compareSections, setCompareSections] = useState<CompareSection[]>([])
  const compareCurrentPassage = useMemo(() => compareSections[0]?.currentPassage ?? null, [compareSections])
  const comparePassage = useMemo(() => compareSections[0]?.comparePassage ?? null, [compareSections])
  const compareSourceVersionId = useMemo(() => compareSections[0]?.compareSourceVersionId ?? compareVersionId, [compareSections, compareVersionId])
  const [compareLoading, setCompareLoading] = useState(false)
  const [compareError, setCompareError] = useState('')
  const [bookIntroOpen, setBookIntroOpen] = useState(false)
  const [bookIntroHtml, setBookIntroHtml] = useState('')
  const [bookIntroLoading, setBookIntroLoading] = useState(false)
  const [bookIntroError, setBookIntroError] = useState('')
  const [bookIntroReference, setBookIntroReference] = useState('')
  const compareCurrentPaneRef = useRef<HTMLElement | null>(null)
  const compareComparePaneRef = useRef<HTMLElement | null>(null)
  const compareVersionMenuRef = useRef<HTMLDivElement | null>(null)
  const compareLoadingMoreRef = useRef(false)
  const readerSelectionSourceRef = useRef<'reader' | null>(null)
  const lastSelectedVerseIdRef = useRef<string | null>(null)
  const compareSelectionScrollKeyRef = useRef('')

  const bibleClient = useBibleClient()
  const chapterNumbersCacheRef = useRef<Map<string, number[]>>(new Map())
  const sectionCacheRef = useRef<Map<string, ReaderSection>>(new Map())
  const passageShellRef = useRef<HTMLDivElement | null>(null)
  const fontSizeRef = useRef<number>(1.02)
  const pinchStartRef = useRef<{ dist: number; size: number }>({ dist: 0, size: 1.02 })
  const sectionRefs = useRef<Map<string, HTMLElement | null>>(new Map())
  const loadingMoreRef = useRef(false)
  const hasPrimedScrollRef = useRef(false)
  const isSyncingScrollRef = useRef(false)
  const suppressChromeHideUntilRef = useRef(0)
  const [sections, setSections] = useState<ReaderSection[]>([])
  const [focusedSectionKey, setFocusedSectionKey] = useState('')
  const [focusedPassage, setFocusedPassage] = useState<{ bookId: string; chapter: number } | null>(null)
  const [focusedVerseLabel, setFocusedVerseLabel] = useState('')
  const [isLoadingSections, setIsLoadingSections] = useState(false)
  const [targetVerse, setTargetVerse] = useState<{ bookId: string; chapter: number; verse: number } | null>(null)
  const [availableVersions, setAvailableVersions] = useState<BibleVersion[]>([])
  const [versionsLoading, setVersionsLoading] = useState(true)
  const [versionsError, setVersionsError] = useState<Error | null>(null)
  useEffect(() => {
    let cancelled = false
    void (async () => {
      setVersionsLoading(true)
      setVersionsError(null)
      try {
        const cached = await getCachedData<BibleVersion[]>(ALL_VERSIONS_CACHE_KEY)
        if (cached?.length) {
          if (!cancelled) {
            setAvailableVersions(cached)
            setVersionsLoading(false)
          }
          return
        }
      } catch {
        // IndexedDB is optional; fall through to a live fetch.
      }
      let versionsFetchedSoFar: BibleVersion[] = []
      try {
        const all = await fetchAllBibleVersions(bibleClient, (versionsSoFar) => {
          versionsFetchedSoFar = versionsSoFar
          if (cancelled) return
          setAvailableVersions(versionsSoFar)
          // Let the reader render as soon as the first page arrives instead
          // of blocking on the full multi-second, multi-page fetch.
          setVersionsLoading(false)
        })
        if (cancelled) return
        setAvailableVersions(all)
        void setCachedData(ALL_VERSIONS_CACHE_KEY, all)
          .then(() => window.dispatchEvent(new CustomEvent(ALL_VERSIONS_CACHE_UPDATED_EVENT, { detail: all.length })))
          .catch(() => {})
      } catch (error) {
        if (!cancelled && !versionsFetchedSoFar.length) {
          setVersionsError(error instanceof Error ? error : new Error(String(error)))
        }
      } finally {
        if (!cancelled) setVersionsLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [bibleClient])
  useEffect(() => {
    if (!versionMenuOpen) return

    const onClick = (event: MouseEvent) => {
      const menu = versionMenuRef.current
      if (!menu || menu.contains(event.target as Node)) return
      setVersionMenuOpen(false)
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setVersionMenuOpen(false)
    }

    window.addEventListener('click', onClick)
    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('click', onClick)
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [versionMenuOpen])

  useEffect(() => {
    if (!versionMenuOpen) setVersionSearchQuery('')
  }, [versionMenuOpen])

  useEffect(() => {
    if (!compareVersionMenuOpen) setCompareVersionSearchQuery('')
  }, [compareVersionMenuOpen])

  useEffect(() => {
    if (compareOpen) {
      setVersionMenuOpen(false)
    }
  }, [compareOpen])

  useEffect(() => {
    if (!compareOpen) {
      setCompareVersionMenuOpen(false)
    }
  }, [compareOpen])

  useEffect(() => {
    if (!compareVersionMenuOpen) return

    const menu = compareVersionMenuRef.current

    const onClick = (event: MouseEvent) => {
      if (!menu || menu.contains(event.target as Node)) return
      setCompareVersionMenuOpen(false)
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setCompareVersionMenuOpen(false)
    }

    window.addEventListener('click', onClick)
    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('click', onClick)
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [compareVersionMenuOpen])

  const localFallbackBooks = useMemo(() => buildLocalFallbackBooks(), [])
  // The single app-wide language control (replaces the old separate en/es
  // toggle): every real language present in the live catalog, plus "auto"
  // and "all". Selecting a specific language filters every version dropdown
  // down to that language; selecting English or Spanish also changes the
  // app's UI text (see the sync effect in App.tsx's SettingsMenu).
  const languageOptions = useMemo(() => buildLanguageOptions(availableVersions), [availableVersions])
  // Only versions explicitly confirmed broken (partial-Bible translations
  // missing books/chapters, verified directly against the API) are hidden.
  // Untested versions -- e.g. every non-English translation, since the probe
  // only checks English -- are shown and rely on resolveVersionSources plus
  // the reader's per-passage/per-pane error handling at read time.
  const excludedVersionIdSet = useMemo(() => new Set(EXCLUDED_VERSION_IDS), [])
  const catalogVersions = useMemo(() => {
    const next = [
      LOCAL_KJV_VERSION,
      LOCAL_NLT_VERSION,
      CSB_VERSION,
      NKJV_VERSION,
      ...availableVersions.filter(
        (entry) => !isLocalFallbackVersion(entry) && !excludedVersionIdSet.has(entry.id),
      ),
    ] as VersionMenuEntry[]
    return next.filter((entry, index, all) => all.findIndex((candidate) => candidate.id === entry.id) === index)
  }, [availableVersions, excludedVersionIdSet])
  const pinnedVersionIdSet = useMemo(() => new Set(pinnedVersionIds), [pinnedVersionIds])

  useEffect(() => {
    if (!catalogVersions.length) return
    setVersionId((current) => {
      if (current && catalogVersions.some((entry) => entry.id === current)) return current
      return catalogVersions[0].id
    })
  }, [catalogVersions])

  const resolvedVersionId = useMemo(
    () => {
      const preferred = versionId ?? 111
      return catalogVersions.find((v) => v.id === preferred)?.id ?? catalogVersions[0]?.id ?? preferred
    },
    [catalogVersions, versionId],
  )
  const selectedVersion = useMemo(
    () => catalogVersions.find((entry) => entry.id === resolvedVersionId) ?? catalogVersions[0],
    [catalogVersions, resolvedVersionId],
  )
  const isLocalFallbackSelected = isLocalFallbackVersion(selectedVersion)
  const { version, loading: versionLoading, error: versionError } = useVersion(resolvedVersionId ?? 1, {
    enabled: resolvedVersionId !== null && !isLocalFallbackSelected,
  })
  const selectedVersionLabel = useMemo(() => {
    if (!selectedVersion) return ''
    return selectedVersion.localized_abbreviation || selectedVersion.abbreviation || selectedVersion.localized_title || selectedVersion.title
  }, [selectedVersion])
  useEffect(() => {
    if (selectedVersion && onVersionChange) {
      onVersionChange({ id: selectedVersion.id, name: selectedVersion.localized_title || selectedVersion.title, abbreviation: selectedVersionLabel })
    }
  }, [selectedVersion, onVersionChange, selectedVersionLabel])
  const resolvedBrowseLanguage = resolveVersionBrowseLanguagePreference(versionBrowseLanguagePreference, language)
  const browseVersions = useMemo(
    () => orderVersionsForBrowse(catalogVersions, resolvedBrowseLanguage, resolvedVersionId, pinnedVersionIds),
    [catalogVersions, pinnedVersionIds, resolvedBrowseLanguage, resolvedVersionId],
  )
  const compareBrowseVersions = useMemo(
    () => orderVersionsForBrowse(catalogVersions, resolvedBrowseLanguage, compareVersionId, pinnedVersionIds),
    [catalogVersions, pinnedVersionIds, resolvedBrowseLanguage, compareVersionId],
  )
  const compareVersion = useMemo(
    () => catalogVersions.find((entry) => entry.id === compareVersionId),
    [catalogVersions, compareVersionId],
  )
  const compareAvailableVersions = catalogVersions
  const { books: booksCollection, loading: booksLoading, error: booksError } = useBooks(resolvedVersionId ?? 1, {
    enabled: resolvedVersionId !== null && !isLocalFallbackSelected,
  })
  const books = isLocalFallbackSelected ? localFallbackBooks : booksCollection?.data ?? []
  const currentBook = useMemo(() => books.find((book) => book.id === bookId) ?? books[0], [books, bookId])
  const currentBookWithChapters = useMemo(
    () => (currentBook ? { ...currentBook, chapters: currentBook.chapters ?? [] } : undefined),
    [currentBook],
  )
  const { chapters: chaptersCollection, loading: chaptersLoading, error: chaptersError } = useChapters(
    resolvedVersionId ?? 1,
    currentBook?.id ?? '',
    {
      enabled: resolvedVersionId !== null && Boolean(currentBook?.id) && !isLocalFallbackSelected,
    },
  )
  const resolvedChapters = useMemo(
    () => (!chaptersLoading && chaptersCollection?.data ? chaptersCollection.data : currentBookWithChapters?.chapters ?? []),
    [chaptersCollection?.data, chaptersLoading, currentBookWithChapters?.chapters],
  )
  const currentIndexBook = useMemo(
    () => (currentBookWithChapters ? { ...currentBookWithChapters, chapters: resolvedChapters } : books[0]),
    [books, currentBookWithChapters, resolvedChapters],
  )
  useEffect(() => {
    setBookIntroOpen(false)
    setBookIntroHtml('')
    setBookIntroError('')
    setBookIntroReference('')
  }, [currentIndexBook?.id, resolvedVersionId])
  const currentChapter = useMemo(() => clampChapter(currentIndexBook, chapter), [currentIndexBook, chapter])
  const parsedReference = useMemo(() => parseReaderReference(referenceInput, books), [referenceInput, books])
  const versionTitle = selectedVersion?.localized_title || selectedVersion?.title || version?.localized_title || version?.title || 'Bible Reader'
  const passageLabel = currentIndexBook ? `${getBookLabel(currentIndexBook)} ${getChapterTitle(currentIndexBook, currentChapter)}` : 'Choose a book'
  const currentVersionLabel = formatVersionLabel(selectedVersion)
  const anchorReference = useMemo<ReaderReference | undefined>(
    () => parsedReference ?? (currentIndexBook ? { bookId: currentIndexBook.id, chapter: currentChapter } : undefined),
    [parsedReference, currentIndexBook, currentChapter],
  )
  const anchorReferenceKey = useMemo(
    () => (anchorReference ? formatReference(anchorReference.bookId, anchorReference.chapter, anchorReference.verse, anchorReference.verseEnd) : ''),
    [anchorReference],
  )
  const currentReference = anchorReferenceKey
  const highlightsPassageId = useMemo(
    () => (anchorReference ? `${anchorReference.bookId}.${anchorReference.chapter}` : ''),
    [anchorReference],
  )
  const compareVersionLabel = formatVersionLabel(compareVersion)
  const highlightsEnabled = auth.isAuthenticated && resolvedVersionId !== null && highlightsPassageId !== '' && !isLocalFallbackSelected
  const {
    highlights,
    loading: highlightsLoading,
    error: highlightsError,
    refetch: refetchHighlights,
    createHighlight,
    deleteHighlight,
  } = useHighlights(
    {
      version_id: resolvedVersionId ?? 1,
      passage_id: highlightsPassageId || 'GEN.1',
    },
    { enabled: highlightsEnabled },
  )
  const selectedVerse = useMemo(() => (selectedId ? findVerse(selectedId) : undefined), [selectedId])
  const activeSection = useMemo(
    () => sections.find((section) => section.key === focusedSectionKey) ?? sections[0] ?? null,
    [focusedSectionKey, sections],
  )

  const bookCodeById = useMemo(() => {
    const all = getAllVerses()
    const nameToCode = new Map<string, string>()
    const usfmToCode = new Map<string, string>()
    for (const verse of all) {
      if (!nameToCode.has(verse.bookName)) {
        nameToCode.set(verse.bookName, verse.book)
      }
      if (!usfmToCode.has(verse.book.toUpperCase())) {
        usfmToCode.set(verse.book.toUpperCase(), verse.book)
      }
    }
    return Object.fromEntries(
      books.map((book) => {
        const code =
          nameToCode.get(book.title) ||
          (book.abbreviation ? nameToCode.get(book.abbreviation) : undefined) ||
          usfmToCode.get(book.id.toUpperCase()) ||
          book.id
        return [book.id, code]
      }),
    )
  }, [books, getAllVerses])
  const bookNumberById = useMemo(() => {
    const all = getAllVerses()
    const canonicalByCode = new Map<string, number>()
    const seen = new Set<string>()
    for (const v of all) {
      if (seen.has(v.book)) continue
      seen.add(v.book)
      canonicalByCode.set(v.book, seen.size)
    }
    const map: Record<string, number> = {}
    for (const [id, code] of Object.entries(bookCodeById)) {
      const number = canonicalByCode.get(code)
      if (number) map[id] = number
    }
    return map
  }, [bookCodeById])
  const readerVersionId = versionId ? String(versionId) : ''
  const bookmarkedIds = useMemo(
    () => new Set(bookmarks.filter((b) => b.versionId === readerVersionId).map((b) => b.verseId)),
    [bookmarks, readerVersionId],
  )

  useEffect(() => {
    if (!highlights?.data?.length || !resolvedVersionId) return
    const all = getAllVerses()
    if (!all.length) return
    const versionId = String(resolvedVersionId)
    const unseen: { verseId: string; color?: string }[] = []
    for (const h of highlights.data) {
      const parts = h.passage_id.split('.')
      const bookId = parts[0]
      const chapter = Number(parts[1])
      const verse = Number(parts[2]?.split('-')[0])
      if (!bookId || !Number.isFinite(chapter) || !Number.isFinite(verse)) continue
      const localBookCode = bookCodeById[bookId.toUpperCase()] ?? bookId.toUpperCase()
      const match = all.find((v) => v.book === localBookCode && v.chapter === chapter && v.verse === verse)
      if (!match || bookmarkedIds.has(match.id)) continue
      unseen.push({ verseId: match.id, color: h.color })
    }
    if (!unseen.length) return
    try {
      importYouVersionHighlights(unseen, versionId, selectedVersionLabel || versionTitle)
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : String(err))
    }
  }, [highlights, resolvedVersionId, selectedVersionLabel, bookmarkedIds, getAllVerses().length])

  const activeBookId = anchorReference?.bookId ?? currentIndexBook?.id ?? ''
  const activeChapter = anchorReference?.chapter ?? currentChapter
  const activeBook = useMemo(
    () => books.find((book) => book.id === activeBookId) ?? currentIndexBook,
    [activeBookId, books, currentIndexBook],
  )

  useEffect(() => {
    if (!activeBookId || typeof window === 'undefined') return
    localStorage.setItem('bible-study-yv-book', activeBookId)
    if (Number.isFinite(activeChapter) && activeChapter > 0) {
      localStorage.setItem('bible-study-yv-chapter', String(activeChapter))
    }
    onLastReadChange?.(activeBookId, activeChapter, currentIndexBook ? getBookLabel(currentIndexBook) : activeBookId)
  }, [activeBookId, activeChapter, onLastReadChange])

  const [mobileChromeVisible, setMobileChromeVisible] = useState(false)
  const [isCompactMobile, setIsCompactMobile] = useState(() => typeof window !== 'undefined' && window.matchMedia('(max-width: 640px)').matches)
  const focusedPassageTitle = useMemo(() => {
    const bookId = focusedPassage?.bookId ?? activeBookId
    const chapter = focusedPassage?.chapter ?? activeChapter
    const book = books.find((b) => b.id === bookId) ?? currentIndexBook
    return book ? `${getBookLabel(book)} ${getChapterTitle(book, chapter)}` : passageLabel
  }, [activeBookId, activeChapter, books, currentIndexBook, focusedPassage, passageLabel])
  const focusedReferenceLabel = focusedVerseLabel || activeSection?.reference || anchorReferenceKey
  const navigationReference = anchorReference
  const copyright = (isLocalFallbackSelected ? selectedVersion?.copyright : version?.copyright)?.trim() ?? ''
  const catalogError = versionsError?.message || ''
  const readerError =
    localError ||
    (!isLocalFallbackSelected ? versionError?.message || booksError?.message || chaptersError?.message || highlightsError?.message || '' : '')
  const isHighlightsPermissionError = Boolean(
    highlightsError &&
      (highlightsError.message?.includes('NOT_PERMITTED') ||
        highlightsError.message?.toLowerCase().includes('permit') ||
        highlightsError.message?.toLowerCase().includes('not permitted') ||
        (highlightsError as { reason?: string }).reason === 'NOT_PERMITTED'),
  )
  const visibleBooks = useMemo(
    () => books.filter((book) => testamentFilter === 'all' || getTestamentForBook(book.id) === testamentFilter),
    [books, testamentFilter],
  )

  const mobileBookOptions = useMemo(
    () =>
      visibleBooks.map((book) => {
        const title = book.full_title || book.title || book.abbreviation || book.id
        const subtitle = book.title && book.title !== title ? book.title : book.abbreviation || ''
        return { value: book.id, label: title, subtitle: subtitle !== title ? subtitle : '' }
      }),
    [visibleBooks],
  )

  const mobileChapterOptions = useMemo(() => {
    const numbers = (activeBook?.chapters ?? [])
      .map((chapter) => Number(chapter.id || chapter.title))
      .filter((value) => Number.isFinite(value))
    return numbers.map((chapter) => ({ value: chapter, label: chapter.toString(), subtitle: 'Chapter' }))
  }, [activeBook])

  const mobileVerseOptions = useMemo(() => {
    const section = sections.find((s) => s.bookId === activeBookId && s.chapter === activeChapter)
    const numbers = section?.verses.map((verse) => Number(verse.verse)).filter(Number.isFinite) ?? []
    return numbers.map((verse) => ({ value: verse, label: verse.toString(), subtitle: 'Verse' }))
  }, [activeBookId, activeChapter, sections])

  const mobileVersionOptions = useMemo(
    () =>
      browseVersions.map((entry) => {
        const label = formatVersionLabel(entry)
        return { value: entry.id, label: label.title, subtitle: label.subtitle }
      }),
    [browseVersions],
  )

  const mobileCompareVersionOptions = useMemo(
    () =>
      compareBrowseVersions.map((entry) => {
        const label = formatVersionLabel(entry)
        return { value: entry.id, label: label.title, subtitle: label.subtitle }
      }),
    [compareBrowseVersions],
  )

  const mobileLanguageOptions = useMemo(
    () => [
      { value: 'auto', label: `Auto (${language.toUpperCase()})` },
      { value: 'all', label: 'All languages' },
      ...languageOptions.map((option) => ({ value: option.tag, label: option.label })),
    ],
    [language, languageOptions],
  )

  const activeVerseNumber = useMemo(() => {
    if (!selectedVerse) return 1
    const bookCode = bookCodeById[activeBookId] ?? activeBookId
    if (selectedVerse.book !== bookCode || selectedVerse.chapter !== activeChapter) return 1
    return selectedVerse.verse
  }, [selectedVerse, activeBookId, activeChapter, bookCodeById])

  useEffect(() => {
    setMobileChromeVisible(true)
    suppressChromeHideUntilRef.current = Date.now() + 700
  }, [activeBookId, activeChapter, resolvedVersionId, compareVersionId, compareOpen, readerView])

  useEffect(() => {
    const media = window.matchMedia('(max-width: 640px)')
    const update = () => setIsCompactMobile(media.matches)
    update()
    media.addEventListener('change', update)
    return () => media.removeEventListener('change', update)
  }, [])

  useEffect(() => {
    if (!isCompactMobile || !compareOpen) return
    setCompareOpen(false)
    setCompareVersionMenuOpen(false)
  }, [compareOpen, isCompactMobile])

  useEffect(() => {
    const shell = passageShellRef.current
    if (!shell || compareOpen) return

    const appMain = shell.closest<HTMLElement>('.app-main')
    const scrollTargets = [shell, appMain].filter(Boolean) as HTMLElement[]
    if (!scrollTargets.length) return

    const lastScrollTops = new Map<HTMLElement, number>(scrollTargets.map((target) => [target, target.scrollTop]))
    let raf = 0

    const updateChromeVisibility = (source: HTMLElement) => {
      const currentScrollTop = source.scrollTop
      const lastScrollTop = lastScrollTops.get(source) ?? currentScrollTop
      const delta = currentScrollTop - lastScrollTop

      if (Date.now() < suppressChromeHideUntilRef.current) {
        lastScrollTops.set(source, currentScrollTop)
        return
      }

      if (currentScrollTop <= 12) {
        setMobileChromeVisible(false)
        lastScrollTops.set(source, currentScrollTop)
        return
      }

      if (Math.abs(delta) < 8) return

      setMobileChromeVisible(delta < 0)
      lastScrollTops.set(source, currentScrollTop)
    }

    const handlers = scrollTargets.map((target) => {
      const onScroll = () => {
        cancelAnimationFrame(raf)
        raf = window.requestAnimationFrame(() => updateChromeVisibility(target))
      }

      target.addEventListener('scroll', onScroll, { passive: true })
      return { target, onScroll }
    })

    return () => {
      handlers.forEach(({ target, onScroll }) => target.removeEventListener('scroll', onScroll))
      cancelAnimationFrame(raf)
    }
  }, [compareOpen, sections.length])

  useEffect(() => {
    const shell = passageShellRef.current
    if (!shell || !Capacitor.isNativePlatform()) return

    const saved = Number(getUserPreference(userId, READER_FONT_SIZE_KEY))
    if (Number.isFinite(saved) && saved > 0) {
      fontSizeRef.current = saved
    }
    shell.style.setProperty('--reader-font-size', `${fontSizeRef.current.toFixed(3)}rem`)

    const getDistance = (t1: Touch, t2: Touch) =>
      Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY)

    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length === 2) {
        const t1 = e.touches[0]
        const t2 = e.touches[1]
        pinchStartRef.current = {
          dist: getDistance(t1, t2),
          size: fontSizeRef.current,
        }
      }
    }

    const onTouchMove = (e: TouchEvent) => {
      if (e.touches.length !== 2 || pinchStartRef.current.dist <= 0) return
      e.preventDefault()
      const t1 = e.touches[0]
      const t2 = e.touches[1]
      const dist = getDistance(t1, t2)
      const scale = dist / pinchStartRef.current.dist
      const next = Math.min(Math.max(pinchStartRef.current.size * scale, 0.85), 1.7)
      fontSizeRef.current = next
      shell.style.setProperty('--reader-font-size', `${next.toFixed(3)}rem`)
    }

    const onTouchEnd = (e: TouchEvent) => {
      if (pinchStartRef.current.dist > 0 && e.touches.length < 2) {
        window.dispatchEvent(new CustomEvent('reader:font-size', { detail: fontSizeRef.current }))
        pinchStartRef.current = { dist: 0, size: fontSizeRef.current }
      }
    }

    shell.addEventListener('touchstart', onTouchStart, { passive: true })
    shell.addEventListener('touchmove', onTouchMove, { passive: false })
    shell.addEventListener('touchend', onTouchEnd, { passive: true })

    return () => {
      shell.removeEventListener('touchstart', onTouchStart)
      shell.removeEventListener('touchmove', onTouchMove)
      shell.removeEventListener('touchend', onTouchEnd)
    }
  }, [compareOpen, sections.length])

  useEffect(() => {
    const onChange = (e: Event) => {
      const size = (e as CustomEvent<number>).detail
      if (typeof size !== 'number') return
      fontSizeRef.current = size
      setUserPreference(userIdRef.current, READER_FONT_SIZE_KEY, String(size))
      const shell = passageShellRef.current
      shell?.style.setProperty('--reader-font-size', `${size.toFixed(3)}rem`)
    }
    window.addEventListener('reader:font-size', onChange)
    return () => window.removeEventListener('reader:font-size', onChange)
  }, [])

  const signedInLabel = userInfo?.name || userInfo?.email || 'YouVersion user'
  const currentPassageLabel = currentReference || passageLabel
  const passageReferenceLabel = focusedReferenceLabel || currentPassageLabel
  const currentVersionTitle = currentVersionLabel.title || versionTitle || 'Choose a version'
  const currentVersionSubtitle = currentVersionLabel.subtitle || copyright || 'Select a version'
  const compareVersionTitle = compareVersionLabel.title || 'Choose a compare version'
  const compareVersionSubtitle = compareVersionLabel.subtitle || 'Select a version'
  const comparePassageLabel = compareCurrentPassage?.reference || currentPassageLabel
  const currentBookMetadata = currentIndexBook as YouVersionBook | undefined
  const currentBookInfoUrl = selectedVersion?.youversion_deep_link?.trim() || ''
  const currentBookInfoLabel = currentBookMetadata?.intro
    ? (currentBookMetadata.intro.title?.trim() || 'Book intro')
    : (currentBookInfoUrl ? 'Open book info' : '')
  const handleSetReaderView = useCallback((view: ReaderView) => {
    setReaderView(view)
  }, [readerView])
  const handleToggleCompare = useCallback(() => {
    setCompareOpen((current) => {
      const next = !current
      if (!next) setCompareVersionMenuOpen(false)
      return next
    })
  }, [])
  const handleToggleAutoScroll = useCallback(() => setAutoScrollEnabled((current) => !current), [])
  const handleToggleRedLetter = useCallback(() => setRedLetterEnabled((current) => !current), [])
  const handleToggleEntityHighlights = useCallback(() => setEntityHighlightsEnabled((current) => !current), [])
  const handleToggleHoverHighlight = useCallback(() => setHoverHighlightEnabled((current) => !current), [])
  const handleToggleVersionMenu = useCallback(() => setVersionMenuOpen((current) => !current), [])
  const handleToggleCompareVersionMenu = useCallback(
    () => setCompareVersionMenuOpen((current) => !current),
    [],
  )
  const handleSelectCurrentVersion = useCallback((id: number) => {
    setVersionId(id)
    setVersionMenuOpen(false)
  }, [])
  const handleSelectCompareVersion = useCallback((id: number) => {
    setCompareVersionId(id)
    setCompareVersionMenuOpen(false)
  }, [])
  const handleTogglePinVersion = useCallback(
    (entry: VersionMenuEntry) => {
      if (isLocalFallbackVersion(entry)) return
      const next = pinnedVersionIds.includes(entry.id)
        ? pinnedVersionIds.filter((id) => id !== entry.id)
        : [...pinnedVersionIds, entry.id]
      setPinnedVersionIdsState(next)
      setPinnedVersionIds(userIdRef.current, next)
    },
    [pinnedVersionIds],
  )
  const handleOpenBookSource = useCallback(() => {
    if (!currentBookInfoUrl) return
    window.open(currentBookInfoUrl, '_blank', 'noopener,noreferrer')
  }, [currentBookInfoUrl])
  const handleOpenBookInfo = useCallback(async () => {
    if (!currentBookMetadata) return

    const introPassageId = currentBookMetadata.intro?.passage_id?.trim() ?? ''
    if (introPassageId && resolvedVersionId !== null) {
      if (bookIntroOpen && bookIntroReference === introPassageId && bookIntroHtml) {
        setBookIntroOpen((current) => !current)
        return
      }

      setBookIntroLoading(true)
      setBookIntroError('')
      try {
        const passage = await fetchYouVersionPassage(resolvedVersionId, introPassageId, { format: 'html', includeHeadings: true, includeNotes: true })
        const ref = parsePassageId(passage.id) ?? parsePassageId(introPassageId)
        const transformed = transformPassageForBrowser(
          passage.content,
          ref?.bookId ?? currentBookMetadata.id,
          ref?.chapter,
          tagPositionsByVerseId,
          bookNumberById,
          entityHighlightsEnabled,
        )
        setBookIntroHtml(transformed.html)
        setBookIntroReference(introPassageId)
        setBookIntroOpen(true)
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        if (message.includes('404')) {
          // Some versions (e.g. KJV) do not have book intros; ignore the 404.
          setBookIntroError('')
          setBookIntroOpen(false)
        } else {
          setBookIntroError(message)
          setBookIntroOpen(true)
        }
      } finally {
        setBookIntroLoading(false)
      }
      return
    }

    if (currentBookInfoUrl) {
      handleOpenBookSource()
    }
  }, [bookIntroHtml, bookIntroOpen, bookIntroReference, bookNumberById, currentBookInfoUrl, currentBookMetadata, entityHighlightsEnabled, handleOpenBookSource, resolvedVersionId, tagPositionsByVerseId])
  const handleSaveVerse = useCallback(async (verseId: string, yvPassageId?: string) => {
    const isSaved = bookmarkedIds.has(verseId)
    onToggleBookmark(verseId, selectedVersion ? String(selectedVersion.id) : '', selectedVersionLabel || versionTitle)
    if (!auth.isAuthenticated || resolvedVersionId === null || isLocalFallbackSelected) return
    const highlightPassageId = yvPassageId ?? verseId
    setLocalError('')
    try {
      if (isSaved) {
        await deleteHighlight(highlightPassageId, { version_id: resolvedVersionId })
      } else {
        await createHighlight({
          version_id: resolvedVersionId,
          passage_id: highlightPassageId,
          color: 'f4b400',
        })
      }
      refetchHighlights()
    } catch (error) {
      setLocalError(error instanceof Error ? error.message : String(error))
    }
  }, [auth.isAuthenticated, bookmarkedIds, createHighlight, deleteHighlight, onToggleBookmark, refetchHighlights, resolvedVersionId, selectedVersion, selectedVersionLabel])

  const handleYouVersionSignIn = useCallback(async () => {
    const redirectUrl = getYouVersionRedirectUrl()
    await beginYouVersionSignIn(redirectUrl, ['openid', 'profile'], ['highlights'])
  }, [])

  const readerToolButtons = useMemo(
    () => (
      <ReaderToolButtons
        readerView={readerView}
        compareOpen={compareOpen}
        autoScrollEnabled={autoScrollEnabled}
        redLetterEnabled={redLetterEnabled}
        hoverHighlightEnabled={hoverHighlightEnabled}
        entityHighlightsEnabled={entityHighlightsEnabled}
        onSetReaderView={handleSetReaderView}
        onToggleCompare={handleToggleCompare}
        onToggleAutoScroll={handleToggleAutoScroll}
        onToggleRedLetter={handleToggleRedLetter}
        onToggleEntityHighlights={handleToggleEntityHighlights}
        onToggleHoverHighlight={handleToggleHoverHighlight}
        onOpenBookInfo={handleOpenBookInfo}
        bookInfoLabel={currentBookInfoLabel}
        bookInfoOpen={bookIntroOpen}
        hideCompareButton={isCompactMobile}
        hideAutoScrollButton={isCompactMobile}
        hideHoverButton={isCompactMobile}
        hideAudioButton={isCompactMobile}
        audioUrl={audioUrl}
        audioPlaying={audioPlaying}
        audioLoading={audioLoading}
        onToggleAudio={onToggleAudio}
      />
    ),
    [readerView, compareOpen, autoScrollEnabled, redLetterEnabled, hoverHighlightEnabled, entityHighlightsEnabled, currentBookInfoLabel, bookIntroOpen, handleOpenBookInfo, handleSetReaderView, handleToggleCompare, handleToggleAutoScroll, handleToggleRedLetter, handleToggleEntityHighlights, handleToggleHoverHighlight, isCompactMobile, audioUrl, audioPlaying, audioLoading, onToggleAudio],
  )


  useEffect(() => {
    if (compareVersionId === null) {
      removeUserPreference(userIdRef.current, READER_COMPARE_KEY)
      return
    }

    setUserPreference(userIdRef.current, READER_COMPARE_KEY, String(compareVersionId))
  }, [compareVersionId])

  useEffect(() => {
    if (!compareOpen || (compareVersionId !== null && compareVersionId !== 0) || !compareAvailableVersions.length || resolvedVersionId === null) return
    const fallbackCompare = compareAvailableVersions.find((entry) => entry.id !== resolvedVersionId)
    if (fallbackCompare) {
      setCompareVersionId(fallbackCompare.id)
    }
  }, [availableVersions, compareAvailableVersions, compareOpen, compareVersionId, resolvedVersionId])

  useEffect(() => {
    if (!compareOpen || compareVersionId === null || compareVersionId === 0 || resolvedVersionId === null) return
    if (compareVersionId !== resolvedVersionId) return

    const fallbackCompare = compareAvailableVersions.find((entry) => entry.id !== resolvedVersionId)
    if (fallbackCompare) {
      setCompareVersionId(fallbackCompare.id)
    }
  }, [compareAvailableVersions, compareOpen, compareVersionId, resolvedVersionId])

  const resolveChapterNumbers = useCallback(
    async (book: YouVersionBook): Promise<number[]> => {
      const cached = chapterNumbersCacheRef.current.get(book.id)
      if (cached?.length) return cached

      const inMemoryNumbers = chapterNumbers(book)
      if (inMemoryNumbers.length) {
        chapterNumbersCacheRef.current.set(book.id, inMemoryNumbers)
        return inMemoryNumbers
      }

      if (resolvedVersionId === null) return []

      try {
        const chaptersResult = await bibleClient.getChapters(resolvedVersionId, book.id)
        const numbers = (chaptersResult.data ?? [])
          .map((chapterEntry) => Number(chapterEntry.id || chapterEntry.title))
          .filter((value) => Number.isFinite(value))
        if (numbers.length) {
          chapterNumbersCacheRef.current.set(book.id, numbers)
        }
        return numbers
      } catch {
        return []
      }
    },
    [bibleClient, resolvedVersionId, tagPositionsByVerseId, hasEntityData, bookNumberById, entityHighlightsEnabled],
  )

  const versionProbeOrder = useCallback(
    (preferredVersionId: number | null) => {
      const ids: number[] = []
      const push = (value: number | null | undefined) => {
        if (!value || ids.includes(value)) return
        ids.push(value)
      }

      push(preferredVersionId)
      for (const entry of catalogVersions) {
        push(entry.id)
      }
      return ids
    },
    [catalogVersions],
  )

  const loadPassageForVersion = useCallback(
    async (versionId: number, reference: ReaderReference): Promise<BiblePassage | null> => {
      const version = catalogVersions.find((entry) => entry.id === versionId)
      if (!version) return null

      const sources = await resolveVersionSources(version)
      if (sources.length === 0) {
        throw new Error('This version is not available for this passage.')
      }

      let lastError: unknown = null
      for (const source of sources) {
        try {
          if (source.kind === 'localKjv') {
            const passage = buildLocalKjvPassage(reference, localFallbackBooks)
            if (passage) return passage
          } else if (source.kind === 'localNlt') {
            return await fetchNltPassage(reference.bookId, reference.chapter)
          } else if (source.kind === 'apiBible') {
            const passage = await fetchApiBiblePassage(source.bibleId, reference)
            if (passage) return passage
          } else if (source.kind === 'bibleApi') {
            const passage = await fetchBibleApiPassage(version, reference)
            if (passage) return passage
          } else if (source.kind === 'youversion') {
            // YouVersion's passage endpoint requires the exact-case USFM book
            // code (e.g. "PSA", "1SA", "NAM"). Our internal reference.bookId
            // can be OSIS-style mixed case (e.g. "Ps", "1Sam") when it comes
            // from the local KJV/NLT fallback data, so normalize it here.
            const chapterReference = formatReference(osisToUsfm(reference.bookId), reference.chapter)
            return await bibleClient.getPassage(versionId, chapterReference, 'html', true, true)
          }
        } catch (error) {
          if (!isAccessDeniedError(error) && !isPassageNotFoundError(error)) throw error
          lastError = error
        }
      }

      throw lastError ?? new Error('This version does not contain this passage.')
    },
    [bibleClient, catalogVersions, localFallbackBooks],
  )

  const loadSectionForVersion = useCallback(
    async (versionId: number, reference: ReaderReference): Promise<ReaderSection | null> => {
      const chapterReference = formatReference(reference.bookId, reference.chapter)
      const cacheKey = `${versionId}:${chapterReference}:${hasEntityData ? '1' : '0'}:${entityHighlightsEnabled ? '1' : '0'}`
      const cached = sectionCacheRef.current.get(cacheKey)
      if (cached) return cached

      const passage = await loadPassageForVersion(versionId, reference)
      if (!passage) return null
      const transformed = transformPassageForBrowser(
        passage.content,
        reference.bookId,
        reference.chapter,
        tagPositionsByVerseId,
        bookNumberById,
        entityHighlightsEnabled,
        isLocalVersionId(versionId),
      )

      const section: ReaderSection = {
        key: chapterReference,
        bookId: reference.bookId,
        chapter: reference.chapter,
        reference: passage.reference || chapterReference,
        passageId: passage.id,
        content: transformed.html,
        plainText: transformed.text,
        verses: extractVerseBlocks(transformed.html),
      }

      sectionCacheRef.current.set(cacheKey, section)
      return section
    },
    [loadPassageForVersion, tagPositionsByVerseId, hasEntityData, bookNumberById, entityHighlightsEnabled],
  )

  const loadSection = useCallback(
    async (reference: ReaderReference): Promise<ReaderSection | null> => {
      if (resolvedVersionId === null) return null
      return loadSectionForVersion(resolvedVersionId, reference)
    },
    [loadSectionForVersion, resolvedVersionId],
  )

  const loadCompareSectionForVersion = useCallback(
    async (currentVersionId: number, nextCompareVersionId: number, reference: ReaderReference): Promise<CompareSection | null> => {
      const chapterReference = formatReference(reference.bookId, reference.chapter)
      const currentPassage = await loadPassageForVersion(currentVersionId, reference)
      if (!currentPassage) return null

      const currentTransformed = transformPassageForBrowser(
        currentPassage.content,
        reference.bookId,
        reference.chapter,
        tagPositionsByVerseId,
        bookNumberById,
        entityHighlightsEnabled,
        isLocalVersionId(currentVersionId),
      )

      let comparePassage: BiblePassage | null = null
      let compareUnavailable = false
      try {
        comparePassage = await loadPassageForVersion(nextCompareVersionId, reference)
      } catch (error) {
        if (!isAccessDeniedError(error) && !isPassageNotFoundError(error)) throw error
      }
      if (!comparePassage) compareUnavailable = true

      const compareTransformed = comparePassage
        ? transformPassageForBrowser(
            comparePassage.content,
            reference.bookId,
            reference.chapter,
            tagPositionsByVerseId,
            bookNumberById,
            entityHighlightsEnabled,
            isLocalVersionId(nextCompareVersionId),
          )
        : { html: '', text: '' }

      return {
        key: chapterReference,
        bookId: reference.bookId,
        chapter: reference.chapter,
        reference: currentPassage.reference || comparePassage?.reference || chapterReference,
        currentPassage,
        comparePassage,
        compareSourceVersionId: nextCompareVersionId,
        compareUnavailable,
        currentHtml: currentTransformed.html,
        compareHtml: compareTransformed.html,
        currentVerses: extractVerseBlocks(currentTransformed.html),
        compareVerses: extractVerseBlocks(compareTransformed.html),
      }
    },
    [loadPassageForVersion, tagPositionsByVerseId, bookNumberById, entityHighlightsEnabled],
  )

  const loadCompareSection = useCallback(
    async (reference: ReaderReference): Promise<CompareSection | null> => {
      if (resolvedVersionId === null || compareVersionId === null || compareVersionId === 0) return null
      return loadCompareSectionForVersion(resolvedVersionId, compareVersionId, reference)
    },
    [compareVersionId, loadCompareSectionForVersion, resolvedVersionId],
  )

  const recoverAccessibleSection = useCallback(
    async (reference: ReaderReference, preferredVersionId: number | null): Promise<ReaderSection | null> => {
      for (const candidateVersionId of versionProbeOrder(preferredVersionId)) {
        try {
          const section = await loadSectionForVersion(candidateVersionId, reference)
          if (section) {
            if (candidateVersionId !== preferredVersionId) {
              setVersionId(candidateVersionId)
            }
            setLocalError('')
            return section
          }
        } catch (error) {
          if (!isAccessDeniedError(error) && !isPassageNotFoundError(error)) throw error
        }
      }
      return null
    },
    [loadSectionForVersion, versionProbeOrder],
  )

  useEffect(() => {
    for (const book of books) {
      const numbers = chapterNumbers(book)
      if (numbers.length) {
        chapterNumbersCacheRef.current.set(book.id, numbers)
      }
    }
    if (currentIndexBook) {
      const currentNumbers = chapterNumbers(currentIndexBook)
      if (currentNumbers.length) {
        chapterNumbersCacheRef.current.set(currentIndexBook.id, currentNumbers)
      }
    }
  }, [books, currentIndexBook])

  useEffect(() => {
    const currentBookIndex = books.findIndex((book) => book.id === currentIndexBook?.id)
    if (resolvedVersionId === null || currentBookIndex < 0) return

    const adjacentBooks = [books[currentBookIndex - 1], books[currentBookIndex + 1]].filter(Boolean) as YouVersionBook[]

    void Promise.all(adjacentBooks.map((book) => resolveChapterNumbers(book))).catch(() => {
      // best-effort cache warmup only
    })
  }, [books, currentIndexBook?.id, resolveChapterNumbers, resolvedVersionId])

  useEffect(() => {
    if (!visibleBooks.length) return
    if (visibleBooks.some((book) => book.id === bookId)) return
    const fallback = visibleBooks[0]
    if (!fallback) return
    setBookId(fallback.id)
    setChapter(clampChapter(fallback, 1))
  }, [bookId, visibleBooks])

  useEffect(() => {
    setUserPreference(userIdRef.current, READER_VIEW_KEY, readerView)
  }, [readerView])

  useEffect(() => {
    if (!currentIndexBook) return
    const currentTestament = getTestamentForBook(currentIndexBook.id)
    if (!currentTestament) return
    if (testamentFilter === 'all') return
    if (currentTestament === testamentFilter) return
    setTestamentFilter(currentTestament)
  }, [currentIndexBook, testamentFilter])

  useEffect(() => {
    if (!books.length) return
    if (testamentFilter === 'all') return
    if (!visibleBooks.length) {
      setTestamentFilter('all')
    }
  }, [books, visibleBooks, testamentFilter])

  const setBookAndChapter = useCallback((nextBookId: string, nextChapter: number) => {
    setBookId(nextBookId)
    setChapter(nextChapter)
    const testament = getTestamentForBook(nextBookId)
    if (testament) setTestamentFilter(testament)
  }, [setBookId, setChapter, setTestamentFilter])

  const appendNextSection = useCallback(async () => {
    if (loadingMoreRef.current || !sections.length || !books.length) return

    const last = sections[sections.length - 1]
    const next = await nextOrPreviousChapter(books, last.bookId, last.chapter, 'next', resolveChapterNumbers)
    if (!next) return

    loadingMoreRef.current = true
    setIsLoadingSections(true)
    try {
      const section = await loadSection(next)
      if (!section) return
      setSections((current) => (current.some((entry) => entry.key === section.key) ? current : [...current, section]))
    } catch (loadError) {
      if (isAccessDeniedError(loadError) || isPassageNotFoundError(loadError)) {
        const recovered = await recoverAccessibleSection(next, resolvedVersionId)
        if (recovered) return
      }
      setLocalError(formatPassageError(loadError))
    } finally {
      loadingMoreRef.current = false
      setIsLoadingSections(false)
    }
  }, [books, loadSection, readerView, resolveChapterNumbers, sections])

  const prependPreviousSection = useCallback(async () => {
    if (loadingMoreRef.current || !sections.length || !books.length) return

    const shell = passageShellRef.current
    const previousScrollTop = shell?.scrollTop ?? 0
    const previousScrollHeight = shell?.scrollHeight ?? 0

    const first = sections[0]
    const previous = await nextOrPreviousChapter(books, first.bookId, first.chapter, 'previous', resolveChapterNumbers)
    if (!previous) return

    loadingMoreRef.current = true
    setIsLoadingSections(true)
    try {
      const section = await loadSection(previous)
      if (!section) return
      setSections((current) => (current.some((entry) => entry.key === section.key) ? current : [section, ...current]))
      window.requestAnimationFrame(() => {
        const nextScrollHeight = shell?.scrollHeight ?? previousScrollHeight
        if (!shell) return
        shell.scrollTop = previousScrollTop + (nextScrollHeight - previousScrollHeight)
      })
    } catch (loadError) {
      if (isAccessDeniedError(loadError) || isPassageNotFoundError(loadError)) {
        const recovered = await recoverAccessibleSection(previous, resolvedVersionId)
        if (recovered) return
      }
      setLocalError(formatPassageError(loadError))
    } finally {
      loadingMoreRef.current = false
      setIsLoadingSections(false)
    }
  }, [books, loadSection, resolveChapterNumbers, sections])

  const appendNextCompareSection = useCallback(async () => {
    if (
      compareLoadingMoreRef.current ||
      !compareSections.length ||
      !books.length ||
      resolvedVersionId === null ||
      compareVersionId === null
    ) {
      return
    }

    const last = compareSections[compareSections.length - 1]
    const next = await nextOrPreviousChapter(books, last.bookId, last.chapter, 'next', resolveChapterNumbers)
    if (!next) return

    compareLoadingMoreRef.current = true
    setCompareLoading(true)
    try {
      const section = await loadCompareSection(next)
      if (!section) return
      setCompareSections((current) => (current.some((entry) => entry.key === section.key) ? current : [...current, section]))
    } catch (loadError) {
      setCompareError(formatPassageError(loadError))
    } finally {
      compareLoadingMoreRef.current = false
      setCompareLoading(false)
    }
  }, [books, compareSections, compareVersionId, loadCompareSection, resolveChapterNumbers, resolvedVersionId])

  const prependPreviousCompareSection = useCallback(async () => {
    if (
      compareLoadingMoreRef.current ||
      !compareSections.length ||
      !books.length ||
      resolvedVersionId === null ||
      compareVersionId === null
    ) {
      return
    }

    const shell = compareCurrentPaneRef.current
    const previousScrollTop = shell?.scrollTop ?? 0
    const previousScrollHeight = shell?.scrollHeight ?? 0

    const first = compareSections[0]
    const previous = await nextOrPreviousChapter(books, first.bookId, first.chapter, 'previous', resolveChapterNumbers)
    if (!previous) return

    compareLoadingMoreRef.current = true
    setCompareLoading(true)
    try {
      const section = await loadCompareSection(previous)
      if (!section) return
      setCompareSections((current) => (current.some((entry) => entry.key === section.key) ? current : [section, ...current]))
      window.requestAnimationFrame(() => {
        const nextScrollHeight = shell?.scrollHeight ?? previousScrollHeight
        if (!shell) return
        shell.scrollTop = previousScrollTop + (nextScrollHeight - previousScrollHeight)
      })
    } catch (loadError) {
      setCompareError(formatPassageError(loadError))
    } finally {
      compareLoadingMoreRef.current = false
      setCompareLoading(false)
    }
  }, [books, compareSections, compareVersionId, loadCompareSection, resolveChapterNumbers, resolvedVersionId])

  useEffect(() => {
    if (!resolvedVersionId || !bookId) {
      setSections([])
      setFocusedSectionKey('')
      setFocusedVerseLabel('')
      return
    }

    let cancelled = false

    async function loadBufferedSections() {
      loadingMoreRef.current = true
      setIsLoadingSections(true)
      setLocalError('')

      const book = books.find((b) => b.id === bookId)
      if (!book) {
        setIsLoadingSections(false)
        loadingMoreRef.current = false
        return
      }

      const numbers = await resolveChapterNumbers(book)
      const clampedChapter = numbers.includes(chapter) ? chapter : numbers[0] ?? chapter
      const firstReference: ReaderReference = { bookId: book.id, chapter: clampedChapter }

      try {
        const firstSection = await loadSection(firstReference)
        if (!firstSection) {
          if (!cancelled) {
            setSections([])
            setFocusedSectionKey('')
            setFocusedVerseLabel('')
          }
          return
        }

        if (cancelled) return

        setSections([firstSection])
        sectionRefs.current = new Map()
        setFocusedSectionKey(firstSection.key)
        setFocusedVerseLabel(formatChapterMarker(book, firstSection.chapter))
        setUserPreference(userIdRef.current, READER_COMMITTED_KEY, firstSection.reference)

        const builtSections: ReaderSection[] = [firstSection]
        let nextReference = await nextOrPreviousChapter(books, firstSection.bookId, firstSection.chapter, 'next', resolveChapterNumbers)

        for (let index = 1; index < INITIAL_BUFFER_SIZE && nextReference; index++) {
          const section = await loadSection(nextReference)
          if (!section) break
          builtSections.push(section)
          nextReference = await nextOrPreviousChapter(books, section.bookId, section.chapter, 'next', resolveChapterNumbers)
        }

        if (cancelled) return

        setSections(builtSections)
      } catch (loadError) {
        if (!cancelled && (isAccessDeniedError(loadError) || isPassageNotFoundError(loadError))) {
          const recovered = await recoverAccessibleSection(firstReference, resolvedVersionId)
          if (recovered) return
        }
        if (!cancelled) {
          const fallbackBook = localFallbackBooks[0]
          if (fallbackBook) {
            const fallbackChapter = Number(fallbackBook.chapters?.[0]?.id ?? fallbackBook.chapters?.[0]?.title ?? 1)
            if (
              Number.isFinite(fallbackChapter) &&
              fallbackChapter > 0 &&
              (firstReference.bookId !== fallbackBook.id || firstReference.chapter !== fallbackChapter)
            ) {
              setVersionId(LOCAL_KJV_VERSION_ID)
              setBookId(fallbackBook.id)
              setChapter(fallbackChapter)
              return
            }
          }
        }
        throw loadError
      } finally {
        loadingMoreRef.current = false
        setIsLoadingSections(false)
      }
    }

    void loadBufferedSections().catch((loadError) => {
      if (cancelled) return
      setLocalError(formatPassageError(loadError))
      loadingMoreRef.current = false
      setIsLoadingSections(false)
    })

    return () => {
      cancelled = true
    }
  }, [bookId, chapter, books, loadSection, resolvedVersionId, resolveChapterNumbers, localFallbackBooks])

  useEffect(() => {
    if (!compareOpen || !resolvedVersionId || !currentIndexBook || compareVersionId === null) {
      setCompareSections([])
      return
    }

    let cancelled = false

    async function loadBufferedCompareSections() {
      compareLoadingMoreRef.current = true
      setIsLoadingSections(true)
      setLocalError('')
      setCompareError('')

      const builtSections: CompareSection[] = []
      const bufferSize = INITIAL_BUFFER_SIZE
      let nextReference: ReaderReference | undefined = { bookId: currentIndexBook.id, chapter: currentChapter }

      try {
        for (let index = 0; index < bufferSize && nextReference; index++) {
          const section = await loadCompareSection(nextReference)
          if (!section) break
          builtSections.push(section)
          nextReference = await nextOrPreviousChapter(books, section.bookId, section.chapter, 'next', resolveChapterNumbers)
        }

        if (cancelled) return

        setCompareSections(builtSections)
      } catch (loadError) {
        if (cancelled) return
        throw loadError
      } finally {
        compareLoadingMoreRef.current = false
        setIsLoadingSections(false)
      }
    }

    void loadBufferedCompareSections().catch((loadError) => {
      if (cancelled) return
      const message = formatPassageError(loadError)
      setCompareError(message)
      compareLoadingMoreRef.current = false
      setIsLoadingSections(false)
    })

    return () => {
      cancelled = true
    }
  }, [books, compareOpen, compareVersionId, currentChapter, currentIndexBook, loadCompareSection, resolvedVersionId, resolveChapterNumbers])

  useEffect(() => {
    const shell = passageShellRef.current
    if (!shell || !sections.length) return

    hasPrimedScrollRef.current = false
    let raf = 0

    const updateFocus = () => {
      const shellRect = shell.getBoundingClientRect()
      const focusLine = shellRect.top

      let focusedSection: ReaderSection | null = null
      let closestDistance = Number.POSITIVE_INFINITY

      for (const s of sections) {
        const element = sectionRefs.current.get(s.key)
        if (!element) continue

        const rect = element.getBoundingClientRect()
        if (rect.bottom < shellRect.top + 40 || rect.top > shellRect.bottom) continue

        const header = element.querySelector('.yv-reader-section-header') as HTMLElement | null
        const headerRect = header?.getBoundingClientRect()
        if (header && headerRect) {
          header.classList.toggle('stuck', headerRect.top <= shellRect.top + 1)
        }
        const headerTop = headerRect?.top ?? rect.top
        const distance = Math.abs(headerTop - focusLine)
        if (distance < closestDistance) {
          focusedSection = s
          closestDistance = distance
        }
      }

      const section = focusedSection ?? sections[0]
      if (!section) return

      setFocusedSectionKey(section.key)
      setFocusedPassage({ bookId: section.bookId, chapter: section.chapter })

      const sectionBook = books.find((book) => book.id === section.bookId)
      setFocusedVerseLabel(formatChapterMarker(sectionBook, section.chapter))

      const nearTop = shell.scrollTop <= SCROLL_LOAD_THRESHOLD
      const nearBottom = shell.scrollTop + shell.clientHeight >= shell.scrollHeight - SCROLL_LOAD_THRESHOLD

      if (!hasPrimedScrollRef.current) {
        hasPrimedScrollRef.current = true
        return
      }

      if (nearTop) {
        void prependPreviousSection()
      } else if (nearBottom) {
        void appendNextSection()
      }
    }

    const onScroll = () => {
      cancelAnimationFrame(raf)
      raf = window.requestAnimationFrame(updateFocus)
    }

    shell.addEventListener('scroll', onScroll, { passive: true })
    updateFocus()

    return () => {
      shell.removeEventListener('scroll', onScroll)
      cancelAnimationFrame(raf)
    }
  }, [appendNextSection, books, prependPreviousSection, sections])

  useEffect(() => {
    setUserPreference(userIdRef.current, READER_VERSION_KEY, String(versionId ?? ''))
  }, [versionId])

  useEffect(() => {
    if (compareVersionId === null) {
      removeUserPreference(userIdRef.current, READER_COMPARE_KEY)
      return
    }

    setUserPreference(userIdRef.current, READER_COMPARE_KEY, String(compareVersionId))
  }, [compareVersionId])

  useEffect(() => {
    setUserPreference(userIdRef.current, READER_BOOK_KEY, bookId)
  }, [bookId])

  useEffect(() => {
    setUserPreference(userIdRef.current, READER_CHAPTER_KEY, String(chapter))
  }, [chapter])

  useEffect(() => {
    setUserPreference(userIdRef.current, READER_INPUT_KEY, referenceInput)
  }, [referenceInput])

  useEffect(() => {
    setUserPreference(userIdRef.current, READER_NAV_WIDTH_KEY, String(navWidth))
  }, [navWidth])

  useEffect(() => {
    setUserPreference(userIdRef.current, READER_AUTOSCROLL_KEY, String(autoScrollEnabled))
  }, [autoScrollEnabled])

  useEffect(() => {
    setUserPreference(userIdRef.current, READER_COMPARE_OPEN_KEY, String(compareOpen))
  }, [compareOpen])

  useEffect(() => {
    setUserPreference(userIdRef.current, READER_RED_LETTER_KEY, String(redLetterEnabled))
  }, [redLetterEnabled])

  useEffect(() => {
    setUserPreference(userIdRef.current, READER_ENTITY_HIGHLIGHTS_KEY, String(entityHighlightsEnabled))
  }, [entityHighlightsEnabled])

  useEffect(() => {
    setUserPreference(userIdRef.current, READER_HOVER_HIGHLIGHT_KEY, String(hoverHighlightEnabled))
  }, [hoverHighlightEnabled])

  useEffect(() => {
    if (!selectedVerse || !books.length) return

    const selectedVerseId = selectedVerse.id
    if (readerSelectionSourceRef.current === 'reader') {
      readerSelectionSourceRef.current = null
      setReferenceInput(`${selectedVerse.bookName} ${selectedVerse.chapter}:${selectedVerse.verse}`)
      lastSelectedVerseIdRef.current = selectedVerseId
      return
    }

    if (lastSelectedVerseIdRef.current === selectedVerseId) return
    lastSelectedVerseIdRef.current = selectedVerseId

    const nextBook =
      books.find((book) => book.id === selectedVerse.book) || resolveBook(selectedVerse.bookName, books)
    if (!nextBook) return
    const isSameLocation = nextBook.id === bookId && selectedVerse.chapter === chapter

    if (!isSameLocation) {
      setBookAndChapter(nextBook.id, selectedVerse.chapter)
      if (readerView !== 'verse') {
        setReaderView('chapter')
      }
    }

    setReferenceInput(`${selectedVerse.bookName} ${selectedVerse.chapter}:${selectedVerse.verse}`)
    setTargetVerse({ bookId: nextBook.id, chapter: selectedVerse.chapter, verse: selectedVerse.verse })
  }, [bookId, books, chapter, compareOpen, readerView, selectedVerse, setBookAndChapter, setReaderView, setTargetVerse])

  const handleReaderVerseSelect = useCallback(
    (verseId: string) => {
      readerSelectionSourceRef.current = 'reader'
      onSelect(verseId)
    },
    [onSelect],
  )

  const handleToggleBookmark = handleSaveVerse

  useLayoutEffect(() => {
    if (!targetVerse) return

    if (compareOpen) {
      const compareSection = compareSections.find(
        (s) => s.bookId === targetVerse.bookId && s.chapter === targetVerse.chapter,
      )
      if (compareSection) {
        const panes = [compareCurrentPaneRef.current, compareComparePaneRef.current]
        const verse = String(targetVerse.verse)
        for (const pane of panes) {
          if (!pane) continue
          const target =
            readerView === 'html'
              ? findVerseTarget(pane, compareSection.key, verse)
              : findCompareTarget(pane, compareSection.key, verse)
          if (target) {
            pane.scrollTo({ top: getCompareScrollTop(pane, target), behavior: 'auto' })
          }
        }
        setTargetVerse(null)
        return
      }
    }

    const section = sections.find((s) => s.bookId === targetVerse.bookId && s.chapter === targetVerse.chapter)
    if (!section || section.key !== sections[0]?.key) return
    const shell = passageShellRef.current
    if (!shell) return
    const sectionEl =
      sectionRefs.current.get(section.key) ??
      (shell.querySelector(
        `.yv-reader-section[data-book-id="${CSS.escape(section.bookId)}"][data-chapter="${section.chapter}"]`,
      ) as HTMLElement | null)
    if (!sectionEl) return
    const verseEl =
      (sectionEl.querySelector(`[data-verse="${targetVerse.verse}"]`) as HTMLElement | null) ??
      (sectionEl.querySelector(`.yv-v[v="${targetVerse.verse}"]`) as HTMLElement | null)
    const header = sectionEl.querySelector('.yv-reader-section-header') as HTMLElement | null
    const headerHeight = header?.clientHeight ?? 48
    if (verseEl) {
      shell.style.scrollPaddingTop = `${headerHeight + 12}px`
      verseEl.scrollIntoView({ block: 'start', behavior: 'auto', inline: 'nearest' })
    } else {
      shell.style.scrollPaddingTop = ''
      sectionEl.scrollIntoView({ block: 'start', behavior: 'auto', inline: 'nearest' })
    }
    setTargetVerse(null)
  }, [compareOpen, compareSections, readerView, sections, targetVerse])

  const compareSelection = useMemo(() => {
    if (!compareOpen || !selectedId) return null

    const parts = selectedId.split('.')
    const verse = parts.pop() ?? ''
    const chapter = Number(parts.pop())
    const bookCode = parts.join('.')
    if (!verse || Number.isNaN(chapter)) return null

    const section = compareSections.find((entry) => (bookCodeById[entry.bookId] ?? entry.bookId) === bookCode && entry.chapter === chapter)
    if (!section) return null

    return {
      sectionKey: section.key,
      verse,
      key: `${section.key}:${verse}`,
    }
  }, [bookCodeById, compareOpen, compareSections, selectedId])

  useLayoutEffect(() => {
    const panes = [compareCurrentPaneRef.current, compareComparePaneRef.current]
    for (const pane of panes) {
      pane?.querySelectorAll('.yv-reader-passage-html .yv-v.selected').forEach((el) => el.classList.remove('selected'))
    }
    if (!compareOpen || !compareSelection) return

    for (const pane of panes) {
      if (!pane) continue
      const htmlVerse = pane.querySelector(
        `article[data-section="${CSS.escape(compareSelection.sectionKey)}"] .yv-v[v="${CSS.escape(compareSelection.verse)}"]`,
      )
      if (htmlVerse) htmlVerse.classList.add('selected')
    }
  }, [compareOpen, compareSelection, compareCurrentPaneRef, compareComparePaneRef])

  useLayoutEffect(() => {
    const panes = [compareCurrentPaneRef.current, compareComparePaneRef.current]
    for (const pane of panes) {
      pane?.querySelectorAll('.verse-hover').forEach((el) => el.classList.remove('verse-hover'))
    }
    if (!hoverHighlightEnabled || !compareOpen || !hoveredVerse) return

    const { section, verse } = hoveredVerse
    for (const pane of panes) {
      if (!pane) continue
      pane.querySelectorAll(`article[data-section="${CSS.escape(section)}"] .yv-v[v="${CSS.escape(verse)}"]`).forEach((el) => {
        el.classList.add('verse-hover')
        el.closest('p')?.classList.add('verse-hover')
      })
      pane.querySelectorAll(`article[data-section="${CSS.escape(section)}"][data-verse="${CSS.escape(verse)}"]`).forEach((el) => el.classList.add('verse-hover'))
    }
  }, [hoveredVerse, compareOpen, hoverHighlightEnabled, compareCurrentPaneRef, compareComparePaneRef])

  useLayoutEffect(() => {
    if (!compareOpen || !autoScrollEnabled) {
      compareSelectionScrollKeyRef.current = ''
      return
    }

    if (!compareSelection) return

    const { sectionKey, verse } = compareSelection

    const selectionKey = `${sectionKey}:${verse}`
    if (compareSelectionScrollKeyRef.current === selectionKey) return
    compareSelectionScrollKeyRef.current = selectionKey

    const panes = [compareCurrentPaneRef.current, compareComparePaneRef.current]
    for (const pane of panes) {
      if (!pane) continue
      const target = findCompareTarget(pane, sectionKey, verse)
      if (!target) continue

      const paneRect = pane.getBoundingClientRect()
      const targetRect = target.getBoundingClientRect()
      const alreadyInView = Math.abs((targetRect.top + targetRect.height / 2 - paneRect.top) - COMPARE_FOCUS_LINE) < 8
      if (!alreadyInView) {
        pane.scrollTo({ top: getCompareScrollTop(pane, target), behavior: 'auto' })
      }
    }
  }, [autoScrollEnabled, compareOpen, compareSelection, compareCurrentPaneRef, compareComparePaneRef])


  const navBook = useMemo(
    () => visibleBooks.find((book) => book.id === activeBookId) ?? visibleBooks[0] ?? currentIndexBook,
    [activeBookId, currentIndexBook, visibleBooks],
  )

  const chapterNavigationBookId = navigationReference?.bookId ?? currentIndexBook?.id ?? bookId
  const chapterNavigationChapter = navigationReference?.chapter ?? currentChapter

  const resolveAdjacentReference = useMemo(() => {
    if (!chapterNavigationBookId) return { previous: undefined, next: undefined }

    const currentBook = currentIndexBook ?? books.find((book) => book.id === chapterNavigationBookId)
    const currentNumbers = currentBook ? chapterNumbers(currentBook) : []
    const chapterIndex = currentNumbers.indexOf(chapterNavigationChapter)
    const bookIndex = books.findIndex((book) => book.id === chapterNavigationBookId)

    let previous: ReaderReference | undefined
    if (chapterIndex > 0 && currentBook) {
      previous = { bookId: currentBook.id, chapter: currentNumbers[chapterIndex - 1] }
    } else if (bookIndex > 0) {
      const previousBook = books[bookIndex - 1]
      const previousNumbers = chapterNumbersCacheRef.current.get(previousBook.id) ?? chapterNumbers(previousBook)
      const last = previousNumbers[previousNumbers.length - 1]
      if (last !== undefined) previous = { bookId: previousBook.id, chapter: last }
    }

    let next: ReaderReference | undefined
    if (chapterIndex >= 0 && chapterIndex < currentNumbers.length - 1 && currentBook) {
      next = { bookId: currentBook.id, chapter: currentNumbers[chapterIndex + 1] }
    } else if (bookIndex >= 0 && bookIndex < books.length - 1) {
      const nextBook = books[bookIndex + 1]
      next = { bookId: nextBook.id, chapter: 1 }
    }

    return { previous, next }
  }, [books, chapterNavigationBookId, chapterNavigationChapter, currentIndexBook])

  const goToReference = useCallback((reference: ReaderReference) => {
    setFocusedSectionKey('')
    setBookAndChapter(reference.bookId, reference.chapter)
    setTargetVerse({ bookId: reference.bookId, chapter: reference.chapter, verse: reference.verse ?? 1 })
    setReferenceInput(formatReference(reference.bookId, reference.chapter, reference.verse, reference.verseEnd))
    const bookCode = bookCodeById[reference.bookId] ?? reference.bookId
    const verseNum = reference.verse ?? 1
    const selectedVerseId = `${bookCode}.${reference.chapter}.${verseNum}`
    readerSelectionSourceRef.current = 'reader'
    onSelect(selectedVerseId)
  }, [bookCodeById, onSelect, setBookAndChapter, setFocusedSectionKey, setReferenceInput, setTargetVerse])

  const handleSelectBook = useCallback(
    (bookId: string) => goToReference({ bookId, chapter: 1 }),
    [goToReference],
  )
  const handleSelectChapter = useCallback(
    (bookId: string, chapterNumber: number) => goToReference({ bookId, chapter: chapterNumber }),
    [goToReference],
  )
  const handleSelectVerse = useCallback(
    (verseNumber: number) => {
      if (!activeBookId) return
      goToReference({ bookId: activeBookId, chapter: activeChapter, verse: verseNumber })
    },
    [activeBookId, activeChapter, goToReference],
  )

  const goAdjacentChapter = useCallback(
    async (direction: 'previous' | 'next') => {
      if (!chapterNavigationBookId || !currentIndexBook) return

      setIsLoadingSections(true)
      try {
        const adjacent = await nextOrPreviousChapter(
          books,
          chapterNavigationBookId,
          chapterNavigationChapter,
          direction,
          resolveChapterNumbers,
        )

        if (adjacent) {
          goToReference(adjacent)
        }
      } finally {
        setIsLoadingSections(false)
      }
    },
    [books, chapterNavigationBookId, chapterNavigationChapter, currentIndexBook, resolveChapterNumbers],
  )

  const onSubmitReference = () => {
    const resolved = parseReaderReference(referenceInput, books)
    if (!resolved) {
      setLocalError('Enter a reference like “John 3:16” or “JHN.3.16”.')
      return
    }
    setLocalError('')
    goToReference(resolved)
  }

  const previousReference = resolveAdjacentReference.previous
  const nextReference = resolveAdjacentReference.next

  const goPrevious = useCallback(() => {
    if (previousReference) goToReference(previousReference)
  }, [goToReference, previousReference])

  const goNext = useCallback(() => {
    if (nextReference) goToReference(nextReference)
  }, [goToReference, nextReference])

  const previousChapterBook = useMemo(
    () => previousReference ? books.find((book) => book.id === previousReference.bookId) : undefined,
    [books, previousReference],
  )

  const nextChapterBook = useMemo(
    () => nextReference ? books.find((book) => book.id === nextReference.bookId) : undefined,
    [books, nextReference],
  )

  const navigationBook = useMemo(
    () => (navigationReference ? books.find((book) => book.id === navigationReference.bookId) : undefined),
    [books, navigationReference],
  )

  const previousChapterDestination = formatChapterNavDestination(previousChapterBook, previousReference, 'No previous chapter')
  const nextChapterDestination = formatChapterNavDestination(nextChapterBook, nextReference, 'No next chapter')
  const currentChapterLabel = passageLabel
  const mobileCompareOpen = compareOpen && !isCompactMobile
  const readerToolButtonsDesktop = useMemo(
    () => (
      <ReaderToolButtons
        readerView={readerView}
        compareOpen={compareOpen}
        autoScrollEnabled={autoScrollEnabled}
        redLetterEnabled={redLetterEnabled}
        hoverHighlightEnabled={hoverHighlightEnabled}
        entityHighlightsEnabled={entityHighlightsEnabled}
        onSetReaderView={handleSetReaderView}
        onToggleCompare={handleToggleCompare}
        onToggleAutoScroll={handleToggleAutoScroll}
        onToggleRedLetter={handleToggleRedLetter}
        onToggleEntityHighlights={handleToggleEntityHighlights}
        onToggleHoverHighlight={handleToggleHoverHighlight}
        onOpenBookInfo={handleOpenBookInfo}
        bookInfoLabel={currentBookInfoLabel}
        bookInfoOpen={bookIntroOpen}
        chapterLabel={currentChapterLabel}
        splitLayout
        audioUrl={audioUrl}
        audioPlaying={audioPlaying}
        audioLoading={audioLoading}
        onToggleAudio={onToggleAudio}
      />
    ),
    [
      readerView,
      compareOpen,
      autoScrollEnabled,
      redLetterEnabled,
      hoverHighlightEnabled,
      entityHighlightsEnabled,
      currentBookInfoLabel,
      bookIntroOpen,
      currentChapterLabel,
      handleOpenBookInfo,
      handleSetReaderView,
      handleToggleCompare,
      handleToggleAutoScroll,
      handleToggleRedLetter,
      handleToggleEntityHighlights,
      handleToggleHoverHighlight,
      audioUrl,
      audioPlaying,
      audioLoading,
      onToggleAudio,
    ],
  )

  const compareCurrentPassageHtml = useMemo(() => {
    if (!compareCurrentPassage) return ''
    const ref = parsePassageId(compareCurrentPassage.id)
    return transformPassageForBrowser(
      compareCurrentPassage.content,
      ref?.bookId,
      ref?.chapter,
      tagPositionsByVerseId,
      bookNumberById,
      entityHighlightsEnabled,
      isLocalVersionId(resolvedVersionId),
    ).html
  }, [compareCurrentPassage, tagPositionsByVerseId, bookNumberById, entityHighlightsEnabled, resolvedVersionId])
  const compareCurrentVerses = useMemo(
    () => (compareCurrentPassageHtml ? extractVerseBlocks(compareCurrentPassageHtml) : []),
    [compareCurrentPassageHtml],
  )
  const comparePassageHtml = useMemo(() => {
    if (!comparePassage) return ''
    const ref = parsePassageId(comparePassage.id)
    return transformPassageForBrowser(
      comparePassage.content,
      ref?.bookId,
      ref?.chapter,
      tagPositionsByVerseId,
      bookNumberById,
      entityHighlightsEnabled,
      isLocalVersionId(compareSourceVersionId),
    ).html
  }, [comparePassage, tagPositionsByVerseId, bookNumberById, entityHighlightsEnabled, compareSourceVersionId])
  const comparePassageVerses = useMemo(
    () => (comparePassageHtml ? extractVerseBlocks(comparePassageHtml) : []),
    [comparePassageHtml],
  )
  const compareVerseRows = useMemo(() => {
    const rows: Array<{ verse: string; current?: VerseBlock; compare?: VerseBlock }> = []
    const compareMap = new Map(comparePassageVerses.map((verse) => [verse.verse, verse]))
    const currentMap = new Map(compareCurrentVerses.map((verse) => [verse.verse, verse]))
    const seen = new Set<string>()

    for (const verse of compareCurrentVerses) {
      rows.push({ verse: verse.verse, current: verse, compare: compareMap.get(verse.verse) })
      seen.add(verse.verse)
    }

    for (const verse of comparePassageVerses) {
      if (seen.has(verse.verse)) continue
      rows.push({ verse: verse.verse, current: currentMap.get(verse.verse), compare: verse })
    }

    return rows
  }, [compareCurrentVerses, comparePassageVerses])

  const handleComparePaneScroll = useCallback(
    (side: ComparePaneSide) => {
      const pane = side === 'current' ? compareCurrentPaneRef.current : compareComparePaneRef.current
      if (!pane || !compareOpen || !compareSections.length || compareLoadingMoreRef.current) return

      const nearTop = pane.scrollTop <= COMPARE_SCROLL_LOAD_THRESHOLD
      const nearBottom = pane.scrollTop + pane.clientHeight >= pane.scrollHeight - COMPARE_SCROLL_LOAD_THRESHOLD

      if (nearTop) {
        void prependPreviousCompareSection()
      } else if (nearBottom) {
        void appendNextCompareSection()
      }

      if (!autoScrollEnabled || isSyncingScrollRef.current) return
      isSyncingScrollRef.current = true

      const sync = findCompareVerseAtFocus(pane, readerView, COMPARE_FOCUS_LINE)
      if (sync) {
        const otherPane = side === 'current' ? compareComparePaneRef.current : compareCurrentPaneRef.current
        if (otherPane) {
          const target =
            readerView === 'html'
              ? findVerseTarget(otherPane, sync.section, sync.verse)
              : findCompareTarget(otherPane, sync.section, sync.verse)
          if (target) {
            otherPane.scrollTo({ top: getCompareScrollTop(otherPane, target), behavior: 'auto' })
          }
        }
      }

      window.setTimeout(() => { isSyncingScrollRef.current = false }, 80)
    },
    [appendNextCompareSection, autoScrollEnabled, compareOpen, compareSections.length, prependPreviousCompareSection, readerView],
  )

  const handleCurrentPaneScroll = useCallback(
    () => handleComparePaneScroll('current'),
    [handleComparePaneScroll],
  )
  const handleComparePaneScrollSide = useCallback(
    () => handleComparePaneScroll('compare'),
    [handleComparePaneScroll],
  )

  const handleComparePaneMouseOver = useCallback(
    (event: ReactMouseEvent<HTMLElement>) => {
      if (!hoverHighlightEnabled) return
      const target = event.target as HTMLElement
      const directVerseEl = target.closest('.yv-v[v]') as HTMLElement | null
      const verseFromP = target.closest('p')?.querySelector('.yv-v[v]') as HTMLElement | null
      const verseEl = directVerseEl ?? verseFromP
      if (verseEl) {
        const section = verseEl.closest('article[data-section]')?.getAttribute('data-section') ?? ''
        const verse = verseEl.getAttribute('v') ?? ''
        if (section && verse) setHoveredVerse({ section, verse })
        return
      }
      const cardEl = target.closest('article[data-verse]') as HTMLElement | null
      if (cardEl) {
        const section = cardEl.getAttribute('data-section') ?? ''
        const verse = cardEl.getAttribute('data-verse') ?? ''
        if (section && verse) setHoveredVerse({ section, verse })
      }
    },
    [hoverHighlightEnabled, setHoveredVerse],
  )

  const handleComparePaneMouseLeave = useCallback(() => {
    if (!hoverHighlightEnabled) return
    setHoveredVerse(null)
  }, [hoverHighlightEnabled, setHoveredVerse])

  const handleCompareVerseClick = useCallback(
    (activeKey: string) => {
      const parsed = splitVerseKey(activeKey)
      if (!parsed) return
      const { section, verse } = parsed

      const chapterParts = section.split('.')
      const rawBookId = chapterParts[0]
      const chapter = chapterParts[1]
      if (rawBookId && chapter) {
        readerSelectionSourceRef.current = 'reader'
        const bookCode = bookCodeById[rawBookId] ?? rawBookId
        onSelect(`${bookCode}.${chapter}.${verse}`)
        setReferenceInput(`${bookCode} ${chapter}:${verse}`)
      }
    },
    [bookCodeById, onSelect],
  )

  const renderComparePaneContent = useCallback(
    (side: ComparePaneSide): ReactNode => {
      const isCurrent = side === 'current'
      const isFlow = readerView === 'verse'
      const selectedCompareVersion = catalogVersions.find((entry) => entry.id === compareVersionId)
      const compareUnavailableNotice = (
        <div className="yv-reader-compare-fallback-notice">
          {selectedCompareVersion?.title ?? 'This version'} is not available for this passage.
        </div>
      )

      if (readerView === 'html') {
        if (!compareSections.length) {
          return <div className="empty yv-reader-compare-empty">Select a comparison version to see the passage side-by-side.</div>
        }

        return (
          <>
            {compareSections.map((section) => (
              <article
                key={`${side}-${section.key}`}
                className="yv-reader-passage yv-reader-passage-html yv-reader-section yv-reader-compare-section"
                data-section={section.key}
              >
                <div className="yv-reader-section-header">
                  <div>
                    <strong>{section.reference}</strong>
                    <span>{isCurrent ? section.currentPassage.id : section.comparePassage?.id ?? ''}</span>
                    {!isCurrent && section.compareUnavailable && compareUnavailableNotice}
                  </div>
                </div>
                {(isCurrent || !section.compareUnavailable) && (
                  <div dangerouslySetInnerHTML={{ __html: isCurrent ? section.currentHtml : section.compareHtml }} />
                )}
              </article>
            ))}
          </>
        )
      }

      return (
        <>
          {compareSections.map((section) => {
            const sectionVerses = isCurrent ? section.currentVerses : section.compareVerses
            if (!isCurrent && section.compareUnavailable) {
              return (
                <div
                  key={`${side}-${section.key}`}
                  className="yv-reader-section yv-reader-compare-section"
                  data-section={section.key}
                >
                  <div className="yv-reader-section-header">
                    <div>
                      <strong>{section.reference}</strong>
                      {compareUnavailableNotice}
                    </div>
                  </div>
                </div>
              )
            }
            if (!sectionVerses.length) return null
            return (
              <div
                key={`${side}-${section.key}`}
                className="yv-reader-section yv-reader-compare-section"
                data-section={section.key}
              >
                <div className="yv-reader-section-header">
                  <div>
                    <strong>{section.reference}</strong>
                    <span>{isCurrent ? section.currentPassage.id : section.comparePassage?.id ?? ''}</span>
                  </div>
                </div>
                <div className={isFlow ? 'yv-reader-verse-flow yv-reader-compare-verse-flow' : 'yv-reader-compare-verse-stack'}>
                  {sectionVerses.map((verse) => {
                    const activeKey = `${section.key}:${verse.verse}`
                    const isSelected = compareSelection?.key === activeKey
                    const articleClass = isFlow
                      ? `yv-reader-verse-flow-item yv-reader-compare-verse-flow-item ${isSelected ? 'selected' : ''}`
                      : `yv-reader-compare-verse-card ${isSelected ? 'selected' : ''}`
                    const verseId = `${bookCodeById[section.bookId] ?? section.bookId}.${section.chapter}.${verse.verse}`
                    const yvPassageId = `${section.bookId}.${section.chapter}.${verse.verse}`
                    const isSaved = bookmarkedIds.has(verseId)

                    return (
                      <article
                        key={`${side}-${activeKey}`}
                        className={articleClass}
                        data-section={section.key}
                        data-verse={verse.verse}
                        onClick={() => handleCompareVerseClick(activeKey)}
                      >
                        <div className="yv-reader-compare-verse-number">{verse.verse}</div>
                        <div
                          className={isFlow ? 'yv-reader-verse-flow-content yv-reader-compare-verse-content' : 'yv-reader-compare-verse-content'}
                          dangerouslySetInnerHTML={{ __html: verse.strippedHtml }}
                        />
                        {isSelected && (
                          <button
                            type="button"
                            className="yv-reader-verse-bookmark"
                            title={isSaved ? 'Unsave' : 'Save'}
                            aria-label={isSaved ? 'Unsave verse' : 'Save verse'}
                            onClick={(e) => {
                              e.stopPropagation()
                              void handleSaveVerse(verseId, yvPassageId)
                            }}
                          >
                            <Highlighter size={14} fill={isSaved ? 'currentColor' : 'none'} />
                          </button>
                        )}
                      </article>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </>
      )
    },
    [compareSections, compareSelection, handleCompareVerseClick, readerView, bookmarkedIds, handleSaveVerse, catalogVersions, compareVersionId],
  )

  const compareGrid = useMemo(
    () => (
      <div className="yv-reader-compare-grid" aria-label="Split-screen Bible comparison">
        <ComparePaneFrame
          paneRef={compareCurrentPaneRef}
          onScroll={handleCurrentPaneScroll}
          onMouseOver={handleComparePaneMouseOver}
          onMouseLeave={handleComparePaneMouseLeave}
        >
          {renderComparePaneContent('current')}
        </ComparePaneFrame>
        <ComparePaneFrame
          paneRef={compareComparePaneRef}
          onScroll={handleComparePaneScrollSide}
          onMouseOver={handleComparePaneMouseOver}
          onMouseLeave={handleComparePaneMouseLeave}
        >
          {renderComparePaneContent('compare')}
        </ComparePaneFrame>
      </div>
    ),
    [
      renderComparePaneContent,
      handleCurrentPaneScroll,
      handleComparePaneScrollSide,
      handleComparePaneMouseOver,
      handleComparePaneMouseLeave,
    ],
  )

  const renderVersionMenu = useCallback(
    (
      ariaLabel: string,
      activeVersionId: number | null,
      onSelect: (id: number) => void,
      versions: readonly VersionMenuEntry[],
      searchVersions: readonly VersionMenuEntry[] = versions,
      menuClassName = '',
      searchQuery = '',
      onSearchQueryChange?: (value: string) => void,
    ) => {
      const trimmedQuery = searchQuery.trim().toLowerCase()
      const filteredVersions = trimmedQuery
        ? searchVersions.filter((entry) => {
            const haystack = [
              entry.title,
              entry.localized_title,
              entry.abbreviation,
              entry.localized_abbreviation,
              entry.language_tag,
            ]
              .filter(Boolean)
              .join(' ')
              .toLowerCase()
            return haystack.includes(trimmedQuery)
          })
        : versions
      const featuredVersions = [LOCAL_KJV_VERSION, LOCAL_NLT_VERSION]
      const featuredIds = new Set(featuredVersions.map((entry) => entry.id))
      const pinnedVersions = filteredVersions.filter((entry) => pinnedVersionIdSet.has(entry.id) && !featuredIds.has(entry.id))
      const visibleVersions = filteredVersions.filter((entry) => !featuredIds.has(entry.id) && !pinnedVersionIdSet.has(entry.id))

      const renderEntry = (entry: VersionMenuEntry, badge?: string) => {
        const entryLabel = formatVersionLabel(entry)
        const isActive = entry.id === activeVersionId
        const isPinned = pinnedVersionIdSet.has(entry.id)
        const canTogglePin = !isLocalFallbackVersion(entry)
        const pinLabel = isPinned ? `Unpin ${entryLabel.title}` : `Pin ${entryLabel.title}`
        return (
          <div key={entry.id} className={`yv-reader-version-menu-item ${isActive ? 'active' : ''}`}>
            <button
              type="button"
              className="yv-reader-version-menu-item-primary"
              onClick={(event) => {
                event.stopPropagation()
                onSelect(entry.id)
              }}
            >
              <span className="yv-reader-version-menu-item-main">
                <strong>{entryLabel.title}</strong>
                <span>{badge || entryLabel.subtitle || 'Bible translation'}</span>
              </span>
            </button>
            {canTogglePin ? (
              <button
                type="button"
                className="yv-reader-version-menu-item-action"
                title={pinLabel}
                aria-label={pinLabel}
                onClick={(event) => {
                  event.stopPropagation()
                  handleTogglePinVersion(entry)
                }}
              >
                {isPinned ? <PinOff size={14} /> : <Pin size={14} />}
              </button>
            ) : null}
          </div>
        )
      }

      return (
        <div className={`yv-reader-selector-menu ${menuClassName}`.trim()} role="menu" aria-label={ariaLabel}>
          {onSearchQueryChange && (
            <input
              type="text"
              className="yv-reader-version-menu-search"
              placeholder="Search versions or languages…"
              value={searchQuery}
              onClick={(event) => event.stopPropagation()}
              onChange={(event) => onSearchQueryChange(event.target.value)}
              autoFocus
            />
          )}
          {featuredVersions.length > 0 && (
            <>
              <div className="yv-reader-version-menu-empty" style={{ marginBottom: '0.35rem' }}>
                Featured version
              </div>
              {featuredVersions.map((entry) =>
                renderEntry(
                  entry,
                  entry.id === LOCAL_KJV_VERSION_ID
                    ? 'Public-domain KJV fallback'
                    : entry.id === LOCAL_NLT_VERSION_ID
                      ? 'Via Tyndale NLT.TO API'
                      : undefined,
                ),
              )}
            </>
          )}
          {pinnedVersions.length > 0 && (
            <>
              <div className="yv-reader-version-menu-empty" style={{ marginBottom: '0.35rem', marginTop: featuredVersions.length > 0 ? '0.5rem' : 0 }}>
                Pinned versions
              </div>
              {pinnedVersions.map((entry) => renderEntry(entry))}
            </>
          )}
          {visibleVersions.map((entry) => renderEntry(entry))}
        </div>
      )
    },
    [handleTogglePinVersion, pinnedVersionIdSet],
  )

  const startResize = useCallback(
    (event: ReactPointerEvent<HTMLButtonElement>) => {
      const body = readerBodyRef.current
      if (!body) return

      event.preventDefault()
      const { width } = body.getBoundingClientRect()
      const maxWidth = Math.min(MAX_NAV_WIDTH, Math.max(MIN_NAV_WIDTH, Math.floor(width * 0.45)))
      const startX = event.clientX
      const startWidth = navWidth

      const updateWidth = (clientX: number) => {
        const nextWidth = Math.min(Math.max(startWidth + (clientX - startX), MIN_NAV_WIDTH), maxWidth)
        setNavWidth(nextWidth)
      }

      const onPointerMove = (moveEvent: PointerEvent) => {
        updateWidth(moveEvent.clientX)
      }

      const onPointerUp = () => {
        window.removeEventListener('pointermove', onPointerMove)
        window.removeEventListener('pointerup', onPointerUp)
      }

      window.addEventListener('pointermove', onPointerMove)
      window.addEventListener('pointerup', onPointerUp)
    },
    [navWidth],
  )

  const readerStyle = useMemo(
    () => ({ '--yv-nav-width': `${navWidth}px` }) as CSSProperties,
    [navWidth],
  )

  const initialLoading = versionsLoading || (resolvedVersionId !== null && (versionLoading || booksLoading) && !version)

  if (initialLoading) {
    return (
      <div className="panel empty" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
        <Loader2 className="spin" size={20} /> Loading YouVersion reader...
      </div>
    )
  }

  if (readerError && !version) {
    return <div className="panel empty yv-reader-error">{readerError}</div>
  }

  return (
    <div className="panel yv-reader-panel">
      <div className="yv-reader" style={readerStyle}>
        {(catalogError || readerError) && (
          <div className="yv-reader-error-banner" role="alert" style={{ padding: '0.75rem 1rem', background: 'var(--danger-bg, rgba(239,68,68,0.15))', color: 'var(--danger, #ef4444)', textAlign: 'center', fontSize: '0.9rem' }}>
            {catalogError && <div>{catalogError}</div>}
            {readerError && <div>{readerError}</div>}
            {isHighlightsPermissionError && (
              <button
                type="button"
                className="secondary"
                style={{ marginTop: '0.5rem' }}
                onClick={() => void handleYouVersionSignIn()}
              >
                Grant highlights access
              </button>
            )}
          </div>
        )}
        <div className="yv-reader-body" ref={readerBodyRef}>
          <aside className="yv-reader-nav">
            {mobileCompareOpen ? (
              <div className="yv-reader-compare-nav-header">
                <ReaderVersionSelector
                  wrapperClassName="yv-reader-selector-shell yv-reader-nav-header-selector"
                  selectorClassName="yv-reader-selector yv-reader-reader-selector yv-reader-nav-header-selector-inner"
                  buttonClassName="yv-reader-version-button yv-reader-nav-header-version-button"
                  menuOpen={versionMenuOpen}
                  onToggleMenu={handleToggleVersionMenu}
                  title={currentVersionTitle}
                  subtitle={currentVersionSubtitle}
                  chevronSize={14}
                  menuRef={versionMenuRef}
                  menu={renderVersionMenu('Bible version selection', resolvedVersionId, handleSelectCurrentVersion, browseVersions, catalogVersions, '', versionSearchQuery, setVersionSearchQuery)}
                />
                <ReaderVersionSelector
                  wrapperClassName="yv-reader-selector-shell yv-reader-nav-header-selector"
                  selectorClassName="yv-reader-selector yv-reader-reader-selector yv-reader-nav-header-selector-inner"
                  buttonClassName="yv-reader-version-button yv-reader-nav-header-version-button"
                  menuOpen={compareVersionMenuOpen}
                  onToggleMenu={handleToggleCompareVersionMenu}
                  title={compareVersionTitle}
                  subtitle={compareVersionSubtitle}
                  chevronSize={14}
                  menuRef={compareVersionMenuRef}
                  menu={renderVersionMenu('Compare Bible version selection', compareVersionId, handleSelectCompareVersion, compareBrowseVersions, catalogVersions, '', compareVersionSearchQuery, setCompareVersionSearchQuery)}
                />
              </div>
            ) : (
              <ReaderVersionSelector
                wrapperClassName="yv-reader-selector-shell yv-reader-nav-header-selector"
                selectorClassName="yv-reader-selector yv-reader-reader-selector yv-reader-nav-header-selector-inner"
                buttonClassName="yv-reader-version-button yv-reader-nav-header-version-button"
                menuOpen={versionMenuOpen}
                onToggleMenu={handleToggleVersionMenu}
                title={currentVersionTitle}
                subtitle={currentVersionSubtitle}
                chevronSize={14}
                menuRef={versionMenuRef}
                menu={renderVersionMenu('Bible version selection', resolvedVersionId, handleSelectCurrentVersion, browseVersions, catalogVersions, '', versionSearchQuery, setVersionSearchQuery)}
              />
            )}

            {(bookIntroOpen || bookIntroLoading || Boolean(bookIntroError) || Boolean(bookIntroHtml)) && (
              <div className="yv-reader-book-intro" role="region" aria-label="Book introduction">
                <div className="yv-reader-book-intro-header">
                  <div className="yv-reader-book-intro-title-wrap">
                    <span>Book intro</span>
                    <strong>{currentBookMetadata?.intro?.title || currentBookMetadata?.full_title || currentBookMetadata?.title || 'YouVersion book'}</strong>
                  </div>
                  <div className="yv-reader-book-intro-actions">
                    {currentBookInfoUrl && (
                      <button type="button" className="secondary" onClick={handleOpenBookSource}>
                        Source
                      </button>
                    )}
                    <button type="button" className="secondary" onClick={() => setBookIntroOpen(false)}>
                      Close
                    </button>
                  </div>
                </div>
                {bookIntroLoading ? (
                  <div className="empty yv-reader-book-intro-empty">Loading book intro…</div>
                ) : bookIntroError ? (
                  <div className="yv-reader-error" style={{ margin: 0 }}>
                    {bookIntroError}
                  </div>
                ) : (
                  <div className="yv-reader-book-intro-content" dangerouslySetInnerHTML={{ __html: bookIntroHtml }} />
                )}
              </div>
            )}

            <div className="yv-reader-nav-stack">
              <ReaderBookList
                visibleBooks={visibleBooks}
                activeBookId={activeBookId}
                onSelectBook={handleSelectBook}
                isLoading={!isLocalFallbackSelected && booksLoading}
                error={booksError?.message}
              />

              <ReaderChapterList
                navBook={navBook}
                activeChapter={activeChapter}
                onSelectChapter={handleSelectChapter}
              />
            </div>

          </aside>

          <button
            type="button"
            className="yv-reader-resize-handle"
            aria-label="Resize book list"
            title="Resize book list"
            onPointerDown={startResize}
          >
            <GripVertical size={16} />
          </button>

          <section className={`yv-reader-reader ${redLetterEnabled ? 'red-letter' : ''} ${hoverHighlightEnabled ? 'hover-highlight' : ''}`}>

            <div className={`yv-reader-mobile-chrome ${mobileChromeVisible ? 'visible' : ''}`}>
              <MobileReaderNav
                bookOptions={mobileBookOptions}
                chapterOptions={mobileChapterOptions}
                verseOptions={mobileVerseOptions}
                versionOptions={mobileVersionOptions}
                compareVersionOptions={mobileCompareOpen ? mobileCompareVersionOptions : undefined}
                activeBookId={activeBookId}
                activeChapter={activeChapter}
                activeVerse={activeVerseNumber}
                activeVersionId={resolvedVersionId}
                activeCompareVersionId={compareVersionId}
                languageOptions={mobileLanguageOptions}
                activeBrowseLanguage={versionBrowseLanguagePreference}
                audioAvailable={Boolean(audioUrl)}
                audioLoading={audioLoading}
                audioPlaying={audioPlaying}
                compareOpen={mobileCompareOpen}
                onSelectBook={handleSelectBook}
                onSelectChapter={(chapter) => handleSelectChapter(activeBookId, chapter)}
                onSelectVerse={handleSelectVerse}
                onSelectVersion={handleSelectCurrentVersion}
                onSelectCompareVersion={handleSelectCompareVersion}
                onSelectBrowseLanguage={handleSelectBrowseLanguage}
                onToggleAudio={onToggleAudio}
              />

              <div className="yv-reader-footer yv-reader-mobile-footer">
                <div className="yv-reader-footer-nav yv-reader-mobile-footer-nav" aria-label="Chapter navigation">
                  <ChapterNavButton
                    direction="previous"
                    label={t('previousChapter')}
                    destination={previousChapterDestination}
                    disabled={!previousReference || isLoadingSections}
                    onClick={goPrevious}
                    compact
                  />
                  <div className="yv-reader-mobile-tools" aria-label="Current chapter">
                    {readerToolButtons}
                  </div>
                  <ChapterNavButton
                    direction="next"
                    label={t('nextChapter')}
                    destination={nextChapterDestination}
                    disabled={!nextReference || isLoadingSections}
                    onClick={goNext}
                    compact
                  />
                </div>
              </div>
            </div>

            {mobileCompareOpen ? (
              <div className="yv-reader-compare-shell">
                {compareError ? (
                  <div className="empty yv-reader-error yv-reader-compare-empty">
                    {compareError}
                    {compareError === ACCESS_DENIED_MESSAGE && !auth.isAuthenticated && (
                      <button
                        type="button"
                        className="secondary"
                        style={{ marginTop: '0.75rem' }}
                        onClick={() => void handleYouVersionSignIn()}
                      >
                        Sign in with YouVersion
                      </button>
                    )}
                  </div>
                ) : !compareVerseRows.length ? (
                  <div className="empty yv-reader-compare-empty">Select a comparison version to see the passage side-by-side.</div>
                ) : (
                  <>
                    {compareGrid}
                  </>
                )}
              </div>
            ) : (
              <ReaderPassageStack
                passageShellRef={passageShellRef}
                sectionRefs={sectionRefs}
                sections={sections}
                readerView={readerView}
                focusedSectionKey={focusedSectionKey}
                isLoadingSections={isLoadingSections}
                selectedId={selectedId}
                onSelectVerse={handleReaderVerseSelect}
                onToggleBookmark={handleToggleBookmark}
                bookmarkedVerseIds={bookmarkedIds}
                bookCodeById={bookCodeById}
              />
            )}

            {isNltVersion(selectedVersion) && (
              <div className="yv-reader-attribution" style={{ padding: '0.5rem 1rem', fontSize: '0.75rem', color: 'var(--text-muted)', textAlign: 'center' }}>
                {NLT_ATTRIBUTION}
              </div>
            )}

            <div className="yv-reader-footer yv-reader-desktop-footer" aria-label="Chapter navigation">
              <div className="yv-reader-footer-nav" aria-label="Chapter navigation">
                <ChapterNavButton
                  direction="previous"
                  label={t('previousChapter')}
                  destination={previousChapterDestination}
                  disabled={!previousReference || isLoadingSections}
                  onClick={goPrevious}
                />
                {readerToolButtonsDesktop}
                <ChapterNavButton
                  direction="next"
                  label={t('nextChapter')}
                  destination={nextChapterDestination}
                  disabled={!nextReference || isLoadingSections}
                  onClick={goNext}
                />
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  )
}
