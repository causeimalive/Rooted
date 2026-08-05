import { useEffect, useState } from 'react'

export interface WikiSummary {
  title: string
  extract: string
  thumbnailUrl?: string
  pageUrl: string
}

// Manual overrides for places/characters whose plain name is ambiguous or
// doesn't match the actual Wikipedia article title.
export const WIKI_TITLE_OVERRIDES: Record<string, string> = {
  ur: 'Ur',
  haran: 'Harran',
  sodom: 'Sodom and Gomorrah',
  peniel: 'Penuel (Bible)',
  dothan: 'Dothan (biblical city)',
  goshen: 'Land of Goshen',
  'memphis-egypt': 'Memphis, Egypt',
  rameses: 'Pi-Ramesses',
  sinai: 'Mount Sinai',
  'horeb-cave': 'Mount Sinai',
  'kadesh-barnea': 'Kadesh Barnea',
  ai: 'Ai (city)',
  gibeon: 'Gibeon (ancient city)',
  shiloh: 'Shiloh (biblical city)',
  gath: 'Gath (city)',
  'en-gedi': 'Ein Gedi',
  'samaria-city': 'Samaria (ancient city)',
  'dan-city': 'Tel Dan',
  tirzah: 'Tirzah (Canaan)',
  'jericho-nt': 'Jericho',
  'red-sea': 'Red Sea',
  'jabesh-gilead': 'Jabesh-Gilead',
}

const cache = new Map<string, WikiSummary | null>()
const inflight = new Map<string, Promise<WikiSummary | null>>()

function wikipediaPageUrl(title: string): string {
  return `https://en.wikipedia.org/wiki/${encodeURIComponent(title.replace(/ /g, '_'))}`
}

export async function fetchWikiSummary(title: string): Promise<WikiSummary | null> {
  if (cache.has(title)) return cache.get(title) ?? null
  const existing = inflight.get(title)
  if (existing) return existing

  const promise = (async (): Promise<WikiSummary | null> => {
    try {
      const res = await fetch(
        `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title.replace(/ /g, '_'))}`,
        { headers: { Accept: 'application/json' } },
      )
      if (!res.ok) throw new Error('not found')
      const data = await res.json()
      if (data.type === 'disambiguation' || !data.extract) throw new Error('no usable summary')
      const summary: WikiSummary = {
        title: data.title ?? title,
        extract: data.extract,
        thumbnailUrl: data.thumbnail?.source ?? data.originalimage?.source,
        pageUrl: data.content_urls?.desktop?.page ?? wikipediaPageUrl(title),
      }
      cache.set(title, summary)
      return summary
    } catch {
      cache.set(title, null)
      return null
    }
  })()

  inflight.set(title, promise)
  try {
    return await promise
  } finally {
    inflight.delete(title)
  }
}

export function getWikipediaLink(idOrTitle: string, fallbackTitle: string): string {
  const title = WIKI_TITLE_OVERRIDES[idOrTitle] ?? fallbackTitle
  return wikipediaPageUrl(title)
}

interface WikiState {
  loading: boolean
  data: WikiSummary | null
}

export function useWikiSummary(id: string | undefined, fallbackTitle: string | undefined): WikiState {
  const title = id && fallbackTitle ? WIKI_TITLE_OVERRIDES[id] ?? fallbackTitle : undefined
  const [state, setState] = useState<WikiState>({ loading: Boolean(title), data: null })

  useEffect(() => {
    if (!title) {
      setState({ loading: false, data: null })
      return
    }
    let cancelled = false
    setState({ loading: true, data: null })
    fetchWikiSummary(title).then((data) => {
      if (!cancelled) setState({ loading: false, data })
    })
    return () => {
      cancelled = true
    }
  }, [title])

  return state
}
