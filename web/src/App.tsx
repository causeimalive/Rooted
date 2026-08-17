import { createPortal } from 'react-dom'
import { lazy, Suspense, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent, type WheelEvent as ReactWheelEvent } from 'react'
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
import MapRegionLegend from './MapRegionLegend'
import MapRegions from './MapRegions'
import MapRoutes from './MapRoutes'
import MapGeoData from './MapGeoData'
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
import SyncVersionMenu from './SyncVersionMenu'
const NetworkThreeScene = lazy(() => import('./NetworkThreeScene'))
import { SCENE_PALETTE } from './relationshipGraph/palette'
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
import { Bookmark as BookmarkType, Memory, Verse, type LexiconEntry, type Place, type RecentSearch } from './types'
import type { Character } from './types'
import { useI18n } from './i18n'
import { getUserPreference, setUserPreference } from './userProfile'
import { getWikipediaLink, useWikiImages, useWikiSummary, type WikiImage } from './wikipedia'
import { useYVAuth } from '@youversion/platform-react-hooks'
import { getYouVersionRedirectUrl } from './youversionRedirect'

type Tab = 'search' | 'reader' | 'wayfinder' | 'map' | 'words'

const TABS: Tab[] = ['search', 'reader', 'wayfinder', 'map', 'words']

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

