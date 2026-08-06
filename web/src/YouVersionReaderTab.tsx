import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react'
import { BookOpen, ChevronLeft, ChevronRight, GripVertical, Loader2 } from 'lucide-react'
import { findVerse, getAllVerses } from './bible'
import { useBibleClient, useBooks, useChapters, useHighlights, useVersion, useVersions, useYVAuth } from '@youversion/platform-react-hooks'
import { transformBibleHtml, type BiblePassage } from '@youversion/platform-core'
import { getTestamentForBook, type Testament } from './bookTaxonomy'
import { type YouVersionBook } from './youversion'
import { useI18n } from './i18n'
import { getYouVersionRedirectUrl } from './youversionRedirect'
import ComparePaneFrame from './ComparePaneFrame'
import ReaderBookList from './ReaderBookList'
import ReaderChapterList from './ReaderChapterList'
import ReaderPassageStack from './ReaderPassageStack'
import ReaderToolButtons from './ReaderToolButtons'
import ReaderVersionSelector from './ReaderVersionSelector'
import type { ReaderView } from './types'

const READER_VERSION_KEY = 'bible-study-yv-version'
const READER_COMPARE_KEY = 'bible-study-yv-compare'
const READER_BOOK_KEY = 'bible-study-yv-book'
const READER_CHAPTER_KEY = 'bible-study-yv-chapter'
const READER_VIEW_KEY = 'bible-study-yv-view'
const READER_INPUT_KEY = 'bible-study-yv-input'
const READER_COMMITTED_KEY = 'bible-study-yv-committed'
const READER_NAV_WIDTH_KEY = 'bible-study-yv-nav-width'
const DEFAULT_NAV_WIDTH = 300
const MIN_NAV_WIDTH = 220
const MAX_NAV_WIDTH = 460
const INITIAL_BUFFER_SIZE = 3
const SCROLL_LOAD_THRESHOLD = 280
const COMPARE_SCROLL_LOAD_THRESHOLD = 120
const COMPARE_FOCUS_LINE = 96

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
  comparePassage: BiblePassage
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

function transformPassageForBrowser(content: string): { html: string; text: string } {
  const html = transformBibleHtml(content, {
    parseHtml: (value) => new DOMParser().parseFromString(value, 'text/html'),
    serializeHtml: (doc) => doc.body.innerHTML,
  }).html
  const text = new DOMParser().parseFromString(html, 'text/html').body.textContent ?? ''
  return { html, text }
}

function extractVerseBlocks(content: string): VerseBlock[] {
  const doc = new DOMParser().parseFromString(content, 'text/html')
  const verses = Array.from(doc.querySelectorAll<HTMLElement>('.yv-v[v]'))

  return verses
    .map((verse) => {
      const html = verse.innerHTML.trim()
      return {
        verse: verse.getAttribute('v') ?? '',
        html,
        text: verse.textContent?.trim() ?? '',
        strippedHtml: stripVerseLabel(html),
      }
    })
    .filter((verse) => verse.verse)
}

function getCompareScrollTop(pane: HTMLElement, target: HTMLElement, focusLine = COMPARE_FOCUS_LINE): number {
  const paneRect = pane.getBoundingClientRect()
  const targetRect = target.getBoundingClientRect()
  const targetTop = pane.scrollTop + (targetRect.top - paneRect.top) + targetRect.height / 2 - focusLine
  const maxScrollTop = Math.max(0, pane.scrollHeight - pane.clientHeight)
  return Math.max(0, Math.min(maxScrollTop, targetTop))
}

function getCompareScrollTopByTop(pane: HTMLElement, target: HTMLElement, desiredTop: number): number {
  const paneRect = pane.getBoundingClientRect()
  const targetRect = target.getBoundingClientRect()
  const targetTop = pane.scrollTop + (targetRect.top - paneRect.top) - desiredTop
  const maxScrollTop = Math.max(0, pane.scrollHeight - pane.clientHeight)
  return Math.max(0, Math.min(maxScrollTop, targetTop))
}

