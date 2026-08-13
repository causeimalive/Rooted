import { createPortal } from 'react-dom'
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent, type WheelEvent as ReactWheelEvent } from 'react'
import { onAuthStateChanged } from 'firebase/auth'
import { Capacitor } from '@capacitor/core'
import { App as CapacitorApp } from '@capacitor/app'
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
  ChevronLeft,
  ChevronRight,
  Maximize2,
  Moon,
  Sun,
  Cog,
  Palette,
  Globe,
  Play,
  Pause,
  Users,
  Check,
} from 'lucide-react'
import { GoogleMap, Polyline, useJsApiLoader } from '@react-google-maps/api'
import MapMarkers from './MapMarkers'
import MapRegions from './MapRegions'
import { YouVersionProvider } from '@youversion/platform-react-ui'
import {
  findVerse,
  extractNetworkThemes as deriveNetworkThemes,
  generateInsight,
  getAllVerses,
  getCrossReferences,
  getCrossReferenceMatches,
  loadBible,
  lookupLexicon,
  searchBible,
  searchLexicon,
  type NetworkTheme,
  type VerseMatch,
} from './bible'
import { redLetterVerseHtml } from './redLetter'
import { useEntityData } from './useEntityData'
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
  getAllCharacters,
  getCharacter,
  getCharacterPath,
  getCharactersForVerse,
  loadCharacters,
  searchCharacters,
} from './characters'
import { BASE_LAYERS, getMapOptions, type MapBaseLayer } from './mapTileLayers'
import WikiMediaCard from './WikiMediaCard'
import LexiconTab from './LexiconTab'
import WayfinderTab from './WayfinderTab'
import YouVersionReaderTab from './YouVersionReaderTab'
import { AuthSignOutButton } from './AuthGate'
import {
  addRecentSearch,
  clearCurrentUser,
  deleteMemory,
  getBookmarks,
  getCurrentUserId,
  getMemories,
  getRecentSearches,
  importAllYouVersionHighlights,
  isBookmarked,
  saveMemory,
  syncUserData,
  toggleBookmark,
} from './storage'
import { auth } from './firebase'
import { Bookmark as BookmarkType, Memory as MemoryType, Verse, type LexiconEntry, type Place, type RecentSearch } from './types'
import type { Character } from './types'
import { useI18n } from './i18n'
import { getUserPreference, setUserPreference } from './userProfile'
import { getWikipediaLink, useWikiImages, useWikiSummary, type WikiImage } from './wikipedia'
import { useYVAuth } from '@youversion/platform-react-hooks'
import { getYouVersionRedirectUrl } from './youversionRedirect'

type Tab = 'search' | 'reader' | 'wayfinder' | 'map' | 'lexicon'

const TABS: Tab[] = ['search', 'reader', 'wayfinder', 'map', 'lexicon']

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

const BRANDING_ASSET_VERSION = '20260811c'
const YOUVERSION_APP_KEY = import.meta.env.VITE_YVP_APP_KEY?.trim() ?? ''
const READER_FONT_SIZE_KEY = 'bible-study-yv-font-size'
const UI_SCALE_KEY = 'bible-study-ui-scale'

