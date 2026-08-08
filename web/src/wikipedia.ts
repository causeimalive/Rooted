import { useEffect, useState } from 'react'

export interface WikiImage {
  title: string
  url: string
  thumbUrl: string
  width?: number
  height?: number
}

export interface WikiSummary {
  title: string
  extract: string
  thumbnailUrl?: string
  imageUrl?: string
  pageUrl: string
  images: WikiImage[]
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
const imageCache = new Map<string, WikiImage[] | null>()
const imageInflight = new Map<string, Promise<WikiImage[] | null>>()

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
        imageUrl: data.originalimage?.source ?? data.thumbnail?.source,
        pageUrl: data.content_urls?.desktop?.page ?? wikipediaPageUrl(title),
        images: data.originalimage?.source
          ? [{ title: data.title ?? title, url: data.originalimage.source, thumbUrl: data.thumbnail?.source ?? data.originalimage.source }]
          : data.thumbnail?.source
            ? [{ title: data.title ?? title, url: data.thumbnail.source, thumbUrl: data.thumbnail.source }]
            : [],
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

async function fetchWikiImagesForTitle(title: string): Promise<WikiImage[] | null> {
  const encodedTitle = encodeURIComponent(title.replace(/ /g, '_'))
  try {
    const res = await fetch(
      `https://en.wikipedia.org/w/api.php?action=query&prop=images&titles=${encodedTitle}&format=json&origin=*`,
      { headers: { Accept: 'application/json' } },
    )
    if (!res.ok) return null
    const data = await res.json()
    const pages = data.query?.pages ?? {}
    const page = Object.values(pages)[0] as { images?: Array<{ title: string; ns: number }> } | undefined
    const imageFiles = (page?.images ?? [])
      .filter((image) => image.ns === 6 && image.title.startsWith('File:'))
      .slice(0, 12)
    if (!imageFiles.length) return null

    const fileTitles = imageFiles.map((image) => image.title).join('|')
    const infoRes = await fetch(
      `https://en.wikipedia.org/w/api.php?action=query&prop=imageinfo&titles=${encodeURIComponent(fileTitles)}&iiprop=url|size|mime&iiurlwidth=600&format=json&origin=*`,
      { headers: { Accept: 'application/json' } },
    )
    if (!infoRes.ok) return null
    const infoData = await infoRes.json()
    const infoPages = infoData.query?.pages ?? {}
    const images: WikiImage[] = []
    for (const infoPage of Object.values(infoPages) as Array<{
      title: string
      imageinfo?: Array<{ url: string; thumburl?: string; width: number; height: number; mime: string }>
    }>) {
      const info = infoPage.imageinfo?.[0]
      if (!info || !info.mime.startsWith('image/')) continue
      images.push({
        title: infoPage.title,
        url: info.url,
        thumbUrl: info.thumburl ?? info.url,
        width: info.width,
        height: info.height,
      })
    }
    return images
  } catch {
    return null
  }
}

export function useWikiImages(title: string | undefined): { loading: boolean; images: WikiImage[] } {
  const [state, setState] = useState<{ loading: boolean; images: WikiImage[] }>({ loading: Boolean(title), images: [] })

  useEffect(() => {
    if (!title) {
      setState({ loading: false, images: [] })
      return
    }
    let cancelled = false
    const normalized = title.replace(/ /g, '_')
    const cached = imageCache.get(normalized)
    if (cached) {
      setState({ loading: false, images: cached })
      return
    }
    const inflight = imageInflight.get(normalized)
    if (inflight) {
      inflight.then((images) => {
        if (!cancelled) setState({ loading: false, images: images ?? [] })
      })
      return
    }
    setState({ loading: true, images: [] })
    const promise = fetchWikiImagesForTitle(title).then((images) => {
      imageCache.set(normalized, images)
      imageInflight.delete(normalized)
      return images ?? []
    })
    imageInflight.set(normalized, promise)
    promise.then((images) => {
      if (!cancelled) setState({ loading: false, images })
    })
    return () => {
      cancelled = true
    }
  }, [title])

  return state
}
