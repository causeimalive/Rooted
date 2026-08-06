import { useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent, type WheelEvent as ReactWheelEvent } from 'react'
import { onAuthStateChanged } from 'firebase/auth'
import { Capacitor } from '@capacitor/core'
import {
  BookOpen,
  Book,
  Map as MapIcon,
  ExternalLink,
  Search,
  Share2,
  Bookmark,
  Loader2,
  X,
  Moon,
  Sun,
  Globe,
  Play,
  Pause,
  Users,
  Link,
  Check,
  Volume2,
} from 'lucide-react'
import { GoogleMap, Marker, Polyline, useJsApiLoader } from '@react-google-maps/api'
import { YouVersionProvider } from '@youversion/platform-react-ui'
import {
  findVerse,
  extractNetworkThemes as deriveNetworkThemes,
  generateInsight,
  getAllVerses,
  getCrossReferences,
  getCrossReferenceMatches,
  getCuratedMeaning,
  loadBible,
  lookupLexicon,
  searchBible,
  type NetworkTheme,
  type VerseMatch,
} from './bible'
import {
  fetchYouVersionAudioChapter,
  fetchYouVersionPassage,
  fetchYouVersionSearch,
  type YouVersionAudioChapter,
  type YouVersionBook,
  type YouVersionPassage,
  type YouVersionSearchHit,
} from './youversion'
import {
  getAllPlaces,
  formatPassage,
  getPassagesForPlace,
  getPlace,
  getPlacesForVerse,
  loadPlaces,
  matchesPassage,
  searchPlaces,
} from './places'
import {
  getCharacter,
  getCharacterPath,
  getCharactersForVerse,
  loadCharacters,
  searchCharacters,
} from './characters'
import { getMapStyle } from './mapStyles'
import WikiMediaCard from './WikiMediaCard'
import LexiconTab from './LexiconTab'
import YouVersionReaderTab from './YouVersionReaderTab'
import NetworkScene from './NetworkScene'
import { AuthSignOutButton } from './AuthGate'
import {
  addRecentSearch,
  clearCurrentUser,
  getBookmarks,
  getRecentSearches,
  isBookmarked,
  syncUserData,
  toggleBookmark,
} from './storage'
import { auth } from './firebase'
import { Bookmark as BookmarkType, Verse, type Place, type RecentSearch } from './types'
import type { Character } from './types'
import { useI18n } from './i18n'
import { getWikipediaLink, useWikiSummary } from './wikipedia'
import { useBibleClient, useBooks, useChapters, useHighlights, useVersion, useVersions, useYVAuth } from '@youversion/platform-react-hooks'
import { getYouVersionRedirectUrl } from './youversionRedirect'

type Tab = 'search' | 'reader' | 'network' | 'map' | 'lexicon'

const TABS: Tab[] = ['search', 'reader', 'network', 'map', 'lexicon']

const USFM_BOOK_NORMALIZE: Record<string, string> = {
  genesis: 'Gen', exodus: 'Exod', leviticus: 'Lev', numbers: 'Num', deuteronomy: 'Deut',
  joshua: 'Josh', judges: 'Judg', ruth: 'Ruth', '1 samuel': '1Sam', '2 samuel': '2Sam',
  '1 kings': '1Kgs', '2 kings': '2Kgs', '1 chronicles': '1Chr', '2 chronicles': '2Chr',
  ezra: 'Ezra', nehemiah: 'Neh', esther: 'Esth', job: 'Job', psalm: 'Ps', psalms: 'Ps',
  proverbs: 'Prov', ecclesiastes: 'Eccl', 'song of solomon': 'Song', isaiah: 'Isa', jeremiah: 'Jer',
  lamentations: 'Lam', ezekiel: 'Ezek', daniel: 'Dan', hosea: 'Hos', joel: 'Joel', amos: 'Amos',
  obadiah: 'Obad', jonah: 'Jonah', micah: 'Mic', nahum: 'Nah', habakkuk: 'Hab', zephaniah: 'Zeph',
  haggai: 'Hag', zechariah: 'Zech', malachi: 'Mal', matthew: 'Matt', mark: 'Mark', luke: 'Luke',
  john: 'John', acts: 'Acts', romans: 'Rom', '1 corinthians': '1Cor', '2 corinthians': '2Cor',
  galatians: 'Gal', ephesians: 'Eph', philippians: 'Phil', colossians: 'Col', '1 thessalonians': '1Thess',
  '2 thessalonians': '2Thess', '1 timothy': '1Tim', '2 timothy': '2Tim', titus: 'Titus',
  philemon: 'Phlm', hebrews: 'Heb', james: 'Jas', '1 peter': '1Pet', '2 peter': '2Pet',
  '1 john': '1John', '2 john': '2John', '3 john': '3John', jude: 'Jude', revelation: 'Rev',
}

function normalizeBookName(name: string): string {
  const lower = name.toLowerCase().replace(/\./g, '').trim()
  if (USFM_BOOK_NORMALIZE[lower]) return USFM_BOOK_NORMALIZE[lower]
  // Try OSIS-style input like "1Sam" or "Gen"
  const osis = lower.replace(/\b(\d)\s*(\w)/g, '$1$2').replace(/^\w/, (c) => c.toUpperCase())
  return osis.charAt(0).toUpperCase() + osis.slice(1)
}

function findLocalVerseIdFromReference(reference: string): string | undefined {
  const clean = reference.replace(/\u2013/g, '-').replace(/\u2014/g, '-')
  const match = clean.match(/^((?:\d\s)?[A-Za-z\.]+)\s+(\d+)(?::(\d+)(?:\s*-\s*\d+)?)?$/)
  if (!match) return undefined
  const bookName = normalizeBookName(match[1])
  const chapter = Number(match[2])
  const verse = match[3] ? Number(match[3]) : 1
  const verses = getAllVerses()
  const found = verses.find((v) => v.book === bookName && v.chapter === chapter && v.verse === verse)
  return found?.id
}

const OSIS_TO_USFM: Record<string, string> = {
  Gen: 'GEN', Exod: 'EXO', Lev: 'LEV', Num: 'NUM', Deut: 'DEU', Josh: 'JOS',
  Judg: 'JDG', Ruth: 'RUT', '1Sam': '1SA', '2Sam': '2SA', '1Kgs': '1KI',
  '2Kgs': '2KI', '1Chr': '1CH', '2Chr': '2CH', Ezra: 'EZR', Neh: 'NEH',
  Esth: 'EST', Job: 'JOB', Ps: 'PSA', Prov: 'PRO', Eccl: 'ECC', Song: 'SNG',
  Isa: 'ISA', Jer: 'JER', Lam: 'LAM', Ezek: 'EZE', Dan: 'DAN', Hos: 'HOS',
  Joel: 'JOL', Amos: 'AMO', Obad: 'OBA', Jonah: 'JON', Mic: 'MIC', Nah: 'NAM',
  Hab: 'HAB', Zeph: 'ZEP', Hag: 'HAG', Zech: 'ZEC', Mal: 'MAL', Matt: 'MAT',
  Mark: 'MRK', Luke: 'LUK', John: 'JHN', Acts: 'ACT', Rom: 'ROM', '1Cor': '1CO',
  '2Cor': '2CO', Gal: 'GAL', Eph: 'EPH', Phil: 'PHP', Col: 'COL', '1Thess': '1TH',
  '2Thess': '2TH', '1Tim': '1TI', '2Tim': '2TI', Titus: 'TIT', Phlm: 'PHM',
  Heb: 'HEB', Jas: 'JAS', '1Pet': '1PE', '2Pet': '2PE', '1John': '1JN',
  '2John': '2JN', '3John': '3JN', Jude: 'JUD', Rev: 'REV',
}

function chapterReferenceForAudio(verse: Verse): string {
  const usfmBook = OSIS_TO_USFM[verse.book] ?? verse.book.toUpperCase()
  return `${usfmBook}.${verse.chapter}`
}

function pickAudioUrl(audio: YouVersionAudioChapter): { url: string; title: string } | undefined {
  const entry = audio.audio?.[0]
  if (!entry) return undefined
  const urls = entry.download_urls ?? {}
  const url = urls.format_mp3_64k ?? urls.format_mp3_128k ?? urls.format_mp3_32k
    ?? urls.format_aac_64k ?? urls.format_aac_128k ?? urls.format_aac_32k
  if (!url) return undefined
  const secureUrl = url.startsWith('//') ? `https:${url}` : url.replace(/^http:/, 'https:')
  return { url: secureUrl, title: entry.title ?? 'Audio Bible' }
}

const WORD_STUDY_STOPWORDS = new Set([
  'the', 'and', 'that', 'with', 'from', 'have', 'this', 'unto', 'they', 'there', 'their', 'shall', 'which', 'will',
  'were', 'when', 'then', 'them', 'into', 'upon', 'what', 'your', 'thou', 'thee', 'his', 'her', 'for', 'but', 'not',
  'are', 'all', 'had', 'has', 'was', 'who', 'out', 'him', 'she', 'our', 'you', 'its', 'thy', 'may', 'one', 'two',
  'god', 'lord', 'jesus', 'christ', 'said', 'say', 'saith', 'also', 'can', 'could', 'would', 'should', 'been', 'being',
  'here', 'very', 'more', 'most', 'much', 'many', 'after', 'before', 'over', 'under', 'a', 'an', 'as', 'at', 'by', 'he',
  'in', 'is', 'it', 'of', 'on', 'or', 'so', 'to', 'up', 'us', 'we', 'be', 'no', 'if', 'my', 'oh', 'go', 'do', 'did',
])