function proxyMediaUrl(url: string): string {
  try {
    const u = new URL(url)
    const proxied = new URL(u.pathname, 'https://rootedinchrist.faith/api/youversion')
    u.searchParams.forEach((value, key) => proxied.searchParams.set(key, value))
    proxied.searchParams.set('host', u.host)
    return proxied.toString()
  } catch {
    return url
  }
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

function SettingsMenu({ lastReadBook }: { lastReadBook: string }) {
  const { auth, userInfo } = useYVAuth()
  const userId = userInfo?.userId
  const [isOpen, setIsOpen] = useState(false)
  const [isVersionMenuOpen, setIsVersionMenuOpen] = useState(false)
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

  const handleOpenSyncMenu = useCallback(() => {
    if (!auth.isAuthenticated) {
      setSyncState('error')
      setSyncMessage('Sign in to sync with YouVersion.')
      return
    }
    setIsVersionMenuOpen(true)
  }, [auth.isAuthenticated])

  const handleSyncSelected = useCallback(async (versionIds: number[], bookIds?: string[], onlySavedChapters?: boolean) => {
    const syncUserId = getCurrentUserId() ?? userId
    if (!syncUserId) return
    if (!versionIds.length) {
      setSyncState('error')
      setSyncMessage('Select at least one version to sync.')
      return
    }
    setSyncState('syncing')
    setSyncMessage('Syncing local bookmarks...')
    try {
      await syncUserData(syncUserId)
      let totalImported = 0
      for (const versionId of versionIds) {
        const imported = await importAllYouVersionHighlights(versionId, (done, total, current) => {
          setSyncMessage(`Version ${versionId}: ${done} / ${total} (${current})`)
        }, bookIds, onlySavedChapters)
        totalImported += imported
      }
      await syncUserData(syncUserId)
      setSyncState('success')
      setSyncMessage(`Sync complete — imported ${totalImported} highlight${totalImported === 1 ? '' : 's'}`)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      console.error('Sync failed:', error)
      setSyncState('error')
      setSyncMessage(message)
    }
  }, [userId])

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
                      onClick={() => void handleOpenSyncMenu()}
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
      {isVersionMenuOpen && YOUVERSION_APP_KEY && (
        <YouVersionProvider
          appKey={YOUVERSION_APP_KEY}
          theme="dark"
          includeAuth={false}
        >
          <SyncVersionMenu
            open={isVersionMenuOpen}
            lastReadVersion={lastReadVersion}
            lastReadBook={lastReadBook}
            onClose={() => setIsVersionMenuOpen(false)}
            onSync={handleSyncSelected}
          />
        </YouVersionProvider>
      )}
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
  const [lastReadBook, setLastReadBook] = useState<string>(() =>
    typeof window !== 'undefined' ? localStorage.getItem('bible-study-yv-book') ?? '' : ''
  )
  const [lastReadChapter, setLastReadChapter] = useState<number>(() => {
    const saved = typeof window !== 'undefined' ? Number(localStorage.getItem('bible-study-yv-chapter')) : 0
    return Number.isFinite(saved) && saved > 0 ? saved : 1
  })
  const [lastReadBookName, setLastReadBookName] = useState<string>(() =>
    typeof window !== 'undefined' ? localStorage.getItem('bible-study-yv-book-name') ?? '' : ''
  )
  const [readerVersion, setReaderVersion] = useState<{ id: number; name: string; abbreviation: string } | null>(null)
  const [hoveredId, setHoveredId] = useState<string | null>(null)
  const [recentSearches, setRecentSearches] = useState<RecentSearch[]>(getRecentSearches())
  const [bookmarks, setBookmarks] = useState<BookmarkType[]>(getBookmarks())
  const [memories, setMemories] = useState<Memory[]>(getMemories())
  const handleSaveMemory = useCallback((m: Memory) => setMemories(saveMemory(m)), [])
  const handleDeleteMemory = useCallback((id: string) => setMemories(deleteMemory(id)), [])
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
    const bookReference = selected
      ? chapterReferenceForAudio(selected)
      : lastReadBook && Number.isFinite(lastReadChapter) && lastReadChapter > 0
        ? `${lastReadBook}.${lastReadChapter}`
        : ''
    const bookName = selected ? selected.bookName : lastReadBookName || lastReadBook
    if (!bookReference) {
      setAudioUrl('')
      setAudioTitle('')
      setAudioError('')
      return
    }
    let cancelled = false
    setAudioLoading(true)
    setAudioError('')
    const versionId = readerVersion?.id ?? 111
    fetchYouVersionAudioChapter(versionId, bookReference)
      .then((audio) => {
        if (cancelled) return
        const picked = pickAudioUrl(audio)
        if (picked) {
          setAudioUrl(proxyMediaUrl(picked.url))
          setAudioTitle(`${picked.title} — ${bookName} ${selected ? selected.chapter : lastReadChapter}`)
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
  }, [selected, readerVersion, lastReadBook, lastReadChapter, lastReadBookName])

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
              {YOUVERSION_APP_KEY ? <SettingsMenu lastReadBook={lastReadBook} /> : null}
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
          <button className={`tab ${tab === 'words' ? 'active' : ''}`} onClick={() => { setQuery(''); setHeaderQuery(''); setTab('words') }}>
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
                  if (tab === 'words') {
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
              {YOUVERSION_APP_KEY ? <SettingsMenu lastReadBook={lastReadBook} /> : null}
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
                  onLastReadChange={(bookId, chapter, bookName) => {
                    setLastReadBook(bookId)
                    setLastReadChapter(chapter)
                    setLastReadBookName(bookName)
                    window.localStorage.setItem('bible-study-yv-book', bookId)
                    window.localStorage.setItem('bible-study-yv-chapter', String(chapter))
                    window.localStorage.setItem('bible-study-yv-book-name', bookName)
                  }}
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
              onSaveMemory={handleSaveMemory}
              onDeleteMemory={handleDeleteMemory}
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
  const [mode, setMode] = useState<'search' | 'bookmarks' | 'lexicon'>('search')
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
  const showingLexicon = mode === 'lexicon'
  const bookmarked = useMemo(
    () => (showingBookmarks ? new Set(allBookmarkedVerses.map((i) => i.verse.id)) : activeVersionBookmarked),
    [showingBookmarks, allBookmarkedVerses, activeVersionBookmarked],
  )

  const resultCount = useMemo(
    () => (showingLexicon ? 0 : showingBookmarks ? allBookmarkedVerses.length : query.trim() ? results.length : recentSearchCount),
    [showingLexicon, showingBookmarks, allBookmarkedVerses.length, query, results.length, recentSearchCount],
  )

  return (
    <div className="panel">
      <div className="search-header">
        <div className="search-mode-toggle">
          <button
            className={`search-mode-btn ${mode === 'search' ? 'active' : ''}`}
            onClick={() => setMode('search')}
          >
            <Search size={14} /> {t('search')}
          </button>
          <button
            className={`search-mode-btn ${mode === 'bookmarks' ? 'active' : ''}`}
            onClick={() => setMode('bookmarks')}
          >
            <Bookmark size={14} /> {t('bookmarks')}
          </button>
          <button
            className={`search-mode-btn ${mode === 'lexicon' ? 'active' : ''}`}
            onClick={() => setMode('lexicon')}
          >
            <BookOpen size={14} /> Lexicon
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
            onKeyDown={(e) => e.key === 'Enter' && !showingBookmarks && !showingLexicon && onSearch(query)}
          />
          {query && (
            <button className="search-clear" onClick={() => { onQuery(''); setMode('search') }}>
              <X size={16} />
            </button>
          )}
        </div>
        {!showingLexicon && (query.trim() || showingBookmarks) && resultCount > 0 && (
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
        ) : showingLexicon ? (
          <LexiconTab query={query} onQuery={onQuery} onSelect={onSelect} mode="entry" />
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
        ) : results.length === 0 ? (
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

type NetworkKind = 'center' | 'related' | 'theme' | 'echo' | 'ambient' | 'book' | 'chapter' | 'person' | 'place' | 'event' | 'userWaypoint'

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

function buildNetworkNodes(centerVerse: Verse, relatedMatches: VerseMatch[], themes: NetworkTheme[], selectedPersonId?: string): NetworkNode[] {
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

  const people = getCharactersForVerse(centerVerse, 3)
  const places = getPlacesForVerse(centerVerse, 3)

  people.forEach((person, index) => {
    const angle = Math.PI + (index / Math.max(people.length, 1)) * Math.PI + (hashString(person.id) / 3600) * Math.PI * 0.2
    const radius = 52
    const x = clamp(50 + Math.cos(angle) * radius, 5, 95)
    const y = clamp(50 + Math.sin(angle) * radius * 0.9, 5, 95)

    nodes.push({
      id: `person-${person.id}`,
      kind: 'person',
      label: person.name,
      detail: person.era || 'Person',
      x,
      y,
      z: clamp(20 + index * 8, 10, 44),
      size: 72,
      score: 0,
    })
  })

  places.forEach((place, index) => {
    const angle = (index / Math.max(places.length, 1)) * Math.PI * 2 + (hashString(place.id) / 3600) * Math.PI * 0.2
    const radius = 62
    const x = clamp(50 + Math.cos(angle) * radius, 5, 95)
    const y = clamp(50 + Math.sin(angle) * radius * 0.9, 5, 95)

    nodes.push({
      id: `place-${place.id}`,
      kind: 'place',
      label: place.name,
      detail: place.region || 'Place',
      x,
      y,
      z: clamp(-20 - index * 8, -44, -10),
      size: 72,
      score: 0,
    })
  })

  if (selectedPersonId) {
    const selected = getCharacter(selectedPersonId)
    const alreadyIncluded = people.some((p) => p.id === selectedPersonId)
    if (selected && !alreadyIncluded) {
      const angle = (hashString(selected.id) / 3600) * Math.PI * 2
      const x = clamp(50 + Math.cos(angle) * 52, 5, 95)
      const y = clamp(50 + Math.sin(angle) * 52 * 0.9, 5, 95)
      nodes.push({
        id: `person-${selected.id}`,
        kind: 'person',
        label: selected.name,
        detail: selected.era || 'Person',
        x,
        y,
        z: 30,
        size: 72,
        score: 0,
      })
    }
  }

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

  relatedMatches.forEach((match) => {
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

  const peopleForCenter = getCharactersForVerse(centerVerse, 3)
  const placesForCenter = getPlacesForVerse(centerVerse, 3)

  peopleForCenter.forEach((person) => {
    edges.push({
      id: `spoke-person-${centerVerse.id}-${person.id}`,
      source: `center-${centerVerse.id}`,
      target: `person-${person.id}`,
      weight: 0.8,
      kind: 'spoke',
    })
  })

  placesForCenter.forEach((place) => {
    edges.push({
      id: `spoke-place-${centerVerse.id}-${place.id}`,
      source: `center-${centerVerse.id}`,
      target: `place-${place.id}`,
      weight: 0.8,
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
      occupied.add(echo.verse.id)
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

type AmbientBibleData = {
  bookNodes: NetworkNode[]
  chapterNodes: NetworkNode[]
  chapterByKey: Map<string, NetworkNode>
  verseByChapter: Map<string, Verse[]>
}

function buildBibleHierarchyNodes(allVerses: Verse[]): AmbientBibleData {
  if (!allVerses.length) {
    return { bookNodes: [], chapterNodes: [], chapterByKey: new Map(), verseByChapter: new Map() }
  }

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

  const bookNodes: NetworkNode[] = []
  const chapterNodes: NetworkNode[] = []
  const chapterByKey = new Map<string, NetworkNode>()
  const verseByChapter = new Map<string, Verse[]>()
  const bookRadius = 480
  const chapterRadius = 90

  bookOrder.forEach((book, bookIndex) => {
    const bookPos = fibonacciSpherePoint(bookIndex, bookOrder.length, bookRadius)
    const bookName = bookNames.get(book) ?? book
    const chapters = chaptersByBook.get(book) ?? []

    bookNodes.push({
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

      const chapterNode: NetworkNode = {
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
      }
      chapterNodes.push(chapterNode)
      chapterByKey.set(key, chapterNode)
      verseByChapter.set(key, verses)
    })
  })

  return { bookNodes, chapterNodes, chapterByKey, verseByChapter }
}

function OldNetworkTab({
  selectedVerse,
  fallbackVerse,
  onSelect,
  selectedId,
  bookmarks,
  theme,
}: {
  selectedVerse?: Verse
  fallbackVerse?: Verse
  onSelect: (id: string) => void
  selectedId: string | null
  bookmarks: BookmarkType[]
  theme: 'dark' | 'light'
}) {
  const { t } = useI18n()
  const all = getAllVerses()
  const { tagsByVerseId } = useEntityData()
  const bookNumberByCode = useMemo(() => {
    const map = new Map<string, number>()
    const seen = new Set<string>()
    for (const v of all) {
      if (seen.has(v.book)) continue
      seen.add(v.book)
      map.set(v.book, map.size + 1)
    }
    return map
  }, [all])
  // Drill-down state for the book -> chapter -> verse hierarchy. Books are
  // always visible; chapters only appear for the focused book (narrowed to
  // the previous/next chapter once a specific chapter is focused); verses
  // only appear for the focused chapter.
  const [networkSelectedVerse, setNetworkSelectedVerse] = useState<Verse | null>(null)
  const [mapFocusBookId, setMapFocusBookId] = useState<string | null>(null)
  const [mapFocusChapter, setMapFocusChapter] = useState<number | null>(null)
  const [cameraDistance, setCameraDistance] = useState(800)
  const [cameraTarget, setCameraTarget] = useState({ x: 0, y: 0, z: 0 })

  const handleCameraChange = useCallback(
    (camera: { yaw: number; pitch: number; distance: number; target: { x: number; y: number; z: number } }) => {
      setCameraDistance(camera.distance)
      setCameraTarget(camera.target)
    },
    [],
  )

  const [showUserJourney, setShowUserJourney] = useState(false)

  const sidebarOpen = Boolean(networkSelectedVerse)
  const networkLayoutStyle = {
    '--network-sidebar-width': sidebarOpen ? 'clamp(360px, 34vw, 520px)' : '0px',
    '--network-sidebar-gap': sidebarOpen ? '1.25rem' : '0px',
  } as CSSProperties
  const centerVerse = networkSelectedVerse ?? selectedVerse ?? fallbackVerse
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
  const [pathProgress, setPathProgress] = useState(0)
  const [pathPlaying, setPathPlaying] = useState(false)
  const [characterQuery, setCharacterQuery] = useState('')

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

  const selectedPersonId = useMemo(
    () => (focusedNodeId?.startsWith('person-') ? focusedNodeId.replace('person-', '') : undefined),
    [focusedNodeId],
  )

  const nodes = useMemo(
    () => (centerVerse ? buildNetworkNodes(centerVerse, relatedMatches, themes, selectedPersonId) : []),
    [centerVerse, relatedMatches, themes, selectedPersonId],
  )

  const edges = useMemo(
    () => (centerVerse ? buildNetworkEdges(centerVerse, relatedMatches, themes) : []),
    [centerVerse, relatedMatches, themes],
  )

  const allCharacters = useMemo(() => getAllCharacters().sort((a, b) => a.name.localeCompare(b.name)), [])
  const filteredCharacters = useMemo(() => {
    const query = characterQuery.trim().toLowerCase()
    if (!query) return allCharacters.slice(0, 80)
    return allCharacters
      .filter((c) => c.name.toLowerCase().includes(query) || c.aliases?.some((a) => a.toLowerCase().includes(query)))
      .slice(0, 80)
  }, [allCharacters, characterQuery])

  const ambientBible = useMemo(() => buildBibleHierarchyNodes(all), [all])

  const localVerseIds = useMemo(
    () => new Set(nodes.map((node) => node.verse?.id).filter((id): id is string => Boolean(id))),
    [nodes],
  )

  const activeGraphFocus = useMemo(() => {
    if (mapFocusBookId != null) {
      return { bookId: mapFocusBookId, chapter: mapFocusChapter }
    }
    if (cameraDistance > 650) {
      return { bookId: null, chapter: null }
    }

    let nearestBook: NetworkNode | null = null
    let minDist = Infinity
    for (const book of ambientBible.bookNodes) {
      const dist = Math.hypot(book.x - cameraTarget.x, book.y - cameraTarget.y, book.z - cameraTarget.z)
      if (dist < minDist) {
        minDist = dist
        nearestBook = book
      }
    }
    if (!nearestBook) return { bookId: null, chapter: null }

    if (cameraDistance > 300) {
      return { bookId: nearestBook.bookId, chapter: null }
    }

    let nearestChapter: NetworkNode | null = null
    minDist = Infinity
    for (const chapter of ambientBible.chapterNodes) {
      if (chapter.bookId !== nearestBook.bookId) continue
      const dist = Math.hypot(chapter.x - cameraTarget.x, chapter.y - cameraTarget.y, chapter.z - cameraTarget.z)
      if (dist < minDist) {
        minDist = dist
        nearestChapter = chapter
      }
    }
    return { bookId: nearestBook.bookId, chapter: nearestChapter?.chapterNumber ?? null }
  }, [mapFocusBookId, mapFocusChapter, cameraDistance, cameraTarget, ambientBible])

  const hierarchyStep = useMemo(() => {
    if (activeGraphFocus.chapter != null) return 'verse'
    if (activeGraphFocus.bookId != null) return 'chapter'
    return 'book'
  }, [activeGraphFocus])

  const visibleAmbientNodes = useMemo<NetworkNode[]>(
    () => {
      if (hierarchyStep === 'book') {
        return ambientBible.bookNodes
      }
      if (hierarchyStep === 'chapter') {
        const focusBookId = activeGraphFocus.bookId ?? centerVerse?.book ?? null
        if (!focusBookId) return []
        return ambientBible.chapterNodes.filter((node) => node.bookId === focusBookId)
      }
      const focusBookId = activeGraphFocus.bookId ?? centerVerse?.book ?? null
      const focusChapter = activeGraphFocus.chapter ?? centerVerse?.chapter ?? null
      if (!focusBookId || focusChapter == null) return []
      const key = `${focusBookId}-${focusChapter}`
      const chapterNode = ambientBible.chapterByKey.get(key)
      const verses = ambientBible.verseByChapter.get(key)
      if (!chapterNode || !verses?.length) return []
      return verses
        .filter((verse) => !localVerseIds.has(verse.id))
        .map((verse, verseIndex) => {
          const verseOffset = fibonacciSpherePoint(verseIndex, verses.length, 26)
          return {
            id: verse.id,
            kind: 'ambient' as NetworkKind,
            label: `${verse.bookName} ${verse.chapter}:${verse.verse}`,
            detail: verse.text.slice(0, 90),
            x: chapterNode.x + verseOffset.x,
            y: chapterNode.y + verseOffset.y,
            z: chapterNode.z + verseOffset.z,
            size: 30,
            verse,
            parentId: `chapter-${key}`,
            bookId: focusBookId,
            bookName: verse.bookName,
            chapterNumber: verse.chapter,
            jumpVerseId: undefined,
          }
        })
    },
    [ambientBible, centerVerse?.book, centerVerse?.chapter, hierarchyStep, localVerseIds, activeGraphFocus],
  )

  const nodeById = useMemo(() => new Map(nodes.map((node) => [node.id, node])), [nodes])

  const selectedCharacter = useMemo(() => {
    if (!focusedNodeId?.startsWith('person-')) return null
    const node = nodeById.get(focusedNodeId)
    if (!node) return null
    const charId = node.id.replace('person-', '')
    return getCharacter(charId)
  }, [focusedNodeId, nodeById])

  const personPath = useMemo(() => {
    if (!selectedCharacter) return [] as NetworkNode[]
    const stops = getCharacterPath(selectedCharacter)
    const personNode = nodeById.get(focusedNodeId ?? '') ?? { x: 50, y: 50, z: 0 }
    const total = stops.length
    return stops.map((stop, i) => {
      const angle = (i / Math.max(total, 1)) * Math.PI * 2
      const radius = 20 + i * 10
      const x = clamp(personNode.x + Math.cos(angle) * radius, 4, 96)
      const y = clamp(personNode.y + Math.sin(angle) * radius, 4, 96)
      const z = personNode.z + 18 + i * 5
      const firstPassage = stop.event.passages[0]
      return {
        id: `event-${selectedCharacter.id}-${i}`,
        kind: 'event' as NetworkKind,
        label: stop.event.label,
        detail: stop.place?.name ?? stop.event.approxDate ?? 'Event',
        x,
        y,
        z,
        size: 30,
        parentId: focusedNodeId,
        bookId: firstPassage?.book,
        chapterNumber: firstPassage?.startChapter,
      } as NetworkNode
    })
  }, [selectedCharacter, focusedNodeId, nodeById])

  const personPaths = useMemo(() => {
    if (!personPath.length) return []
    const color = SCENE_PALETTE[theme].nodeColors.person
    const points = personPath.map((n) => ({ x: n.x, y: n.y, z: n.z }))
    return [{ id: focusedNodeId ?? 'person-path', points, color }]
  }, [personPath, focusedNodeId, theme])

  const currentPathStopIndex = useMemo(() => {
    if (!personPath.length) return -1
    return Math.min(personPath.length - 1, Math.floor(pathProgress * personPath.length))
  }, [personPath.length, pathProgress])

  const currentPathStop = useMemo(
    () => (currentPathStopIndex >= 0 ? personPath[currentPathStopIndex] : null),
    [currentPathStopIndex, personPath],
  )

  const userJourneyNodes = useMemo<NetworkNode[]>(() => {
    if (!showUserJourney) return []
    const sorted = [...bookmarks]
      .filter((b) => b.verseId)
      .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
    if (sorted.length < 2) return []
    return sorted
      .map((bookmark, i) => {
        const verse = findVerse(bookmark.verseId)
        if (!verse) return null
        const chapterKey = `${verse.book}-${verse.chapter}`
        const chapterNode = ambientBible.chapterByKey.get(chapterKey)
        const verses = ambientBible.verseByChapter.get(chapterKey)
        if (!chapterNode || !verses) return null
        const verseIndex = verses.findIndex((v) => v.id === verse.id)
        const offset = fibonacciSpherePoint(verseIndex, verses.length, 26)
        return {
          id: `user-waypoint-${bookmark.id}`,
          kind: 'userWaypoint' as NetworkKind,
          label: `${verse.bookName} ${verse.chapter}:${verse.verse}`,
          detail: `Saved ${new Date(bookmark.createdAt).toLocaleDateString()}`,
          x: chapterNode.x + offset.x,
          y: chapterNode.y + offset.y,
          z: chapterNode.z + offset.z,
          size: 28,
          verse,
          parentId: `chapter-${chapterKey}`,
          bookId: verse.book,
          bookName: verse.bookName,
          chapterNumber: verse.chapter,
        } as NetworkNode
      })
      .filter((n): n is NetworkNode => Boolean(n))
  }, [bookmarks, showUserJourney, ambientBible])

  const userJourneyPaths = useMemo(() => {
    if (!showUserJourney || userJourneyNodes.length < 2) return []
    const color = SCENE_PALETTE[theme].nodeColors.verse
    const points = userJourneyNodes.map((n) => ({ x: n.x, y: n.y, z: n.z }))
    return [{ id: 'user-journey', points, color }]
  }, [userJourneyNodes, showUserJourney, theme])

  const scenePaths = useMemo(
    () => [...personPaths, ...userJourneyPaths].map((path) => ({ ...path, progress: pathProgress })),
    [personPaths, userJourneyPaths, pathProgress],
  )

  useEffect(() => {
    if (!pathPlaying) return
    const interval = window.setInterval(() => {
      setPathProgress((p) => (p >= 1 ? 0 : Math.min(1, p + 0.008)))
    }, 80)
    return () => window.clearInterval(interval)
  }, [pathPlaying])

  useEffect(() => {
    setPathProgress(0)
    setPathPlaying(false)
  }, [focusedNodeId, showUserJourney])

  const sceneNodes = useMemo(() => [...visibleAmbientNodes, ...nodes, ...personPath, ...userJourneyNodes], [visibleAmbientNodes, nodes, personPath, userJourneyNodes])
  const sceneNodeById = useMemo(() => new Map(sceneNodes.map((node) => [node.id, node])), [sceneNodes])

  const centerNode = useMemo(() => nodes.find((node) => node.kind === 'center'), [nodes])
  const selectedNode = useMemo(
    () => (selectedId ? nodes.find((node) => node.verse?.id === selectedId) : undefined),
    [nodes, selectedId],
  )
  const activeGraphFocusNode = useMemo(
    () => (focusedNodeId ? sceneNodeById.get(focusedNodeId) : undefined),
    [focusedNodeId, sceneNodeById],
  )
  const graphFocus = useMemo(() => {
    const node = activeGraphFocusNode ?? selectedNode
    if (node) {
      return { x: node.x, y: node.y, z: node.z }
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
  }, [activeGraphFocusNode, nodes, selectedNode])
  const selectedSceneNodeId = useMemo(
    () => activeGraphFocusNode?.id ?? selectedNode?.id ?? centerNode?.id ?? null,
    [activeGraphFocusNode, centerNode, selectedNode],
  )

  const focusedNode = useMemo(
    () => (hoveredNodeId ? sceneNodeById.get(hoveredNodeId) : focusedNodeId ? sceneNodeById.get(focusedNodeId) : selectedNode ?? centerNode),
    [centerNode, focusedNodeId, hoveredNodeId, sceneNodeById, selectedNode]
  )
  const focusedVerse = focusedNode?.verse ?? centerVerse
  const focusedVerseTags = useMemo(() => {
    if (!focusedVerse) return null
    const bookNumber = bookNumberByCode.get(focusedVerse.book)
    if (!bookNumber) return null
    const key = `${String(bookNumber).padStart(2, '0')}${String(focusedVerse.chapter).padStart(3, '0')}${String(focusedVerse.verse).padStart(3, '0')}`
    return tagsByVerseId[key] ?? null
  }, [focusedVerse, bookNumberByCode, tagsByVerseId])
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

  const handleSceneSelect = useCallback(
    (id: string) => {
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
        const jump = node.jumpVerseId ? findVerse(node.jumpVerseId) : undefined
        const verse = jump ?? centerVerse
        if (verse) {
          setNetworkSelectedVerse(verse)
          onSelect(verse.id)
        }
        return
      }
      if (node.verse) {
        setNetworkSelectedVerse(node.verse)
        onSelect(node.verse.id)
      }
    },
    [centerVerse, findVerse, onSelect, sceneNodeById, setFocusedNodeId, setMapFocusBookId, setMapFocusChapter, setNetworkSelectedVerse],
  )

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
                  {ambientBible.bookNodes.find((node) => node.bookId === mapFocusBookId)?.bookName ?? mapFocusBookId}
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
          {[
            ['center', 'Center'],
            ['verse', 'Verse'],
            ['person', 'Person'],
            ['place', 'Place'],
            ['theme', 'Theme'],
            ['originalWord', 'Word'],
            ['userWaypoint', 'Journey'],
          ].map(([kind, label]) => {
            const [r, g, b] = SCENE_PALETTE[theme].nodeColors[kind as keyof typeof SCENE_PALETTE.dark.nodeColors]
            return (
              <span key={kind}>
                <span className="legend-dot" style={{ background: `rgb(${r}, ${g}, ${b})` }} /> {label}
              </span>
            )
          })}
        </div>
      </div>

      <div className="network-grid" style={networkLayoutStyle}>
        <section className="bubble-canvas-card network-stage-card">
          <Suspense
            fallback={
              <div style={{ width: '100%', height: '100%', minHeight: 460, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text)' }}>
                Loading graph…
              </div>
            }
          >
            <NetworkThreeScene
              nodes={sceneNodes}
              edges={edges}
              focus={graphFocus}
              selectedId={selectedSceneNodeId}
              onSelect={handleSceneSelect}
              onHoverNode={setHoveredNodeId}
              onCameraChange={handleCameraChange}
              paths={scenePaths}
              theme={theme}
            />
          </Suspense>
        </section>

        <aside className={`network-sidebar ${sidebarOpen ? 'open' : ''}`}>
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

          <div className="bubble-card wayfinder-card">
            <h3>Wayfinder</h3>
            <div className="network-helper-text">Pick a biblical figure to see their path through Scripture.</div>
            <input
              type="text"
              value={characterQuery}
              onChange={(e) => setCharacterQuery(e.target.value)}
              placeholder="Search people…"
              className="network-character-search"
              style={{ width: '100%', margin: '0.65rem 0' }}
            />
            <div className="bubble-list network-character-list" style={{ maxHeight: 160, overflowY: 'auto' }}>
              {filteredCharacters.map((character) => (
                <button
                  key={character.id}
                  className="bubble-list-item network-context-item"
                  onClick={() => {
                    setFocusedNodeId(`person-${character.id}`)
                    setMapFocusBookId(null)
                    setMapFocusChapter(null)
                    setCharacterQuery('')
                  }}
                >
                  <span>{character.name}</span>
                  <small>{character.era}{character.approxDateRange ? ` · ${character.approxDateRange}` : ''}</small>
                </button>
              ))}
            </div>

            {selectedCharacter && (
              <div className="network-context-section" style={{ marginTop: '0.75rem' }}>
                <h4>{selectedCharacter.name}</h4>
                {personPath.length > 0 && (
                  <div className="wayfinder-path-controls">
                    <div className="network-path-buttons" style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.5rem' }}>
                      <button type="button" className="secondary" onClick={() => setPathPlaying((p) => !p)} title={pathPlaying ? t('pausePath') : t('playPath')}>
                        {pathPlaying ? <Pause size={16} /> : <Play size={16} />}
                      </button>
                      <button type="button" className="secondary" onClick={() => { setPathPlaying(false); setPathProgress((p) => Math.min(1, p + 0.05)) }} title="Step forward">
                        <ChevronRight size={16} /> Step
                      </button>
                    </div>
                    <input
                      type="range"
                      min={0}
                      max={1}
                      step={0.01}
                      value={pathProgress}
                      onChange={(e) => { setPathProgress(Number(e.target.value)); setPathPlaying(false) }}
                      style={{ width: '100%' }}
                    />
                    {currentPathStop && (
                      <div className="network-timeline-stop" style={{ marginTop: '0.5rem' }}>
                        <strong>{currentPathStop.label}</strong>
                        <small>{currentPathStop.detail}</small>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            <div className="network-context-section" style={{ marginTop: '0.75rem' }}>
              <h4>My Journey</h4>
              <button type="button" className={showUserJourney ? 'primary' : 'secondary'} onClick={() => setShowUserJourney((s) => !s)}>
                {showUserJourney ? 'Hide my journey' : 'Show my journey'}
              </button>
              {showUserJourney && userJourneyNodes.length > 0 && (
                <div className="bubble-list network-character-list" style={{ maxHeight: 160, overflowY: 'auto', marginTop: '0.5rem' }}>
                  {userJourneyNodes.map((node) => (
                    <button
                      key={node.id}
                      className="bubble-list-item network-context-item"
                      onClick={() => node.verse && onSelect(node.verse.id)}
                    >
                      <span>{node.label}</span>
                      <small>{node.detail}</small>
                    </button>
                  ))}
                </div>
              )}
            </div>
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

          {focusedVerseTags && Object.keys(focusedVerseTags).length > 0 && (
            <div className="bubble-card network-entities-card">
              <h3>Named entities</h3>
              <div className="network-entity-list">
                {Object.entries(focusedVerseTags).map(([tag, count]) => (
                  <span key={tag} className={`network-entity-chip entity-${tag}`} title={`${count} word${count === 1 ? '' : 's'}`}>
                    {tag.toUpperCase()} <small>{count}</small>
                  </span>
                ))}
              </div>
            </div>
          )}

          <div className="bubble-card">
            <div className="lexicon-card-heading" style={{ marginBottom: '0.65rem' }}>
              <h3>{t('networkRelated')}</h3>
              {relatedMatches.some((match) => match.source === 'curated') && <span className="verse-meta-pill">Curated OpenBible</span>}
            </div>
            <div className="bubble-list network-related-list">
              {relatedMatches.map((match) => {
                const verse = match.verse
                const active = selectedId === verse.id || hoveredNodeId === verse.id
                return (
                  <button key={verse.id} className={`bubble-list-item network-related-item ${active ? 'active' : ''}`} onClick={() => onSelect(verse.id)} onMouseEnter={() => setHoveredNodeId(verse.id)} onFocus={() => setHoveredNodeId(verse.id)}>
                    <span>
                      {verse.bookName} {verse.chapter}:{verse.verse}
                      <em className="network-score-inline">{t('networkStrength')} {Math.round(match.score)}</em>
                      {match.source === 'curated' && <em className="network-source-inline">Curated</em>}
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

    return places
      .map((place) => {
        const projected = latLngToWorld(place.lat, place.lng, FALLBACK_MAP_ZOOM)
        return {
          place,
          x: (projected.x - visibleTopLeft.x) * scale,
          y: (projected.y - visibleTopLeft.y) * scale,
        }
      })
      .filter(
        (point) =>
          point.x >= -64 &&
          point.x <= viewport.width + 64 &&
          point.y >= -64 &&
          point.y <= viewport.height + 64,
      )
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
  const touchStartRef = useRef<{ x: number; y: number } | null>(null)

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

  const handleTouchStart = useCallback((event: React.TouchEvent) => {
    const touch = event.touches[0]
    touchStartRef.current = { x: touch.clientX, y: touch.clientY }
  }, [])

  const handleTouchEnd = useCallback(
    (event: React.TouchEvent) => {
      const start = touchStartRef.current
      touchStartRef.current = null
      if (!start || allImages.length < 2) return
      const touch = event.changedTouches[0]
      const dx = touch.clientX - start.x
      const dy = touch.clientY - start.y
      if (Math.abs(dx) < 40 || Math.abs(dx) < Math.abs(dy) * 1.5) return
      if (dx < 0) nextImage()
      else previousImage()
    },
    [allImages.length, nextImage, previousImage],
  )

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
            <div
              className="map-place-popup-image-frame"
              onTouchStart={handleTouchStart}
              onTouchEnd={handleTouchEnd}
            >
              <img className="map-place-popup-image" src={popupImage.thumbUrl || undefined} alt={popupImage.title ?? place.name} loading="lazy" />

              {allImages.length > 1 && (
                <button
                  type="button"
                  className="map-place-popup-image-zone map-place-popup-image-zone-left"
                  onClick={previousImage}
                  aria-label="Previous image"
                >
                  <span className="map-place-popup-image-nav-btn">
                    <ChevronLeft size={20} />
                  </span>
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
                  <span className="map-place-popup-image-nav-btn">
                    <ChevronRight size={20} />
                  </span>
                </button>
              )}

              {allImages.length > 1 && (
                <div className="map-place-popup-image-dots">
                  {allImages.map((_, index) => (
                    <button
                      key={index}
                      type="button"
                      className={`map-place-popup-image-dot ${index === activeImageIndex ? 'active' : ''}`}
                      onClick={() => setActiveImageIndex(index)}
                      aria-label={`Go to image ${index + 1}`}
                    />
                  ))}
                </div>
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
              {activeImageIndex + 1} / {allImages.length}
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
        <div
          className="map-place-lightbox"
          role="dialog"
          aria-modal="true"
          aria-label={`Image ${activeImageIndex + 1} of ${allImages.length}`}
          onClick={(event) => {
            if (event.target === event.currentTarget) closeLightbox()
          }}
        >
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

          <div
            className="map-place-lightbox-content"
            onTouchStart={handleTouchStart}
            onTouchEnd={handleTouchEnd}
          >
            <div className="map-place-lightbox-image-wrap">
              <img src={activeImage.url || undefined} alt={activeImage.title} loading="lazy" />
              {allImages.length > 1 && (
                <>
                  <button
                    type="button"
                    className="map-place-lightbox-image-click-zone map-place-lightbox-image-click-zone-left"
                    onClick={previousImage}
                    aria-label="Previous image"
                  />
                  <button
                    type="button"
                    className="map-place-lightbox-image-click-zone map-place-lightbox-image-click-zone-right"
                    onClick={nextImage}
                    aria-label="Next image"
                  />
                </>
              )}
            </div>
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
  const [showRegions, setShowRegions] = useState(false)
  const [selectedRegionIds, setSelectedRegionIds] = useState<Set<string> | null>(null)
  const [showRoutes, setShowRoutes] = useState(false)
  const [showGeo, setShowGeo] = useState(false)

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
                  left: '0.75rem',
                  zIndex: 10,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  flexWrap: 'wrap',
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
                <div
                  style={{
                    display: 'flex',
                    flexWrap: 'wrap',
                    gap: '0.4rem',
                  }}
                >
                  {[
                    { id: 'regions', label: 'Regions', active: showRegions, toggle: setShowRegions },
                    { id: 'roads', label: 'Roads', active: showRoutes, toggle: setShowRoutes },
                    { id: 'context', label: 'Context', active: showGeo, toggle: setShowGeo },
                  ].map((pill) => {
                    const isActive = pill.active
                    const activeBg =
                      theme === 'dark'
                        ? 'rgba(125, 160, 210, 0.36)'
                        : '#d6e4f5'
                    const activeBorder =
                      theme === 'dark'
                        ? '1px solid rgba(150, 185, 235, 0.6)'
                        : '1px solid #a8c0e0'
                    const activeColor =
                      theme === 'dark' ? '#e8f0ff' : '#142030'
                    return (
                      <button
                        key={pill.id}
                        type="button"
                        aria-pressed={isActive}
                        onClick={() => pill.toggle(!isActive)}
                        style={{
                          padding: '0.4rem 0.85rem',
                          borderRadius: '9999px',
                          fontSize: '0.78rem',
                          fontWeight: 600,
                          cursor: 'pointer',
                          border: isActive
                            ? activeBorder
                            : '1px solid color-mix(in srgb, var(--accent) 22%, var(--muted))',
                          background: isActive ? activeBg : 'var(--surface)',
                          color: isActive ? activeColor : 'var(--text)',
                          boxShadow: isActive
                            ? '0 0 0.5rem rgba(100, 140, 200, 0.22)'
                            : '0 1px 2px rgba(0,0,0,0.06)',
                          transition: 'all 0.15s ease',
                          userSelect: 'none',
                        }}
                      >
                        {pill.label}
                      </button>
                    )
                  })}
                </div>
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
                <MapRegions show={showRegions} theme={theme} selectedRegionIds={selectedRegionIds} />
                <MapRoutes show={showRoutes} theme={theme} />
                <MapGeoData show={showGeo} theme={theme} />
              </GoogleMap>
              <div
                style={{
                  position: 'absolute',
                  bottom: '0.75rem',
                  left: '0.75rem',
                  zIndex: 10,
                }}
              >
                <MapRegionLegend
                  visible={showRegions}
                  theme={theme}
                  selectedIds={selectedRegionIds}
                  onSelectedIdsChange={setSelectedRegionIds}
                />
              </div>
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






