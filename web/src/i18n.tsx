import { createContext, useContext, useEffect, useState, ReactNode } from 'react'

export type Language = 'en' | 'es'

const translations: Record<Language, Record<string, string>> = {
  en: {
    appTitle: 'Rooted',
    search: 'Search',
    map: 'Map',
    network: 'Wayfinder',
    words: 'Words',
    reader: 'Reader',
    book: 'Book',
    chapter: 'Chapter',
    previousChapter: 'Previous chapter',
    nextChapter: 'Next chapter',
    readerHint: 'Pick a book and chapter to read line by line.',
    readerEmpty: 'No verses available for this selection.',
    scriptureMapTitle: 'Scripture Geography',
    scriptureMapHint: 'See where the biblical story unfolded and jump between locations.',
    selectedLocation: 'Selected location',
    relevantLocation: 'Relevant to selected verse',
    relatedPassages: 'Related passages',
    featuredPlaces: 'Featured places',
    tapAPlace: 'Tap a place on the map to see its context.',
    networkTitle: 'Wayfinder',
    networkHint: 'Explore cross-references, biblical figures, and your own journey through Scripture.',
    networkEmpty: 'Select a verse or search result to build the network graph.',
    networkCenter: 'Center verse',
    networkRelated: 'Related verses',
    networkThemes: 'Key themes',
    networkTapHint: 'Tap any node to jump to that verse.',
    networkHoverHint: 'Hover or tap nodes to preview their connections.',
    networkGestureHint: 'Drag to orbit, hold Shift or Ctrl+drag to pan, scroll to zoom, and click a node to explore deeper.',
    networkAllBooks: 'All Books',
    networkConnections: 'Connections',
    networkStrength: 'Strength',
    networkVerseFocus: 'Verse focus',
    networkPreview: 'Node preview',
    networkThemeFocus: 'Theme focus',
    networkContext: 'Context',
    searchPlaceholder: 'Search keyword, topic, or phrase…',
    loading: 'Loading Bible data…',
    noData: 'No Bible data found. Run the data fetch script.',
    noResults: 'No verses found.',
    resultCount: '{count} results',
    curated: 'Curated Meaning',
    aiInsight: 'AI Insight',
    related: 'Related Passages',
    delete: 'Delete',
    bookmark: 'Bookmark',
    unbookmark: 'Unbookmark',
    bookmarks: 'Bookmarks',
    noBookmarks: 'No bookmarks yet.',
    signIn: 'Sign In',
    signOut: 'Sign Out',
    name: 'Name',
    email: 'Email',
    lightMode: 'Light mode',
    darkMode: 'Dark mode',
    language: 'Language',
    copyUrl: 'Copy shareable URL',
    copied: 'Copied!',
    youVersionResults: 'YouVersion Results',
    mappedToLocal: 'Mapped to local corpus',
    youVersionOnly: 'YouVersion only',
    mapHint: 'Search first to build the network graph.',
    selectVerse: 'Select a verse to open the larger details panel for meaning, related passages, and notes.',
    lexiconEmpty: 'Type a word to see its KJV and historical meaning.',
    lexiconNotFound: 'No dictionary entry for “{term}” yet.',
    kjvSense: 'KJV / historical sense',
    modern: 'Modern equivalent',
    context: 'Context when written',
    versesUsing: 'Verses using this word',
    recentSearches: 'Recent Searches',
    noRecentSearches: 'Your recent searches will appear here.',
    searchPlacesAndPeople: 'Search a place or biblical figure…',
    characters: 'People',
    places: 'Places',
    characterTimeline: 'Timeline & Path',
    playPath: 'Play journey',
    pausePath: 'Pause',
    dateDisclaimer: 'Dates and some locations are approximate, based on mainstream scholarly estimates. Scholars disagree on many of these ranges.',
    noCharacterResults: 'No matching places or people found.',
    clearCharacter: 'Back to place view',
    mapLoadError: 'Could not load Google Maps. Check your API key configuration.',
    historyAndMedia: 'History & References',
    readOnWikipedia: 'Read on Wikipedia',
    bibleGateway: 'BibleGateway',
    noHistoryFound: 'No additional history found yet — try the Wikipedia link below.',
  },
  es: {
    appTitle: 'Rooted',
    search: 'Buscar',
    map: 'Mapa',
    network: 'Wayfinder',
    words: 'Palabras',
    reader: 'Lector',
    book: 'Libro',
    chapter: 'Capítulo',
    previousChapter: 'Capítulo anterior',
    nextChapter: 'Capítulo siguiente',
    readerHint: 'Elige un libro y capítulo para leer versículo por versículo.',
    readerEmpty: 'No hay versículos disponibles para esta selección.',
    scriptureMapTitle: 'Geografía bíblica',
    scriptureMapHint: 'Mira dónde se desarrolló la historia bíblica y salta entre lugares.',
    selectedLocation: 'Lugar seleccionado',
    relevantLocation: 'Relacionado con el versículo',
    relatedPassages: 'Pasajes relacionados',
    featuredPlaces: 'Lugares destacados',
    tapAPlace: 'Toca un lugar del mapa para ver su contexto.',
    networkTitle: 'Wayfinder',
    networkHint: 'Explora referencias cruzadas, figuras bíblicas y tu propio viaje a través de la Escritura.',
    networkEmpty: 'Selecciona un versículo o resultado de búsqueda para construir el network graph.',
    networkCenter: 'Versículo central',
    networkRelated: 'Versículos relacionados',
    networkThemes: 'Temas clave',
    networkTapHint: 'Toca cualquier nodo para abrir ese versículo.',
    networkHoverHint: 'Pasa el cursor o toca los nodos para ver sus conexiones.',
    networkGestureHint: 'Arrastra para orbitar, mantén Shift o Ctrl y arrastra para desplazar, usa la rueda para acercar, y toca un nodo para explorar más.',
    networkAllBooks: 'Todos los libros',
    networkConnections: 'Conexiones',
    networkStrength: 'Fuerza',
    networkVerseFocus: 'Enfoque del versículo',
    networkPreview: 'Vista previa del nodo',
    networkThemeFocus: 'Enfoque del tema',
    networkContext: 'Contexto',
    searchPlaceholder: 'Buscar palabra clave, tema o frase…',
    loading: 'Cargando datos bíblicos…',
    noData: 'No se encontraron datos bíblicos. Ejecute el script de obtención de datos.',
    noResults: 'No se encontraron versículos.',
    resultCount: '{count} resultados',
    curated: 'Significado seleccionado',
    aiInsight: 'Perspectiva de IA',
    related: 'Pasajes relacionados',
    delete: 'Eliminar',
    bookmark: 'Marcar',
    unbookmark: 'Desmarcar',
    bookmarks: 'Marcadores',
    noBookmarks: 'Aún no hay marcadores.',
    signIn: 'Iniciar sesión',
    signOut: 'Cerrar sesión',
    name: 'Nombre',
    email: 'Correo',
    lightMode: 'Modo claro',
    darkMode: 'Modo oscuro',
    language: 'Idioma',
    copyUrl: 'Copiar enlace compartible',
    copied: 'Copiado!',
    youVersionResults: 'Resultados de YouVersion',
    mappedToLocal: 'Mapeado al corpus local',
    youVersionOnly: 'Solo YouVersion',
    mapHint: 'Primero busca para construir el grafo de red.',
    selectVerse: 'Selecciona un versículo para abrir un panel más grande con significado, pasajes relacionados y notas.',
    lexiconEmpty: 'Escriba una palabra para ver su significado histórico y en KJV.',
    lexiconNotFound: 'Aún no hay entrada de diccionario para “{term}”.',
    kjvSense: 'Sentido histórico / KJV',
    modern: 'Equivalente moderno',
    context: 'Contexto al escribirlo',
    versesUsing: 'Versículos que usan esta palabra',
    recentSearches: 'Búsquedas recientes',
    noRecentSearches: 'Tus búsquedas recientes aparecerán aquí.',
    searchPlacesAndPeople: 'Busca un lugar o personaje bíblico…',
    characters: 'Personajes',
    places: 'Lugares',
    characterTimeline: 'Línea de tiempo y ruta',
    playPath: 'Reproducir viaje',
    pausePath: 'Pausar',
    dateDisclaimer: 'Las fechas y algunos lugares son aproximados, basados en estimaciones académicas generales. Los expertos no coinciden en muchos de estos rangos.',
    noCharacterResults: 'No se encontraron lugares o personajes.',
    clearCharacter: 'Volver a la vista de lugar',
    mapLoadError: 'No se pudo cargar Google Maps. Verifica la configuración de tu clave de API.',
    historyAndMedia: 'Historia y referencias',
    readOnWikipedia: 'Leer en Wikipedia',
    bibleGateway: 'BibleGateway',
    noHistoryFound: 'Aún no hay más historia — prueba el enlace de Wikipedia.',
  },
}