function SettingsMenu() {
  const { auth, userInfo } = useYVAuth()
  const userId = userInfo?.userId
  const [isOpen, setIsOpen] = useState(false)
  const [fontSize, setFontSize] = useState(() => {
    const saved = Number(getUserPreference(userId, READER_FONT_SIZE_KEY))
    return Number.isFinite(saved) && saved > 0 ? saved : 1.02
  })
  const [uiScale, setUiScale] = useState(() => {
    const saved = Number(getUserPreference(userId, UI_SCALE_KEY))
    return Number.isFinite(saved) && saved > 0 ? saved : 1
  })
  const [showDebug, setShowDebug] = useState(() => {
    try {
      return localStorage.getItem('network-scene:debug') !== 'false'
    } catch {
      return true
    }
  })
  const [category, setCategory] = useState<'look-feel' | 'network' | 'youversion'>('look-feel')
  const [syncState, setSyncState] = useState<'idle' | 'syncing' | 'success' | 'error'>('idle')
  const [syncMessage, setSyncMessage] = useState<string | null>(null)
  const dialogRef = useRef<HTMLDialogElement | null>(null)

  const lastReadVersion = Number(getUserPreference(userId, 'bible-study-yv-version'))

  const CATEGORIES: { id: 'look-feel' | 'network' | 'youversion'; label: string; icon: typeof Cog }[] = [
    { id: 'look-feel', label: 'Look & feel', icon: Palette },
    { id: 'network', label: 'Network', icon: Globe },
    { id: 'youversion', label: 'YouVersion', icon: BookOpen },
  ]

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    if (isOpen) {
      if (!dialog.open) dialog.showModal()
    } else if (dialog.open) {
      dialog.close()
    }
  }, [isOpen])

  useEffect(() => {
    try {
      localStorage.setItem('network-scene:debug', String(showDebug))
    } catch {}
    window.dispatchEvent(new CustomEvent('network-scene:debug', { detail: showDebug }))
  }, [showDebug])

  useEffect(() => {
    const onChange = (e: Event) => {
      const size = (e as CustomEvent<number>).detail
      if (typeof size === 'number') setFontSize(size)
    }
    window.addEventListener('reader:font-size', onChange)
    return () => window.removeEventListener('reader:font-size', onChange)
  }, [])

  useEffect(() => {
    const clamped = Math.min(Math.max(uiScale, 0.85), 1.35)
    if (clamped !== uiScale) {
      setUiScale(clamped)
      return
    }
    document.documentElement.style.setProperty('--app-ui-scale', String(clamped))
    setUserPreference(userId, UI_SCALE_KEY, String(clamped))
  }, [uiScale, userId])

  useEffect(() => {
    if (!isOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [isOpen])

  const updateFontSize = useCallback((next: number) => {
    const clamped = Math.min(Math.max(next, 0.85), 1.7)
    setFontSize(clamped)
    setUserPreference(userId, READER_FONT_SIZE_KEY, String(clamped))
    window.dispatchEvent(new CustomEvent('reader:font-size', { detail: clamped }))
  }, [userId])

  const updateUiScale = useCallback((next: number) => {
    setUiScale(Math.min(Math.max(next, 0.85), 1.35))
  }, [])

  const handleSync = useCallback(async () => {
    const syncUserId = getCurrentUserId() ?? userId
    if (!syncUserId) return
    const versionId = Number.isFinite(lastReadVersion) && lastReadVersion > 0 ? lastReadVersion : null
    if (!versionId) {
      setSyncState('error')
      setSyncMessage('Open a chapter in the reader first so the app knows which Bible version to sync.')
      return
    }
    setSyncState('syncing')
    setSyncMessage('Syncing local bookmarks...')
    try {
      await syncUserData(syncUserId)
      const imported = await importAllYouVersionHighlights(versionId, (done, total, current) => {
        setSyncMessage(`Scanning YouVersion chapters... ${done} / ${total} (${current})`)
      })
      await syncUserData(syncUserId)
      setSyncState('success')
      setSyncMessage(`Sync complete — imported ${imported} highlight${imported === 1 ? '' : 's'}`)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      console.error('Sync failed:', error)
      setSyncState('error')
      setSyncMessage(message)
    }
  }, [userId, lastReadVersion])

  return (
    <>
      <button
        type="button"
        className="theme-toggle header-settings-button"
        onClick={() => setIsOpen(true)}
        title="Settings"
        aria-label="Settings"
      >
        <Cog size={18} />
      </button>
      <dialog
        className="header-settings-dialog"
        ref={dialogRef}
        onClose={() => setIsOpen(false)}
        onClick={(e) => {
          if (e.currentTarget === e.target) setIsOpen(false)
        }}
      >
        <div className="header-settings-popup">
          <button
            type="button"
            className="header-settings-close"
            onClick={() => setIsOpen(false)}
            aria-label="Close settings"
          >
            <X size={20} />
          </button>
          <div className="header-settings-sidebar">
              <div className="header-settings-sidebar-header">
                <h4 className="header-settings-title">Settings</h4>
              </div>
              {CATEGORIES.map((cat) => {
                const Icon = cat.icon
                const active = category === cat.id
                return (
                  <button
                    key={cat.id}
                    type="button"
                    className={`header-settings-category ${active ? 'active' : ''}`}
                    onClick={() => setCategory(cat.id)}
                  >
                    <Icon size={18} />
                    <span>{cat.label}</span>
                  </button>
                )
              })}
            </div>
            <div className="header-settings-content">
              {category === 'look-feel' && (
                <>
                  <h3 className="header-settings-content-title">Look & feel</h3>
                  <div className="header-settings-card">
                    <span>Reader text size</span>
                    <div className="header-settings-range">
                      <button
                        type="button"
                        className="secondary"
                        onClick={() => updateFontSize(fontSize - 0.05)}
                        aria-label="Decrease text size"
                      >
                        -
                      </button>
                      <input
                        type="range"
                        min={0.85}
                        max={1.7}
                        step={0.05}
                        value={fontSize}
                        onChange={(e) => updateFontSize(Number(e.target.value))}
                      />
                      <button
                        type="button"
                        className="secondary"
                        onClick={() => updateFontSize(fontSize + 0.05)}
                        aria-label="Increase text size"
                      >
                        +
                      </button>
                    </div>
                  </div>
                  <div className="header-settings-card">
                    <span>UI scale</span>
                    <div className="header-settings-range">
                      <button
                        type="button"
                        className="secondary"
                        onClick={() => updateUiScale(uiScale - 0.05)}
                        aria-label="Decrease UI scale"
                      >
                        -
                      </button>
                      <input
                        type="range"
                        min={0.85}
                        max={1.35}
                        step={0.05}
                        value={uiScale}
                        onChange={(e) => updateUiScale(Number(e.target.value))}
                      />
                      <button
                        type="button"
                        className="secondary"
                        onClick={() => updateUiScale(uiScale + 0.05)}
                        aria-label="Increase UI scale"
                      >
                        +
                      </button>
                    </div>
                  </div>
                </>
              )}
              {category === 'network' && (
                <>
                  <h3 className="header-settings-content-title">Network</h3>
                  <div className="header-settings-card header-settings-toggle">
                    <div>
                      <span>Show debug coordinates</span>
                      <small>Render camera and crosshair debug values over the network scene</small>
                    </div>
                    <input
                      id="show-debug"
                      type="checkbox"
                      aria-label="Show debug coordinates"
                      checked={showDebug}
                      onChange={(e) => setShowDebug(e.target.checked)}
                    />
                  </div>
                </>
              )}
              {category === 'youversion' && (
                <>
                  <h3 className="header-settings-content-title">YouVersion</h3>
                  <div className="header-settings-card yv-card">
                    <div className="yv-card-header">
                      <span className="yv-card-icon">
                        <Check size={20} />
                      </span>
                      <div className="yv-card-body">
                        <span className="yv-card-title">
                          YouVersion {auth.isAuthenticated ? 'connected' : 'available'}
                        </span>
                        {auth.isAuthenticated && userInfo?.name ? (
                          <small>Signed in as {userInfo.name}</small>
                        ) : (
                          <small>Sign in with YouVersion to sync highlights across devices.</small>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="header-settings-card header-settings-toggle">
                    <div>
                      <span>Bookmarks & highlights</span>
                      <small>Sync your saved bookmarks and imported highlights across devices</small>
                    </div>
                    <button
                      type="button"
                      className="secondary"
                      disabled={!auth.isAuthenticated || syncState === 'syncing'}
                      onClick={() => void handleSync()}
                    >
                      {syncState === 'syncing' ? <Loader2 size={16} className="spin" /> : 'Sync'}
                    </button>
                  </div>
                  {syncMessage && (
                    <small
                      style={{
                        color: syncState === 'success' ? 'var(--success)' : 'var(--danger)',
                        display: 'block',
                        marginTop: '0.25rem',
                      }}
                    >
                      {syncMessage}
                    </small>
                  )}
                </>
              )}
            </div>
        </div>
      </dialog>
    </>
  )
}

export default function App() {
  const isNative = Capacitor.isNativePlatform()

  useEffect(() => {
    if (!isNative) return
    let listener: { remove: () => void } | undefined
    const handleUrl = (urlString: string | undefined) => {
      if (!urlString) return
      try {
        console.info('App launch URL:', urlString)
        if (urlString.startsWith('com.rooted.christ://auth')) {
          // Auth callback is already loaded into the WebView by MainActivity;
          // do not reload it from the JS side.
          return
        }
        const url = new URL(urlString)
        const params = url.search
        if (params) {
          const base = window.location.origin + (window.location.pathname.split('?')[0] || '/')
          window.location.href = base + params
        }
      } catch (err) {
        console.error('App launch URL error:', err)
      }
    }
    CapacitorApp.addListener('appUrlOpen', (event) => handleUrl(event.url)).then((handle) => {
      listener = handle
    })
    CapacitorApp.getLaunchUrl().then((url) => {
      if (url?.url) handleUrl(url.url)
    })
    return () => {
      listener?.remove()
    }
  }, [isNative])

  const { t, language, setLanguage } = useI18n()
  const { auth: yvAuth, userInfo } = useYVAuth()
  const yvUserId = yvAuth.isAuthenticated ? userInfo?.userId : undefined
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
  const [mapSearchResultsHost, setMapSearchResultsHost] = useState<HTMLDivElement | null>(null)
  const mapSearchResultsHostRef = useCallback((node: HTMLDivElement | null) => {
    setMapSearchResultsHost(node)
  }, [])
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
  const [readerVersion, setReaderVersion] = useState<{ id: number; name: string; abbreviation: string } | null>(null)
  const [hoveredId, setHoveredId] = useState<string | null>(null)
  const [recentSearches, setRecentSearches] = useState<RecentSearch[]>(getRecentSearches())
  const [bookmarks, setBookmarks] = useState<BookmarkType[]>(getBookmarks())
  const [memories, setMemories] = useState<MemoryType[]>(() => {
    const stored = getMemories()
    if (stored.length) return stored
    return getBookmarks().map((b) => ({
      id: b.id,
      verseId: b.verseId,
      type: 'bookmark' as const,
      body: b.label,
      color: b.color,
      createdAt: b.createdAt,
      shareLevel: 'private' as const,
    }))
  })
  const [audioPlaying, setAudioPlaying] = useState(false)
  const audioRef = useRef<HTMLAudioElement | null>(null)

  const selected = useMemo(() => (selectedId ? findVerse(selectedId) : undefined), [selectedId])
  const hovered = useMemo(() => (hoveredId ? findVerse(hoveredId) : undefined), [hoveredId])
  const recentVerse = useMemo(() => (recentSearches[0] ? findVerse(recentSearches[0].verseId) : undefined), [recentSearches])
  const detailVerse = selected ?? hovered ?? recentVerse

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
    const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
      const userId = firebaseUser?.uid ?? yvUserId
      if (userId) {
        void syncUserData(userId).catch(() => {})
      } else {
        clearCurrentUser()
      }
    })
    return unsubscribe
  }, [yvUserId])

  useEffect(() => {
    if (yvUserId) {
      void syncUserData(yvUserId).catch(() => {})
    }
  }, [yvUserId])

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
      versionId: readerVersion ? String(readerVersion.id) : verse.translation,
      versionAbbreviation: readerVersion ? (readerVersion.abbreviation || readerVersion.name) : verse.translation.toUpperCase(),
    })
    setRecentSearches(getRecentSearches())
  }

  const handleBookmark = (verseId: string, versionId?: string, versionAbbreviation?: string) => {
    const v = versionId ?? (readerVersion ? String(readerVersion.id) : '')
    const a = versionAbbreviation ?? (readerVersion ? (readerVersion.abbreviation || readerVersion.name) : '')
    toggleBookmark(verseId, v, a)
    setBookmarks(getBookmarks())
  }

  const openVerseInReader = (id: string) => {
    setSelectedId(id)
    setTab('reader')
  }

  const detailRelatedMatches = useMemo(
    () => (detailVerse ? getCrossReferenceMatches(detailVerse) : []),
    [detailVerse],
  )

  const wordStudyMatch = useMemo(() => {
    if (!detailVerse) return null
    const stop = new Set([
      'the', 'and', 'that', 'with', 'from', 'have', 'this', 'unto', 'they', 'their', 'shall', 'which', 'will', 'were',
      'then', 'them', 'for', 'but', 'not', 'are', 'all', 'had', 'has', 'was', 'who', 'out', 'him', 'you', 'its', 'thy',
      'thou', 'thee', 'one', 'two', 'god', 'lord', 'jesus', 'christ', 'said', 'say', 'saith', 'also', 'can', 'could',
      'would', 'should', 'been', 'being', 'more', 'most', 'much', 'many', 'after', 'before', 'over', 'under', 'a', 'an',
      'as', 'at', 'by', 'he', 'in', 'is', 'it', 'of', 'on', 'or', 'so', 'to', 'up', 'us', 'we', 'be', 'no', 'if', 'my',
      'oh', 'go', 'do', 'did', 'hath', 'didst', 'shalt', 'wilt', 'ye', 'when', 'where', 'what', 'there', 'thereof',
    ])
    const seen = new Set<string>()
    const candidates: { original: string; entry: LexiconEntry; score: number }[] = []
    const matches = detailVerse.text.matchAll(/[a-zA-Z']{4,}/g)
    for (const match of matches) {
      const original = match[0]
      const base = original.toLowerCase().replace(/'s?$/, '')
      if (stop.has(base) || seen.has(base)) continue
      seen.add(base)
      const entry = lookupLexicon(base)
      if (!entry) continue
      const score = (entry.kjvMeaning?.length ?? 0) + (entry.modernMeaning?.length ?? 0) + (entry.historicalContext?.length ?? 0)
      candidates.push({ original, entry, score })
    }
    if (candidates.length === 0) return null
    candidates.sort((a, b) => b.score - a.score || a.original.localeCompare(b.original))
    return { word: candidates[0].original, entry: candidates[0].entry }
  }, [detailVerse])

  return (
    <div className={isNative ? 'app is-native' : 'app'} data-active-tab={tab}>
      <audio ref={audioRef} src={audioUrl || undefined} onEnded={() => setAudioPlaying(false)} onPause={() => setAudioPlaying(false)} onPlay={() => setAudioPlaying(true)} />
      <header className="app-header">
        <h1>
          <img
            className={isNative ? 'brand-logo' : 'brand-wordmark'}
            src={isNative
              ? (theme === 'dark'
                ? `/branding/tan/logo-192.png?v=${BRANDING_ASSET_VERSION}`
                : `/branding/green/logo-192.png?v=${BRANDING_ASSET_VERSION}`)
              : (theme === 'dark'
                ? `/branding/tan/wordmark-192.png?v=${BRANDING_ASSET_VERSION}`
                : `/branding/green/wordmark-192.png?v=${BRANDING_ASSET_VERSION}`)}
            srcSet={
              isNative
                ? (theme === 'dark'
                  ? `/branding/tan/logo-96.png?v=${BRANDING_ASSET_VERSION} 1x, /branding/tan/logo-192.png?v=${BRANDING_ASSET_VERSION} 2x, /branding/tan/logo-512.png?v=${BRANDING_ASSET_VERSION} 3x`
                  : `/branding/green/logo-96.png?v=${BRANDING_ASSET_VERSION} 1x, /branding/green/logo-192.png?v=${BRANDING_ASSET_VERSION} 2x, /branding/green/logo-512.png?v=${BRANDING_ASSET_VERSION} 3x`)
                : (theme === 'dark'
                  ? `/branding/tan/wordmark-64.png?v=${BRANDING_ASSET_VERSION} 1x, /branding/tan/wordmark-128.png?v=${BRANDING_ASSET_VERSION} 2x, /branding/tan/wordmark-192.png?v=${BRANDING_ASSET_VERSION} 3x`
                  : `/branding/green/wordmark-64.png?v=${BRANDING_ASSET_VERSION} 1x, /branding/green/wordmark-128.png?v=${BRANDING_ASSET_VERSION} 2x, /branding/green/wordmark-192.png?v=${BRANDING_ASSET_VERSION} 3x`)
            }
            alt={t('appTitle')}
            height={isNative ? 40 : 64}
          />
          {isNative && (
            <span className="header-actions">
              <button className="theme-toggle" onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')} title={theme === 'dark' ? t('lightMode') : t('darkMode')}>
                {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
              </button>
              {YOUVERSION_APP_KEY ? <SettingsMenu /> : null}
              {YOUVERSION_APP_KEY ? <AuthSignOutButton /> : null}
            </span>
          )}
        </h1>
        <div className="tabs">
          <button className={`tab ${tab === 'search' ? 'active' : ''}`} onClick={() => { setQuery(''); setResults([]); setYvSearchResults([]); setYvSearchError(''); setHeaderQuery(''); setTab('search') }}>
            <Search size={16} /> {t('search')}
          </button>
          <button className={`tab ${tab === 'reader' ? 'active' : ''}`} onClick={() => setTab('reader')}>
            <BookOpen size={16} /> {t('reader')}
          </button>
          <button className={`tab ${tab === 'wayfinder' ? 'active' : ''}`} onClick={() => setTab('wayfinder')}>
            <Share2 size={16} /> {t('wayfinder')}
          </button>
          <button className={`tab ${tab === 'map' ? 'active' : ''}`} onClick={() => setTab('map')}>
            <MapIcon size={16} /> {t('map')}
          </button>
          <button className={`tab ${tab === 'lexicon' ? 'active' : ''}`} onClick={() => { setQuery(''); setHeaderQuery(''); setTab('lexicon') }}>
            <Book size={16} /> {t('words')}
          </button>
        </div>
        <div className="header-tools">
          {tab !== 'search' && (
            <div className="header-search-shell" ref={mapSearchResultsHostRef}>
              <form
                className="header-search"
                onSubmit={(e) => {
                  e.preventDefault()
                  const trimmed = headerQuery.trim()
                  if (!trimmed) return
                  if (tab === 'lexicon') {
                    setQuery(trimmed)
                    return
                  }
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
            </div>
          )}
          {!isNative && (
            <>
              <button
                type="button"
                className="language-toggle"
                onClick={() => setLanguage(language === 'en' ? 'es' : 'en')}
                title={t('language')}
                aria-label={`${t('language')} (${language.toUpperCase()})`}
              >
                <span aria-hidden="true">{language.toUpperCase()}</span>
              </button>
              <button className="theme-toggle" onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')} title={theme === 'dark' ? t('lightMode') : t('darkMode')}>
                {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
              </button>
              {YOUVERSION_APP_KEY ? <SettingsMenu /> : null}
              {YOUVERSION_APP_KEY ? <AuthSignOutButton /> : null}
            </>
          )}
        </div>
      </header>

      {loading ? (
        <div className="panel empty" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <Loader2 className="spin" size={20} /> {t('loading')}
        </div>
      ) : error ? (
        <div className="panel empty">{error}</div>
      ) : (
        <main className="app-main">
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
              onSelect={setSelectedId}
              readerVersion={readerVersion}
              onHoverVerse={setHoveredId}
              onSelectResult={recordSearchSelection}
              bookmarks={bookmarks}
              onToggleBookmark={handleBookmark}
              recentSearches={recentSearches}
            />
          )}
          {tab === 'reader' && (
            YOUVERSION_APP_KEY ? (
              <YouVersionProvider
                appKey={YOUVERSION_APP_KEY}
                theme={theme}
                includeAuth={true}
                authRedirectUrl={getYouVersionRedirectUrl()}
              >
                <YouVersionReaderTab
                  selectedId={selectedId}
                  onSelect={setSelectedId}
                  bookmarks={bookmarks}
                  onToggleBookmark={handleBookmark}
                  audioUrl={audioUrl}
                  audioPlaying={audioPlaying}
                  audioLoading={audioLoading}
                  audioTitle={audioTitle}
                  onToggleAudio={toggleAudio}
                  onVersionChange={setReaderVersion}
                />
              </YouVersionProvider>
            ) : (
              <div className="panel empty">Missing YouVersion app key. Add `VITE_YVP_APP_KEY` to `web/.env.local`.</div>
            )
          )}
          {tab === 'wayfinder' && (
            <WayfinderTab
              memories={memories}
              selectedVerse={selected}
              onSelect={setSelectedId}
              onSaveMemory={(m) => setMemories(saveMemory(m))}
              onDeleteMemory={(id) => setMemories(deleteMemory(id))}
            />
          )}
          {tab === 'map' && (
            <MapTab
              selectedVerse={selected}
              onSelect={setSelectedId}
              selectedId={selectedId}
              theme={theme}
              query={headerQuery}
              onQuery={setHeaderQuery}
              searchResultsHost={mapSearchResultsHost}
            />
          )}


          {tab === 'search' && (
            <aside className="sidebar verse-sidebar">
              <LexiconTab query={query} onQuery={setQuery} onSelect={setSelectedId} />
              {detailVerse ? (
                <>
                  <section className="detail-card detail-card-hero">
                    <div className="verse-ref">
                      {detailVerse!.bookName} {detailVerse!.chapter}:{detailVerse!.verse} ({detailVerse!.translation.toUpperCase()})
                    </div>
                    <div className="verse-text">{detailVerse!.text}</div>
                    <div className="detail-actions-row">
                      <span className="verse-meta-pill">{t('selectVerse')}</span>
                      <button onClick={() => handleBookmark(detailVerse!.id, readerVersion ? String(readerVersion.id) : detailVerse!.translation, readerVersion ? (readerVersion.abbreviation || readerVersion.name) : detailVerse!.translation.toUpperCase())}>
                        {isBookmarked(detailVerse!.id, readerVersion ? String(readerVersion.id) : detailVerse!.translation) ? t('unbookmark') : t('bookmark')}
                      </button>
                    </div>
                  </section>

                  {wordStudyMatch && (
                    <section className="detail-card">
                      <h4 className="section-title">{t('words')}</h4>
                      <div className="meaning-box meaning-box-word-study">
                        <p className="word-study-word">{wordStudyMatch.entry.word}</p>
                        {wordStudyMatch.entry.kjvMeaning && (
                          <p className="word-study-kjv">{wordStudyMatch.entry.kjvMeaning}</p>
                        )}
                        <p>{wordStudyMatch.entry.modernMeaning}{wordStudyMatch.entry.historicalContext ? ` . ${wordStudyMatch.entry.historicalContext}` : ''}</p>
                      </div>
                    </section>
                  )}

                  <section className="detail-card">
                    <h4 className="section-title">{t('aiInsight')}</h4>
                    <div className="meaning-box meaning-box-highlight">
                      <p>{generateInsight(detailVerse!, detailRelatedMatches.map((match) => match.verse))}</p>
                    </div>
                  </section>

                  <section className="detail-card">
                    <div className="detail-card-heading" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem', marginBottom: '0.65rem' }}>
                      <h4 className="section-title" style={{ marginBottom: 0 }}>{t('related')}</h4>
                      {detailRelatedMatches.some((match) => match.source === 'curated') && (
                        <span className="verse-meta-pill">Curated OpenBible</span>
                      )}
                    </div>
                    <div className="verse-list">
                      {detailRelatedMatches.slice(0, 8).map((match) => {
                        const v = match.verse
                        return (
                          <div key={v.id} className="verse-card" onClick={() => setSelectedId(v.id)}>
                            <div className="verse-ref" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', justifyContent: 'space-between' }}>
                              <span>{v.bookName} {v.chapter}:{v.verse}</span>
                              {match.source === 'curated' && <span className="verse-meta-pill" style={{ padding: '0.24rem 0.5rem', fontSize: '0.7rem' }}>Curated</span>}
                            </div>
                            <div className="verse-text">{v.text.slice(0, 120)}{v.text.length > 120 ? '…' : ''}</div>
                          </div>
                        )
                      })}
                    </div>
                  </section>
                </>
              ) : (
                <div className="detail-empty">
                  <div>
                    <h4 className="section-title">{t('selectVerse')}</h4>
                    <p>{t('selectVerseHint')}</p>
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
  readerVersion,
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
  readerVersion: { id: number; name: string; abbreviation: string } | null
  onHoverVerse: (id: string | null) => void
  onSelectResult: (id: string, query: string) => void
  bookmarks: BookmarkType[]
  onToggleBookmark: (id: string, versionId?: string, versionAbbreviation?: string) => void
  recentSearches: RecentSearch[]
}) {
  const { t } = useI18n()
  const [mode, setMode] = useState<'search' | 'bookmarks'>('search')
  const all = getAllVerses()
  const currentVersionId = readerVersion ? String(readerVersion.id) : ''
  const allBookmarkedVerses = useMemo(
    () => bookmarks
      .map((b) => {
        const verse = all.find((v) => v.id === b.verseId)
        return verse ? { id: b.id, verse, versionId: b.versionId ?? '', versionAbbreviation: b.versionAbbreviation ?? '' } : null
      })
      .filter((i): i is { id: string; verse: Verse; versionId: string; versionAbbreviation: string } => Boolean(i)),
    [all, bookmarks],
  )
  const activeVersionBookmarked = useMemo(
    () => new Set(bookmarks.filter((b) => b.versionId === currentVersionId).map((b) => b.verseId)),
    [bookmarks, currentVersionId],
  )

  const recentSearchCount = useMemo(
    () => recentSearches.filter((r) => findVerse(r.verseId)).length,
    [recentSearches],
  )

  const showingBookmarks = mode === 'bookmarks'
  const bookmarked = useMemo(
    () => (showingBookmarks ? new Set(allBookmarkedVerses.map((i) => i.verse.id)) : activeVersionBookmarked),
    [showingBookmarks, allBookmarkedVerses, activeVersionBookmarked],
  )

  const resultCount = useMemo(
    () => (showingBookmarks ? allBookmarkedVerses.length : query.trim() ? results.length : recentSearchCount),
    [showingBookmarks, allBookmarkedVerses.length, query, results.length, recentSearchCount],
  )

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
            onKeyDown={(e) => e.key === 'Enter' && !showingBookmarks && onSearch(query)}
          />
          {query && (
            <button className="search-clear" onClick={() => { onQuery(''); setMode('search') }}>
              <X size={16} />
            </button>
          )}
        </div>
        {(query.trim() || showingBookmarks) && resultCount > 0 && (
          <div className="result-count">{t('resultCount', { count: String(resultCount) })}</div>
        )}
      </div>
      <div className="verse-list">
          {showingBookmarks ? (
          allBookmarkedVerses.length === 0 ? (
            <div className="empty">{t('noBookmarks')}</div>
          ) : (
            allBookmarkedVerses.map((item) => (
              <div
                key={item.id}
                className={`verse-card ${selectedId === item.verse.id ? 'active' : ''}`}
                onClick={() => onSelect(item.verse.id)}
                onDoubleClick={() => onSelectResult(item.verse.id, `${item.verse.bookName} ${item.verse.chapter}:${item.verse.verse}`)}
                onPointerEnter={() => onHoverVerse(item.verse.id)}
                onFocus={() => onHoverVerse(item.verse.id)}
              >
                <div className="verse-ref">
                  <span>{item.verse.bookName} {item.verse.chapter}:{item.verse.verse}</span>
                  {item.versionAbbreviation ? (
                    <span className="verse-meta-pill" style={{ marginLeft: 'auto' }}>{item.versionAbbreviation}</span>
                  ) : item.versionId ? (
                    <span className="verse-meta-pill" style={{ marginLeft: 'auto' }}>{item.versionId.toUpperCase()}</span>
                  ) : null}
                  <button
                    className="secondary"
                    onClick={(e) => { e.stopPropagation(); onToggleBookmark(item.verse.id, item.versionId, item.versionAbbreviation) }}
                    aria-label={t('unbookmark')}
                  >
                    <Bookmark size={14} fill="currentColor" />
                  </button>
                </div>
                <div
                  className="verse-text"
                  dangerouslySetInnerHTML={{
                    __html: redLetterVerseHtml(item.verse.text, item.verse.book, item.verse.chapter, item.verse.verse),
                  }}
                />
              </div>
            ))
          )
        ) : !query.trim() ? (
          <div className="recent-searches">
            <div className="recent-searches-heading">
              <h4 className="section-title">{t('recentSearches')}</h4>
              {resultCount > 0 && (
                <div className="result-count">{t('resultCount', { count: String(resultCount) })}</div>
              )}
            </div>
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
                      onClick={() => onSelect(recent.verseId)}
                      onDoubleClick={() => onSelectResult(recent.verseId, recent.query)}
                      onPointerEnter={() => onHoverVerse(verse.id)}
                      onFocus={() => onHoverVerse(verse.id)}
                    >
                      <div className="verse-ref">
                        <span>{verse.bookName} {verse.chapter}:{verse.verse}</span>
                        {recent.versionAbbreviation ? (
                          <span className="verse-meta-pill" style={{ marginLeft: 'auto' }}>{recent.versionAbbreviation}</span>
                        ) : recent.versionId ? (
                          <span className="verse-meta-pill" style={{ marginLeft: 'auto' }}>{recent.versionId.toUpperCase()}</span>
                        ) : null}
                        <button
                          className="secondary"
                          onClick={(e) => { e.stopPropagation(); onToggleBookmark(verse.id, readerVersion ? String(readerVersion.id) : verse.translation, readerVersion ? (readerVersion.abbreviation || readerVersion.name) : verse.translation.toUpperCase()) }}
                          aria-label={bookmarked.has(verse.id) ? t('unbookmark') : t('bookmark')}
                        >
                          {bookmarked.has(verse.id) ? <Bookmark size={14} fill="currentColor" /> : <Bookmark size={14} />}
                        </button>
                      </div>
                      <div
                        className="verse-text"
                        dangerouslySetInnerHTML={{
                          __html: redLetterVerseHtml(verse.text, verse.book, verse.chapter, verse.verse),
                        }}
                      />
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        ) : (
          <>

            {results.length === 0 ? (
              <div className="empty">{t('noResults')}</div>
            ) : (
              results.map(({ verse }) => (
                <div
                  key={verse.id}
                  className={`verse-card ${selectedId === verse.id ? 'active' : ''}`}
                  onClick={() => onSelect(verse.id)}
                  onDoubleClick={() => onSelectResult(verse.id, query)}
                  onPointerEnter={() => onHoverVerse(verse.id)}
                  onFocus={() => onHoverVerse(verse.id)}
                >
                  <div className="verse-ref">
                    <span>{verse.bookName} {verse.chapter}:{verse.verse}</span>
                    {(readerVersion || verse.translation) && (
                      <span className="verse-meta-pill" style={{ marginLeft: 'auto' }}>{readerVersion ? (readerVersion.abbreviation || readerVersion.name) : verse.translation.toUpperCase()}</span>
                    )}
                    <button
                      className="secondary"
                      onClick={(e) => { e.stopPropagation(); onToggleBookmark(verse.id, readerVersion ? String(readerVersion.id) : verse.translation, readerVersion ? (readerVersion.abbreviation || readerVersion.name) : verse.translation.toUpperCase()) }}
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
          </>
        )}

      </div>
    </div>
  )
}

function LexiconQueryPanel({
  query,
  onQuery,
}: {
  query: string
  onQuery: (q: string) => void
}) {
  const { t } = useI18n()
  const trimmed = query.trim()
  const entry = useMemo(() => (trimmed ? lookupLexicon(trimmed) : null), [trimmed])
  const suggestions = useMemo(() => (trimmed ? searchLexicon(trimmed) : []), [trimmed])

  if (!trimmed) return null
  if (!entry && suggestions.length === 0) return null

  return (
    <section className="detail-card">
      <h4 className="section-title">{t('words')}</h4>
      {entry ? (
        <div className="meaning-box meaning-box-word-study" style={{ marginBottom: '0.5rem' }}>
          <p className="word-study-word">{entry.word}</p>
          {entry.kjvMeaning && <p className="word-study-kjv">{entry.kjvMeaning}</p>}
          <p>{entry.modernMeaning}{entry.historicalContext ? ` . ${entry.historicalContext}` : ''}</p>
        </div>
      ) : (
        <div className="meaning-box">
          <p>{t('lexiconNotFound', { term: trimmed })}</p>
        </div>
      )}
      {suggestions.length > 0 && (
        <div className="lexicon-suggestions">
          {suggestions.map((s) => (
            <button key={s.word} className="suggestion" onClick={() => onQuery(s.word)}>
              {s.word}
            </button>
          ))}
        </div>
      )}
    </section>
  )
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

type Point = {
  x: number
  y: number
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
const MAP_LIBRARIES: 'places'[] = []
const DEFAULT_MAP_CENTER = { lat: 31.5, lng: 35.2 }

const MAP_THEME_PALETTE = {
  dark: {
    fallbackBackdrop: 'linear-gradient(180deg, #181d23 0%, #101318 100%)',
    route: '#d7be7d',
    markerDefault: '#a98b54',
    markerRelevant: '#8fd3c8',
    markerActive: '#f2efe6',
    markerStroke: '#101318',
    markerActiveStroke: '#f2efe6',
  },
  light: {
    fallbackBackdrop: 'linear-gradient(180deg, #f4ead7 0%, #e8ddc9 100%)',
    route: '#a98b54',
    markerDefault: '#a98b54',
    markerRelevant: '#5f7438',
    markerActive: '#d7be7d',
    markerStroke: '#2e372a',
    markerActiveStroke: '#fffaf2',
  },
} as const

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
  const palette = MAP_THEME_PALETTE[theme]
  const centerWorld = useMemo(() => latLngToWorld(center.lat, center.lng, FALLBACK_MAP_ZOOM), [center])
  const [panOffset, setPanOffset] = useState({ x: 0, y: 0 })
  const [scale, setScale] = useState(1)
  const panOffsetRef = useRef(panOffset)
  const scaleRef = useRef(scale)
  useEffect(() => {
    panOffsetRef.current = panOffset
  }, [panOffset])
  useEffect(() => {
    scaleRef.current = scale
  }, [scale])
  const gestureRef = useRef<{
    mode: 'idle' | 'pan' | 'pinch'
    pointers: Map<number, Point>
    startPan: Point
    startScale: number
    startDistance: number
    startMidpoint: Point
    focusWorld: Point
  }>({
    mode: 'idle',
    pointers: new Map(),
    startPan: { x: 0, y: 0 },
    startScale: 1,
    startDistance: 0,
    startMidpoint: { x: 0, y: 0 },
    focusWorld: { x: centerWorld.x, y: centerWorld.y },
  })
  const tileCount = 2 ** FALLBACK_MAP_ZOOM
  const minScale = 0.75
  const maxScale = 2.5
  const visibleTopLeft = useMemo(
    () => ({
      x: centerWorld.x - (viewport.width / 2 + panOffset.x) / scale,
      y: centerWorld.y - (viewport.height / 2 + panOffset.y) / scale,
    }),
    [centerWorld.x, centerWorld.y, panOffset.x, panOffset.y, scale, viewport.height, viewport.width],
  )
  const visibleBottomRight = useMemo(
    () => ({
      x: centerWorld.x + (viewport.width / 2 - panOffset.x) / scale,
      y: centerWorld.y + (viewport.height / 2 - panOffset.y) / scale,
    }),
    [centerWorld.x, centerWorld.y, panOffset.x, panOffset.y, scale, viewport.height, viewport.width],
  )

  const tiles = useMemo(() => {
    if (!viewport.width || !viewport.height) return []

    const startTileX = Math.floor(visibleTopLeft.x / TILE_SIZE)
    const endTileX = Math.floor(visibleBottomRight.x / TILE_SIZE)
    const startTileY = Math.floor(visibleTopLeft.y / TILE_SIZE)
    const endTileY = Math.floor(visibleBottomRight.y / TILE_SIZE)

    const tileList: Array<{ x: number; y: number; src: string }> = []

    for (let tileY = startTileY; tileY <= endTileY; tileY += 1) {
      if (tileY < 0 || tileY >= tileCount) continue
      for (let tileX = startTileX; tileX <= endTileX; tileX += 1) {
        const wrappedX = ((tileX % tileCount) + tileCount) % tileCount
        tileList.push({
          x: (tileX * TILE_SIZE - visibleTopLeft.x) * scale,
          y: (tileY * TILE_SIZE - visibleTopLeft.y) * scale,
          src: `https://tile.openstreetmap.org/${FALLBACK_MAP_ZOOM}/${wrappedX}/${tileY}.png`,
        })
      }
    }

    return tileList
  }, [scale, tileCount, visibleBottomRight.x, visibleBottomRight.y, visibleTopLeft.x, visibleTopLeft.y, viewport.height, viewport.width])

  const markerPoints = useMemo(() => {
    if (!viewport.width || !viewport.height) return []

    return places.map((place) => {
      const projected = latLngToWorld(place.lat, place.lng, FALLBACK_MAP_ZOOM)
      return {
        place,
        x: (projected.x - visibleTopLeft.x) * scale,
        y: (projected.y - visibleTopLeft.y) * scale,
      }
    })
  }, [places, scale, visibleTopLeft.x, visibleTopLeft.y, viewport.height, viewport.width])

  const pathPixels = useMemo(() => {
    if (!viewport.width || !viewport.height) return []

    return pathPoints
      .map((point) => {
        const projected = latLngToWorld(point.lat, point.lng, FALLBACK_MAP_ZOOM)
        return {
          x: (projected.x - visibleTopLeft.x) * scale,
          y: (projected.y - visibleTopLeft.y) * scale,
        }
      })
      .filter((point) => point.x >= -32 && point.x <= viewport.width + 32 && point.y >= -32 && point.y <= viewport.height + 32)
  }, [pathPoints, scale, visibleTopLeft.x, visibleTopLeft.y, viewport.height, viewport.width])

  useEffect(() => {
    const reset = { x: 0, y: 0 }
    panOffsetRef.current = reset
    scaleRef.current = 1
    setPanOffset(reset)
    setScale(1)
    gestureRef.current.mode = 'idle'
    gestureRef.current.pointers.clear()
    gestureRef.current.startPan = reset
    gestureRef.current.startScale = 1
    gestureRef.current.startDistance = 0
    gestureRef.current.startMidpoint = { x: 0, y: 0 }
    gestureRef.current.focusWorld = { x: centerWorld.x, y: centerWorld.y }
  }, [center.lat, center.lng, centerWorld.x, centerWorld.y])

  const updateGestureFromPointers = useCallback(() => {
    const gesture = gestureRef.current
    const points = Array.from(gesture.pointers.values())
    if (points.length >= 2) {
      gesture.mode = 'pinch'
      gesture.startDistance = distance(points[0], points[1])
      gesture.startMidpoint = midpoint(points[0], points[1])
      gesture.focusWorld = {
        x: centerWorld.x + (gesture.startMidpoint.x - viewport.width / 2 - gesture.startPan.x) / gesture.startScale,
        y: centerWorld.y + (gesture.startMidpoint.y - viewport.height / 2 - gesture.startPan.y) / gesture.startScale,
      }
      return
    }
    if (points.length === 1) {
      gesture.mode = 'pan'
      gesture.startMidpoint = points[0]
      gesture.startPan = { ...panOffsetRef.current }
      gesture.startScale = scaleRef.current
      gesture.startDistance = 0
      return
    }
    gesture.mode = 'idle'
  }, [centerWorld.x, centerWorld.y, panOffset, scale, viewport.height, viewport.width])

  const handlePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 && event.pointerType !== 'touch') return
    if ((event.target as HTMLElement | null)?.closest('button')) return
    const container = containerRef.current
    if (!container) return
    const rect = container.getBoundingClientRect()
    const point = { x: event.clientX - rect.left, y: event.clientY - rect.top }
    const gesture = gestureRef.current
    gesture.pointers.set(event.pointerId, point)
    gesture.startPan = { ...panOffsetRef.current }
    gesture.startScale = scaleRef.current
    updateGestureFromPointers()
    container.setPointerCapture(event.pointerId)
    event.preventDefault()
  }

  const handlePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const gesture = gestureRef.current
    if (!gesture.pointers.has(event.pointerId)) return
    const container = containerRef.current
    if (!container) return
    const rect = container.getBoundingClientRect()
    const point = { x: event.clientX - rect.left, y: event.clientY - rect.top }
    gesture.pointers.set(event.pointerId, point)

    if (gesture.mode === 'pan' && gesture.startMidpoint) {
      const dx = point.x - gesture.startMidpoint.x
      const dy = point.y - gesture.startMidpoint.y
      if (Math.abs(dx) + Math.abs(dy) > 2) {
        event.preventDefault()
        const nextPan = { x: gesture.startPan.x + dx, y: gesture.startPan.y + dy }
        panOffsetRef.current = nextPan
        setPanOffset(nextPan)
      }
      return
    }

    if (gesture.mode === 'pinch' && gesture.startDistance > 0) {
      const points = Array.from(gesture.pointers.values())
      if (points.length < 2) return
      const currentMidpoint = midpoint(points[0], points[1])
      const currentDistance = distance(points[0], points[1])
      const nextScale = clamp(gesture.startScale * (currentDistance / gesture.startDistance), minScale, maxScale)
      const nextPan = {
        x: currentMidpoint.x - viewport.width / 2 - (gesture.focusWorld.x - centerWorld.x) * nextScale,
        y: currentMidpoint.y - viewport.height / 2 - (gesture.focusWorld.y - centerWorld.y) * nextScale,
      }
      scaleRef.current = nextScale
      panOffsetRef.current = nextPan
      setScale(nextScale)
      setPanOffset(nextPan)
      event.preventDefault()
    }
  }

  const endGesture = (event: ReactPointerEvent<HTMLDivElement>) => {
    const gesture = gestureRef.current
    gesture.pointers.delete(event.pointerId)
    const container = containerRef.current
    if (container?.hasPointerCapture(event.pointerId)) {
      container.releasePointerCapture(event.pointerId)
    }
    updateGestureFromPointers()
  }

  return (
    <div
      ref={containerRef}
      className={`map-canvas map-canvas-fallback ${theme}`}
      style={{ background: palette.fallbackBackdrop, touchAction: 'none' }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={endGesture}
      onPointerCancel={endGesture}
    >
      {viewport.width > 0 && viewport.height > 0 && tiles.map((tile) => (
        <img
          key={`${tile.src}-${tile.x}-${tile.y}`}
          className="map-tile"
          src={tile.src || undefined}
          alt=""
          aria-hidden="true"
          draggable={false}
          style={{ left: tile.x, top: tile.y, width: TILE_SIZE * scale, height: TILE_SIZE * scale }}
        />
      ))}

      <svg className="map-svg map-route-overlay" viewBox={`0 0 ${Math.max(viewport.width, 1)} ${Math.max(viewport.height, 1)}`} preserveAspectRatio="none" aria-hidden="true">
        {pathPixels.length > 1 && (
          <polyline
            points={pathPixels.map((point) => `${point.x},${point.y}`).join(' ')}
            fill="none"
            stroke={palette.route}
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
  const { images: extraImages } = useWikiImages(place.id, place.name)
  const wikiLink = data?.pageUrl ?? getWikipediaLink(place.id, place.name)
  const highlightedPassages = useMemo(() => place.passages.slice(0, 6), [place.passages])

  const [lightboxOpen, setLightboxOpen] = useState(false)
  const [activeImageIndex, setActiveImageIndex] = useState(0)

  const allImages = useMemo<WikiImage[]>(() => {
    const images: WikiImage[] = []
    if (data?.imageUrl) {
      images.push({
        title: data.title,
        url: data.imageUrl,
        thumbUrl: data.thumbnailUrl ?? data.imageUrl,
      })
    } else if (data?.thumbnailUrl) {
      images.push({
        title: data.title,
        url: data.thumbnailUrl,
        thumbUrl: data.thumbnailUrl,
      })
    }
    for (const image of extraImages) {
      if (images.some((existing) => existing.url === image.url)) continue
      images.push(image)
    }
    return images
  }, [data, extraImages])

  const openLightbox = useCallback(() => {
    setLightboxOpen(true)
  }, [])

  const closeLightbox = useCallback(() => setLightboxOpen(false), [])

  const nextImage = useCallback(() => {
    setActiveImageIndex((current) => (current + 1) % allImages.length)
  }, [allImages.length])

  const previousImage = useCallback(() => {
    setActiveImageIndex((current) => (current - 1 + allImages.length) % allImages.length)
  }, [allImages.length])

  useEffect(() => {
    if (lightboxOpen) return
    setActiveImageIndex(0)
  }, [lightboxOpen, place.id])

  const popupImage = allImages[activeImageIndex] ?? {
    thumbUrl: data?.thumbnailUrl,
    url: data?.imageUrl ?? data?.thumbnailUrl,
    title: data?.title ?? place.name,
  }

  useEffect(() => {
    if (!lightboxOpen) return
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeLightbox()
      if (event.key === 'ArrowRight') nextImage()
      if (event.key === 'ArrowLeft') previousImage()
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [lightboxOpen, closeLightbox, nextImage, previousImage])

  const activeImage = allImages[activeImageIndex]

  return (
    <>
      <div className="map-place-popup" role="dialog" aria-label={place.name} aria-live="polite">
        <button type="button" className="map-place-popup-close" onClick={onClose} aria-label={t('close')}>
          <X size={20} />
        </button>

        <div className="map-place-popup-media">
          {loading ? (
            <div className="map-place-popup-media-loading">
              <Loader2 className="spin" size={16} /> {t('loading')}
            </div>
          ) : popupImage?.thumbUrl ? (
            <div className="map-place-popup-image-frame">
              <img className="map-place-popup-image" src={popupImage.thumbUrl || undefined} alt={popupImage.title ?? place.name} loading="lazy" />

              {allImages.length > 1 && (
                <button
                  type="button"
                  className="map-place-popup-image-zone map-place-popup-image-zone-left"
                  onClick={previousImage}
                  aria-label="Previous image"
                >
                  <ChevronLeft size={22} />
                </button>
              )}

              <button
                type="button"
                className="map-place-popup-image-zone map-place-popup-image-zone-center"
                onClick={openLightbox}
                aria-label={`View fullscreen image of ${place.name}`}
              >
                <span className="map-place-popup-image-overlay">
                  <Maximize2 size={18} />
                </span>
              </button>

              {allImages.length > 1 && (
                <button
                  type="button"
                  className="map-place-popup-image-zone map-place-popup-image-zone-right"
                  onClick={nextImage}
                  aria-label="Next image"
                >
                  <ChevronRight size={22} />
                </button>
              )}
            </div>
          ) : (
            <div className="map-place-popup-placeholder">
              <MapIcon size={18} />
              <span>{place.region}</span>
            </div>
          )}
          {allImages.length > 1 && (
            <div className="map-place-popup-image-count">
              {allImages.length} images
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

      {lightboxOpen && activeImage && (
        <div className="map-place-lightbox" role="dialog" aria-modal="true" aria-label={`Image ${activeImageIndex + 1} of ${allImages.length}`}>
          <button type="button" className="map-place-lightbox-close" onClick={closeLightbox} aria-label={t('close')}>
            <X size={20} />
          </button>

          {allImages.length > 1 && (
            <button
              type="button"
              className="map-place-lightbox-zone map-place-lightbox-zone-left"
              onClick={previousImage}
              aria-label="Previous image"
            >
              <ChevronLeft size={28} />
            </button>
          )}

          <div className="map-place-lightbox-content">
            <img src={activeImage.url || undefined} alt={activeImage.title} loading="lazy" />
            {allImages.length > 1 && (
              <div className="map-place-lightbox-dots">
                {allImages.map((_, index) => (
                  <button
                    key={index}
                    type="button"
                    className={`map-place-lightbox-dot ${index === activeImageIndex ? 'active' : ''}`}
                    onClick={() => setActiveImageIndex(index)}
                    aria-label={`Go to image ${index + 1}`}
                  />
                ))}
              </div>
            )}
          </div>

          {allImages.length > 1 && (
            <button
              type="button"
              className="map-place-lightbox-zone map-place-lightbox-zone-right"
              onClick={nextImage}
              aria-label="Next image"
            >
              <ChevronRight size={28} />
            </button>
          )}
        </div>
      )}
    </>
  )
}

function MapTab({
  selectedVerse,
  onSelect,
  selectedId,
  theme,
  query,
  onQuery,
  searchResultsHost,
}: {
  selectedVerse?: Verse
  onSelect: (id: string) => void
  selectedId: string | null
  theme: 'dark' | 'light'
  query: string
  onQuery: (q: string) => void
  searchResultsHost: HTMLDivElement | null
}) {
  const { t } = useI18n()
  const all = getAllVerses()
  const [allPlaces, setAllPlaces] = useState<Place[]>(getAllPlaces)
  useEffect(() => {
    Promise.all([loadPlaces(), loadCharacters()]).then(() => {
      setAllPlaces(getAllPlaces())
    })
  }, [])
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
  const palette = MAP_THEME_PALETTE[theme]

  const placeResults = useMemo(() => searchPlaces(query), [query])
  const characterResults = useMemo(() => searchCharacters(query), [query])
  const searchResultsContent = () =>
    query.trim() ? (
      <div className="map-search-dropdown" role="menu" aria-label={t('search')}>
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
    ) : null

  const [mapActivePlaceId, setMapActivePlaceId] = useState<string>(relevantPlaces[0]?.id ?? allPlaces[0]?.id ?? '')
  const [sidebarPlaceId, setSidebarPlaceId] = useState<string>(relevantPlaces[0]?.id ?? allPlaces[0]?.id ?? '')
  const [activeCharacter, setActiveCharacter] = useState<Character | null>(null)
  const [showPlacePopup, setShowPlacePopup] = useState(false)
  const [selectionSource, setSelectionSource] = useState<'map' | 'search'>('map')
  const [isCompactMap, setIsCompactMap] = useState(() => typeof window !== 'undefined' && window.matchMedia('(max-width: 720px)').matches)
  const [baseLayer, setBaseLayer] = useState<MapBaseLayer>('antique')

  useEffect(() => {
    if (!activeCharacter) {
      const defaultId = relevantPlaces[0]?.id ?? allPlaces[0]?.id ?? ''
      setMapActivePlaceId(defaultId)
      setSidebarPlaceId(defaultId)
      setSelectionSource('map')
    }
    setShowPlacePopup(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedVerse, activeCharacter])

  useEffect(() => {
    const media = window.matchMedia('(max-width: 720px)')
    const update = () => setIsCompactMap(media.matches)
    update()
    media.addEventListener('change', update)
    return () => media.removeEventListener('change', update)
  }, [])

  const mapActivePlace = getPlace(mapActivePlaceId) ?? allPlaces[0]
  const sidebarPlace = getPlace(sidebarPlaceId) ?? allPlaces[0]
  const sidebarOpen = selectionSource === 'search' && Boolean(activeCharacter || sidebarPlaceId)
  const [sidebarRevealing, setSidebarRevealing] = useState(false)
  const sidebarRef = useRef<HTMLDivElement | null>(null)
  const sidebarPreviouslyOpenRef = useRef(false)

  useEffect(() => {
    if (sidebarOpen && !sidebarPreviouslyOpenRef.current) {
      setSidebarRevealing(true)
      const hideReveal = window.setTimeout(() => setSidebarRevealing(false), 280)
      sidebarPreviouslyOpenRef.current = sidebarOpen
      return () => window.clearTimeout(hideReveal)
    }
    sidebarPreviouslyOpenRef.current = sidebarOpen
  }, [sidebarOpen])

  useEffect(() => {
    if (!sidebarOpen) return
    const handlePointerDown = (event: PointerEvent) => {
      const sidebar = sidebarRef.current
      if (!sidebar || sidebar.contains(event.target as Node)) return
      setSelectionSource('map')
      setShowPlacePopup(false)
    }
    window.addEventListener('pointerdown', handlePointerDown)
    return () => window.removeEventListener('pointerdown', handlePointerDown)
  }, [sidebarOpen])

  const mapLayoutStyle = {
    '--map-sidebar-width': sidebarOpen ? 'clamp(360px, 34vw, 520px)' : '0px',
    '--map-sidebar-gap': sidebarOpen ? '1.25rem' : '0px',
  } as CSSProperties
  const popupPlace = showPlacePopup && !isCompactMap ? mapActivePlace : undefined

  const path = useMemo(() => (activeCharacter ? getCharacterPath(activeCharacter) : []), [activeCharacter])
  const [stopIndex, setStopIndex] = useState(0)
  const [playing, setPlaying] = useState(false)
  const mapRef = useRef<google.maps.Map | null>(null)
  const pathPlaceIds = useMemo(() => new Set(path.map((stop) => stop.place?.id).filter((id): id is string => Boolean(id))), [path])
  const visiblePlaces = useMemo(
    () => (activeCharacter && playing ? allPlaces.filter((place) => pathPlaceIds.has(place.id)) : allPlaces),
    [activeCharacter, allPlaces, pathPlaceIds, playing],
  )
  const allPlacesBounds = useMemo<google.maps.LatLngBoundsLiteral | undefined>(() => {
    if (!allPlaces.length) return undefined
    const lats = allPlaces.map((p) => p.lat)
    const lngs = allPlaces.map((p) => p.lng)
    return {
      north: Math.max(...lats),
      south: Math.min(...lats),
      east: Math.max(...lngs),
      west: Math.min(...lngs),
    }
  }, [allPlaces])

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

  const selectPlace = (id: string) => {
    setMapActivePlaceId(id)
    setActiveCharacter(null)
    onQuery('')
    if (isNativePlatform || isCompactMap) {
      setSidebarPlaceId(id)
      setSelectionSource('search')
      setShowPlacePopup(false)
    } else {
      setSelectionSource('map')
      setShowPlacePopup(true)
    }
  }

  const selectPlaceFromSearch = (id: string) => {
    setMapActivePlaceId(id)
    setSidebarPlaceId(id)
    setActiveCharacter(null)
    onQuery('')
    setSelectionSource('search')
    setShowPlacePopup(false)
  }

  const selectSidebarPlace = (id: string) => {
    setMapActivePlaceId(id)
    setSidebarPlaceId(id)
    setActiveCharacter(null)
    onQuery('')
    setSelectionSource('search')
    setShowPlacePopup(false)
  }

  const selectCharacter = (character: Character, source: 'map' | 'search' = 'search') => {
    setActiveCharacter(character)
    setSelectionSource(source)
    setShowPlacePopup(false)
    onQuery('')
    const first = getCharacterPath(character)[0]
    if (first?.place) {
      setMapActivePlaceId(first.place.id)
      setSidebarPlaceId(first.place.id)
    }
  }

  const visiblePassages = sidebarPlace ? getPassagesForPlace(sidebarPlace, all, 8) : []
  const nearbyPlaces = allPlaces.filter((p) => p.id !== sidebarPlace?.id).slice(0, 10)
  const center = mapCenter
  const pathCoords = path
    .slice(0, stopIndex + 1)
    .map((s) => (s.place ? { lat: s.place.lat, lng: s.place.lng } : null))
    .filter((c): c is { lat: number; lng: number } => c !== null)
  const useFallbackMap = isNativePlatform || loadError || !isLoaded

  return (
    <div className={`panel map-layout ${sidebarOpen ? 'sidebar-open' : 'sidebar-closed'}`} style={mapLayoutStyle}>
      <div className="map-grid">
        <section className="map-canvas-card">
          {searchResultsHost ? createPortal(searchResultsContent(), searchResultsHost) : null}

          <div className="map-canvas map-canvas-google">
            {popupPlace ? <MapPlacePopup place={popupPlace} onClose={() => setShowPlacePopup(false)} /> : null}
            {useFallbackMap ? (
              <FallbackMapView
                places={visiblePlaces}
                activePlaceId={mapActivePlace?.id}
                relevantIds={relevantIds}
                pathPoints={pathCoords}
                center={center}
                onSelect={selectPlace}
                theme={theme}
              />
            ) : null}
            {loadError && !isNativePlatform && !useFallbackMap && <div className="empty">{t('mapLoadError')}</div>}
            {!useFallbackMap && !isLoaded && (
              <div className="empty" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Loader2 className="spin" size={18} /> {t('loading')}
              </div>
            )}
            {isLoaded && !useFallbackMap && !allPlaces.length && (
              <div className="empty" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Loader2 className="spin" size={18} /> Loading places…
              </div>
            )}
            {isLoaded && !useFallbackMap && allPlaces.length > 0 && (<>
              <div
                className="map-base-control"
                style={{
                  position: 'absolute',
                  top: '0.75rem',
                  right: '0.75rem',
                  zIndex: 10,
                }}
              >
                <select
                  aria-label="Base map"
                  value={baseLayer}
                  onChange={(e) => setBaseLayer(e.target.value as MapBaseLayer)}
                  style={{
                    padding: '0.4rem 0.6rem',
                    borderRadius: '0.5rem',
                    border: '1px solid color-mix(in srgb, var(--accent) 22%, var(--muted))',
                    background: 'var(--surface)',
                    color: 'var(--text)',
                    fontSize: '0.875rem',
                    cursor: 'pointer',
                  }}
                >
                  {BASE_LAYERS.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.label}
                    </option>
                  ))}
                </select>
              </div>
              <GoogleMap
                key={`${theme}-${baseLayer}`}
                mapContainerStyle={{ width: '100%', height: '100%' }}
                center={center}
                zoom={4}
                options={{
                  ...getMapOptions(baseLayer, theme),
                  minZoom: 3,
                  maxZoom: 18,
                  ...(allPlacesBounds
                    ? { restriction: { latLngBounds: allPlacesBounds, strictBounds: false } }
                    : {}),
                }}
                onLoad={(map) => {
                  mapRef.current = map
                  if (allPlacesBounds) {
                    const bounds = new google.maps.LatLngBounds()
                    bounds.extend({ lat: allPlacesBounds.south, lng: allPlacesBounds.west })
                    bounds.extend({ lat: allPlacesBounds.north, lng: allPlacesBounds.east })
                    map.fitBounds(bounds, { top: 64, right: 64, bottom: 64, left: 64 })
                    google.maps.event.addListenerOnce(map, 'idle', () => {
                      const z = map.getZoom()
                      if (z != null) map.setZoom(z + 0.5)
                    })
                  }
                }}
              >
                <MapMarkers
                  places={visiblePlaces}
                  palette={palette}
                  theme={theme}
                  relevantIds={relevantIds}
                  activePlaceId={mapActivePlace?.id}
                  onSelect={selectPlace}
                />
                {pathCoords.length > 1 && (
                  <Polyline
                    path={pathCoords}
                    options={{ strokeColor: palette.route, strokeOpacity: 0.9, strokeWeight: 3 }}
                  />
                )}
              </GoogleMap>
          </>)}
          </div>
        </section>

          <aside ref={sidebarRef} className={`map-sidebar ${sidebarOpen ? 'open' : 'closed'} ${sidebarRevealing ? 'revealing' : ''}`} aria-hidden={!sidebarOpen}>
            <div className="map-sidebar-inner">
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
              ) : sidebarPlace ? (
                <>
                  <div key={`place-${sidebarPlace.id}`} className="map-location-card map-card-pop">
                    <div className="map-location-region">{sidebarPlace.region}</div>
                    <h3>{sidebarPlace.name}</h3>
                    <p>{sidebarPlace.description}</p>
                    {visiblePassages.length === 0 && (
                      <div className="map-passage-list">
                        {sidebarPlace.passages.slice(0, 4).map((passage, i) => (
                          <span key={i} className="map-passage-tag">{passage.book} {passage.startChapter}</span>
                        ))}
                      </div>
                    )}
                    {selectedVerse && relevantIds.has(sidebarPlace.id) ? (
                      <div className="map-location-context">{selectedVerse.bookName} {selectedVerse.chapter}:{selectedVerse.verse}</div>
                    ) : (
                      <div className="map-location-context">{t('tapAPlace')}</div>
                    )}
                  </div>

                  <WikiMediaCard
                    key={`place-wiki-${sidebarPlace.id}`}
                    id={sidebarPlace.id}
                    title={sidebarPlace.name}
                    passages={sidebarPlace.passages.slice(0, 4)}
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
                        <button key={place.id} className={`map-place-chip ${place.id === sidebarPlace?.id ? 'active' : ''}`} onClick={() => selectSidebarPlace(place.id)}>
                          <span>{place.name}</span>
                          <small>{place.region}</small>
                        </button>
                      ))}
                    </div>
                  </div>
                </>
              ) : null}
            </div>
          </aside>
      </div>
    </div>
  )
}