function splitVerseKey(activeKey: string): { section: string; verse: string } | null {
  const idx = activeKey.lastIndexOf(':')
  if (idx <= 0) return null
  return { section: activeKey.slice(0, idx), verse: activeKey.slice(idx + 1) }
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

function stripVerseLabel(html: string): string {
  const doc = new DOMParser().parseFromString(`<div>${html}</div>`, 'text/html')
  const root = doc.body.firstElementChild
  if (!root) return html

  root.querySelectorAll('.yv-vlbl').forEach((node) => node.remove())
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

function formatVersionLabel(version: { title: string; localized_title?: string; abbreviation?: string; localized_abbreviation?: string; language_tag?: string } | undefined): { title: string; subtitle: string } {
  if (!version) {
    return { title: 'Choose a Bible version', subtitle: 'Open the menu to switch translations' }
  }

  return {
    title: version.localized_title || version.title,
    subtitle: version.localized_abbreviation || version.abbreviation || version.language_tag || '',
  }
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
}: {
  direction: 'previous' | 'next'
  label: string
  destination: string
  disabled?: boolean
  onClick: () => void
}) {
  const isPrevious = direction === 'previous'
  const MainIcon = isPrevious ? ChevronLeft : ChevronRight

  return (
    <button
      type="button"
      className={`yv-reader-chapter-nav-button ${isPrevious ? 'previous' : 'next'}`}
      onClick={onClick}
      disabled={disabled}
      aria-label={`${label}: ${destination}`}
    >
      <span className="yv-reader-chapter-nav-icon" aria-hidden="true">
        <MainIcon size={16} />
      </span>
      <span className="yv-reader-chapter-nav-copy">
        <small>{label}</small>
        <strong>{destination}</strong>
      </span>
      <span className="yv-reader-chapter-nav-chevron" aria-hidden="true">
        {isPrevious ? <ChevronLeft size={15} /> : <ChevronRight size={15} />}
      </span>
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
}: {
  selectedId: string | null
  onSelect: (id: string) => void
}) {
  const { t, language } = useI18n()
  const readerBodyRef = useRef<HTMLDivElement | null>(null)
  const versionMenuRef = useRef<HTMLDivElement | null>(null)
  const [localError, setLocalError] = useState('')
  const [versionId, setVersionId] = useState<number | null>(() => {
    const saved = Number(window.localStorage.getItem(READER_VERSION_KEY))
    return Number.isFinite(saved) && saved > 0 ? saved : null
  })
  const [bookId, setBookId] = useState(() => window.localStorage.getItem(READER_BOOK_KEY) ?? '')
  const [chapter, setChapter] = useState(() => {
    const saved = Number(window.localStorage.getItem(READER_CHAPTER_KEY))
    return Number.isFinite(saved) && saved > 0 ? saved : 1
  })
  const [readerView, setReaderView] = useState<ReaderView>(() => {
    const saved = window.localStorage.getItem(READER_VIEW_KEY) ?? window.localStorage.getItem('bible-study-yv-mode')
    if (saved === 'html' || saved === 'chapter' || saved === 'verse') return saved
    if (saved === 'verseFlow') return 'verse'
    if (saved === 'text') return 'chapter'
    return 'html'
  })
  const [testamentFilter, setTestamentFilter] = useState<TestamentFilter>('all')
  const [referenceInput, setReferenceInput] = useState(() => window.localStorage.getItem(READER_INPUT_KEY) ?? '')
  const [navWidth, setNavWidth] = useState<number>(() => {
    const saved = Number(window.localStorage.getItem(READER_NAV_WIDTH_KEY))
    return Number.isFinite(saved) && saved >= MIN_NAV_WIDTH ? saved : DEFAULT_NAV_WIDTH
  })
  const [versionMenuOpen, setVersionMenuOpen] = useState(false)
  const [compareOpen, setCompareOpen] = useState(false)
  const [compareVersionMenuOpen, setCompareVersionMenuOpen] = useState(false)
  const [compareVersionId, setCompareVersionId] = useState<number | null>(() => {
    const saved = Number(window.localStorage.getItem(READER_COMPARE_KEY))
    return Number.isFinite(saved) && saved > 0 ? saved : null
  })
  const [compareSections, setCompareSections] = useState<CompareSection[]>([])
  const compareCurrentPassage = useMemo(() => compareSections[0]?.currentPassage ?? null, [compareSections])
  const comparePassage = useMemo(() => compareSections[0]?.comparePassage ?? null, [compareSections])
  const [compareLoading, setCompareLoading] = useState(false)
  const [compareError, setCompareError] = useState('')
  const compareCurrentPaneRef = useRef<HTMLElement | null>(null)
  const compareComparePaneRef = useRef<HTMLElement | null>(null)
  const compareVersionMenuRef = useRef<HTMLDivElement | null>(null)
  const compareLoadingMoreRef = useRef(false)
  const compareScrollLockRef = useRef<ComparePaneSide | null>(null)
  const compareLastActiveKeyRef = useRef('')
  const compareSyncDisabledUntilRef = useRef<number>(0)
  const [compareActiveVerse, setCompareActiveVerse] = useState('')
  const [compareSelectedKey, setCompareSelectedKey] = useState('')
  const [compareScrollSync, setCompareScrollSync] = useState(true)

  useEffect(() => {
    if (!compareScrollSync) {
      compareScrollLockRef.current = null
    }
  }, [compareScrollSync])

  const bibleClient = useBibleClient()
  const { auth, signIn, signOut, processCallback, userInfo } = useYVAuth()
  const chapterNumbersCacheRef = useRef<Map<string, number[]>>(new Map())
  const sectionCacheRef = useRef<Map<string, ReaderSection>>(new Map())
  const passageShellRef = useRef<HTMLDivElement | null>(null)
  const sectionRefs = useRef<Map<string, HTMLElement | null>>(new Map())
  const loadingMoreRef = useRef(false)
  const hasPrimedScrollRef = useRef(false)
  const skipScrollToTopRef = useRef(false)
  const [sections, setSections] = useState<ReaderSection[]>([])
  const [focusedSectionKey, setFocusedSectionKey] = useState('')
  const [focusedVerseLabel, setFocusedVerseLabel] = useState('')
  const [isLoadingSections, setIsLoadingSections] = useState(false)
  const [targetVerse, setTargetVerse] = useState<{ bookId: string; chapter: number; verse: number } | null>(null)

  const versionLanguageRanges = language === 'es' ? 'es' : 'en'
  const { versions: versionCollection, loading: versionsLoading, error: versionsError } = useVersions(versionLanguageRanges)
  const availableVersions = versionCollection?.data ?? []

  useEffect(() => {
    if (!versionMenuOpen) return

    const onPointerDown = (event: PointerEvent) => {
      const menu = versionMenuRef.current
      if (!menu || menu.contains(event.target as Node)) return
      setVersionMenuOpen(false)
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setVersionMenuOpen(false)
    }

    window.addEventListener('pointerdown', onPointerDown)
    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('pointerdown', onPointerDown)
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [versionMenuOpen])

  useEffect(() => {
    if (!compareOpen) {
      setCompareVersionMenuOpen(false)
      return
    }

    if (compareVersionId === null) {
      setCompareVersionMenuOpen(true)
    }
  }, [compareOpen, compareVersionId])

  useEffect(() => {
    if (!compareVersionMenuOpen) return

    const menu = compareVersionMenuRef.current

    const onPointerDown = (event: PointerEvent) => {
      if (!menu || menu.contains(event.target as Node)) return
      setCompareVersionMenuOpen(false)
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setCompareVersionMenuOpen(false)
    }

    window.addEventListener('pointerdown', onPointerDown)
    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('pointerdown', onPointerDown)
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [compareVersionMenuOpen])

  useEffect(() => {
    if (!availableVersions.length) return
    setVersionId((current) => {
      if (current && availableVersions.some((entry) => entry.id === current)) return current
      return availableVersions[0].id
    })
  }, [availableVersions])

  const resolvedVersionId = versionId ?? availableVersions[0]?.id ?? null
  const selectedVersion = useMemo(
    () => availableVersions.find((entry) => entry.id === resolvedVersionId) ?? availableVersions[0],
    [availableVersions, resolvedVersionId],
  )
  const compareVersion = useMemo(
    () => availableVersions.find((entry) => entry.id === compareVersionId),
    [availableVersions, compareVersionId],
  )
  const { version, loading: versionLoading, error: versionError } = useVersion(resolvedVersionId ?? 1, {
    enabled: resolvedVersionId !== null,
  })
  const { books: booksCollection, loading: booksLoading, error: booksError } = useBooks(resolvedVersionId ?? 1, {
    enabled: resolvedVersionId !== null,
  })
  const books = booksCollection?.data ?? []
  const currentBook = useMemo(() => books.find((book) => book.id === bookId) ?? books[0], [books, bookId])
  const currentBookWithChapters = useMemo(
    () => (currentBook ? { ...currentBook, chapters: currentBook.chapters ?? [] } : undefined),
    [currentBook],
  )
  const { chapters: chaptersCollection, loading: chaptersLoading, error: chaptersError } = useChapters(
    resolvedVersionId ?? 1,
    currentBook?.id ?? '',
    {
      enabled: resolvedVersionId !== null && Boolean(currentBook?.id),
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
  const currentChapter = useMemo(() => clampChapter(currentIndexBook, chapter), [currentIndexBook, chapter])
  const parsedReference = useMemo(() => parseReaderReference(referenceInput, books), [referenceInput, books])
  const versionTitle = version?.localized_title || version?.title || 'Bible Reader'
  const versionSubtitle = version?.localized_abbreviation || version?.abbreviation || version?.language_tag || ''
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
  const compareVersionLabel = formatVersionLabel(compareVersion)
  const highlightsEnabled = auth.isAuthenticated && resolvedVersionId !== null && Boolean(currentReference)
  const {
    highlights,
    loading: highlightsLoading,
    error: highlightsError,
    refetch: refetchHighlights,
    createHighlight,
  } = useHighlights(
    {
      version_id: resolvedVersionId ?? 1,
      passage_id: currentReference || 'GEN.1',
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
    for (const verse of all) {
      if (!nameToCode.has(verse.bookName)) {
        nameToCode.set(verse.bookName, verse.book)
      }
    }
    return Object.fromEntries(
      books.map((book) => {
        const code = nameToCode.get(book.title) || (book.abbreviation ? nameToCode.get(book.abbreviation) : undefined) || book.id
        return [book.id, code]
      }),
    )
  }, [books, getAllVerses])
  const activeBookId = activeSection?.bookId ?? currentIndexBook?.id ?? ''
  const activeChapter = activeSection?.chapter ?? currentChapter
  const activeBook = useMemo(
    () => books.find((book) => book.id === activeBookId) ?? currentIndexBook,
    [activeBookId, books, currentIndexBook],
  )
  const focusedPassageTitle = activeBook ? `${getBookLabel(activeBook)} ${getChapterTitle(activeBook, activeChapter)}` : passageLabel
  const focusedReferenceLabel = focusedVerseLabel || activeSection?.reference || anchorReferenceKey
  const navigationReference = activeSection
    ? { bookId: activeSection.bookId, chapter: activeSection.chapter }
    : anchorReference
  const copyright = version?.copyright?.trim() ?? ''
  const readerError = localError || versionsError?.message || versionError?.message || booksError?.message || chaptersError?.message || ''
  const visibleBooks = useMemo(
    () => books.filter((book) => testamentFilter === 'all' || getTestamentForBook(book.id) === testamentFilter),
    [books, testamentFilter],
  )

  const highlightCount = highlights?.data.length ?? 0
  const signedInLabel = userInfo?.name || userInfo?.email || 'YouVersion user'
  const currentPassageLabel = currentReference || passageLabel
  const passageReferenceLabel = focusedReferenceLabel || currentPassageLabel
  const currentVersionTitle = currentVersionLabel.title || versionTitle || 'Choose a version'
  const currentVersionSubtitle = currentVersionLabel.subtitle || copyright || 'Select a version'
  const compareVersionTitle = compareVersionLabel.title || 'Choose a compare version'
  const compareVersionSubtitle = compareVersionLabel.subtitle || 'Select a version'
  const comparePassageLabel = compareCurrentPassage?.reference || currentPassageLabel
  const handleSetReaderView = useCallback((view: ReaderView) => {
    if (view !== readerView) {
      compareSyncDisabledUntilRef.current = Date.now() + 350
    }
    setReaderView(view)
  }, [readerView])
  const handleToggleCompare = useCallback(() => {
    setCompareOpen((current) => {
      const next = !current
      if (!next) setCompareVersionMenuOpen(false)
      return next
    })
  }, [])
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
  const readerToolButtons = useMemo(
    () => (
      <ReaderToolButtons
        readerView={readerView}
        compareOpen={compareOpen}
        selectedVerse={selectedVerse}
        onSetReaderView={handleSetReaderView}
        onToggleCompare={handleToggleCompare}
        onSelectVerse={onSelect}
      />
    ),
    [readerView, compareOpen, selectedVerse, handleSetReaderView, handleToggleCompare, onSelect],
  )

  useEffect(() => {
    if (compareVersionId === null) {
      window.localStorage.removeItem(READER_COMPARE_KEY)
      return
    }

    window.localStorage.setItem(READER_COMPARE_KEY, String(compareVersionId))
  }, [compareVersionId])

  useEffect(() => {
    if (!compareOpen || compareVersionId !== null || !availableVersions.length || resolvedVersionId === null) return
    const fallbackCompare = availableVersions.find((entry) => entry.id !== resolvedVersionId)
    if (fallbackCompare) {
      setCompareVersionId(fallbackCompare.id)
    }
  }, [availableVersions, compareOpen, compareVersionId, resolvedVersionId])

  useEffect(() => {
    if (!compareOpen || compareVersionId === null || resolvedVersionId === null) return
    if (compareVersionId !== resolvedVersionId) return

    const fallbackCompare = availableVersions.find((entry) => entry.id !== resolvedVersionId)
    if (fallbackCompare) {
      setCompareVersionId(fallbackCompare.id)
    }
  }, [availableVersions, compareOpen, compareVersionId, resolvedVersionId])

  useEffect(() => {
    const search = new URLSearchParams(window.location.search)
    if (!search.has('code') && !search.has('error') && !search.has('state')) return

    void processCallback().catch((error) => {
      setLocalError(error instanceof Error ? error.message : String(error))
    })
  }, [processCallback])

  const handleYouVersionSignIn = useCallback(async () => {
    await signIn({
      redirectUrl: getYouVersionRedirectUrl(),
      scopes: ['profile', 'email'],
      permissions: ['highlights'],
    })
  }, [signIn])

  const handleSyncCurrentPassage = useCallback(async () => {
    if (!resolvedVersionId || !currentReference) return

    setLocalError('')
    try {
      await createHighlight({
        version_id: resolvedVersionId,
        passage_id: currentReference,
        color: 'f4b400',
      })
      refetchHighlights()
    } catch (error) {
      setLocalError(error instanceof Error ? error.message : String(error))
    }
  }, [createHighlight, currentReference, refetchHighlights, resolvedVersionId])

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
    [bibleClient, resolvedVersionId],
  )

  const loadCompareSection = useCallback(
    async (reference: ReaderReference): Promise<CompareSection | null> => {
      if (resolvedVersionId === null || compareVersionId === null) return null

      const chapterReference = formatReference(reference.bookId, reference.chapter)
      const [currentPassage, comparePassage] = await Promise.all([
        bibleClient.getPassage(resolvedVersionId, chapterReference, 'html', true, true),
        bibleClient.getPassage(compareVersionId, chapterReference, 'html', true, true),
      ])

      const currentTransformed = transformPassageForBrowser(currentPassage.content)
      const compareTransformed = transformPassageForBrowser(comparePassage.content)

      return {
        key: chapterReference,
        bookId: reference.bookId,
        chapter: reference.chapter,
        reference: currentPassage.reference || comparePassage.reference || chapterReference,
        currentPassage,
        comparePassage,
        currentHtml: currentTransformed.html,
        compareHtml: compareTransformed.html,
        currentVerses: extractVerseBlocks(currentTransformed.html),
        compareVerses: extractVerseBlocks(compareTransformed.html),
      }
    },
    [bibleClient, compareVersionId, resolvedVersionId],
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
    window.localStorage.setItem(READER_VIEW_KEY, readerView)
  }, [readerView])

  useEffect(() => {
    if (!currentIndexBook) return
    const currentTestament = getTestamentForBook(currentIndexBook.id)
    if (!currentTestament) return
    if (testamentFilter === 'all') return
    if (currentTestament === testamentFilter) return
    setTestamentFilter(currentTestament)
  }, [currentIndexBook, testamentFilter])

  const loadSection = useCallback(
    async (reference: ReaderReference): Promise<ReaderSection | null> => {
      if (resolvedVersionId === null) return null

      const chapterReference = formatReference(reference.bookId, reference.chapter)
      const cacheKey = `${resolvedVersionId}:${chapterReference}`
      const cached = sectionCacheRef.current.get(cacheKey)
      if (cached) return cached

      const passage = await bibleClient.getPassage(resolvedVersionId, chapterReference, 'html', true, true)
      const transformed = transformPassageForBrowser(passage.content)

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
    [bibleClient, resolvedVersionId],
  )

  const setBookAndChapter = useCallback((nextBookId: string, nextChapter: number) => {
    setBookId(nextBookId)
    setChapter(nextChapter)
    const testament = getTestamentForBook(nextBookId)
    if (testament) setTestamentFilter(testament)
  }, [])

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
      setLocalError(loadError instanceof Error ? loadError.message : String(loadError))
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
      setLocalError(loadError instanceof Error ? loadError.message : String(loadError))
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
      setLocalError(loadError instanceof Error ? loadError.message : String(loadError))
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
      setLocalError(loadError instanceof Error ? loadError.message : String(loadError))
    } finally {
      compareLoadingMoreRef.current = false
      setCompareLoading(false)
    }
  }, [books, compareSections, compareVersionId, loadCompareSection, resolveChapterNumbers, resolvedVersionId])

  useEffect(() => {
    if (!resolvedVersionId || !currentIndexBook || !anchorReference) {
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

      const firstReference: ReaderReference = { bookId: currentIndexBook.id, chapter: currentChapter }
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
        setFocusedVerseLabel(formatChapterMarker(books.find((book) => book.id === firstSection.bookId), firstSection.chapter))
        window.localStorage.setItem(READER_COMMITTED_KEY, firstSection.reference)

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
      } finally {
        loadingMoreRef.current = false
        setIsLoadingSections(false)
      }
    }

    void loadBufferedSections().catch((loadError) => {
      if (cancelled) return
      setLocalError(loadError instanceof Error ? loadError.message : String(loadError))
      loadingMoreRef.current = false
      setIsLoadingSections(false)
    })

    return () => {
      cancelled = true
    }
  }, [anchorReference, books, currentChapter, currentIndexBook, loadSection, resolvedVersionId, resolveChapterNumbers])

  useEffect(() => {
    if (!compareOpen || !resolvedVersionId || !currentIndexBook || !anchorReference || compareVersionId === null) {
      setCompareSections([])
      return
    }

    let cancelled = false

    async function loadBufferedCompareSections() {
      compareLoadingMoreRef.current = true
      setIsLoadingSections(true)
      setLocalError('')

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
        compareLastActiveKeyRef.current = ''
        setCompareActiveVerse('')
        window.requestAnimationFrame(() => {
          const shell = compareCurrentPaneRef.current
          if (shell && shell.scrollTop !== 0) {
            compareScrollLockRef.current = 'current'
            shell.scrollTop = 0
          }
          window.requestAnimationFrame(() => {
            const compareShell = compareComparePaneRef.current
            if (compareShell && compareShell.scrollTop !== 0) {
              compareScrollLockRef.current = 'compare'
              compareShell.scrollTop = 0
            }
            window.requestAnimationFrame(() => {
              compareScrollLockRef.current = null
            })
          })
        })
      } finally {
        compareLoadingMoreRef.current = false
        setIsLoadingSections(false)
      }
    }

    void loadBufferedCompareSections().catch((loadError) => {
      if (cancelled) return
      setLocalError(loadError instanceof Error ? loadError.message : String(loadError))
      compareLoadingMoreRef.current = false
      setIsLoadingSections(false)
    })

    return () => {
      cancelled = true
    }
  }, [anchorReference, books, compareOpen, compareVersionId, currentChapter, currentIndexBook, loadCompareSection, resolvedVersionId, resolveChapterNumbers])

  useEffect(() => {
    const shell = passageShellRef.current
    if (!shell || !sections.length) return

    hasPrimedScrollRef.current = false
    let raf = 0

    const updateFocus = () => {
      const shellRect = shell.getBoundingClientRect()
      const focusLine = shellRect.top + 96

      let focusedSection: ReaderSection | null = null
      let closestDistance = Number.POSITIVE_INFINITY

      for (const section of sections) {
        const element = sectionRefs.current.get(section.key)
        if (!element) continue

        const rect = element.getBoundingClientRect()
        if (rect.bottom < shellRect.top + 40 || rect.top > shellRect.bottom) continue

        const distance = Math.abs(rect.top - focusLine)
        if (distance < closestDistance) {
          focusedSection = section
          closestDistance = distance
        }
      }

      const section = focusedSection ?? sections[0]
      if (!section) return

      setFocusedSectionKey(section.key)

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
    window.localStorage.setItem(READER_VERSION_KEY, String(versionId ?? ''))
  }, [versionId])

  useEffect(() => {
    if (compareVersionId === null) {
      window.localStorage.removeItem(READER_COMPARE_KEY)
      return
    }

    window.localStorage.setItem(READER_COMPARE_KEY, String(compareVersionId))
  }, [compareVersionId])

  useEffect(() => {
    window.localStorage.setItem(READER_BOOK_KEY, bookId)
  }, [bookId])

  useEffect(() => {
    window.localStorage.setItem(READER_CHAPTER_KEY, String(chapter))
  }, [chapter])

  useEffect(() => {
    window.localStorage.setItem(READER_INPUT_KEY, referenceInput)
  }, [referenceInput])

  useEffect(() => {
    window.localStorage.setItem(READER_NAV_WIDTH_KEY, String(navWidth))
  }, [navWidth])

  useEffect(() => {
    if (!selectedVerse || !books.length) return
    const nextBook =
      books.find((book) => book.id === selectedVerse.book) || resolveBook(selectedVerse.bookName, books)
    if (!nextBook) return
    skipScrollToTopRef.current = true
    setBookAndChapter(nextBook.id, selectedVerse.chapter)
    setReferenceInput(`${selectedVerse.bookName} ${selectedVerse.chapter}:${selectedVerse.verse}`)
    if (readerView !== 'verse') {
      setReaderView('chapter')
    }
    setTargetVerse({ bookId: nextBook.id, chapter: selectedVerse.chapter, verse: selectedVerse.verse })
  }, [books, selectedVerse, setBookAndChapter, setReaderView])

  useEffect(() => {
    if (!targetVerse) return
    const section = sections.find((s) => s.bookId === targetVerse.bookId && s.chapter === targetVerse.chapter)
    if (!section) return
    const shell = passageShellRef.current
    if (!shell) return
    const verseEl = shell.querySelector(`[data-verse="${targetVerse.verse}"]`) as HTMLElement | null
    if (!verseEl) return
    const shellRect = shell.getBoundingClientRect()
    const verseRect = verseEl.getBoundingClientRect()
    const alreadyInView = verseRect.top < shellRect.bottom && verseRect.bottom > shellRect.top
    if (!alreadyInView) {
      verseEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
    }
    setTargetVerse(null)
  }, [sections, targetVerse])

  useEffect(() => {
    const panes = [compareCurrentPaneRef.current, compareComparePaneRef.current]
    for (const pane of panes) {
      pane?.querySelectorAll('.yv-reader-passage-html .yv-v.selected').forEach((el) => el.classList.remove('selected'))
    }
    if (!compareOpen) return

    let sectionKey = ''
    let verse = ''
    if (compareSelectedKey) {
      const parsed = splitVerseKey(compareSelectedKey)
      if (parsed) {
        sectionKey = parsed.section
        verse = parsed.verse
      }
    } else if (selectedId) {
      const parts = selectedId.split('.')
      verse = parts.pop() ?? ''
      const chapter = Number(parts.pop())
      const bookCode = parts.join('.')
      if (!verse || Number.isNaN(chapter)) return
      const section = compareSections.find(
        (s) => (bookCodeById[s.bookId] ?? s.bookId) === bookCode && s.chapter === chapter,
      )
      if (section) sectionKey = section.key
    }
    if (!sectionKey || !verse) return

    for (const pane of panes) {
      if (!pane) continue
      const htmlVerse = pane.querySelector(
        `article[data-section="${CSS.escape(sectionKey)}"] .yv-v[v="${CSS.escape(verse)}"]`,
      )
      if (htmlVerse) htmlVerse.classList.add('selected')
    }
  }, [compareOpen, selectedId, compareSelectedKey, compareSections, bookCodeById, compareCurrentPaneRef, compareComparePaneRef])

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
    skipScrollToTopRef.current = false
    setFocusedSectionKey('')
    setBookAndChapter(reference.bookId, reference.chapter)
    setReferenceInput(formatReference(reference.bookId, reference.chapter, reference.verse, reference.verseEnd))
    window.requestAnimationFrame(() => {
      const shell = passageShellRef.current
      if (!shell) return
      shell.scrollTop = 0
    })
  }, [])

  const handleSelectBook = useCallback(
    (bookId: string, chapterNumber: number) => goToReference({ bookId, chapter: chapterNumber }),
    [goToReference],
  )
  const handleSelectChapter = useCallback(
    (bookId: string, chapterNumber: number) => goToReference({ bookId, chapter: chapterNumber }),
    [goToReference],
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
  const currentChapterLabel = formatChapterNavDestination(navigationBook, navigationReference, passageLabel)

  const compareCurrentPassageHtml = useMemo(
    () => (compareCurrentPassage ? transformPassageForBrowser(compareCurrentPassage.content).html : ''),
    [compareCurrentPassage],
  )
  const compareCurrentVerses = useMemo(
    () => (compareCurrentPassageHtml ? extractVerseBlocks(compareCurrentPassageHtml) : []),
    [compareCurrentPassageHtml],
  )
  const comparePassageHtml = useMemo(
    () => (comparePassage ? transformPassageForBrowser(comparePassage.content).html : ''),
    [comparePassage],
  )
  const comparePassageVerses = useMemo(
    () => (comparePassageHtml ? extractVerseBlocks(comparePassageHtml) : []),
    [comparePassageHtml],
  )
  const compareExtraSections = useMemo(() => compareSections.slice(1), [compareSections])
  const compareCurrentSectionKey = useMemo(() => compareSections[0]?.key ?? '', [compareSections])
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

  useEffect(() => {
    if (!compareOpen) {
      compareScrollLockRef.current = null
      setCompareActiveVerse('')
      setCompareSelectedKey('')
      return
    }

    const firstVerseNumber = compareVerseRows[0]?.verse ?? ''
    const firstKey = firstVerseNumber && compareCurrentSectionKey ? `${compareCurrentSectionKey}:${firstVerseNumber}` : ''
    compareLastActiveKeyRef.current = firstKey
    setCompareActiveVerse(firstKey)

    window.requestAnimationFrame(() => {
      const currentPane = compareCurrentPaneRef.current
      if (currentPane && currentPane.scrollTop !== 0) {
        compareScrollLockRef.current = 'current'
        currentPane.scrollTop = 0
      }
      window.requestAnimationFrame(() => {
        const comparePane = compareComparePaneRef.current
        if (comparePane && comparePane.scrollTop !== 0) {
          compareScrollLockRef.current = 'compare'
          comparePane.scrollTop = 0
        }
        window.requestAnimationFrame(() => {
          compareScrollLockRef.current = null
        })
      })
    })
  }, [compareOpen, compareCurrentSectionKey, compareVerseRows])

  const updateCompareActiveVerse = useCallback(
    (side: ComparePaneSide) => {
      if (compareScrollLockRef.current === side) return
      if (Date.now() < compareSyncDisabledUntilRef.current) return

      const pane = side === 'current' ? compareCurrentPaneRef.current : compareComparePaneRef.current
      const otherSide = side === 'current' ? 'compare' : 'current'
      const otherPane = otherSide === 'current' ? compareCurrentPaneRef.current : compareComparePaneRef.current
      if (!pane || !otherPane) return

      const paneRect = pane.getBoundingClientRect()
      const focusX = paneRect.left + paneRect.width / 2
      const focusY = paneRect.top + COMPARE_FOCUS_LINE
      const element = document.elementFromPoint(focusX, focusY)
      const card = element?.closest('[data-verse]') as HTMLElement | null

      let verseEl: HTMLElement | null = null
      if (!card) {
        const labelX = Math.min(paneRect.right - 4, paneRect.left + 24)
        for (let y = focusY; y >= paneRect.top; y -= 10) {
          const el = document.elementFromPoint(labelX, y)
          const v = el?.closest('.yv-v[v]') as HTMLElement | null
          if (v) {
            verseEl = v
            break
          }
        }
      }

      let syncTop: number | null = null
      let shouldSync = false

      const isInView = (el: HTMLElement, container: HTMLElement) => {
        const rect = el.getBoundingClientRect()
        const cRect = container.getBoundingClientRect()
        return rect.top >= cRect.top && rect.bottom <= cRect.bottom
      }

      if (card) {
        const section = card.dataset.section
        const verse = card.dataset.verse
        if (section && verse) {
          const activeKey = `${section}:${verse}`
          if (compareLastActiveKeyRef.current !== activeKey) {
            compareLastActiveKeyRef.current = activeKey
            setCompareActiveVerse(activeKey)
          }

          const target = findCompareTarget(otherPane, section, verse)
          if (target && !isInView(target, otherPane)) {
            const sourceOffset = card.getBoundingClientRect().top - paneRect.top
            syncTop = getCompareScrollTopByTop(otherPane, target, sourceOffset)
            shouldSync = true
          }
        }
      } else if (verseEl) {
        const section = verseEl.closest('article[data-section]')?.getAttribute('data-section')
        const verse = verseEl.getAttribute('v')
        if (section && verse) {
          const activeKey = `${section}:${verse}`
          if (compareLastActiveKeyRef.current !== activeKey) {
            compareLastActiveKeyRef.current = activeKey
            setCompareActiveVerse(activeKey)
          }

          const target = findVerseTarget(otherPane, section, verse)
          if (target && !isInView(target, otherPane)) {
            const sourceOffset = verseEl.getBoundingClientRect().top - paneRect.top
            syncTop = getCompareScrollTopByTop(otherPane, target, sourceOffset)
            shouldSync = true
          }
        }
      } else {
        const sourceRatio = pane.scrollTop / Math.max(1, pane.scrollHeight - pane.clientHeight)
        syncTop = sourceRatio * Math.max(1, otherPane.scrollHeight - otherPane.clientHeight)
        shouldSync = true
      }

      if (shouldSync && syncTop !== null && Math.abs(syncTop - otherPane.scrollTop) > 1) {
        compareScrollLockRef.current = otherSide
        compareSyncDisabledUntilRef.current = Math.max(compareSyncDisabledUntilRef.current, Date.now() + 150)
        otherPane.scrollTo({ top: syncTop, behavior: 'smooth' })
      }
    },
    [],
  )

  const handleComparePaneScroll = useCallback(
    (side: ComparePaneSide) => {
      if (compareScrollLockRef.current === side) {
        compareScrollLockRef.current = null
        return
      }

      if (compareScrollSync && Date.now() >= compareSyncDisabledUntilRef.current) {
        updateCompareActiveVerse(side)
      }

      const pane = side === 'current' ? compareCurrentPaneRef.current : compareComparePaneRef.current
      if (!pane || !compareOpen || !compareSections.length || compareLoadingMoreRef.current) return

      const nearTop = pane.scrollTop <= COMPARE_SCROLL_LOAD_THRESHOLD
      const nearBottom = pane.scrollTop + pane.clientHeight >= pane.scrollHeight - COMPARE_SCROLL_LOAD_THRESHOLD

      if (nearTop) {
        void prependPreviousCompareSection()
      } else if (nearBottom) {
        void appendNextCompareSection()
      }
    },
    [appendNextCompareSection, compareOpen, compareScrollSync, compareSections.length, prependPreviousCompareSection, updateCompareActiveVerse],
  )

  const handleCurrentPaneScroll = useCallback(
    () => handleComparePaneScroll('current'),
    [handleComparePaneScroll],
  )
  const handleComparePaneScrollSide = useCallback(
    () => handleComparePaneScroll('compare'),
    [handleComparePaneScroll],
  )

  const handleCompareVerseClick = useCallback(
    (activeKey: string) => {
      compareLastActiveKeyRef.current = activeKey
      setCompareActiveVerse(activeKey)
      setCompareSelectedKey(activeKey)

      const parsed = splitVerseKey(activeKey)
      if (!parsed) return
      const { section, verse } = parsed

      const chapterParts = section.split('.')
      const rawBookId = chapterParts[0]
      const chapter = chapterParts[1]
      if (rawBookId && chapter) {
        const bookCode = bookCodeById[rawBookId] ?? rawBookId
        onSelect(`${bookCode}.${chapter}.${verse}`)
      }

      compareSyncDisabledUntilRef.current = Date.now() + 800

      const currentPane = compareCurrentPaneRef.current
      if (currentPane) {
        const currentTarget = findCompareTarget(currentPane, section, verse)
        if (currentTarget) {
          const currentPaneRect = currentPane.getBoundingClientRect()
          const currentTargetRect = currentTarget.getBoundingClientRect()
          const currentInView = currentTargetRect.top >= currentPaneRect.top && currentTargetRect.bottom <= currentPaneRect.bottom
          if (!currentInView) {
            compareScrollLockRef.current = 'current'
            currentPane.scrollTo({ top: getCompareScrollTop(currentPane, currentTarget), behavior: 'smooth' })
          }
        }
      }

      const comparePane = compareComparePaneRef.current
      if (comparePane) {
        const compareTarget = findCompareTarget(comparePane, section, verse)
        if (compareTarget) {
          const comparePaneRect = comparePane.getBoundingClientRect()
          const compareTargetRect = compareTarget.getBoundingClientRect()
          const compareInView = compareTargetRect.top >= comparePaneRect.top && compareTargetRect.bottom <= comparePaneRect.bottom
          if (!compareInView) {
            compareScrollLockRef.current = 'compare'
            comparePane.scrollTo({ top: getCompareScrollTop(comparePane, compareTarget), behavior: 'smooth' })
          }
        }
      }

      window.setTimeout(() => {
        compareScrollLockRef.current = null
      }, 800)
    },
    [bookCodeById, onSelect],
  )

  const renderComparePaneContent = useCallback(
    (side: ComparePaneSide): ReactNode => {
      const isCurrent = side === 'current'
      const baseHtml = isCurrent ? compareCurrentPassageHtml : comparePassageHtml
      const verses = isCurrent ? compareCurrentVerses : comparePassageVerses
      const extraSections = compareExtraSections
      const firstSectionKey = compareCurrentSectionKey
      const isFlow = readerView === 'verse'

      if (readerView === 'html') {
        if (!baseHtml) {
          return <div className="empty yv-reader-compare-empty">Select a comparison version to see the passage side-by-side.</div>
        }

        return (
          <>
            <article
              className="yv-reader-passage yv-reader-passage-html"
              data-section={firstSectionKey}
              dangerouslySetInnerHTML={{ __html: baseHtml }}
            />
            {extraSections.map((section) => (
              <article
                key={`${side}-${section.key}`}
                className="yv-reader-passage yv-reader-passage-html"
                data-section={section.key}
                dangerouslySetInnerHTML={{ __html: isCurrent ? section.currentHtml : section.compareHtml }}
              />
            ))}
          </>
        )
      }

      return (
        <>
          <div className={isFlow ? 'yv-reader-verse-flow yv-reader-compare-verse-flow' : 'yv-reader-compare-verse-stack'}>
            {verses.map((verse) => {
              const activeKey = `${firstSectionKey}:${verse.verse}`
              const isSelected = compareSelectedKey === activeKey
              const articleClass = isFlow
                ? `yv-reader-verse-flow-item yv-reader-compare-verse-flow-item ${isSelected ? 'selected' : ''}`
                : `yv-reader-compare-verse-card ${isSelected ? 'selected' : ''}`

              return (
                <article
                  key={`${side}-${activeKey}`}
                  className={articleClass}
                  data-section={firstSectionKey}
                  data-verse={verse.verse}
                  onClick={() => handleCompareVerseClick(activeKey)}
                >
                  <div className="yv-reader-compare-verse-number">{verse.verse}</div>
                  <div
                    className={isFlow ? 'yv-reader-verse-flow-content yv-reader-compare-verse-content' : 'yv-reader-compare-verse-content'}
                    dangerouslySetInnerHTML={{ __html: verse.strippedHtml }}
                  />
                </article>
              )
            })}
            {extraSections.map((section) => {
              const sectionVerses = isCurrent ? section.currentVerses : section.compareVerses
              return sectionVerses.map((verse) => {
                const activeKey = `${section.key}:${verse.verse}`
                const isSelected = compareSelectedKey === activeKey
                const articleClass = isFlow
                  ? `yv-reader-verse-flow-item yv-reader-compare-verse-flow-item ${isSelected ? 'selected' : ''}`
                  : `yv-reader-compare-verse-card ${isSelected ? 'selected' : ''}`

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
                  </article>
                )
              })
            })}
          </div>
        </>
      )
    },
    [
      compareCurrentPassageHtml,
      compareCurrentSectionKey,
      compareCurrentVerses,
      compareExtraSections,
      comparePassageHtml,
      comparePassageVerses,
      compareSelectedKey,
      handleCompareVerseClick,
      readerView,
    ],
  )

  const compareGrid = useMemo(
    () => (
      <div className="yv-reader-compare-grid" aria-label="Split-screen Bible comparison">
        <ComparePaneFrame paneRef={compareCurrentPaneRef} onScroll={handleCurrentPaneScroll}>
          {renderComparePaneContent('current')}
        </ComparePaneFrame>
        <ComparePaneFrame paneRef={compareComparePaneRef} onScroll={handleComparePaneScrollSide}>
          {renderComparePaneContent('compare')}
        </ComparePaneFrame>
      </div>
    ),
    [renderComparePaneContent, handleCurrentPaneScroll, handleComparePaneScrollSide],
  )

  const renderVersionMenu = useCallback(
    (
      ariaLabel: string,
      activeVersionId: number | null,
      onSelect: (id: number) => void,
      menuClassName = '',
    ) => (
      <div className={`yv-reader-selector-menu ${menuClassName}`.trim()} role="menu" aria-label={ariaLabel}>
        {availableVersions.map((entry) => {
          const entryLabel = formatVersionLabel(entry)
          const isActive = entry.id === activeVersionId
          return (
            <div key={entry.id} className={`yv-reader-version-menu-item ${isActive ? 'active' : ''}`}>
              <button
                type="button"
                className="yv-reader-version-menu-item-primary"
                onClick={() => onSelect(entry.id)}
              >
                <span className="yv-reader-version-menu-item-main">
                  <strong>{entryLabel.title}</strong>
                  <span>{entryLabel.subtitle || 'Bible translation'}</span>
                </span>
              </button>
            </div>
          )
        })}
      </div>
    ),
    [availableVersions],
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

  if (readerError && !availableVersions.length) {
    return <div className="panel empty yv-reader-error">{readerError}</div>
  }

  return (
    <div className="panel yv-reader-panel">
      <div className="yv-reader" style={readerStyle}>
        <div className="yv-reader-body" ref={readerBodyRef}>
          <aside className="yv-reader-nav">
            <div className="yv-reader-nav-header">
              <BookOpen size={16} />
              <div className="yv-reader-nav-header-copy">
                <strong>{versionTitle}</strong>
                <div>{versionSubtitle || 'Readable passage list'}</div>
              </div>
              {readerToolButtons}
            </div>

            <div className="yv-reader-nav-stack">
              <ReaderBookList
                visibleBooks={visibleBooks}
                activeBookId={activeBookId}
                onSelectBook={handleSelectBook}
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

          <section className="yv-reader-reader">
            <div className="yv-reader-meta">
              <div className="yv-reader-meta-panel yv-reader-meta-panel-primary">
                <span className="yv-reader-meta-label">Passage</span>
                <strong>{focusedPassageTitle}</strong>
                <span>{passageReferenceLabel}</span>
                {compareOpen ? <small>Compare passage: {comparePassageLabel}</small> : null}
              </div>
              <div className="yv-reader-meta-panel yv-reader-meta-panel-version">
                <span className="yv-reader-meta-label">Version</span>
                <strong>{currentVersionTitle}</strong>
                <span>{currentVersionSubtitle}</span>
                {compareOpen ? (
                  <>
                    <small>Current: {currentVersionTitle}</small>
                    <small>Compare: {compareVersionTitle} · {compareVersionSubtitle}</small>
                  </>
                ) : (
                  <small>{copyright || 'Select a version'}</small>
                )}
              </div>
            </div>

            {compareOpen ? (
              <div className="yv-reader-compare-shell">
                {compareError ? (
                  <div className="empty yv-reader-error yv-reader-compare-empty">{compareError}</div>
                ) : !compareVerseRows.length ? (
                  <div className="empty yv-reader-compare-empty">Select a comparison version to see the passage side-by-side.</div>
                ) : (
                  <>
                    <div className="yv-reader-selector-group" aria-label="Split-screen Bible version selectors">
                      <div className="yv-reader-selector-group-label">Version selectors</div>
                      <div className="yv-reader-compare-controls">
                        <ReaderVersionSelector
                          wrapperClassName="yv-reader-selector-shell yv-reader-compare-selector-shell"
                          selectorClassName="yv-reader-compare-selector"
                          buttonClassName="yv-reader-version-button yv-reader-compare-selector-button"
                          menuOpen={versionMenuOpen}
                          onToggleMenu={handleToggleVersionMenu}
                          title={currentVersionLabel.title || 'Choose current version'}
                          subtitle={compareCurrentPassage?.reference ?? currentChapterLabel}
                          chevronSize={14}
                          menuRef={versionMenuRef}
                          menu={versionMenuOpen ? renderVersionMenu('Bible version selection', resolvedVersionId, handleSelectCurrentVersion, 'yv-reader-current-pane-menu') : null}
                        />

                        <ReaderVersionSelector
                          wrapperClassName="yv-reader-selector-shell yv-reader-compare-selector-shell"
                          selectorClassName="yv-reader-compare-selector"
                          buttonClassName="yv-reader-version-button yv-reader-compare-selector-button"
                          menuOpen={compareVersionMenuOpen}
                          onToggleMenu={handleToggleCompareVersionMenu}
                          title={compareVersionLabel.title || 'Choose compare version'}
                          subtitle={comparePassage?.reference || compareVersionLabel.subtitle || 'Select a translation'}
                          chevronSize={16}
                          menuRef={compareVersionMenuRef}
                          menu={compareVersionMenuOpen ? renderVersionMenu('Compare Bible version selection', compareVersionId, handleSelectCompareVersion, 'yv-reader-compare-pane-menu') : null}
                        />

                        <button
                          type="button"
                          className={`yv-reader-compare-sync-toggle ${compareScrollSync ? 'active' : ''}`}
                          onClick={() => setCompareScrollSync((sync) => !sync)}
                          aria-pressed={compareScrollSync}
                        >
                          {compareScrollSync ? 'Sync: on' : 'Sync: off'}
                        </button>
                      </div>
                    </div>

                    {compareGrid}
                  </>
                )}
              </div>
            ) : (
              <>
                <div className="yv-reader-selector-group" aria-label="Bible version selector">
                  <div className="yv-reader-selector-group-label">Version selector</div>
                  <ReaderVersionSelector
                    wrapperClassName="yv-reader-selector-shell yv-reader-reader-selector-shell"
                    selectorClassName="yv-reader-reader-selector"
                    buttonClassName="yv-reader-version-button yv-reader-reader-selector-button"
                    menuOpen={versionMenuOpen}
                    onToggleMenu={handleToggleVersionMenu}
                    title={versionTitle}
                    subtitle={versionSubtitle || copyright || 'Select a version'}
                    chevronSize={14}
                    menuRef={versionMenuRef}
                    menu={renderVersionMenu('Bible version selection', resolvedVersionId, handleSelectCurrentVersion)}
                  />
                </div>
                <ReaderPassageStack
                  passageShellRef={passageShellRef}
                  sectionRefs={sectionRefs}
                  sections={sections}
                  readerView={readerView}
                  focusedSectionKey={focusedSectionKey}
                  isLoadingSections={isLoadingSections}
                  selectedId={selectedId}
                  onSelectVerse={onSelect}
                  bookCodeById={bookCodeById}
                />
              </>
            )}

            <div className="yv-reader-footer">
              <div className="yv-reader-footer-nav" aria-label="Chapter navigation">
                <ChapterNavButton
                  direction="previous"
                  label={t('previousChapter')}
                  destination={previousChapterDestination}
                  disabled={!previousReference || isLoadingSections}
                  onClick={goPrevious}
                />
                <div className="yv-reader-current-chapter-spot" aria-label="Current chapter">
                  <span>Current chapter</span>
                  <strong>{currentChapterLabel}</strong>
                </div>
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
