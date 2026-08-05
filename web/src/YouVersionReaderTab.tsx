import { Fragment, useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react'
import { AlignJustify, ArrowLeftRight, Bookmark, BookOpen, ChevronDown, ChevronLeft, ChevronRight, GripVertical, Loader2, Search, Type } from 'lucide-react'
import { findVerse } from './bible'
import { useBibleClient, useBooks, useChapters, useHighlights, useVersion, useVersions, useYVAuth } from '@youversion/platform-react-hooks'
import { transformBibleHtml, type BiblePassage } from '@youversion/platform-core'
import { getTestamentForBook, type Testament } from './bookTaxonomy'
import {
  type YouVersionBook,
}
from './youversion'
import { useI18n } from './i18n'
import { getYouVersionRedirectUrl } from './youversionRedirect'

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

type ReaderView = 'html' | 'chapter' | 'verse'
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
}

type VerseBlock = {
  verse: string
  html: string
  text: string
}

type CompareSection = {
  key: string
  bookId: string
  chapter: number
  reference: string
  currentPassage: BiblePassage
  comparePassage: BiblePassage
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
    .map((verse) => ({
      verse: verse.getAttribute('v') ?? '',
      html: verse.innerHTML.trim(),
      text: verse.textContent?.trim() ?? '',
    }))
    .filter((verse) => verse.verse)
}