function interestingVerseWords(text: string, limit = 6): string[] {
  const seen = new Set<string>()
  const words: string[] = []
  const matches = text.toLowerCase().match(/[a-z']{3,}/g) ?? []
  for (const word of matches) {
    const base = word.replace(/'s?$/, '')
    if (WORD_STUDY_STOPWORDS.has(base) || seen.has(base)) continue
    seen.add(base)
    words.push(base)
    if (words.length >= limit) break
  }
  return words
}

const VERSE_PARAM = 'verse'

function parseHash(): { tab?: Tab; verseId?: string } {
  const params = new URLSearchParams(window.location.hash.replace(/^#/, ''))
  return {
    verseId: params.get(VERSE_PARAM) ?? undefined,
  }
}

function serializeHash(verseId: string | null | undefined): string {
  const params = new URLSearchParams()
  if (verseId) params.set(VERSE_PARAM, verseId)
  return params.toString()
}

const BRANDING_ASSET_VERSION = '20260805g'
const YOUVERSION_APP_KEY = import.meta.env.VITE_YVP_APP_KEY?.trim() ?? ''

export default function App() {
  const { t, language, setLanguage } = useI18n()
  const [theme, setTheme] = useState<'dark' | 'light'>(() => {
    const saved = localStorage.getItem('bible-study-theme') as 'dark' | 'light' | null
    if (saved === 'dark' || saved === 'light') return saved
    return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark'
  })
  const [tab, setTab] = useState<Tab>('search')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [query, setQuery] = useState('')
  const [headerQuery, setHeaderQuery] = useState(query)
  useEffect(() => setHeaderQuery(query), [query])
  const [results, setResults] = useState<{ verse: Verse; score: number }[]>([])
  const [yvSearchResults, setYvSearchResults] = useState<YouVersionSearchHit[]>([])
  const [yvSearchLoading, setYvSearchLoading] = useState(false)
  const [yvSearchError, setYvSearchError] = useState('')
  const [audioUrl, setAudioUrl] = useState('')
  const [audioTitle, setAudioTitle] = useState('')
  const [audioLoading, setAudioLoading] = useState(false)
  const [audioError, setAudioError] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(() => parseHash().verseId ?? null)
  const [hoveredId, setHoveredId] = useState<string | null>(null)
  const [recentSearches, setRecentSearches] = useState<RecentSearch[]>(getRecentSearches())
  const [bookmarks, setBookmarks] = useState<BookmarkType[]>(getBookmarks())
  const [copiedUrl, setCopiedUrl] = useState(false)
  const [audioPlaying, setAudioPlaying] = useState(false)
  const audioRef = useRef<HTMLAudioElement | null>(null)

  const selected = useMemo(() => (selectedId ? findVerse(selectedId) : undefined), [selectedId])
  const hovered = useMemo(() => (hoveredId ? findVerse(hoveredId) : undefined), [hoveredId])
  const detailVerse = hovered ?? selected

  const handleShareUrl = () => {
    const url = window.location.href
    void navigator.clipboard.writeText(url).then(() => {
      setCopiedUrl(true)
      window.setTimeout(() => setCopiedUrl(false), 1500)
    })
  }

  const toggleAudio = () => {
    const audio = audioRef.current
    if (!audio || !audioUrl) return
    if (audio.paused) {
      void audio.play().then(() => setAudioPlaying(true)).catch((e) => setAudioError(String(e)))
    } else {
      audio.pause()
      setAudioPlaying(false)
    }
  }

  useEffect(() => {
    document.documentElement.dataset.theme = theme
    localStorage.setItem('bible-study-theme', theme)
  }, [theme])

  useEffect(() => {
    Promise.all([loadBible(), loadPlaces(), loadCharacters()])
      .then(([loadedVerses]) => {
        setLoading(false)
        if (!loadedVerses.length) setError(t('noData'))
      })
      .catch((e) => {
        setLoading(false)
        setError(String(e))
      })
  }, [])

  useEffect(() => {
    const next = serializeHash(selectedId)
    if (window.location.hash.replace(/^#/, '') !== next) {
      window.history.replaceState(null, '', next ? `#${next}` : window.location.pathname)
    }
  }, [selectedId])

  useEffect(() => {
    const onHashChange = () => {
      const { verseId } = parseHash()
      if (verseId !== undefined && verseId !== selectedId) setSelectedId(verseId || null)
    }
    window.addEventListener('hashchange', onHashChange)
    return () => window.removeEventListener('hashchange', onHashChange)
  }, [selectedId])

  useEffect(() => {
    setBookmarks(getBookmarks())
    setRecentSearches(getRecentSearches())
  }, [selectedId, tab])

  useEffect(() => {
    const refreshSavedContent = () => {
      setBookmarks(getBookmarks())
      setRecentSearches(getRecentSearches())
    }

    refreshSavedContent()
    window.addEventListener('bible-study-storage-hydrated', refreshSavedContent)
    window.addEventListener('storage', refreshSavedContent)
    return () => {
      window.removeEventListener('bible-study-storage-hydrated', refreshSavedContent)
      window.removeEventListener('storage', refreshSavedContent)
    }
  }, [])

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (user) {
        void syncUserData(user.uid).catch(() => {})
      } else {
        clearCurrentUser()
      }
    })
    return unsubscribe
  }, [])

  useEffect(() => {
    if (tab !== 'search') {
      setHoveredId(null)
    }
  }, [tab])

  useEffect(() => {
    const trimmed = query.trim()
    if (!trimmed) {
      setResults([])
      return
    }
    const found = searchBible(trimmed)
    setResults(found.slice(0, 100))
  }, [query])

  useEffect(() => {
    const trimmed = query.trim()
    if (!trimmed || trimmed.length < 3) {
      setYvSearchResults([])
      setYvSearchError('')
      return
    }
    let cancelled = false
    const timeout = window.setTimeout(() => {
      setYvSearchLoading(true)
      setYvSearchError('')
      const savedVersion = Number(window.localStorage.getItem('bible-study-yv-version'))
      const versionId = Number.isFinite(savedVersion) && savedVersion > 0 ? savedVersion : 1
      fetchYouVersionSearch(trimmed, versionId, { perPage: 10 })
        .then((hits) => {
          if (cancelled) return
          setYvSearchResults(hits)
        })
        .catch((error) => {
          if (cancelled) return
          setYvSearchError(error instanceof Error ? error.message : String(error))
        })
        .finally(() => {
          if (!cancelled) setYvSearchLoading(false)
        })
    }, 400)
    return () => {
      cancelled = true
      window.clearTimeout(timeout)
      setYvSearchLoading(false)
    }
  }, [query])

  useEffect(() => {
    if (!selected) {
      setAudioUrl('')
      setAudioTitle('')
      setAudioError('')
      return
    }
    let cancelled = false
    setAudioLoading(true)
    setAudioError('')
    const savedVersion = Number(window.localStorage.getItem('bible-study-yv-version'))
    const versionId = Number.isFinite(savedVersion) && savedVersion > 0 ? savedVersion : 1
    fetchYouVersionAudioChapter(versionId, chapterReferenceForAudio(selected))
      .then((audio) => {
        if (cancelled) return
        const picked = pickAudioUrl(audio)
        if (picked) {
          setAudioUrl(picked.url)
          setAudioTitle(`${picked.title} — ${selected.bookName} ${selected.chapter}`)
        } else {
          setAudioError('No audio available for this chapter.')
        }
      })
      .catch((error) => {
        if (cancelled) return
        setAudioError(error instanceof Error ? error.message : String(error))
      })
      .finally(() => {
        if (!cancelled) setAudioLoading(false)
      })
    return () => {
      cancelled = true
      setAudioLoading(false)
    }
  }, [selected])

  const runSearch = (q: string) => {
    setQuery(q)
    setTab('search')
  }

  // Log a recent search only once the user actually picks a verse from the
  // results, so the list shows what they were looking for, not every keystroke.
  const recordSearchSelection = (verseId: string, searchQuery: string) => {
    setSelectedId(verseId)
    setTab('reader')
    const verse = findVerse(verseId)
    if (!verse || !searchQuery.trim()) return
    addRecentSearch({
      query: searchQuery,
      verseId,
      reference: `${verse.bookName} ${verse.chapter}:${verse.verse}`,
    })
    setRecentSearches(getRecentSearches())
  }

  const handleBookmark = (id: string) => {
    toggleBookmark(id)
    setBookmarks(getBookmarks())
  }

  const openVerseInReader = (id: string) => {
    setSelectedId(id)
    setTab('reader')
  }

  const verseLexiconMatches = useMemo(() => {
    if (!detailVerse) return []
    return interestingVerseWords(detailVerse.text)
      .map((word) => ({ word, entry: lookupLexicon(word) }))
      .filter((match): match is { word: string; entry: import('./types').LexiconEntry } => Boolean(match.entry))
  }, [detailVerse])

  return (
    <div className="app">
      <audio ref={audioRef} src={audioUrl} onEnded={() => setAudioPlaying(false)} onPause={() => setAudioPlaying(false)} onPlay={() => setAudioPlaying(true)} />
      <header>
        <h1>
          <img
            className="brand-wordmark"
            src={theme === 'dark'
              ? `/branding/tan/wordmark-192.png?v=${BRANDING_ASSET_VERSION}`
              : `/branding/green/wordmark-192.png?v=${BRANDING_ASSET_VERSION}`}
            srcSet={
              theme === 'dark'
                ? `/branding/tan/wordmark-64.png?v=${BRANDING_ASSET_VERSION} 1x, /branding/tan/wordmark-128.png?v=${BRANDING_ASSET_VERSION} 2x, /branding/tan/wordmark-192.png?v=${BRANDING_ASSET_VERSION} 3x`
                : `/branding/green/wordmark-64.png?v=${BRANDING_ASSET_VERSION} 1x, /branding/green/wordmark-128.png?v=${BRANDING_ASSET_VERSION} 2x, /branding/green/wordmark-192.png?v=${BRANDING_ASSET_VERSION} 3x`
            }
            alt={t('appTitle')}
            height={64}
          />
        </h1>
        <div className="tabs">
          <button className={`tab ${tab === 'search' ? 'active' : ''}`} onClick={() => setTab('search')}>
            <Search size={16} /> {t('search')}
          </button>
          <button className={`tab ${tab === 'reader' ? 'active' : ''}`} onClick={() => setTab('reader')}>
            <BookOpen size={16} /> {t('reader')}
          </button>
          <button className={`tab ${tab === 'network' ? 'active' : ''}`} onClick={() => setTab('network')}>
            <Share2 size={16} /> {t('network')}
          </button>
          <button className={`tab ${tab === 'map' ? 'active' : ''}`} onClick={() => setTab('map')}>
            <MapIcon size={16} /> {t('map')}
          </button>
          <button className={`tab ${tab === 'lexicon' ? 'active' : ''}`} onClick={() => setTab('lexicon')}>
            <Book size={16} /> {t('words')}
          </button>
        </div>
        <div className="header-tools">
          <form
            className="header-search"
            onSubmit={(e) => {
              e.preventDefault()
              const trimmed = headerQuery.trim()
              if (!trimmed) return
              runSearch(trimmed)
            }}
          >
            <button type="submit" className="header-search-submit" aria-label={t('search')}>
              <Search size={16} />
            </button>
            <input
              type="text"
              enterKeyHint="search"
              placeholder={t('searchPlaceholder')}
              value={headerQuery}
              onChange={(e) => setHeaderQuery(e.target.value)}
            />
            {headerQuery && (
              <button
                type="button"
                className="header-search-clear"
                onClick={() => {
                  setHeaderQuery('')
                  setQuery('')
                }}
                aria-label={t('delete')}
              >
                <X size={14} />
              </button>
            )}
          </form>
          <button onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')} title={theme === 'dark' ? t('lightMode') : t('darkMode')}>
            {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
          </button>
          <button onClick={() => setLanguage(language === 'en' ? 'es' : 'en')} title={t('language')}>
            <Globe size={18} /> {language.toUpperCase()}
          </button>
          <button onClick={handleShareUrl} title={copiedUrl ? t('copied') : t('copyUrl')}>
            {copiedUrl ? <Check size={18} /> : <Link size={18} />}
          </button>
          {selected && (
            <button
              onClick={toggleAudio}
              title={audioTitle || 'Audio Bible'}
              className={audioUrl ? 'audio-ready' : audioLoading ? 'audio-loading' : 'audio-unavailable'}
              disabled={audioLoading || !audioUrl}
            >
              {audioLoading ? <Loader2 className="spin" size={18} /> : audioPlaying ? <Pause size={18} /> : <Volume2 size={18} />}
            </button>
          )}
          <AuthSignOutButton />
        </div>
      </header>

      {loading ? (
        <div className="panel empty" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <Loader2 className="spin" size={20} /> {t('loading')}
        </div>
      ) : error ? (
        <div className="panel empty">{error}</div>
      ) : (
        <main>
          {tab === 'search' && (
            <SearchTab
              query={query}
              onQuery={setQuery}
              onSearch={runSearch}
              results={results}
              yvSearchResults={yvSearchResults}
              yvSearchLoading={yvSearchLoading}
              yvSearchError={yvSearchError}
              selectedId={selectedId}
              onSelect={openVerseInReader}
              onHoverVerse={setHoveredId}
              onSelectResult={recordSearchSelection}
              bookmarks={bookmarks}
              onToggleBookmark={handleBookmark}
              recentSearches={recentSearches}
            />
          )}
          {tab === 'reader' && (
            YOUVERSION_APP_KEY ? (
              <YouVersionProvider appKey={YOUVERSION_APP_KEY} theme={theme} includeAuth={true} authRedirectUrl={getYouVersionRedirectUrl()}>
                <YouVersionReaderTab
                  selectedId={selectedId}
                  onSelect={setSelectedId}
                />
              </YouVersionProvider>
            ) : (
              <div className="panel empty">Missing YouVersion app key. Add `VITE_YVP_APP_KEY` to `web/.env.local`.</div>
            )
          )}
          {tab === 'network' && (
            <NetworkTab
              selectedVerse={selected}
              fallbackVerse={results[0]?.verse ?? getAllVerses()[0]}
              onSelect={setSelectedId}
              selectedId={selectedId}
              theme={theme}
            />
          )}
          {tab === 'map' && (
            <MapTab selectedVerse={selected} onSelect={setSelectedId} selectedId={selectedId} theme={theme} />
          )}

          {tab === 'lexicon' && (
            <LexiconTab onSelect={(id) => { setSelectedId(id); setTab('search') }} />
          )}

          {tab === 'search' && (
            <aside className="sidebar verse-sidebar">
              {detailVerse ? (
                <>
                  <section className="detail-card detail-card-hero">
                    <div className="verse-ref">
                      {detailVerse!.bookName} {detailVerse!.chapter}:{detailVerse!.verse} ({detailVerse!.translation.toUpperCase()})
                    </div>
                    <div className="verse-text">{detailVerse!.text}</div>
                    <div className="detail-actions-row">
                      <span className="verse-meta-pill">{hovered ? 'Hover preview' : t('selectVerse')}</span>
                      <button onClick={() => handleBookmark(detailVerse!.id)}>
                        {isBookmarked(detailVerse!.id) ? t('unbookmark') : t('bookmark')}
                      </button>
                    </div>
                  </section>

                  <section className="detail-card">
                    <h4 className="section-title">{t('curated')}</h4>
                    {verseLexiconMatches.length > 0 ? (
                      <div className="word-study-list">
                        {verseLexiconMatches.map(({ word, entry }) => (
                          <details key={word} className="word-study-entry">
                            <summary>
                              <strong>{entry.word}</strong>
                              <span>{entry.kjvMeaning}</span>
                            </summary>
                            <p>{entry.modernMeaning}. {entry.historicalContext}</p>
                          </details>
                        ))}
                      </div>
                    ) : (
                      <div className="meaning-box">
                        <p>{getCuratedMeaning(query || 'God')}</p>
                      </div>
                    )}
                  </section>

                  <section className="detail-card">
                    <h4 className="section-title">{t('aiInsight')}</h4>
                    <div className="meaning-box meaning-box-highlight">
                      <p>{generateInsight(detailVerse!, getCrossReferences(detailVerse!))}</p>
                    </div>
                  </section>

                  <section className="detail-card">
                    <h4 className="section-title">{t('related')}</h4>
                    <div className="verse-list">
                      {getCrossReferences(detailVerse!).slice(0, 8).map((v) => (
                        <div key={v.id} className="verse-card" onClick={() => setSelectedId(v.id)}>
                          <div className="verse-ref">{v.bookName} {v.chapter}:{v.verse}</div>
                          <div className="verse-text">{v.text.slice(0, 120)}{v.text.length > 120 ? '…' : ''}</div>
                        </div>
                      ))}
                    </div>
                  </section>
                </>
              ) : (
                <div className="detail-empty">
                  <div>
                    <h4 className="section-title">{t('selectVerse')}</h4>
                    <p>Hover over a verse to preview its details here.</p>
                  </div>
                </div>
              )}
            </aside>
          )}
        </main>
      )}
    </div>
  )
}

function escapeRegExp(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function Highlight({ text, query }: { text: string; query: string }) {
  if (!query.trim()) return <span>{text}</span>
  const terms = query.split(/\s+/).filter(Boolean).map(escapeRegExp)
  if (!terms.length) return <span>{text}</span>
  const splitRe = new RegExp(`\\b(${terms.join('|')})\\b`, 'gi')
  const matchRe = new RegExp(`\\b(${terms.join('|')})\\b`, 'i')
  const parts = text.split(splitRe)
  return (
    <span>
      {parts.map((part, i) =>
        matchRe.test(part) ? <mark key={i}>{part}</mark> : <span key={i}>{part}</span>
      )}
    </span>
  )
}

type ReaderChapter = {
  chapter: number
  verses: Verse[]
}

type ReaderBook = {
  book: string
  bookName: string
  chapters: ReaderChapter[]
}

function groupVersesByBook(verses: Verse[]): ReaderBook[] {
  const books = new Map<string, ReaderBook>()

  for (const verse of verses) {
    let book = books.get(verse.book)
    if (!book) {
      book = { book: verse.book, bookName: verse.bookName, chapters: [] }
      books.set(verse.book, book)
    }

    let chapter = book.chapters.find((c) => c.chapter === verse.chapter)
    if (!chapter) {
      chapter = { chapter: verse.chapter, verses: [] }
      book.chapters.push(chapter)
    }

    chapter.verses.push(verse)
  }

  return Array.from(books.values()).map((book) => ({
    ...book,
    chapters: book.chapters
      .map((chapter) => ({
        ...chapter,
        verses: chapter.verses.slice().sort((a, b) => a.verse - b.verse),
      }))
      .sort((a, b) => a.chapter - b.chapter),
  }))
}

function ReaderTab({
  selectedId,
  onSelect,
}: {
  selectedId: string | null
  onSelect: (id: string) => void
}) {
  const { t } = useI18n()
  const all = getAllVerses()
  const books = useMemo(() => groupVersesByBook(all), [all])
  const selectedVerse = selectedId ? all.find((v) => v.id === selectedId) : undefined
  const [bookKey, setBookKey] = useState(selectedVerse?.book ?? books[0]?.book ?? '')
  const [chapter, setChapter] = useState(selectedVerse?.chapter ?? books[0]?.chapters[0]?.chapter ?? 1)

  const currentBook = books.find((b) => b.book === bookKey) ?? books[0]
  const chapters = currentBook?.chapters ?? []
  const currentChapter = chapters.find((c) => c.chapter === chapter) ?? chapters[0]
  const verses = currentChapter?.verses ?? []
  const chapterIndex = chapters.findIndex((c) => c.chapter === chapter)
  const bookIndex = books.findIndex((b) => b.book === (currentBook?.book ?? ''))

  const goPrevious = () => {
    if (!currentBook || !chapters.length) return
    if (chapterIndex > 0) {
      setChapter(chapters[chapterIndex - 1].chapter)
      return
    }
    if (bookIndex > 0) {
      const previousBook = books[bookIndex - 1]
      const lastChapter = previousBook.chapters[previousBook.chapters.length - 1]
      setBookKey(previousBook.book)
      setChapter(lastChapter.chapter)
    }
  }

  const goNext = () => {
    if (!currentBook || !chapters.length) return
    if (chapterIndex >= 0 && chapterIndex < chapters.length - 1) {
      setChapter(chapters[chapterIndex + 1].chapter)
      return
    }
    if (bookIndex >= 0 && bookIndex < books.length - 1) {
      const nextBook = books[bookIndex + 1]
      setBookKey(nextBook.book)
      setChapter(nextBook.chapters[0].chapter)
    }
  }

  if (!books.length) {
    return <div className="panel empty">{t('loading')}</div>
  }

  return (
    <div className="panel reader-layout">
      <div className="reader-toolbar">
        <div className="reader-field">
          <label htmlFor="reader-book">{t('book')}</label>
          <select
            id="reader-book"
            value={currentBook?.book ?? ''}
            onChange={(e) => {
              const nextBook = books.find((b) => b.book === e.target.value)
              setBookKey(e.target.value)
              setChapter(nextBook?.chapters[0]?.chapter ?? 1)
            }}
          >
            {books.map((book) => (
              <option key={book.book} value={book.book}>
                {book.bookName}
              </option>
            ))}
          </select>
        </div>

        <div className="reader-field">
          <label htmlFor="reader-chapter">{t('chapter')}</label>
          <select
            id="reader-chapter"
            value={currentChapter?.chapter ?? chapter}
            onChange={(e) => setChapter(Number(e.target.value))}
          >
            {chapters.map((chapterOption) => (
              <option key={chapterOption.chapter} value={chapterOption.chapter}>
                {chapterOption.chapter}
              </option>
            ))}
          </select>
        </div>

        <div className="reader-controls">
          <button className="secondary" onClick={goPrevious} disabled={!currentBook}>
            ← {t('previousChapter')}
          </button>
          <button className="secondary" onClick={goNext} disabled={!currentBook}>
            {t('nextChapter')} →
          </button>
        </div>
      </div>

      <div className="reader-summary">
        <div>
          <strong>{currentBook?.bookName ?? t('reader')}</strong> {currentChapter?.chapter ?? chapter}
        </div>
        <div>{t('readerHint')}</div>
      </div>

      <div className="reader-content">
        {verses.length === 0 ? (
          <div className="empty">{t('readerEmpty')}</div>
        ) : (
          verses.map((verse) => (
            <div
              key={verse.id}
              className={`reader-verse ${selectedId === verse.id ? 'active' : ''}`}
              onClick={() => onSelect(verse.id)}
            >
              <div className="reader-verse-number">{verse.verse}</div>
              <div className="reader-verse-text">{verse.text}</div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}

function SearchTab({
  query,
  onQuery,
  onSearch,
  results,
  yvSearchResults,
  yvSearchLoading,
  yvSearchError,
  selectedId,
  onSelect,
  onHoverVerse,
  onSelectResult,
  bookmarks,
  onToggleBookmark,
  recentSearches,
}: {
  query: string
  onQuery: (q: string) => void
  onSearch: (q: string) => void
  results: { verse: Verse; score: number }[]
  yvSearchResults: YouVersionSearchHit[]
  yvSearchLoading: boolean
  yvSearchError: string
  selectedId: string | null
  onSelect: (id: string) => void
  onHoverVerse: (id: string | null) => void
  onSelectResult: (id: string, query: string) => void
  bookmarks: BookmarkType[]
  onToggleBookmark: (id: string) => void
  recentSearches: RecentSearch[]
}) {
  const { t } = useI18n()
  const bookmarked = new Set(bookmarks.map((b) => b.verseId))
  const [mode, setMode] = useState<'bookmarks' | 'search'>('search')
  const all = getAllVerses()

  useEffect(() => {
    if (query.trim()) setMode('search')
  }, [query])

  const bookmarkedVerses = useMemo(
    () => bookmarks
      .map((b) => all.find((v) => v.id === b.verseId))
      .filter((v): v is Verse => Boolean(v)),
    [all, bookmarks],
  )

  const showingBookmarks = mode === 'bookmarks'
  const listVerses = showingBookmarks ? bookmarkedVerses : results.map((r) => r.verse)

  return (
    <div className="panel">
      <div className="search-header">
        <div className="search-mode-toggle">
          <button
            className={`search-mode-btn ${!showingBookmarks ? 'active' : ''}`}
            onClick={() => setMode('search')}
          >
            <Search size={14} /> {t('search')}
          </button>
          <button
            className={`search-mode-btn ${showingBookmarks ? 'active' : ''}`}
            onClick={() => setMode('bookmarks')}
          >
            <Bookmark size={14} /> {t('bookmarks')}
          </button>
        </div>
        <div className="search-bar">
          <Search className="search-icon" size={18} />
          <input
            type="text"
            placeholder={t('searchPlaceholder')}
            value={query}
            autoFocus
            onChange={(e) => onQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && onSearch(query)}
          />
          {query && (
            <button className="search-clear" onClick={() => { onQuery(''); setMode('search') }}>
              <X size={16} />
            </button>
          )}
        </div>
        {!showingBookmarks && (
          <div className="result-count">{t('resultCount', { count: String(results.length) })}</div>
        )}
      </div>
      <div className="verse-list">
        {showingBookmarks ? (
          listVerses.length === 0 ? (
            <div className="empty">{t('noBookmarks')}</div>
          ) : (
            listVerses.map((verse) => (
              <div
                key={verse.id}
                className={`verse-card ${selectedId === verse.id ? 'active' : ''}`}
                onClick={() => onSelect(verse.id)}
                onPointerEnter={() => onHoverVerse(verse.id)}
                onFocus={() => onHoverVerse(verse.id)}
              >
                <div className="verse-ref">
                  <span>{verse.bookName} {verse.chapter}:{verse.verse}</span>
                  <button
                    className="secondary"
                    onClick={(e) => { e.stopPropagation(); onToggleBookmark(verse.id) }}
                    aria-label={t('unbookmark')}
                  >
                    <Bookmark size={14} fill="currentColor" />
                  </button>
                </div>
                <div className="verse-text">{verse.text}</div>
              </div>
            ))
          )
        ) : results.length === 0 && query.trim() ? (
          <div className="empty">{t('noResults')}</div>
        ) : !query.trim() ? (
          <div className="recent-searches">
            <h4 className="section-title">{t('recentSearches')}</h4>
            {recentSearches.length === 0 ? (
              <div className="empty">{t('noRecentSearches')}</div>
            ) : (
              <div className="recent-search-list">
                {recentSearches.map((recent) => {
                  const verse = findVerse(recent.verseId)
                  if (!verse) return null
                  return (
                    <div
                      key={recent.id}
                      className={`verse-card ${selectedId === verse.id ? 'active' : ''}`}
                      onClick={() => { onQuery(recent.query); onSelectResult(recent.verseId, recent.query) }}
                      onPointerEnter={() => onHoverVerse(verse.id)}
                      onFocus={() => onHoverVerse(verse.id)}
                    >
                      <div className="verse-ref">
                        <span>{verse.bookName} {verse.chapter}:{verse.verse}</span>
                        <button
                          className="secondary"
                          onClick={(e) => { e.stopPropagation(); onToggleBookmark(verse.id) }}
                          aria-label={bookmarked.has(verse.id) ? t('unbookmark') : t('bookmark')}
                        >
                          {bookmarked.has(verse.id) ? <Bookmark size={14} fill="currentColor" /> : <Bookmark size={14} />}
                        </button>
                      </div>
                      <div className="verse-text">{verse.text}</div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        ) : (
          results.map(({ verse }) => (
            <div
              key={verse.id}
              className={`verse-card ${selectedId === verse.id ? 'active' : ''}`}
              onClick={() => onSelectResult(verse.id, query)}
              onPointerEnter={() => onHoverVerse(verse.id)}
              onFocus={() => onHoverVerse(verse.id)}
            >
              <div className="verse-ref">
                <span>{verse.bookName} {verse.chapter}:{verse.verse}</span>
                <button
                  className="secondary"
                  onClick={(e) => { e.stopPropagation(); onToggleBookmark(verse.id) }}
                  aria-label={bookmarked.has(verse.id) ? t('unbookmark') : t('bookmark')}
                >
                  {bookmarked.has(verse.id) ? <Bookmark size={14} fill="currentColor" /> : <Bookmark size={14} />}
                </button>
              </div>
              <div className="verse-text">
                <Highlight text={verse.text} query={query} />
              </div>
            </div>
          ))
        )}

      </div>
    </div>
  )
}

type NetworkKind = 'center' | 'related' | 'theme' | 'echo' | 'ambient' | 'book' | 'chapter'

type NetworkNode = {
  id: string
  kind: NetworkKind
  label: string
  detail: string
  x: number
  y: number
  z: number
  size: number
  verse?: Verse
  score?: number
  tier?: 'strong' | 'medium' | 'soft'
  jumpVerseId?: string
  parentId?: string
  bookId?: string
  bookName?: string
  chapterNumber?: number
}

// Canonical Bible book order (Protestant canon, 66 books). Used to sort the
// network map hierarchy by book -> chapter -> verse instead of alphabetically.
const CANONICAL_BOOK_ORDER = [
  'Gen', 'Exod', 'Lev', 'Num', 'Deut', 'Josh', 'Judg', 'Ruth', '1Sam', '2Sam',
  '1Kgs', '2Kgs', '1Chr', '2Chr', 'Ezra', 'Neh', 'Esth', 'Job', 'Ps', 'Prov',
  'Eccl', 'Song', 'Isa', 'Jer', 'Lam', 'Ezek', 'Dan', 'Hos', 'Joel', 'Amos',
  'Obad', 'Jonah', 'Mic', 'Nah', 'Hab', 'Zeph', 'Hag', 'Zech', 'Mal',
  'Matt', 'Mark', 'Luke', 'John', 'Acts', 'Rom', '1Cor', '2Cor', 'Gal', 'Eph',
  'Phil', 'Col', '1Thess', '2Thess', '1Tim', '2Tim', 'Titus', 'Phlm', 'Heb',
  'Jas', '1Pet', '2Pet', '1John', '2John', '3John', 'Jude', 'Rev',
]

function canonicalBookIndex(book: string) {
  const index = CANONICAL_BOOK_ORDER.indexOf(book)
  return index === -1 ? CANONICAL_BOOK_ORDER.length : index
}

type NetworkEdgeKind = 'spoke' | 'bridge' | 'theme'

type NetworkEdge = {
  id: string
  source: string
  target: string
  weight: number
  kind: NetworkEdgeKind
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

function hashString(input: string) {
  let hash = 0
  for (let i = 0; i < input.length; i += 1) {
    hash = (hash * 31 + input.charCodeAt(i)) % 3600
  }
  return hash
}

function toSvgPoint(node: { x: number; y: number }) {
  return {
    x: (node.x / 100) * 1000,
    y: (node.y / 100) * 640,
  }
}

type Camera = {
  x: number
  y: number
  scale: number
  rotation: number
  rotationX: number
  rotationY: number
  rotationZ: number
}

type Point = {
  x: number
  y: number
}

type ProjectedPoint = Point & {
  scale: number
  blur: number
  opacity: number
  depth: number
}

function normalizeAngle(rotation: number) {
  const wrapped = ((rotation + 180) % 360 + 360) % 360 - 180
  return wrapped
}

function normalizeRotation(rotation: number) {
  return normalizeAngle(rotation)
}

function clampScale(scale: number) {
  return clamp(scale, 0.72, 4.2)
}

function pointFromEvent(event: { clientX: number; clientY: number }, rect: DOMRect): Point {
  return {
    x: event.clientX - rect.left,
    y: event.clientY - rect.top,
  }
}

function screenPointToLocal(camera: Camera, point: Point): Point {
  const radians = (camera.rotation * Math.PI) / 180
  const cos = Math.cos(radians)
  const sin = Math.sin(radians)
  const dx = point.x - camera.x
  const dy = point.y - camera.y
  return {
    x: (dx * cos + dy * sin) / camera.scale,
    y: (-dx * sin + dy * cos) / camera.scale,
  }
}

function focusCameraOnLocalPoint(camera: Camera, focusScreen: Point, focusLocal: Point, nextScale: number, nextRotation: number): Camera {
  const radians = (nextRotation * Math.PI) / 180
  const cos = Math.cos(radians)
  const sin = Math.sin(radians)
  const transformedX = focusLocal.x * nextScale * cos - focusLocal.y * nextScale * sin
  const transformedY = focusLocal.x * nextScale * sin + focusLocal.y * nextScale * cos
  return {
    ...camera,
    x: focusScreen.x - transformedX,
    y: focusScreen.y - transformedY,
    scale: nextScale,
    rotation: nextRotation,
    rotationX: camera.rotationX,
    rotationY: camera.rotationY,
    rotationZ: nextRotation,
  }
}

function projectNetworkPoint(
  node: { x: number; y: number; z: number },
  camera: Camera,
  stage: Point,
  focus: { x: number; y: number; z: number },
): ProjectedPoint {
  const centerX = stage.x / 2
  const centerY = stage.y / 2
  const focusX = (focus.x / 100) * stage.x
  const focusY = (focus.y / 100) * stage.y
  const worldX = (node.x / 100) * stage.x - focusX
  const worldY = (node.y / 100) * stage.y - focusY
  const worldZ = node.z - focus.z

  const yaw = (camera.rotationY * Math.PI) / 180
  const pitch = (camera.rotationX * Math.PI) / 180
  const roll = (camera.rotationZ * Math.PI) / 180

  const cosY = Math.cos(yaw)
  const sinY = Math.sin(yaw)
  const cosX = Math.cos(pitch)
  const sinX = Math.sin(pitch)
  const cosZ = Math.cos(roll)
  const sinZ = Math.sin(roll)

  const yawX = worldX * cosY + worldZ * sinY
  const yawZ = -worldX * sinY + worldZ * cosY
  const pitchY = worldY * cosX - yawZ * sinX
  const pitchZ = worldY * sinX + yawZ * cosX
  const rollX = yawX * cosZ - pitchY * sinZ
  const rollY = yawX * sinZ + pitchY * cosZ

  const depth = clamp((pitchZ + 180) / 360, 0, 1)
  const perspectiveScale = 0.9 + depth * 0.24
  const blur = 0
  const opacity = clamp(0.38 + depth * 0.62, 0.38, 1)

  return {
    x: centerX + camera.x + rollX * perspectiveScale * camera.scale,
    y: centerY + camera.y + rollY * perspectiveScale * camera.scale,
    scale: perspectiveScale * camera.scale,
    blur,
    opacity,
    depth: pitchZ,
  }
}

function focusCameraOnNode(node: { x: number; y: number; z: number }, camera: Camera, stage: Point, nextScale: number): Camera {
  return {
    ...camera,
    scale: nextScale,
  }
}

function midpoint(a: Point, b: Point): Point {
  return {
    x: (a.x + b.x) / 2,
    y: (a.y + b.y) / 2,
  }
}

function distance(a: Point, b: Point) {
  return Math.hypot(b.x - a.x, b.y - a.y)
}

function angleBetween(a: Point, b: Point) {
  return Math.atan2(b.y - a.y, b.x - a.x)
}

function buildNetworkNodes(centerVerse: Verse, relatedMatches: VerseMatch[], themes: NetworkTheme[]): NetworkNode[] {
  const allVerses = getAllVerses()
  const nodes: NetworkNode[] = [
    {
      id: `center-${centerVerse.id}`,
      kind: 'center',
      label: `${centerVerse.bookName} ${centerVerse.chapter}:${centerVerse.verse}`,
      detail: centerVerse.text.slice(0, 150),
      x: 50,
      y: 50,
      z: 0,
      size: 234,
      verse: centerVerse,
    },
  ]

  const relatedCount = Math.max(relatedMatches.length, 1)
  relatedMatches.forEach((match, index) => {
    const verse = match.verse
    const tier = match.score >= 32 ? 'strong' : match.score >= 24 ? 'medium' : 'soft'
    const baseAngle = (hashString(verse.id) / 3600) * Math.PI * 2
    const spread = (index / relatedCount) * Math.PI * 1.15
    const angle = baseAngle + spread
    const radius = tier === 'strong' ? 18 : tier === 'medium' ? 27 : 38
    const x = clamp(50 + Math.cos(angle) * radius, 10, 90)
    const y = clamp(50 + Math.sin(angle) * radius * (tier === 'soft' ? 0.9 : 1.03), 10, 90)

    nodes.push({
      id: verse.id,
      kind: 'related',
      label: `${verse.bookName} ${verse.chapter}:${verse.verse}`,
      detail: match.sharedTerms.slice(0, 3).join(' • ') || `${Math.round(match.score)} strength`,
      x,
      y,
      z: clamp(42 - index * 2.5, 12, 42),
      size: clamp(158 - index * 7, 102, 158),
      verse,
      score: match.score,
      tier,
    })
  })

  themes.forEach((theme, index) => {
    const angle = -Math.PI / 2 + (index / Math.max(themes.length, 1)) * Math.PI * 2
    const radius = 44 + Math.min(index * 2.2, 10)
    const jumpVerseId = relatedMatches.find((match) => match.sharedTerms.includes(theme.label))?.verse.id

    nodes.push({
      id: `theme-${theme.label}`,
      kind: 'theme',
      label: theme.label,
      detail: `${theme.count} verses`,
      x: clamp(50 + Math.cos(angle) * radius, 8, 92),
      y: clamp(50 + Math.sin(angle) * radius, 8, 92),
      z: clamp(24 + index * 3, 10, 48),
      size: clamp(118 - index * 5, 84, 118),
      score: theme.weight,
      jumpVerseId,
    })
  })

  const occupied = new Set(nodes.map((node) => node.verse?.id).filter((id): id is string => Boolean(id)))
  relatedMatches.slice(0, 6).forEach((match, parentIndex) => {
    const parentNode = nodes.find((node) => node.verse?.id === match.verse.id)
    if (!parentNode) return

    const echoes = getCrossReferenceMatches(match.verse, allVerses, 6)
      .filter((candidate) => !occupied.has(candidate.verse.id) && candidate.verse.id !== centerVerse.id)
      .slice(0, parentIndex < 3 ? 2 : 1)

    echoes.forEach((echo, echoIndex) => {
      const angle = (hashString(`${parentNode.id}:${echo.verse.id}`) / 3600) * Math.PI * 2
      const radius = 11 + parentIndex * 1.6 + echoIndex * 3.2
      const x = clamp(parentNode.x + Math.cos(angle) * radius, 4, 96)
      const y = clamp(parentNode.y + Math.sin(angle) * radius * 0.94, 4, 96)

      occupied.add(echo.verse.id)
      nodes.push({
        id: `echo-${echo.verse.id}`,
        kind: 'echo',
        label: `${echo.verse.bookName} ${echo.verse.chapter}:${echo.verse.verse}`,
        detail: echo.sharedTerms.slice(0, 2).join(' • ') || `${Math.round(echo.score)} echo`,
        x,
        y,
        z: clamp(58 + parentIndex * 2 + echoIndex * 4, 28, 82),
        size: clamp(92 - parentIndex * 3 - echoIndex * 5, 64, 92),
        verse: echo.verse,
        score: echo.score * 0.72,
        tier: 'soft',
        parentId: parentNode.id,
      })
    })
  })

  return nodes
}

function buildNetworkEdges(centerVerse: Verse, relatedMatches: VerseMatch[], themes: NetworkTheme[]): NetworkEdge[] {
  const allVerses = getAllVerses()
  const edges: NetworkEdge[] = []
  const occupied = new Set<string>([centerVerse.id])

  relatedMatches.slice(0, 6).forEach((match) => {
    occupied.add(match.verse.id)
  })

  relatedMatches.forEach((match) => {
    edges.push({
      id: `spoke-${centerVerse.id}-${match.verse.id}`,
      source: `center-${centerVerse.id}`,
      target: match.verse.id,
      weight: match.score,
      kind: 'spoke',
    })
  })

  for (let i = 0; i < relatedMatches.length; i += 1) {
    for (let j = i + 1; j < relatedMatches.length; j += 1) {
      const left = relatedMatches[i].verse
      const right = relatedMatches[j].verse
      const sameBook = left.book === right.book
      const sameChapter = sameBook && left.chapter === right.chapter
      const closeScore = Math.abs(relatedMatches[i].score - relatedMatches[j].score)

      if (sameChapter || (sameBook && closeScore <= 6) || (sameBook && j - i <= 2)) {
        edges.push({
          id: `bridge-${left.id}-${right.id}`,
          source: left.id,
          target: right.id,
          weight: sameChapter ? 1 : 0.7,
          kind: 'bridge',
        })
      }
    }
  }

  relatedMatches.slice(0, 6).forEach((match, parentIndex) => {
    const echoMatches = getCrossReferenceMatches(match.verse, allVerses, 6)
      .filter((candidate) => !occupied.has(candidate.verse.id) && candidate.verse.id !== centerVerse.id)
      .slice(0, parentIndex < 3 ? 2 : 1)

    echoMatches.forEach((echo) => {
      edges.push({
        id: `echo-${match.verse.id}-${echo.verse.id}`,
        source: match.verse.id,
        target: `echo-${echo.verse.id}`,
        weight: Math.max(0.3, echo.score * 0.45),
        kind: 'bridge',
      })
    })
  })

  themes.forEach((theme) => {
    const themeId = `theme-${theme.label}`
    relatedMatches.forEach((match) => {
      if (match.sharedTerms.includes(theme.label) || match.verse.text.toLowerCase().includes(theme.label.toLowerCase())) {
        edges.push({
          id: `theme-${theme.label}-${match.verse.id}`,
          source: match.verse.id,
          target: themeId,
          weight: theme.weight,
          kind: 'theme',
        })
      }
    })
  })

  return edges
}

function fibonacciSpherePoint(index: number, total: number, radius: number) {
  if (total <= 1) return { x: 0, y: 0, z: radius }
  const goldenAngle = Math.PI * (3 - Math.sqrt(5))
  const t = index / (total - 1)
  const yUnit = 1 - t * 2
  const radiusAtY = Math.sqrt(Math.max(0, 1 - yUnit * yUnit))
  const theta = goldenAngle * index
  return {
    x: Math.cos(theta) * radiusAtY * radius,
    y: yUnit * radius,
    z: Math.sin(theta) * radiusAtY * radius,
  }
}

function buildBibleHierarchyNodes(allVerses: Verse[]): NetworkNode[] {
  if (!allVerses.length) return []

  const bookOrder: string[] = []
  const bookSeen = new Set<string>()
  const bookNames = new Map<string, string>()
  const chaptersByBook = new Map<string, number[]>()
  const versesByBookChapter = new Map<string, Verse[]>()

  allVerses.forEach((verse) => {
    if (!bookSeen.has(verse.book)) {
      bookSeen.add(verse.book)
      bookOrder.push(verse.book)
      bookNames.set(verse.book, verse.bookName)
    }
    const chapters = chaptersByBook.get(verse.book) ?? []
    if (!chapters.includes(verse.chapter)) chapters.push(verse.chapter)
    chaptersByBook.set(verse.book, chapters)

    const key = `${verse.book}-${verse.chapter}`
    const verses = versesByBookChapter.get(key) ?? []
    verses.push(verse)
    versesByBookChapter.set(key, verses)
  })

  // Enforce canonical book order and numeric chapter/verse order regardless
  // of the order verses were loaded in.
  bookOrder.sort((a, b) => canonicalBookIndex(a) - canonicalBookIndex(b))
  chaptersByBook.forEach((chapters) => chapters.sort((a, b) => a - b))
  versesByBookChapter.forEach((verses) => verses.sort((a, b) => a.verse - b.verse))

  const nodes: NetworkNode[] = []
  const bookRadius = 800
  const chapterRadius = 150
  const verseRadius = 42

  bookOrder.forEach((book, bookIndex) => {
    const bookPos = fibonacciSpherePoint(bookIndex, bookOrder.length, bookRadius)
    const bookName = bookNames.get(book) ?? book
    const chapters = chaptersByBook.get(book) ?? []

    nodes.push({
      id: `book-${book}`,
      kind: 'book',
      label: bookName,
      detail: `${chapters.length} chapters`,
      x: bookPos.x,
      y: bookPos.y,
      z: bookPos.z,
      size: 40,
      bookId: book,
      bookName,
    })

    chapters.forEach((chapter, chapterIndex) => {
      const chapterOffset = fibonacciSpherePoint(chapterIndex, chapters.length, chapterRadius)
      const chapterPos = {
        x: bookPos.x + chapterOffset.x,
        y: bookPos.y + chapterOffset.y,
        z: bookPos.z + chapterOffset.z,
      }
      const key = `${book}-${chapter}`
      const verses = versesByBookChapter.get(key) ?? []

      nodes.push({
        id: `chapter-${key}`,
        kind: 'chapter',
        label: `${bookName} ${chapter}`,
        detail: `${verses.length} verses`,
        x: chapterPos.x,
        y: chapterPos.y,
        z: chapterPos.z,
        size: 18,
        parentId: `book-${book}`,
        bookId: book,
        bookName,
        chapterNumber: chapter,
      })

      verses.forEach((verse, verseIndex) => {
        const verseOffset = fibonacciSpherePoint(verseIndex, verses.length, verseRadius)
        nodes.push({
          id: verse.id,
          kind: 'ambient',
          label: `${verse.bookName} ${verse.chapter}:${verse.verse}`,
          detail: verse.text.slice(0, 90),
          x: chapterPos.x + verseOffset.x,
          y: chapterPos.y + verseOffset.y,
          z: chapterPos.z + verseOffset.z,
          size: 30,
          verse,
          parentId: `chapter-${key}`,
          bookId: book,
          bookName,
          chapterNumber: chapter,
        })
      })
    })
  })

  return nodes
}

function NetworkTab({
  selectedVerse,
  fallbackVerse,
  onSelect,
  selectedId,
  theme,
}: {
  selectedVerse?: Verse
  fallbackVerse?: Verse
  onSelect: (id: string) => void
  selectedId: string | null
  theme: 'dark' | 'light'
}) {
  const { t } = useI18n()
  const all = getAllVerses()
  const centerVerse = selectedVerse ?? fallbackVerse
  // Drill-down state for the book -> chapter -> verse hierarchy. Books are
  // always visible; chapters only appear for the focused book (narrowed to
  // the previous/next chapter once a specific chapter is focused); verses
  // only appear for the focused chapter.
  const [mapFocusBookId, setMapFocusBookId] = useState<string | null>(null)
  const [mapFocusChapter, setMapFocusChapter] = useState<number | null>(null)
  useEffect(() => {
    if (centerVerse) {
      setMapFocusBookId(centerVerse.book)
      setMapFocusChapter(centerVerse.chapter)
    }
  }, [centerVerse?.id])
  const canvasRef = useRef<HTMLDivElement | null>(null)
  const cameraRef = useRef<Camera>({ x: 0, y: 0, scale: 1, rotation: 0, rotationX: 0, rotationY: 0, rotationZ: 0 })
  const gestureRef = useRef<{
    mode: 'idle' | 'pan' | 'pinch' | 'orbit'
    pointers: Map<number, Point>
    startCamera: Camera
    startPoint?: Point
    startLocal?: Point
    startDistance?: number
    startAngle?: number
    startMidpoint?: Point
  }>({
    mode: 'idle',
    pointers: new Map(),
    startCamera: { x: 0, y: 0, scale: 1, rotation: 0, rotationX: 0, rotationY: 0, rotationZ: 0 },
  })
  const settleTimerRef = useRef<number | null>(null)
  const pendingZoomRef = useRef<{ scale: number; rotation: number } | null>(null)
  const [isInteracting, setIsInteracting] = useState(false)
  const [camera, setCamera] = useState<Camera>({ x: 0, y: 0, scale: 1, rotation: 0, rotationX: 0, rotationY: 0, rotationZ: 0 })
  const [canvasSize, setCanvasSize] = useState<Point>({ x: 1000, y: 640 })
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null)
  const [focusedNodeId, setFocusedNodeId] = useState<string | null>(null)

  const syncCamera = (next: Camera) => {
    cameraRef.current = next
    setCamera(next)
  }

  const settleInteraction = () => {
    if (settleTimerRef.current !== null) {
      window.clearTimeout(settleTimerRef.current)
    }
    settleTimerRef.current = window.setTimeout(() => {
      setIsInteracting(false)
      settleTimerRef.current = null
    }, 140)
  }

  const focusNodeWithZoom = (node: NetworkNode) => {
    const current = cameraRef.current
    const targetScale = node.kind === 'theme' ? 1.95 : node.kind === 'center' ? 1.45 : 2.1
    const nextScale = clampScale(Math.max(current.scale * 1.18, targetScale))
    pendingZoomRef.current = { scale: nextScale, rotation: current.rotation }
    syncCamera({ ...current, scale: nextScale })
    setIsInteracting(true)
    settleInteraction()
  }

  useEffect(() => {
    const container = canvasRef.current
    if (!container) return
    const observer = new ResizeObserver(() => {
      const rect = container.getBoundingClientRect()
      setCanvasSize({ x: rect.width, y: rect.height })
    })
    observer.observe(container)
    const rect = container.getBoundingClientRect()
    setCanvasSize({ x: rect.width, y: rect.height })
    return () => observer.disconnect()
  }, [])

  const relatedMatches = useMemo(
    () => (centerVerse ? getCrossReferenceMatches(centerVerse, all, 12) : []),
    [all, centerVerse],
  )

  const relatedVerses = useMemo(() => relatedMatches.map((match) => match.verse), [relatedMatches])

  const themes = useMemo(
    () => (centerVerse ? deriveNetworkThemes([centerVerse, ...relatedVerses], 6) : []),
    [centerVerse, relatedVerses],
  )

  const nodes = useMemo(
    () => (centerVerse ? buildNetworkNodes(centerVerse, relatedMatches, themes) : []),
    [centerVerse, relatedMatches, themes],
  )

  const edges = useMemo(
    () => (centerVerse ? buildNetworkEdges(centerVerse, relatedMatches, themes) : []),
    [centerVerse, relatedMatches, themes],
  )

  const ambientBibleNodes = useMemo(() => buildBibleHierarchyNodes(all), [all])

  const localVerseIds = useMemo(
    () => new Set(nodes.map((node) => node.verse?.id).filter((id): id is string => Boolean(id))),
    [nodes],
  )

  const visibleAmbientNodes = useMemo(
    () => ambientBibleNodes.filter((node) => {
      if (node.verse && localVerseIds.has(node.verse.id)) return false
      if (node.kind === 'book') return true
      if (node.kind === 'chapter') {
        if (!mapFocusBookId || node.bookId !== mapFocusBookId) return false
        if (mapFocusChapter == null) return true
        const chapterNumber = node.chapterNumber ?? 0
        return Math.abs(chapterNumber - mapFocusChapter) <= 1
      }
      if (node.kind === 'ambient') {
        return Boolean(mapFocusBookId && mapFocusChapter != null && node.bookId === mapFocusBookId && node.chapterNumber === mapFocusChapter)
      }
      return true
    }),
    [ambientBibleNodes, localVerseIds, mapFocusBookId, mapFocusChapter],
  )

  const sceneNodes = useMemo(() => [...visibleAmbientNodes, ...nodes], [nodes, visibleAmbientNodes])

  const nodeById = useMemo(() => new Map(nodes.map((node) => [node.id, node])), [nodes])
  const sceneNodeById = useMemo(() => new Map(sceneNodes.map((node) => [node.id, node])), [sceneNodes])

  const centerNode = useMemo(() => nodes.find((node) => node.kind === 'center'), [nodes])
  const selectedNode = useMemo(
    () => (selectedId ? nodes.find((node) => node.verse?.id === selectedId) : undefined),
    [nodes, selectedId],
  )
  const graphFocus = useMemo(() => {
    if (selectedNode) {
      return { x: selectedNode.x, y: selectedNode.y, z: selectedNode.z }
    }

    if (!nodes.length) {
      return { x: 50, y: 50, z: 0 }
    }

    const totals = nodes.reduce(
      (acc, node) => ({
        x: acc.x + node.x,
        y: acc.y + node.y,
        z: acc.z + node.z,
      }),
      { x: 0, y: 0, z: 0 },
    )

    return {
      x: totals.x / nodes.length,
      y: totals.y / nodes.length,
      z: totals.z / nodes.length,
    }
  }, [nodes, selectedNode])

  const projectedNodes = useMemo(
    () => nodes.map((node) => ({ node, projected: projectNetworkPoint(node, camera, canvasSize, graphFocus) })).sort((a, b) => a.projected.depth - b.projected.depth),
    [camera, canvasSize, graphFocus, nodes],
  )

  const projectedEdges = useMemo(
    () => edges.map((edge) => {
      const source = nodes.find((node) => node.id === edge.source)
      const target = nodes.find((node) => node.id === edge.target)
      if (!source || !target) return null
      return {
        edge,
        source: projectNetworkPoint(source, camera, canvasSize, graphFocus),
        target: projectNetworkPoint(target, camera, canvasSize, graphFocus),
      }
    }).filter((entry): entry is NonNullable<typeof entry> => Boolean(entry)),
    [camera, canvasSize, edges, graphFocus, nodes],
  )

  const focusedNode = useMemo(
    () => (hoveredNodeId ? sceneNodeById.get(hoveredNodeId) : focusedNodeId ? sceneNodeById.get(focusedNodeId) : selectedNode ?? centerNode),
    [centerNode, focusedNodeId, hoveredNodeId, sceneNodeById, selectedNode]
  )
  const focusedVerse = focusedNode?.verse ?? centerVerse
  const focusedMatch = focusedVerse ? relatedMatches.find((match) => match.verse.id === focusedVerse.id) : undefined
  const focusedTheme = focusedNode?.kind === 'theme' ? themes.find((theme) => theme.label === focusedNode.label) : undefined
  const themeMatches = focusedTheme ? relatedMatches.filter((match) => match.sharedTerms.includes(focusedTheme.label)) : []
  const strongestMatch = relatedMatches[0]

  const focusedCharacters = useMemo(
    () => (focusedVerse ? getCharactersForVerse(focusedVerse, 4) : []),
    [focusedVerse],
  )
  const focusedPlaces = useMemo(
    () => (focusedVerse ? getPlacesForVerse(focusedVerse, 4) : []),
    [focusedVerse],
  )
  const focusedCharacterTimeline = useMemo(() => {
    const character = focusedCharacters[0]
    return character ? getCharacterPath(character).slice(0, 4) : []
  }, [focusedCharacters])

  useEffect(() => {
    syncCamera({ ...cameraRef.current, x: 0, y: 0 })
    pendingZoomRef.current = null
  }, [graphFocus.x, graphFocus.y, graphFocus.z, centerVerse?.id])

  useEffect(() => {
    const handlePointerMove = (event: PointerEvent) => {
      const gesture = gestureRef.current
      if (!gesture.pointers.has(event.pointerId)) return
      const container = canvasRef.current
      if (!container) return
      const rect = container.getBoundingClientRect()
      const point = pointFromEvent(event, rect)
      gesture.pointers.set(event.pointerId, point)

      if (gesture.mode === 'pan' && gesture.startPoint) {
        const activePoint = gesture.pointers.get(event.pointerId) ?? point
        const deltaX = activePoint.x - gesture.startPoint.x
        const deltaY = activePoint.y - gesture.startPoint.y
        syncCamera({ ...gesture.startCamera, x: gesture.startCamera.x + deltaX, y: gesture.startCamera.y + deltaY })
        setIsInteracting(true)
        settleInteraction()
        return
      }

      if (gesture.mode === 'orbit' && gesture.startPoint) {
        const activePoint = gesture.pointers.get(event.pointerId) ?? point
        const deltaX = activePoint.x - gesture.startPoint.x
        const deltaY = activePoint.y - gesture.startPoint.y
        syncCamera({
          ...gesture.startCamera,
          rotationY: normalizeAngle(gesture.startCamera.rotationY + deltaX * 0.22),
          rotationX: clamp(gesture.startCamera.rotationX - deltaY * 0.18, -58, 58),
          rotationZ: gesture.startCamera.rotationZ + deltaX * 0.05,
        })
        setIsInteracting(true)
        settleInteraction()
        return
      }

      if (gesture.mode === 'pinch' && gesture.startLocal) {
        const points = Array.from(gesture.pointers.values())
        if (points.length < 2 || !gesture.startDistance || gesture.startAngle === undefined || !gesture.startMidpoint) return
        const currentMidpoint = midpoint(points[0], points[1])
        const currentDistance = distance(points[0], points[1])
        const currentAngle = angleBetween(points[0], points[1])
        const nextScale = clampScale(gesture.startCamera.scale * (currentDistance / gesture.startDistance))
        const twist = ((currentAngle - gesture.startAngle) * 180) / Math.PI
        const midpointDeltaX = currentMidpoint.x - gesture.startMidpoint.x
        const midpointDeltaY = currentMidpoint.y - gesture.startMidpoint.y
        syncCamera({
          ...focusCameraOnLocalPoint(gesture.startCamera, currentMidpoint, gesture.startLocal, nextScale, normalizeRotation(gesture.startCamera.rotation + twist)),
          rotationX: clamp(gesture.startCamera.rotationX - midpointDeltaY * 0.08, -58, 58),
          rotationY: normalizeAngle(gesture.startCamera.rotationY + midpointDeltaX * 0.08),
          rotationZ: normalizeRotation(gesture.startCamera.rotationZ + twist),
        })
        setIsInteracting(true)
        settleInteraction()
      }
    }

    const handlePointerUp = (event: PointerEvent) => {
      const gesture = gestureRef.current
      gesture.pointers.delete(event.pointerId)
      if (gesture.pointers.size >= 2) {
        const points = Array.from(gesture.pointers.values())
        const container = canvasRef.current
        if (!container) return
        const rect = container.getBoundingClientRect()
        const currentMidpoint = midpoint(points[0], points[1])
        gesture.mode = 'pinch'
        gesture.startCamera = cameraRef.current
        gesture.startMidpoint = currentMidpoint
        gesture.startDistance = distance(points[0], points[1])
        gesture.startAngle = angleBetween(points[0], points[1])
        gesture.startLocal = screenPointToLocal(cameraRef.current, currentMidpoint)
        setIsInteracting(true)
        settleInteraction()
        return
      }

      if (gesture.pointers.size === 1) {
        const remaining = Array.from(gesture.pointers.values())[0]
        gesture.mode = 'pan'
        gesture.startCamera = cameraRef.current
        gesture.startPoint = remaining
        gesture.startLocal = undefined
        gesture.startDistance = undefined
        gesture.startAngle = undefined
        gesture.startMidpoint = undefined
        setIsInteracting(true)
        settleInteraction()
        return
      }

      gesture.mode = 'idle'
      gesture.startPoint = undefined
      gesture.startLocal = undefined
      gesture.startDistance = undefined
      gesture.startAngle = undefined
      gesture.startMidpoint = undefined
      setIsInteracting(false)
      settleInteraction()
    }

    window.addEventListener('pointermove', handlePointerMove)
    window.addEventListener('pointerup', handlePointerUp)
    window.addEventListener('pointercancel', handlePointerUp)
    return () => {
      window.removeEventListener('pointermove', handlePointerMove)
      window.removeEventListener('pointerup', handlePointerUp)
      window.removeEventListener('pointercancel', handlePointerUp)
    }
  }, [])

  const handleWheel = (event: ReactWheelEvent<HTMLDivElement>) => {
    event.preventDefault()
    const container = canvasRef.current
    if (!container) return
    const rect = container.getBoundingClientRect()
    const screenPoint = pointFromEvent(event, rect)
    const current = cameraRef.current
    const wheelDelta = event.deltaMode === 1 ? event.deltaY * 16 : event.deltaMode === 2 ? event.deltaY * rect.height : event.deltaY
    const nextScale = clampScale(current.scale * Math.exp(-wheelDelta * 0.0012))
    const localPoint = screenPointToLocal(current, screenPoint)
    syncCamera(focusCameraOnLocalPoint(current, screenPoint, localPoint, nextScale, current.rotation))
    setIsInteracting(true)
    settleInteraction()
  }

  const handlePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 && event.pointerType !== 'touch') return
    if ((event.target as HTMLElement | null)?.closest('button')) return
    const container = canvasRef.current
    if (!container) return
    const rect = container.getBoundingClientRect()
    const point = pointFromEvent(event, rect)
    const gesture = gestureRef.current
    gesture.pointers.set(event.pointerId, point)
    ;(event.currentTarget as HTMLDivElement).setPointerCapture(event.pointerId)

    if (gesture.pointers.size >= 2) {
      const points = Array.from(gesture.pointers.values())
      gesture.mode = 'pinch'
      gesture.startCamera = cameraRef.current
      gesture.startMidpoint = midpoint(points[0], points[1])
      gesture.startDistance = distance(points[0], points[1])
      gesture.startAngle = angleBetween(points[0], points[1])
      gesture.startLocal = screenPointToLocal(cameraRef.current, gesture.startMidpoint)
    } else {
      gesture.mode = event.altKey || event.button === 1 ? 'orbit' : 'pan'
      gesture.startCamera = cameraRef.current
      gesture.startPoint = point
      gesture.startLocal = undefined
      gesture.startDistance = undefined
      gesture.startAngle = undefined
      gesture.startMidpoint = undefined
    }

    setIsInteracting(true)
    settleInteraction()
  }

  const handleNodeSelect = (node: NetworkNode) => {
    setFocusedNodeId(node.id)
    focusNodeWithZoom(node)
    if (node.kind === 'theme') {
      onSelect(node.jumpVerseId ?? centerVerse?.id ?? selectedId ?? '')
      return
    }
    if (node.verse) {
      onSelect(node.verse.id)
    }
  }

  const handleSceneSelect = (id: string) => {
    const node = sceneNodeById.get(id)
    if (!node) return
    setFocusedNodeId(id)
    if (node.kind === 'book') {
      setMapFocusBookId(node.bookId ?? null)
      setMapFocusChapter(null)
      return
    }
    if (node.kind === 'chapter') {
      setMapFocusBookId(node.bookId ?? null)
      setMapFocusChapter(node.chapterNumber ?? null)
      return
    }
    if (node.kind === 'theme') {
      onSelect(node.jumpVerseId ?? centerVerse?.id ?? id)
      return
    }
    if (node.verse) {
      onSelect(node.verse.id)
    }
  }

  const viewportTransform = `translate3d(${camera.x}px, ${camera.y}px, 0) scale(${camera.scale})`

  if (!centerVerse) {
    return <div className="panel empty">{t('networkEmpty')}</div>
  }

  return (
    <div className="panel bubble-layout network-panel">
      <div className="bubble-header network-header">
        <div>
          <h2>{t('networkTitle')}</h2>
          <p>{t('networkHint')}</p>
          <div className="network-helper-text">{t('networkHoverHint')}</div>
        </div>

        <div className="network-header-center">
          <div className="network-summary-row">
            <span className="network-stat-chip">{relatedMatches.length} {t('networkConnections')}</span>
            <span className="network-stat-chip">{themes.length} {t('networkThemes')}</span>
            <span className="network-stat-chip">{strongestMatch ? `${t('networkStrength')} ${Math.round(strongestMatch.score)}` : t('networkStrength')}</span>
          </div>

          <div className="network-breadcrumb">
            <button className="secondary network-breadcrumb-crumb" onClick={() => { setMapFocusBookId(null); setMapFocusChapter(null) }}>
              {t('networkAllBooks')}
            </button>
            {mapFocusBookId && (
              <>
                <span className="network-breadcrumb-sep">/</span>
                <button className="secondary network-breadcrumb-crumb" onClick={() => setMapFocusChapter(null)}>
                  {ambientBibleNodes.find((node) => node.kind === 'book' && node.bookId === mapFocusBookId)?.bookName ?? mapFocusBookId}
                </button>
              </>
            )}
            {mapFocusBookId && mapFocusChapter != null && (
              <>
                <span className="network-breadcrumb-sep">/</span>
                <span className="network-breadcrumb-crumb active">{t('chapter')} {mapFocusChapter}</span>
              </>
            )}
          </div>
        </div>

        <div className="bubble-legend network-legend">
          <span><span className="legend-dot active" /> {t('networkCenter')}</span>
          <span><span className="legend-dot bubble-related" /> {t('networkRelated')}</span>
          <span><span className="legend-dot bubble-theme" /> {t('networkThemes')}</span>
        </div>
      </div>

      <div className="bubble-grid network-grid">
        <section className="bubble-canvas-card network-stage-card">
          <NetworkScene
            nodes={sceneNodes}
            edges={edges}
            focus={graphFocus}
            selectedId={selectedId}
            theme={theme}
            onSelect={handleSceneSelect}
            onHoverNode={setHoveredNodeId}
          />
        </section>

        <aside className="bubble-sidebar network-sidebar">
          <div className="bubble-card network-focus-card">
            <div className="network-focus-topline">
              <span className="network-focus-badge">{focusedNode?.kind === 'theme' ? t('networkThemeFocus') : hoveredNodeId ? t('networkPreview') : t('networkVerseFocus')}</span>
              {focusedMatch && focusedNode?.kind !== 'theme' && (
                <span className="network-focus-strength">{t('networkStrength')} {Math.round(focusedMatch.score)}</span>
              )}
            </div>

            {focusedNode?.kind === 'theme' && focusedTheme ? (
              <>
                <div className="verse-ref">{focusedTheme.label}</div>
                <div className="verse-text">{focusedTheme.count} verses share this theme within the current network.</div>
                <div className="network-theme-verse-list">
                  {themeMatches.slice(0, 4).map((match) => (
                    <button key={match.verse.id} className="network-theme-link" onClick={() => onSelect(match.verse.id)}>
                      <span>{match.verse.bookName} {match.verse.chapter}:{match.verse.verse}</span>
                      <small>{match.sharedTerms.slice(0, 3).join(' • ')}</small>
                    </button>
                  ))}
                </div>
              </>
            ) : (
              <>
                <div className="verse-ref">
                  {focusedVerse?.bookName} {focusedVerse?.chapter}:{focusedVerse?.verse}
                </div>
                <div className="verse-text">{focusedVerse?.text}</div>

                <div className="network-focus-metrics">
                  <div>
                    <span>{t('networkConnections')}</span>
                    <strong>{relatedMatches.length}</strong>
                  </div>
                  <div>
                    <span>{t('networkStrength')}</span>
                    <strong>{focusedMatch ? Math.round(focusedMatch.score) : 0}</strong>
                  </div>
                  <div>
                    <span>{t('networkThemes')}</span>
                    <strong>{themes.length}</strong>
                  </div>
                </div>

                <div className="network-term-row">
                  {(focusedMatch?.sharedTerms ?? relatedMatches[0]?.sharedTerms ?? []).slice(0, 5).map((term) => (
                    <span key={term} className="network-term-chip">{term}</span>
                  ))}
                </div>
              </>
            )}

            <div className="map-location-context" style={{ marginTop: '0.75rem' }}>{t('networkTapHint')}</div>
          </div>

          {(focusedCharacters.length > 0 || focusedPlaces.length > 0 || focusedCharacterTimeline.length > 0) && (
            <div className="bubble-card network-context-card">
              <h3>{t('networkContext')}</h3>

              {focusedCharacters.length > 0 && (
                <div className="network-context-section">
                  <h4>{t('characters')}</h4>
                  <div className="bubble-list network-context-list">
                    {focusedCharacters.map((character) => (
                      <div key={character.id} className="bubble-list-item network-context-item">
                        <span>{character.name}</span>
                        <small>{character.era}{character.approxDateRange ? ` · ${character.approxDateRange}` : ''}</small>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {focusedCharacterTimeline.length > 0 && (
                <div className="network-context-section">
                  <h4>{t('characterTimeline')}</h4>
                  <div className="network-timeline">
                    {focusedCharacterTimeline.map((stop, index) => (
                      <div key={index} className="network-timeline-stop">
                        <div className="network-timeline-marker" />
                        <div className="network-timeline-body">
                          <strong>{stop.event.label}</strong>
                          <small>
                            {stop.event.approxDate ? stop.event.approxDate : ''}
                            {stop.place ? ` · ${stop.place.name}` : ''}
                            {stop.event.passages.length > 0 ? ` · ${formatPassage(stop.event.passages[0])}` : ''}
                          </small>
                          {stop.event.dateViews && stop.event.dateViews.length > 0 && (
                            <div className="network-date-views">
                              {stop.event.dateViews.map((view, viewIndex) => (
                                <span key={viewIndex} className="network-date-view" title={view.notes}>
                                  {view.label}: {view.approxDate}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {focusedPlaces.length > 0 && (
                <div className="network-context-section">
                  <h4>{t('places')}</h4>
                  <div className="bubble-list network-context-list">
                    {focusedPlaces.map((place) => (
                      <div key={place.id} className="bubble-list-item network-context-item">
                        <span>{place.name}</span>
                        <small>{place.region}</small>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          <div className="bubble-card">
            <h3>{t('networkRelated')}</h3>
            <div className="bubble-list network-related-list">
              {relatedMatches.map((match) => {
                const verse = match.verse
                const active = selectedId === verse.id || hoveredNodeId === verse.id
                return (
                  <button key={verse.id} className={`bubble-list-item network-related-item ${active ? 'active' : ''}`} onClick={() => onSelect(verse.id)} onMouseEnter={() => setHoveredNodeId(verse.id)} onFocus={() => setHoveredNodeId(verse.id)}>
                    <span>
                      {verse.bookName} {verse.chapter}:{verse.verse}
                      <em className="network-score-inline">{t('networkStrength')} {Math.round(match.score)}</em>
                    </span>
                    <small>{match.sharedTerms.slice(0, 3).join(' • ') || verse.text.slice(0, 90)}</small>
                  </button>
                )
              })}
            </div>
          </div>

          <div className="bubble-card">
            <h3>{t('networkThemes')}</h3>
            <div className="bubble-themes network-theme-cloud">
              {themes.map((theme) => {
                const themeVerse = themeMatches.find((match) => match.sharedTerms.includes(theme.label))?.verse
                return (
                  <button key={theme.label} className="bubble-theme-chip network-theme-chip" onClick={() => themeVerse && onSelect(themeVerse.id)} onMouseEnter={() => setHoveredNodeId(`theme-${theme.label}`)} onFocus={() => setHoveredNodeId(`theme-${theme.label}`)}>
                    <strong>{theme.label}</strong>
                    <small>{theme.count} verses</small>
                  </button>
                )
              })}
            </div>
          </div>
        </aside>
      </div>
    </div>
  )
}

const MAP_LIBRARIES: 'places'[] = []
const DEFAULT_MAP_CENTER = { lat: 31.5, lng: 35.2 }

interface FallbackMapPoint {
  place: Place
  x: number
  y: number
}

const FALLBACK_MAP_ZOOM = 4
const TILE_SIZE = 256

function degToRad(value: number) {
  return (value * Math.PI) / 180
}

function latLngToWorld(lat: number, lng: number, zoom: number) {
  const scale = TILE_SIZE * (2 ** zoom)
  const clampedLat = clamp(lat, -85.05112878, 85.05112878)
  const sin = Math.sin(degToRad(clampedLat))
  return {
    x: ((lng + 180) / 360) * scale,
    y: (0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI)) * scale,
  }
}

function useElementSize<T extends HTMLElement>() {
  const ref = useRef<T | null>(null)
  const [size, setSize] = useState({ width: 0, height: 0 })

  useEffect(() => {
    const element = ref.current
    if (!element) return

    const update = () => {
      const rect = element.getBoundingClientRect()
      setSize({ width: rect.width, height: rect.height })
    }

    update()

    if (typeof ResizeObserver === 'undefined') {
      const fallbackHandle = window.setInterval(update, 250)
      return () => window.clearInterval(fallbackHandle)
    }

    const observer = new ResizeObserver(update)
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  return [ref, size] as const
}

function getFallbackBounds(places: Place[]) {
  if (!places.length) {
    return {
      minLat: DEFAULT_MAP_CENTER.lat - 2,
      maxLat: DEFAULT_MAP_CENTER.lat + 2,
      minLng: DEFAULT_MAP_CENTER.lng - 2,
      maxLng: DEFAULT_MAP_CENTER.lng + 2,
    }
  }

  const latitudes = places.map((place) => place.lat)
  const longitudes = places.map((place) => place.lng)
  const minLat = Math.min(...latitudes)
  const maxLat = Math.max(...latitudes)
  const minLng = Math.min(...longitudes)
  const maxLng = Math.max(...longitudes)
  const latPadding = Math.max((maxLat - minLat) * 0.12, 0.75)
  const lngPadding = Math.max((maxLng - minLng) * 0.12, 0.75)

  return {
    minLat: minLat - latPadding,
    maxLat: maxLat + latPadding,
    minLng: minLng - lngPadding,
    maxLng: maxLng + lngPadding,
  }
}

function getFallbackCenter(places: Place[]) {
  if (!places.length) return DEFAULT_MAP_CENTER
  const bounds = getFallbackBounds(places)
  return {
    lat: (bounds.minLat + bounds.maxLat) / 2,
    lng: (bounds.minLng + bounds.maxLng) / 2,
  }
}

function buildFallbackPoints(places: Place[], bounds: ReturnType<typeof getFallbackBounds>): FallbackMapPoint[] {
  const latRange = Math.max(bounds.maxLat - bounds.minLat, 0.0001)
  const lngRange = Math.max(bounds.maxLng - bounds.minLng, 0.0001)

  return places.map((place) => ({
    place,
    x: clamp(((place.lng - bounds.minLng) / lngRange) * 100, 2, 98),
    y: clamp(((bounds.maxLat - place.lat) / latRange) * 100, 2, 98),
  }))
}

function FallbackMapView({
  places,
  activePlaceId,
  relevantIds,
  pathPoints,
  center,
  onSelect,
  theme,
}: {
  places: Place[]
  activePlaceId?: string
  relevantIds: Set<string>
  pathPoints: Array<{ lat: number; lng: number }>
  center: { lat: number; lng: number }
  onSelect: (id: string) => void
  theme: 'dark' | 'light'
}) {
  const [containerRef, viewport] = useElementSize<HTMLDivElement>()
  const centerWorld = useMemo(() => latLngToWorld(center.lat, center.lng, FALLBACK_MAP_ZOOM), [center])
  const tileCount = 2 ** FALLBACK_MAP_ZOOM
  const topLeft = {
    x: centerWorld.x - viewport.width / 2,
    y: centerWorld.y - viewport.height / 2,
  }

  const tiles = useMemo(() => {
    if (!viewport.width || !viewport.height) return []

    const startTileX = Math.floor(topLeft.x / TILE_SIZE)
    const endTileX = Math.floor((topLeft.x + viewport.width) / TILE_SIZE)
    const startTileY = Math.floor(topLeft.y / TILE_SIZE)
    const endTileY = Math.floor((topLeft.y + viewport.height) / TILE_SIZE)

    const tileList: Array<{ x: number; y: number; src: string }> = []

    for (let tileY = startTileY; tileY <= endTileY; tileY += 1) {
      if (tileY < 0 || tileY >= tileCount) continue
      for (let tileX = startTileX; tileX <= endTileX; tileX += 1) {
        const wrappedX = ((tileX % tileCount) + tileCount) % tileCount
        tileList.push({
          x: tileX * TILE_SIZE - topLeft.x,
          y: tileY * TILE_SIZE - topLeft.y,
          src: `https://tile.openstreetmap.org/${FALLBACK_MAP_ZOOM}/${wrappedX}/${tileY}.png`,
        })
      }
    }

    return tileList
  }, [tileCount, topLeft.x, topLeft.y, viewport.height, viewport.width])

  const markerPoints = useMemo(() => {
    if (!viewport.width || !viewport.height) return []

    return places.map((place) => {
      const projected = latLngToWorld(place.lat, place.lng, FALLBACK_MAP_ZOOM)
      return {
        place,
        x: projected.x - topLeft.x,
        y: projected.y - topLeft.y,
      }
    })
  }, [places, topLeft.x, topLeft.y, viewport.height, viewport.width])

  const pathPixels = useMemo(() => {
    if (!viewport.width || !viewport.height) return []

    return pathPoints
      .map((point) => {
        const projected = latLngToWorld(point.lat, point.lng, FALLBACK_MAP_ZOOM)
        return {
          x: projected.x - topLeft.x,
          y: projected.y - topLeft.y,
        }
      })
      .filter((point) => point.x >= -32 && point.x <= viewport.width + 32 && point.y >= -32 && point.y <= viewport.height + 32)
  }, [pathPoints, topLeft.x, topLeft.y, viewport.height, viewport.width])

  const backdrop =
    theme === 'dark'
      ? { background: 'linear-gradient(180deg, #2a2213 0%, #241b10 100%)' }
      : { background: 'linear-gradient(180deg, #f4ead7 0%, #e8ddc9 100%)' }

  const water = theme === 'dark' ? '#8f7a5b' : '#a4bcc3'
  const land = theme === 'dark' ? '#3a3419' : '#ecdcc2'
  const route = '#8a6d3b'

  return (
    <div ref={containerRef} className="map-canvas map-canvas-fallback" style={backdrop}>
      {viewport.width > 0 && viewport.height > 0 && tiles.map((tile) => (
        <img
          key={`${tile.src}-${tile.x}-${tile.y}`}
          className="map-tile"
          src={tile.src}
          alt=""
          aria-hidden="true"
          draggable={false}
          style={{ left: tile.x, top: tile.y, width: TILE_SIZE, height: TILE_SIZE }}
        />
      ))}

      <svg className="map-svg map-route-overlay" viewBox={`0 0 ${Math.max(viewport.width, 1)} ${Math.max(viewport.height, 1)}`} preserveAspectRatio="none" aria-hidden="true">
        {pathPixels.length > 1 && (
          <polyline
            points={pathPixels.map((point) => `${point.x},${point.y}`).join(' ')}
            fill="none"
            stroke={route}
            strokeOpacity="0.95"
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        )}
      </svg>

      {markerPoints.map((point) => {
        const active = point.place.id === activePlaceId
        const relevant = relevantIds.has(point.place.id)
        return (
          <button
            key={point.place.id}
            type="button"
            className={`map-pin ${active ? 'active' : ''} ${relevant ? 'relevant' : ''}`}
            style={{ left: point.x, top: point.y }}
            onClick={() => onSelect(point.place.id)}
            title={point.place.name}
          >
            <span className="map-pin-dot" />
            <span className="map-pin-label">{point.place.name}</span>
          </button>
        )
      })}
    </div>
  )
}

function MapPlacePopup({
  place,
  onClose,
}: {
  place: Place
  onClose: () => void
}) {
  const { t } = useI18n()
  const { loading, data } = useWikiSummary(place.id, place.name)
  const wikiLink = data?.pageUrl ?? getWikipediaLink(place.id, place.name)
  const highlightedPassages = useMemo(() => place.passages.slice(0, 6), [place.passages])

  return (
    <div className="map-place-popup" role="dialog" aria-label={place.name} aria-live="polite">
      <button type="button" className="map-place-popup-close" onClick={onClose} aria-label={t('close')}>
        <X size={14} />
      </button>

      <div className="map-place-popup-media">
        {loading ? (
          <div className="map-place-popup-media-loading">
            <Loader2 className="spin" size={16} /> {t('loading')}
          </div>
        ) : data?.thumbnailUrl ? (
          <img className="map-place-popup-image" src={data.thumbnailUrl} alt={place.name} loading="lazy" />
        ) : (
          <div className="map-place-popup-placeholder">
            <MapIcon size={18} />
            <span>{place.region}</span>
          </div>
        )}
      </div>

      <div className="map-place-popup-body">
        <div className="map-location-region">{place.region}</div>
        <h3>{place.name}</h3>
        <p>{place.description}</p>
        {data?.extract ? <p className="map-place-popup-extract">{data.extract}</p> : null}

        <div className="map-place-popup-meta">
          <span>{place.passages.length} {t('relatedPassages')}</span>
          <span>{place.lat.toFixed(2)}, {place.lng.toFixed(2)}</span>
        </div>

        {highlightedPassages.length > 0 && (
          <div className="map-passage-list">
            {highlightedPassages.map((passage, index) => (
              <span key={`${place.id}-${index}`} className="map-passage-tag">
                {formatPassage(passage)}
              </span>
            ))}
          </div>
        )}

        <a className="wiki-link map-place-popup-link" href={wikiLink} target="_blank" rel="noreferrer">
          <ExternalLink size={12} /> {t('readOnWikipedia')}
        </a>
      </div>
    </div>
  )
}

function MapTab({
  selectedVerse,
  onSelect,
  selectedId,
  theme,
}: {
  selectedVerse?: Verse
  onSelect: (id: string) => void
  selectedId: string | null
  theme: 'dark' | 'light'
}) {
  const { t } = useI18n()
  const all = getAllVerses()
  const allPlaces = useMemo(() => getAllPlaces(), [])
  const mapCenter = useMemo(() => getFallbackCenter(allPlaces), [allPlaces])
  const isNativePlatform = Capacitor.isNativePlatform()
  const { isLoaded, loadError } = useJsApiLoader({
    id: 'google-map-script',
    googleMapsApiKey: import.meta.env.VITE_GOOGLE_MAPS_API_KEY ?? '',
    libraries: MAP_LIBRARIES,
  })

  const relevantPlaces = useMemo(() => getPlacesForVerse(selectedVerse, 6), [selectedVerse])
  const relevantIds = useMemo(() => new Set(relevantPlaces.map((p) => p.id)), [relevantPlaces])
  const relevantCharacters = useMemo(() => getCharactersForVerse(selectedVerse, 4), [selectedVerse])

  const [query, setQueryLocal] = useState('')
  const placeResults = useMemo(() => searchPlaces(query), [query])
  const characterResults = useMemo(() => searchCharacters(query), [query])

  const [activePlaceId, setActivePlaceId] = useState<string>(relevantPlaces[0]?.id ?? allPlaces[0]?.id ?? '')
  const [activeCharacter, setActiveCharacter] = useState<Character | null>(null)
  const [showPlacePopup, setShowPlacePopup] = useState(false)
  const [selectionSource, setSelectionSource] = useState<'map' | 'search'>('map')
  const [animateSearchSidebar, setAnimateSearchSidebar] = useState(false)
  const sidebarWasVisibleRef = useRef(false)

  useEffect(() => {
    if (!activeCharacter) {
      setActivePlaceId(relevantPlaces[0]?.id ?? allPlaces[0]?.id ?? '')
    }
    if (!activeCharacter) {
      setSelectionSource('map')
    }
    setShowPlacePopup(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedVerse])

  const showSearchSidebarDetails = selectionSource === 'search' || Boolean(activeCharacter)

  useEffect(() => {
    if (showSearchSidebarDetails) {
      if (!sidebarWasVisibleRef.current && selectionSource === 'search') {
        setAnimateSearchSidebar(true)
        const handle = window.setTimeout(() => setAnimateSearchSidebar(false), 220)
        sidebarWasVisibleRef.current = true
        return () => window.clearTimeout(handle)
      }
      sidebarWasVisibleRef.current = true
      return
    }

    sidebarWasVisibleRef.current = false
    setAnimateSearchSidebar(false)
  }, [selectionSource, showSearchSidebarDetails])

  const activePlace = getPlace(activePlaceId) ?? allPlaces[0]
  const popupPlace = showPlacePopup ? activePlace : undefined
  const [bounceId, setBounceId] = useState<string | null>(null)

  const path = useMemo(() => (activeCharacter ? getCharacterPath(activeCharacter) : []), [activeCharacter])
  const [stopIndex, setStopIndex] = useState(0)
  const [playing, setPlaying] = useState(false)
  const mapRef = useRef<google.maps.Map | null>(null)
  const pathPlaceIds = useMemo(() => new Set(path.map((stop) => stop.place?.id).filter((id): id is string => Boolean(id))), [path])
  const visiblePlaces = useMemo(
    () => (activeCharacter && playing ? allPlaces.filter((place) => pathPlaceIds.has(place.id)) : allPlaces),
    [activeCharacter, allPlaces, pathPlaceIds, playing],
  )

  useEffect(() => {
    setStopIndex(0)
    setPlaying(false)
  }, [activeCharacter])

  useEffect(() => {
    if (!playing) return
    const handle = window.setInterval(() => {
      setStopIndex((i) => {
        if (i >= path.length - 1) {
          setPlaying(false)
          return i
        }
        return i + 1
      })
    }, 1800)
    return () => window.clearInterval(handle)
  }, [playing, path.length])

  useEffect(() => {
    const stop = path[stopIndex]
    if (stop?.place && mapRef.current) {
      mapRef.current.panTo({ lat: stop.place.lat, lng: stop.place.lng })
    }
  }, [stopIndex, path])

  const jumpToStop = (i: number) => {
    setStopIndex(i)
    setPlaying(false)
    const stop = path[i]
    const passage = stop?.event.passages[0]
    if (passage) {
      const match = all.find((v) => matchesPassage(v, passage))
      if (match) onSelect(match.id)
    }
  }

  const bouncePlace = (id: string) => {
    setBounceId(id)
    window.setTimeout(() => setBounceId((current) => (current === id ? null : current)), 1400)
  }

  const selectPlace = (id: string) => {
    setActivePlaceId(id)
    setActiveCharacter(null)
    setQueryLocal('')
    setSelectionSource('map')
    setShowPlacePopup(true)
    bouncePlace(id)
  }

  const selectPlaceFromSearch = (id: string) => {
    setActivePlaceId(id)
    setActiveCharacter(null)
    setQueryLocal('')
    setSelectionSource('search')
    setShowPlacePopup(false)
    bouncePlace(id)
  }

  const selectCharacter = (character: Character, source: 'map' | 'search' = 'search') => {
    setActiveCharacter(character)
    setSelectionSource(source)
    setShowPlacePopup(false)
    setQueryLocal('')
    const first = getCharacterPath(character)[0]
    if (first?.place) {
      setActivePlaceId(first.place.id)
      bouncePlace(first.place.id)
    }
  }

  const visiblePassages = activePlace ? getPassagesForPlace(activePlace, all, 8) : []
  const nearbyPlaces = allPlaces.filter((p) => p.id !== activePlace?.id).slice(0, 10)
  const center = mapCenter
  const pathCoords = path
    .slice(0, stopIndex + 1)
    .map((s) => (s.place ? { lat: s.place.lat, lng: s.place.lng } : null))
    .filter((c): c is { lat: number; lng: number } => c !== null)
  const useFallbackMap = isNativePlatform || loadError || !isLoaded

  return (
    <div className="panel map-layout">
      <div className="map-search-row">
        <div className="map-search-input-wrap">
          <Search size={16} />
          <input
            className="map-search-input"
            placeholder={t('searchPlacesAndPeople')}
            value={query}
            onChange={(e) => setQueryLocal(e.target.value)}
          />
          {query.trim() && (
            <button type="button" className="map-search-clear" onClick={() => setQueryLocal('')} aria-label={t('delete')}>
              <X size={14} />
            </button>
          )}
        </div>
        {query.trim() && (
          <div className="map-search-results">
            {characterResults.length > 0 && (
              <div className="map-search-group">
                <div className="map-search-group-label"><Users size={12} /> {t('characters')}</div>
                {characterResults.map((c) => (
                  <button key={c.id} type="button" className="map-search-result" onClick={() => selectCharacter(c, 'search')}>
                    <span>{c.name}</span>
                    <small>{c.era}</small>
                  </button>
                ))}
              </div>
            )}
            {placeResults.length > 0 && (
              <div className="map-search-group">
                <div className="map-search-group-label"><MapIcon size={12} /> {t('places')}</div>
                {placeResults.map((p) => (
                  <button key={p.id} type="button" className="map-search-result" onClick={() => selectPlaceFromSearch(p.id)}>
                    <span>{p.name}</span>
                    <small>{p.region}</small>
                  </button>
                ))}
              </div>
            )}
            {!characterResults.length && !placeResults.length && (
              <div className="map-search-empty">{t('noCharacterResults')}</div>
            )}
          </div>
        )}
      </div>

      <div className="map-grid">
        <section className="map-canvas-card">
          <div className="map-canvas map-canvas-google">
            {popupPlace ? <MapPlacePopup place={popupPlace} onClose={() => setShowPlacePopup(false)} /> : null}
            {useFallbackMap ? (
              <FallbackMapView
                places={visiblePlaces}
                activePlaceId={activePlace?.id}
                relevantIds={relevantIds}
                pathPoints={pathCoords}
                center={center}
                onSelect={selectPlace}
                theme={theme}
              />
            ) : null}
            {loadError && !isNativePlatform && <div className="empty">{t('mapLoadError')}</div>}
            {!useFallbackMap && !isLoaded && (
              <div className="empty" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Loader2 className="spin" size={18} /> {t('loading')}
              </div>
            )}
            {isLoaded && !useFallbackMap && (
              <GoogleMap
                key={theme}
                mapContainerStyle={{ width: '100%', height: '100%' }}
                center={center}
                zoom={4}
                onLoad={(map) => {
                  mapRef.current = map
                  if (allPlaces.length) {
                    const bounds = new google.maps.LatLngBounds()
                    allPlaces.forEach((place) => bounds.extend({ lat: place.lat, lng: place.lng }))
                    map.fitBounds(bounds, 72)
                  }
                }}
                options={{
                  styles: getMapStyle(theme),
                  disableDefaultUI: true,
                  zoomControl: true,
                  clickableIcons: false,
                }}
              >
                {visiblePlaces.map((place) => {
                  const active = place.id === activePlace?.id
                  const relevant = relevantIds.has(place.id)
                  return (
                    <Marker
                      key={place.id}
                      position={{ lat: place.lat, lng: place.lng }}
                      title={place.name}
                      onClick={() => selectPlace(place.id)}
                      animation={bounceId === place.id ? google.maps.Animation.BOUNCE : undefined}
                      icon={{
                        path: google.maps.SymbolPath.CIRCLE,
                        scale: active ? 13 : relevant ? 10 : 8,
                        fillColor: active ? '#f0d57b' : relevant ? '#cbb56f' : '#a86f3a',
                        fillOpacity: 1,
                        strokeColor: active ? '#fff7e2' : '#2d2215',
                        strokeWeight: active ? 3 : 1.5,
                      }}
                    />
                  )
                })}
                {pathCoords.length > 1 && (
                  <Polyline
                    path={pathCoords}
                    options={{ strokeColor: '#b58a44', strokeOpacity: 0.9, strokeWeight: 3 }}
                  />
                )}
              </GoogleMap>
            )}
          </div>
        </section>

        {showSearchSidebarDetails ? (
          <aside className={`map-sidebar ${animateSearchSidebar ? 'search-open' : ''}`}>
            {activeCharacter ? (
            <>
              <div key={`char-${activeCharacter.id}`} className="map-location-card map-card-pop">
                <div className="map-location-region">{activeCharacter.era}</div>
                <h3>{activeCharacter.name}</h3>
                <p>{activeCharacter.summary}</p>
                {activeCharacter.approxDateRange && (
                  <div className="map-passage-list">
                    <span className="map-passage-tag">{activeCharacter.approxDateRange}</span>
                  </div>
                )}
                <button className="secondary" style={{ marginTop: '0.75rem' }} onClick={() => setActiveCharacter(null)}>
                  <X size={14} /> {t('clearCharacter')}
                </button>
              </div>

              <WikiMediaCard
                key={`char-wiki-${activeCharacter.id}`}
                id={activeCharacter.id}
                title={activeCharacter.name}
                passages={activeCharacter.events.flatMap((event) => event.passages).slice(0, 4)}
              />

              <div className="map-list-card character-timeline-card">
                <h4>{t('characterTimeline')}</h4>
                <div className="timeline-controls">
                  <button type="button" onClick={() => setPlaying((p) => !p)} disabled={path.length < 2}>
                    {playing ? <Pause size={16} /> : <Play size={16} />} {playing ? t('pausePath') : t('playPath')}
                  </button>
                </div>
                <div className="timeline-track">
                  {path.map((stop, i) => (
                    <button
                      key={i}
                      type="button"
                      className={`timeline-stop ${i === stopIndex ? 'active' : ''} ${i <= stopIndex ? 'visited' : ''}`}
                      onClick={() => jumpToStop(i)}
                    >
                      <span className="timeline-stop-index">{i + 1}</span>
                      <span className="timeline-stop-body">
                        <span className="timeline-stop-label">{stop.event.label}</span>
                        <small>{stop.place?.name}{stop.event.approxDate ? ` \u2022 ${stop.event.approxDate}` : ''}</small>
                        {stop.event.dateViews && stop.event.dateViews.length > 0 && (
                          <span className="timeline-date-views">
                            {stop.event.dateViews.map((view, viewIndex) => (
                              <span key={viewIndex} className="timeline-date-view" title={view.notes}>
                                {view.label}: {view.approxDate}
                              </span>
                            ))}
                          </span>
                        )}
                      </span>
                    </button>
                  ))}
                </div>
                <div className="map-disclaimer">{t('dateDisclaimer')}</div>
              </div>
            </>
            ) : activePlace ? (
            <>
              <div key={`place-${activePlace.id}`} className="map-location-card map-card-pop">
                <div className="map-location-region">{activePlace.region}</div>
                <h3>{activePlace.name}</h3>
                <p>{activePlace.description}</p>
                {visiblePassages.length === 0 && (
                  <div className="map-passage-list">
                    {activePlace.passages.slice(0, 4).map((passage, i) => (
                      <span key={i} className="map-passage-tag">{passage.book} {passage.startChapter}</span>
                    ))}
                  </div>
                )}
                {selectedVerse && relevantIds.has(activePlace.id) ? (
                  <div className="map-location-context">{selectedVerse.bookName} {selectedVerse.chapter}:{selectedVerse.verse}</div>
                ) : (
                  <div className="map-location-context">{t('tapAPlace')}</div>
                )}
              </div>

              <WikiMediaCard
                key={`place-wiki-${activePlace.id}`}
                id={activePlace.id}
                title={activePlace.name}
                passages={activePlace.passages.slice(0, 4)}
              />

              {relevantCharacters.length > 0 && (
                <div className="map-list-card">
                  <h4><Users size={14} /> {t('characters')}</h4>
                  <div className="map-place-list">
                    {relevantCharacters.map((c) => (
                      <button key={c.id} className="map-place-chip" onClick={() => selectCharacter(c, 'search')}>
                        <span>{c.name}</span>
                        <small>{c.era}</small>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div className="map-list-card">
                <h4>{t('relatedPassages')}</h4>
                <div className="map-verse-list">
                  {visiblePassages.length ? visiblePassages.map((verse) => (
                    <div key={verse.id} className={`map-verse-card ${selectedId === verse.id ? 'active' : ''}`} onClick={() => onSelect(verse.id)}>
                      <div className="verse-ref">{verse.bookName} {verse.chapter}:{verse.verse}</div>
                      <div className="verse-text">{verse.text}</div>
                    </div>
                  )) : <div className="empty">{t('readerEmpty')}</div>}
                </div>
              </div>

              <div className="map-list-card">
                <h4>{t('featuredPlaces')}</h4>
                <div className="map-place-list">
                  {nearbyPlaces.map((place) => (
                    <button key={place.id} className={`map-place-chip ${place.id === activePlace?.id ? 'active' : ''}`} onClick={() => selectPlace(place.id)}>
                      <span>{place.name}</span>
                      <small>{place.region}</small>
                    </button>
                  ))}
                </div>
              </div>
            </>
            ) : null}
          </aside>
        ) : null}
      </div>
    </div>
  )
}