interface I18nContextType {
  language: Language
  setLanguage: (lang: Language) => void
  t: (key: string, vars?: Record<string, string>) => string
}

const I18nContext = createContext<I18nContextType | undefined>(undefined)

const LANG_KEY = 'bible-study-lang'
const SUPPORTED: readonly Language[] = (Object.keys(translations) as Language[]).sort()

function isLanguage(value: string | null): value is Language {
  return typeof value === 'string' && SUPPORTED.includes(value as Language)
}

function getInitialLanguage(): Language {
  try {
    const saved = localStorage.getItem(LANG_KEY)
    if (isLanguage(saved)) return saved
  } catch { }
  try {
    const nav = typeof navigator !== 'undefined' ? navigator.language.toLowerCase() : ''
    if (nav.startsWith('es')) return 'es'
  } catch { }
  return 'en'
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<Language>(getInitialLanguage)

  const setLanguage = (lang: Language) => {
    if (!SUPPORTED.includes(lang)) return
    setLanguageState(lang)
  }

  useEffect(() => {
    try {
      localStorage.setItem(LANG_KEY, language)
    } catch { }
    if (typeof document !== 'undefined') {
      document.documentElement.lang = language
    }
  }, [language])

  const t = (key: string, vars?: Record<string, string>) => {
    let str = translations[language][key] ?? key
    if (vars) {
      for (const [k, v] of Object.entries(vars)) {
        str = str.replace(`{${k}}`, v)
      }
    }
    return str
  }

  return <I18nContext.Provider value={{ language, setLanguage, t }}>{children}</I18nContext.Provider>
}

export function useI18n() {
  const ctx = useContext(I18nContext)
  if (!ctx) throw new Error('useI18n must be inside I18nProvider')
  return ctx
}