function getCompareScrollTop(pane: HTMLElement, target: HTMLElement, focusLine = COMPARE_FOCUS_LINE): number {
  const paneRect = pane.getBoundingClientRect()
  const targetRect = target.getBoundingClientRect()
  const targetTop = pane.scrollTop + (targetRect.top - paneRect.top) + targetRect.height / 2 - focusLine
  const maxScrollTop = Math.max(0, pane.scrollHeight - pane.clientHeight)
  return Math.max(0, Math.min(maxScrollTop, targetTop))
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

function formatBookRow(book: YouVersionBook): { title: string; subtitle: string } {
  return {
    title: getBookTitle(book),
    subtitle: getBookSubtitle(book) || (getTestamentForBook(book.id) === 'NT' ? 'New Testament' : 'Old Testament'),
  }
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
  const compareVersionMenuRef = useRef<HTMLDivElement | null>(null)
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
  const [compareCurrentPassage, setCompareCurrentPassage] = useState<BiblePassage | null>(null)
  const [comparePassage, setComparePassage] = useState<BiblePassage | null>(null)
  const [compareLoading, setCompareLoading] = useState(false)
  const [compareError, setCompareError] = useState('')
  const compareCurrentPaneRef = useRef<HTMLDivElement | null>(null)
  const compareComparePaneRef = useRef<HTMLDivElement | null>(null)
  const compareCurrentVerseRefs = useRef<Map<string, HTMLElement | null>>(new Map())
  const compareCompareVerseRefs = useRef<Map<string, HTMLElement | null>>(new Map())
  const compareLoadingMoreRef = useRef(false)
  const compareScrollLockRef = useRef<ComparePaneSide | null>(null)
  const hasCompareScrollPrimedRef = useRef(false)
  const [compareActiveVerse, setCompareActiveVerse] = useState('')
  const bibleClient = useBibleClient()
  const { auth, signIn, signOut, processCallback, userInfo } = useYVAuth()
  const chapterNumbersCacheRef = useRef<Map<string, number[]>>(new Map())
  const passageShellRef = useRef<HTMLDivElement | null>(null)
  const sectionRefs = useRef<Map<string, HTMLElement | null>>(new Map())
  const loadingMoreRef = useRef(false)
  const hasPrimedScrollRef = useRef(false)
  const [sections, setSections] = useState<ReaderSection[]>([])
  const [focusedSectionKey, setFocusedSectionKey] = useState('')
  const [focusedVerseLabel, setFocusedVerseLabel] = useState('')
  const [isLoadingSections, setIsLoadingSections] = useState(false)

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

    const onPointerDown = (event: PointerEvent) => {
      const menu = compareVersionMenuRef.current
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
  const versionSelectionTitle = currentVersionLabel.title
  const versionSelectionSubtitle = compareOpen && compareVersion
    ? currentVersionLabel.subtitle || copyright || 'Select a version'
    : currentVersionLabel.subtitle || copyright || 'Select a version'

  const versionSelectionCard = null

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

  useEffect(() => {
    if (!compareOpen || compareVersionId === null || !currentReference || resolvedVersionId === null) {
      setComparePassage(null)
      setCompareLoading(false)
      setCompareError('')
      return
    }

    if (compareVersionId === resolvedVersionId) {
      setComparePassage(null)
      setCompareLoading(false)
      setCompareError('')
      return
    }

    let cancelled = false
    setCompareLoading(true)
    setCompareError('')

    void bibleClient
      .getPassage(compareVersionId, currentReference, 'html', true, true)
      .then((passage) => {
        if (!cancelled) {
          setComparePassage(passage)
        }
      })
      .catch((error) => {
        if (!cancelled) {
          setComparePassage(null)
          setCompareError(error instanceof Error ? error.message : String(error))
        }
      })
      .finally(() => {
        if (!cancelled) {
          setCompareLoading(false)
        }
      })

    return () => {
      cancelled = true
    }
  }, [bibleClient, compareOpen, compareVersionId, currentReference, resolvedVersionId])

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

      return {
        key: chapterReference,
        bookId: reference.bookId,
        chapter: reference.chapter,
        reference: currentPassage.reference || comparePassage.reference || chapterReference,
        currentPassage,
        comparePassage,
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
      const passage = await bibleClient.getPassage(resolvedVersionId, chapterReference, 'html', true, true)
      const transformed = transformPassageForBrowser(passage.content)

      return {
        key: chapterReference,
        bookId: reference.bookId,
        chapter: reference.chapter,
        reference: passage.reference || chapterReference,
        passageId: passage.id,
        content: transformed.html,
        plainText: transformed.text,
      }
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

      const builtSections: ReaderSection[] = []
      const bufferSize = INITIAL_BUFFER_SIZE
      let nextReference: ReaderReference | undefined = { bookId: currentIndexBook.id, chapter: currentChapter }

      for (let index = 0; index < bufferSize && nextReference; index++) {
        const section = await loadSection(nextReference)
        if (!section) break
        builtSections.push(section)
        nextReference = await nextOrPreviousChapter(books, section.bookId, section.chapter, 'next', resolveChapterNumbers)
      }

      if (cancelled) return

      setSections(builtSections)
      sectionRefs.current = new Map()
      setFocusedSectionKey(builtSections[0]?.key ?? '')
      setFocusedVerseLabel(formatChapterMarker(books.find((book) => book.id === builtSections[0]?.bookId), builtSections[0]?.chapter ?? currentChapter))
      window.localStorage.setItem(READER_COMMITTED_KEY, builtSections[0]?.reference ?? '')
      window.requestAnimationFrame(() => {
        const shell = passageShellRef.current
        if (!shell) return
        shell.scrollTop = 0
      })
      loadingMoreRef.current = false
      setIsLoadingSections(false)
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
      setCompareCurrentPassage(null)
      setComparePassage(null)
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

      for (let index = 0; index < bufferSize && nextReference; index++) {
        const section = await loadCompareSection(nextReference)
        if (!section) break
        builtSections.push(section)
        nextReference = await nextOrPreviousChapter(books, section.bookId, section.chapter, 'next', resolveChapterNumbers)
      }

      if (cancelled) return

      setCompareSections(builtSections)
      setCompareCurrentPassage(builtSections[0]?.currentPassage ?? null)
      setComparePassage(builtSections[0]?.comparePassage ?? null)
      compareCurrentVerseRefs.current = new Map()
      compareCompareVerseRefs.current = new Map()
      setCompareActiveVerse('')
      window.requestAnimationFrame(() => {
        const shell = compareCurrentPaneRef.current
        if (!shell) return
        shell.scrollTop = 0
      })
      compareLoadingMoreRef.current = false
      setIsLoadingSections(false)
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

  const visibleSections = useMemo(() => sections, [sections])

  useEffect(() => {
    const shell = passageShellRef.current
    if (!shell || !visibleSections.length) return

    hasPrimedScrollRef.current = false
    let raf = 0

    const updateFocus = () => {
      const shellRect = shell.getBoundingClientRect()
      const focusLine = shellRect.top + 96

      let focusedSection: ReaderSection | null = null
      let closestDistance = Number.POSITIVE_INFINITY

      for (const section of visibleSections) {
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

      const section = focusedSection ?? visibleSections[0]
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
  }, [appendNextSection, books, prependPreviousSection, visibleSections])

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
    if (!compareOpen) {
      setCompareCurrentPassage(null)
      setComparePassage(null)
      return
    }

    setCompareCurrentPassage(compareSections[0]?.currentPassage ?? null)
    setComparePassage(compareSections[0]?.comparePassage ?? null)
  }, [compareOpen, compareSections])

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
    const nextBook = books.find((book) => book.id === selectedVerse.book)
    if (!nextBook) return
    setBookAndChapter(nextBook.id, selectedVerse.chapter)
    setReferenceInput(`${selectedVerse.bookName} ${selectedVerse.chapter}:${selectedVerse.verse}`)
  }, [books, selectedVerse, setBookAndChapter])
  const navBook = useMemo(
    () => visibleBooks.find((book) => book.id === activeBookId) ?? visibleBooks[0] ?? currentIndexBook,
    [activeBookId, currentIndexBook, visibleBooks],
  )
  const chapterNumbersList = chapterNumbers(navBook)

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

  const goToReference = (reference: ReaderReference) => {
    setFocusedSectionKey('')
    setBookAndChapter(reference.bookId, reference.chapter)
    setReferenceInput(formatReference(reference.bookId, reference.chapter, reference.verse, reference.verseEnd))
    window.requestAnimationFrame(() => {
      const shell = passageShellRef.current
      if (!shell) return
      shell.scrollTop = 0
    })
  }

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

  const goPrevious = () => {
    void goAdjacentChapter('previous')
  }

  const goNext = () => {
    void goAdjacentChapter('next')
  }

  const previousReference = resolveAdjacentReference.previous
  const nextReference = resolveAdjacentReference.next

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

  const chapterViewSections = useMemo(
    () =>
      visibleSections.map((section) => ({
        section,
        verses: readerView === 'chapter' || readerView === 'verse' ? extractVerseBlocks(section.content) : [],
      })),
    [readerView, visibleSections],
  )

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
      hasCompareScrollPrimedRef.current = false
      setCompareActiveVerse('')
      return
    }

    hasCompareScrollPrimedRef.current = false
    const firstVerse = compareVerseRows[0]?.verse ?? ''
    setCompareActiveVerse((current) => (current && compareVerseRows.some((row) => row.verse === current) ? current : firstVerse))

    window.requestAnimationFrame(() => {
      compareCurrentPaneRef.current?.scrollTo({ top: 0 })
      compareComparePaneRef.current?.scrollTo({ top: 0 })
    })
  }, [compareOpen, compareVerseRows])

  const updateCompareActiveVerse = useCallback(
    (side: ComparePaneSide) => {
      if (compareScrollLockRef.current && compareScrollLockRef.current !== side) return

      const pane = side === 'current' ? compareCurrentPaneRef.current : compareComparePaneRef.current
      const refs = side === 'current' ? compareCurrentVerseRefs.current : compareCompareVerseRefs.current
      if (!pane) return

      const paneRect = pane.getBoundingClientRect()
      const focusLine = paneRect.top + 96

      let focusedVerse = ''
      let closestDistance = Number.POSITIVE_INFINITY

      refs.forEach((node, verse) => {
        if (!node) return
        const rect = node.getBoundingClientRect()
        if (rect.bottom < paneRect.top + 40 || rect.top > paneRect.bottom) return

        const distance = Math.abs(rect.top - focusLine)
        if (distance < closestDistance) {
          closestDistance = distance
          focusedVerse = verse
        }
      })

      if (!focusedVerse) return

      setCompareActiveVerse(focusedVerse)

      const otherPane = side === 'current' ? compareComparePaneRef.current : compareCurrentPaneRef.current
      const otherRefs = side === 'current' ? compareCompareVerseRefs.current : compareCurrentVerseRefs.current
      const target = otherRefs.get(focusedVerse)
      if (!otherPane || !target) return

      compareScrollLockRef.current = side
      otherPane.scrollTo({ top: getCompareScrollTop(otherPane, target) })

      window.requestAnimationFrame(() => {
        if (compareScrollLockRef.current === side) {
          compareScrollLockRef.current = null
        }
      })
    },
    [],
  )

  const handleComparePaneScroll = useCallback(
    (side: ComparePaneSide) => {
      updateCompareActiveVerse(side)

      const pane = side === 'current' ? compareCurrentPaneRef.current : compareComparePaneRef.current
      if (!pane || !compareOpen || !compareSections.length) return

      if (compareLoadingMoreRef.current || compareScrollLockRef.current) return

      const nearTop = pane.scrollTop <= COMPARE_SCROLL_LOAD_THRESHOLD
      const nearBottom = pane.scrollTop + pane.clientHeight >= pane.scrollHeight - COMPARE_SCROLL_LOAD_THRESHOLD

      if (!hasCompareScrollPrimedRef.current) {
        hasCompareScrollPrimedRef.current = true
        return
      }

      if (nearTop) {
        void prependPreviousCompareSection()
      } else if (nearBottom) {
        void appendNextCompareSection()
      }
    },
    [appendNextCompareSection, compareOpen, compareSections.length, prependPreviousCompareSection, updateCompareActiveVerse],
  )

  const handleCompareVerseClick = useCallback(
    (verse: string) => {
      setCompareActiveVerse(verse)

      const currentTarget = compareCurrentVerseRefs.current.get(verse)
      if (currentTarget) {
        compareScrollLockRef.current = 'compare'
        const currentPane = compareCurrentPaneRef.current
        if (currentPane) {
          currentPane.scrollTo({ top: getCompareScrollTop(currentPane, currentTarget) })
        }
      }

      const compareTarget = compareCompareVerseRefs.current.get(verse)
      if (compareTarget) {
        compareScrollLockRef.current = 'current'
        const comparePane = compareComparePaneRef.current
        if (comparePane) {
          comparePane.scrollTo({ top: getCompareScrollTop(comparePane, compareTarget) })
        }
      }

      window.requestAnimationFrame(() => {
        compareScrollLockRef.current = null
      })
    },
    [],
  )

  const startResize = (event: ReactPointerEvent<HTMLButtonElement>) => {
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
  }

  const readerStyle = {
    '--yv-nav-width': `${navWidth}px`,
  } as CSSProperties

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
        {versionSelectionCard ? <div className="yv-reader-topbar">{versionSelectionCard}</div> : null}

        <div className="yv-reader-body" ref={readerBodyRef}>
          <aside className="yv-reader-nav">
            <div className="yv-reader-nav-header">
              <BookOpen size={16} />
              <div>
                <strong>{versionTitle}</strong>
                <div>{versionSubtitle || 'Readable passage list'}</div>
              </div>
            </div>

            <div className="yv-reader-filter-group">
              <div className="yv-reader-filter-label">Testament</div>
              <div className="yv-reader-filter-tabs">
                {(['all', 'OT', 'NT'] as const).map((value) => (
                  <button
                    key={value}
                    type="button"
                    className={`yv-reader-filter-tab ${testamentFilter === value ? 'active' : ''}`}
                    onClick={() => setTestamentFilter(value)}
                  >
                    {value === 'all' ? 'All' : value === 'OT' ? 'Old' : 'New'}
                  </button>
                ))}
              </div>
            </div>

            <div className="yv-reader-book-list">
              {visibleBooks.map((book) => {
                const row = formatBookRow(book)
                return (
                <button
                  key={book.id}
                  type="button"
                  className={`yv-book-pill ${book.id === activeBookId ? 'active' : ''}`}
                  onClick={() => {
                    const firstChapter = chapterNumbers(book)[0] ?? 1
                    goToReference({ bookId: book.id, chapter: firstChapter })
                  }}
                >
                  <span>
                    <strong>{row.title}</strong>
                    <small>{row.subtitle}</small>
                  </span>
                  <small>{book.chapters?.length ?? 0}</small>
                </button>
              )})}
            </div>

            <div className="yv-reader-chapter-list">
              {chapterNumbersList.map((chapterNumber) => (
                <button
                  key={`${navBook?.id ?? 'book'}-${chapterNumber}`}
                  type="button"
                  className={`yv-chapter-pill ${chapterNumber === activeChapter ? 'active' : ''}`}
                  onClick={() =>
                    navBook &&
                    goToReference({ bookId: navBook.id, chapter: chapterNumber })
                  }
                >
                  {chapterNumber}
                </button>
              ))}
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
            <div className={`yv-reader-meta ${compareOpen ? 'yv-reader-meta-compare' : ''}`}>
              <div className="yv-reader-meta-block" ref={versionMenuRef}>
                <span className="yv-reader-meta-label">Version</span>
                <button
                  type="button"
                  className="yv-reader-version-link yv-reader-version-trigger"
                  aria-expanded={versionMenuOpen}
                  aria-label="Change Bible version"
                  title="Change Bible version"
                  onPointerDown={(event) => {
                    event.stopPropagation()
                  }}
                  onClick={() => setVersionMenuOpen((current) => !current)}
                >
                  <strong>{versionTitle}</strong>
                  <span>{versionSubtitle || copyright || 'Select a version'}</span>
                </button>
                {versionMenuOpen ? (
                  <div className="yv-reader-version-menu yv-reader-compare-menu yv-reader-compare-pane-menu" role="menu" aria-label="Bible version selection">
                    {availableVersions.map((entry) => {
                      const entryLabel = formatVersionLabel(entry)
                      const isActive = entry.id === resolvedVersionId
                      return (
                        <div
                          key={entry.id}
                          className={`yv-reader-version-menu-item ${isActive ? 'active' : ''}`}
                        >
                          <button
                            type="button"
                            className="yv-reader-version-menu-item-primary"
                            onClick={() => {
                              setVersionId(entry.id)
                              setVersionMenuOpen(false)
                            }}
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
                ) : null}
              </div>
              <div className="yv-reader-meta-block yv-reader-meta-block-center">
                <span className="yv-reader-meta-label">Current chapter</span>
                <strong>{currentChapterLabel}</strong>
                <span>{isLoadingSections ? 'Loading ahead…' : `${sections.length} section${sections.length === 1 ? '' : 's'} loaded`}</span>
              </div>
              {compareOpen ? (
                <div className="yv-reader-meta-block yv-reader-meta-block-compare" ref={compareVersionMenuRef}>
                  <span className="yv-reader-meta-label">Compare version</span>
                  <button
                    type="button"
                    className="yv-reader-version-link yv-reader-version-trigger"
                    aria-expanded={compareVersionMenuOpen}
                    aria-label="Change compare version"
                    title="Change compare version"
                    onPointerDown={(event) => {
                      event.stopPropagation()
                    }}
                    onClick={() => setCompareVersionMenuOpen((current) => !current)}
                  >
                    {compareVersion ? (
                      <>
                        <strong>{compareVersionLabel.title}</strong>
                        <span>{compareVersionLabel.subtitle || 'Parallel translation'}</span>
                      </>
                    ) : (
                      <>
                        <strong>Choose a version</strong>
                        <span>Select a comparison translation</span>
                      </>
                    )}
                  </button>
                  {compareVersionMenuOpen ? (
                    <div className="yv-reader-version-menu yv-reader-compare-menu yv-reader-compare-pane-menu" role="menu" aria-label="Compare Bible version selection">
                      {availableVersions.map((entry) => {
                        const label = formatVersionLabel(entry)
                        const isActive = entry.id === compareVersionId
                        return (
                          <div
                            key={entry.id}
                            className={`yv-reader-version-menu-item ${isActive ? 'active' : ''}`}
                          >
                            <button
                              type="button"
                              className="yv-reader-version-menu-item-primary"
                              onClick={() => {
                                setCompareVersionId(entry.id)
                                setCompareVersionMenuOpen(false)
                              }}
                            >
                              <span className="yv-reader-version-menu-item-main">
                                <strong>{label.title}</strong>
                                <span>{label.subtitle || 'Bible translation'}</span>
                              </span>
                            </button>
                          </div>
                        )
                      })}
                    </div>
                  ) : null}
                </div>
              ) : null}
              <div className="yv-reader-meta-tools" role="group" aria-label="Reading tools">
                <button
                  type="button"
                  className={`yv-reader-meta-icon-button ${readerView === 'html' ? 'active' : ''}`}
                  aria-pressed={readerView === 'html'}
                  aria-label="Full reading flow"
                  title="Full reading flow"
                  onClick={() => setReaderView('html')}
                >
                  <Type size={15} />
                </button>
                <button
                  type="button"
                  className={`yv-reader-meta-icon-button ${readerView === 'chapter' ? 'active' : ''}`}
                  aria-pressed={readerView === 'chapter'}
                  aria-label="Chapter reading flow"
                  title="Chapter reading flow"
                  onClick={() => setReaderView('chapter')}
                >
                  <BookOpen size={15} />
                </button>
                <button
                  type="button"
                  className={`yv-reader-meta-icon-button ${readerView === 'verse' ? 'active' : ''}`}
                  aria-pressed={readerView === 'verse'}
                  aria-label="Verse reading flow"
                  title="Verse reading flow"
                  onClick={() => setReaderView('verse')}
                >
                  <AlignJustify size={15} />
                </button>
                <button
                  type="button"
                  className={`yv-reader-meta-icon-button ${compareOpen ? 'active' : ''}`}
                  aria-pressed={compareOpen}
                  aria-label={compareOpen ? 'Turn compare mode off' : 'Turn compare mode on'}
                  title={compareOpen ? 'Compare on' : 'Compare off'}
                  onClick={() => {
                    setCompareOpen((current) => {
                      const next = !current
                      if (!next) setCompareVersionMenuOpen(false)
                      return next
                    })
                  }}
                >
                  <ArrowLeftRight size={15} />
                </button>
                <button
                  type="button"
                  className="yv-reader-meta-icon-button"
                  aria-label="Highlight selected verse"
                  title="Highlight selected verse"
                  onClick={() => {
                    const verse = selectedVerse
                    if (verse) onSelect(verse.id)
                  }}
                  disabled={!selectedVerse}
                >
                  <Bookmark size={15} />
                </button>
              </div>

            </div>

            {compareOpen ? (
              <div className="yv-reader-compare-shell">
                {compareLoading ? (
                  <div className="empty yv-reader-compare-empty" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <Loader2 className="spin" size={18} /> Loading split-screen comparison…
                  </div>
                ) : compareError ? (
                  <div className="empty yv-reader-error yv-reader-compare-empty">{compareError}</div>
                ) : readerView === 'html' ? (
                  compareCurrentPassageHtml && comparePassageHtml ? (
                    <div className="yv-reader-compare-grid" aria-label="Split-screen Bible comparison">
                      <section className="yv-reader-compare-pane">
                        <div className="yv-reader-compare-pane-header">
                          <strong>{currentVersionLabel.title}</strong>
                          <span>{compareCurrentPassage?.reference ?? currentChapterLabel}</span>
                        </div>
                        <article
                          className="yv-reader-passage yv-reader-passage-html"
                          dangerouslySetInnerHTML={{ __html: compareCurrentPassageHtml }}
                        />
                        {compareExtraSections.map((section) => (
                          <article
                            key={`current-${section.key}`}
                            className="yv-reader-passage yv-reader-passage-html"
                            dangerouslySetInnerHTML={{ __html: transformPassageForBrowser(section.currentPassage.content).html }}
                          />
                        ))}
                      </section>

                      <section className="yv-reader-compare-pane">
                        <div className="yv-reader-compare-pane-header">
                          <strong>{compareVersionLabel.title}</strong>
                          <span>{comparePassage?.reference || compareVersionLabel.subtitle || 'Parallel translation'}</span>
                        </div>
                        <article
                          className="yv-reader-passage yv-reader-passage-html"
                          dangerouslySetInnerHTML={{ __html: comparePassageHtml }}
                        />
                        {compareExtraSections.map((section) => (
                          <article
                            key={`compare-${section.key}`}
                            className="yv-reader-passage yv-reader-passage-html"
                            dangerouslySetInnerHTML={{ __html: transformPassageForBrowser(section.comparePassage.content).html }}
                          />
                        ))}
                      </section>
                    </div>
                  ) : (
                    <div className="empty yv-reader-compare-empty">Select a comparison version to see the passage side-by-side.</div>
                  )
                ) : compareVerseRows.length ? (
                  <div className="yv-reader-compare-grid" aria-label="Split-screen Bible comparison">
                    <section
                      ref={compareCurrentPaneRef}
                      className="yv-reader-compare-pane"
                      onScroll={() => handleComparePaneScroll('current')}
                    >
                      <div className="yv-reader-compare-pane-header">
                        <strong>{currentVersionLabel.title || 'Choose current version'}</strong>
                        <span>{compareCurrentPassage?.reference ?? currentChapterLabel}</span>
                      </div>
                      <div className="yv-reader-compare-verse-indicator" aria-label="Synced verse indicator">
                        <span />
                        <small>{compareActiveVerse ? `Verse ${compareActiveVerse}` : 'Verse sync'}</small>
                        <span />
                      </div>
                      {readerView === 'verse' ? (
                        <div className="yv-reader-verse-flow yv-reader-compare-verse-flow">
                          {compareCurrentVerses.map((verse) => (
                            <article
                              key={`current-${verse.verse}`}
                              ref={(node) => {
                                compareCurrentVerseRefs.current.set(verse.verse, node)
                              }}
                              className={`yv-reader-verse-flow-item yv-reader-compare-verse-flow-item ${compareActiveVerse === verse.verse ? 'active' : ''}`}
                              data-verse={verse.verse}
                              onClick={() => handleCompareVerseClick(verse.verse)}
                            >
                              <div className="yv-reader-compare-verse-number">{verse.verse}</div>
                              <div
                                className="yv-reader-verse-flow-content yv-reader-compare-verse-content"
                                dangerouslySetInnerHTML={{ __html: stripVerseLabel(verse.html) }}
                              />
                            </article>
                          ))}
                          {compareExtraSections.map((section) =>
                            extractVerseBlocks(transformPassageForBrowser(section.currentPassage.content).html).map((verse) => (
                              <article
                                key={`current-${section.key}-${verse.verse}`}
                                className="yv-reader-verse-flow-item yv-reader-compare-verse-flow-item"
                              >
                                <div className="yv-reader-compare-verse-number">{verse.verse}</div>
                                <div
                                  className="yv-reader-verse-flow-content yv-reader-compare-verse-content"
                                  dangerouslySetInnerHTML={{ __html: stripVerseLabel(verse.html) }}
                                />
                              </article>
                            )),
                          )}
                        </div>
                      ) : (
                        <div className="yv-reader-compare-verse-stack">
                          {compareCurrentVerses.map((verse) => (
                            <article
                              key={`current-${verse.verse}`}
                              ref={(node) => {
                                compareCurrentVerseRefs.current.set(verse.verse, node)
                              }}
                              className={`yv-reader-compare-verse-card ${compareActiveVerse === verse.verse ? 'active' : ''}`}
                              data-verse={verse.verse}
                              onClick={() => handleCompareVerseClick(verse.verse)}
                            >
                              <div className="yv-reader-compare-verse-number">{verse.verse}</div>
                              <div
                                className="yv-reader-compare-verse-content"
                                dangerouslySetInnerHTML={{ __html: stripVerseLabel(verse.html) }}
                              />
                            </article>
                          ))}
                          {compareExtraSections.map((section) =>
                            extractVerseBlocks(transformPassageForBrowser(section.currentPassage.content).html).map((verse) => (
                              <article
                                key={`current-stack-${section.key}-${verse.verse}`}
                                className="yv-reader-compare-verse-card"
                              >
                                <div className="yv-reader-compare-verse-number">{verse.verse}</div>
                                <div
                                  className="yv-reader-compare-verse-content"
                                  dangerouslySetInnerHTML={{ __html: stripVerseLabel(verse.html) }}
                                />
                              </article>
                            )),
                          )}
                        </div>
                      )}
                    </section>

                    <section
                      ref={compareComparePaneRef}
                      className="yv-reader-compare-pane"
                      onScroll={() => handleComparePaneScroll('compare')}
                    >
                      <div className="yv-reader-compare-pane-header">
                        <strong>{compareVersionLabel.title || 'Choose compare version'}</strong>
                        <span>{comparePassage?.reference || compareVersionLabel.subtitle || 'Select a translation'}</span>
                      </div>
                      <div className="yv-reader-compare-verse-indicator" aria-label="Synced verse indicator">
                        <span />
                        <small>{compareActiveVerse ? `Verse ${compareActiveVerse}` : 'Verse sync'}</small>
                        <span />
                      </div>
                      {readerView === 'verse' ? (
                        <div className="yv-reader-verse-flow yv-reader-compare-verse-flow">
                          {comparePassageVerses.map((verse) => (
                            <article
                              key={`compare-${verse.verse}`}
                              ref={(node) => {
                                compareCompareVerseRefs.current.set(verse.verse, node)
                              }}
                              className={`yv-reader-verse-flow-item yv-reader-compare-verse-flow-item ${compareActiveVerse === verse.verse ? 'active' : ''}`}
                              data-verse={verse.verse}
                              onClick={() => handleCompareVerseClick(verse.verse)}
                            >
                              <div className="yv-reader-compare-verse-number">{verse.verse}</div>
                              <div
                                className="yv-reader-verse-flow-content yv-reader-compare-verse-content"
                                dangerouslySetInnerHTML={{ __html: stripVerseLabel(verse.html) }}
                              />
                            </article>
                          ))}
                          {compareExtraSections.map((section) =>
                            extractVerseBlocks(transformPassageForBrowser(section.comparePassage.content).html).map((verse) => (
                              <article
                                key={`compare-${section.key}-${verse.verse}`}
                                className="yv-reader-verse-flow-item yv-reader-compare-verse-flow-item"
                              >
                                <div className="yv-reader-compare-verse-number">{verse.verse}</div>
                                <div
                                  className="yv-reader-verse-flow-content yv-reader-compare-verse-content"
                                  dangerouslySetInnerHTML={{ __html: stripVerseLabel(verse.html) }}
                                />
                              </article>
                            )),
                          )}
                        </div>
                      ) : (
                        <div className="yv-reader-compare-verse-stack">
                          {comparePassageVerses.map((verse) => (
                            <article
                              key={`compare-${verse.verse}`}
                              ref={(node) => {
                                compareCompareVerseRefs.current.set(verse.verse, node)
                              }}
                              className={`yv-reader-compare-verse-card ${compareActiveVerse === verse.verse ? 'active' : ''}`}
                              data-verse={verse.verse}
                              onClick={() => handleCompareVerseClick(verse.verse)}
                            >
                              <div className="yv-reader-compare-verse-number">{verse.verse}</div>
                              <div
                                className="yv-reader-compare-verse-content"
                                dangerouslySetInnerHTML={{ __html: stripVerseLabel(verse.html) }}
                              />
                            </article>
                          ))}
                          {compareExtraSections.map((section) =>
                            extractVerseBlocks(transformPassageForBrowser(section.comparePassage.content).html).map((verse) => (
                              <article
                                key={`compare-stack-${section.key}-${verse.verse}`}
                                className="yv-reader-compare-verse-card"
                              >
                                <div className="yv-reader-compare-verse-number">{verse.verse}</div>
                                <div
                                  className="yv-reader-compare-verse-content"
                                  dangerouslySetInnerHTML={{ __html: stripVerseLabel(verse.html) }}
                                />
                              </article>
                            )),
                          )}
                        </div>
                      )}
                    </section>
                  </div>
                ) : (
                  <div className="empty yv-reader-compare-empty">Select a comparison version to see the passage side-by-side.</div>
                )}
              </div>
            ) : (
              <div className="yv-reader-passage-shell" ref={passageShellRef}>
                {sections.length ? (
                  <div className="yv-reader-passage-stack">
                    {chapterViewSections.map((entry) => (
                      <Fragment key={entry.section.key}>
                        <article
                          ref={(node) => {
                            sectionRefs.current.set(entry.section.key, node)
                          }}
                          className={`yv-reader-section ${entry.section.key === focusedSectionKey ? 'active' : ''}`}
                          data-book-id={entry.section.bookId}
                          data-chapter={entry.section.chapter}
                        >
                          <div className="yv-reader-section-header">
                            <div>
                              <strong>{entry.section.reference}</strong>
                              <span>{entry.section.passageId}</span>
                            </div>
                          </div>

                          {readerView === 'chapter' ? (
                            entry.verses.length ? (
                              <div className="yv-reader-verse-stack">
                                {entry.verses.map((verse) => (
                                  <article key={`${entry.section.key}-${verse.verse}`} className="yv-reader-verse-card">
                                    <div className="yv-reader-verse-number">{verse.verse}</div>
                                    <div
                                      className="yv-reader-verse-content"
                                      dangerouslySetInnerHTML={{ __html: stripVerseLabel(verse.html) }}
                                    />
                                  </article>
                                ))}
                              </div>
                            ) : (
                              <pre className="yv-reader-passage yv-reader-passage-text">{entry.section.plainText}</pre>
                            )
                          ) : readerView === 'verse' ? (
                            entry.verses.length ? (
                              <div className="yv-reader-verse-flow">
                                {entry.verses.map((verse) => (
                                  <article key={`${entry.section.key}-${verse.verse}`} className="yv-reader-verse-flow-item">
                                    <div className="yv-reader-verse-flow-content" dangerouslySetInnerHTML={{ __html: verse.html }} />
                                  </article>
                                ))}
                              </div>
                            ) : (
                              <div className="empty">No verse markers found.</div>
                            )
                          ) : (
                            <article
                              className="yv-reader-passage yv-reader-passage-html"
                              dangerouslySetInnerHTML={{ __html: entry.section.content }}
                            />
                          )}
                        </article>
                      </Fragment>
                    ))}

                    {isLoadingSections ? (
                      <div className="empty yv-reader-loading-more" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <Loader2 className="spin" size={18} /> Loading more chapters...
                      </div>
                    ) : null}
                  </div>
                ) : (
                  <div className="empty">Select a passage to begin reading.</div>
                )}
              </div>
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
