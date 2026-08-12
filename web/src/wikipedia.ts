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
  wikipediaTitle?: string
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
  'chinnereth': 'Sea of Galilee',
  'chinneroth': 'Sea of Galilee',
  'kinneret': 'Sea of Galilee',
  'kineret': 'Sea of Galilee',
}

const cache = new Map<string, WikiSummary | null>()
const inflight = new Map<string, Promise<WikiSummary | null>>()
const imageCache = new Map<string, WikiImage[] | null>()
const imageInflight = new Map<string, Promise<WikiImage[] | null>>()

function wikipediaPageUrl(title: string): string {
  return `https://en.wikipedia.org/wiki/${encodeURIComponent(title.replace(/ /g, '_'))}`
}

function resolveTitle(idOrTitle: string, fallbackTitle?: string): string | undefined {
  if (!idOrTitle || !fallbackTitle) return undefined
  return WIKI_TITLE_OVERRIDES[idOrTitle] ?? fallbackTitle
}

async function fetchWikipediaSummary(title: string): Promise<WikiSummary | null> {
  try {
    const res = await fetch(
      `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title.replace(/ /g, '_'))}`,
      { headers: { Accept: 'application/json' } },
    )
    if (!res.ok) throw new Error('not found')
    const data = await res.json()
    if (data.type === 'disambiguation' || !data.extract) throw new Error('no usable summary')
    const images: WikiImage[] = []
    if (data.originalimage?.source) {
      images.push({
        title: data.title ?? title,
        url: data.originalimage.source,
        thumbUrl: data.thumbnail?.source ?? data.originalimage.source,
      })
    } else if (data.thumbnail?.source) {
      images.push({
        title: data.title ?? title,
        url: data.thumbnail.source,
        thumbUrl: data.thumbnail.source,
      })
    }
    return {
      title: data.title ?? title,
      wikipediaTitle: data.title ?? title,
      extract: data.extract,
      thumbnailUrl: data.thumbnail?.source ?? data.originalimage?.source,
      imageUrl: data.originalimage?.source ?? data.thumbnail?.source,
      pageUrl: data.content_urls?.desktop?.page ?? wikipediaPageUrl(title),
      images,
    }
  } catch {
    return null
  }
}

function commonsFileUrl(file: string, width?: number): string {
  const encoded = encodeURIComponent(file.replace(/ /g, '_'))
  return `https://commons.wikimedia.org/wiki/Special:FilePath/${encoded}${width ? `?width=${width}` : ''}`
}

async function fetchWikidataSummary(title: string): Promise<WikiSummary | null> {
  try {
    const searchRes = await fetch(
      `https://www.wikidata.org/w/api.php?action=wbsearchentities&search=${encodeURIComponent(title)}&language=en&format=json&origin=*`,
      { headers: { Accept: 'application/json' } },
    )
    if (!searchRes.ok) return null
    const searchData = (await searchRes.json()) as { search?: Array<{ id: string }> }
    const id = searchData.search?.[0]?.id
    if (!id) return null

    const entityRes = await fetch(`https://www.wikidata.org/wiki/Special:EntityData/${id}.json`)
    if (!entityRes.ok) return null
    const entityData = (await entityRes.json()) as { entities: Record<string, any> }
    const entity = entityData.entities[id]
    const label = entity.labels?.en?.value ?? title
    const extract = entity.descriptions?.en?.value ?? ''
    const enWikiUrl = entity.sitelinks?.enwiki?.url
    const pageUrl = enWikiUrl ?? wikipediaPageUrl(label)

    const imageFiles: string[] = []
    const p18 = entity.claims?.P18?.[0]?.mainsnak?.datavalue?.value
    if (p18) imageFiles.push(p18)
    const p41 = entity.claims?.P41?.[0]?.mainsnak?.datavalue?.value
    if (p41 && !imageFiles.includes(p41)) imageFiles.push(p41)

    const images: WikiImage[] = imageFiles
      .filter(Boolean)
      .map((file) => ({
        title: file,
        url: commonsFileUrl(file, 800),
        thumbUrl: commonsFileUrl(file, 400),
      }))

    return {
      title: label,
      wikipediaTitle: enWikiUrl ? undefined : label,
      extract,
      thumbnailUrl: images[0]?.thumbUrl,
      imageUrl: images[0]?.url,
      pageUrl,
      images,
    }
  } catch {
    return null
  }
}

export async function fetchWikiSummary(id: string | undefined, fallbackTitle: string | undefined): Promise<WikiSummary | null> {
  const title = resolveTitle(id ?? '', fallbackTitle)
  if (!title) return null

  if (cache.has(title)) return cache.get(title) ?? null
  const existing = inflight.get(title)
  if (existing) return existing

  const promise = (async (): Promise<WikiSummary | null> => {
    try {
      const wp = await fetchWikipediaSummary(title)
      if (wp) {
        cache.set(title, wp)
        return wp
      }
      const wd = await fetchWikidataSummary(title)
      cache.set(title, wd)
      return wd
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

interface WikiState {
  loading: boolean
  data: WikiSummary | null
}

export function useWikiSummary(id: string | undefined, fallbackTitle: string | undefined): WikiState {
  const title = resolveTitle(id ?? '', fallbackTitle)
  const [state, setState] = useState<WikiState>({ loading: Boolean(title), data: null })

  useEffect(() => {
    if (!title) {
      setState({ loading: false, data: null })
      return
    }
    let cancelled = false
    setState({ loading: true, data: null })
    fetchWikiSummary(id, fallbackTitle).then((data) => {
      if (!cancelled) setState({ loading: false, data })
    })
    return () => {
      cancelled = true
    }
  }, [title])

  return state
}

async function fetchWikipediaImagesForTitle(title: string): Promise<WikiImage[] | null> {
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

async function fetchWikimediaCommonsImages(title: string): Promise<WikiImage[] | null> {
  try {
    const searchRes = await fetch(
      `https://commons.wikimedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(title)}&srnamespace=6&srlimit=12&format=json&origin=*`,
      { headers: { Accept: 'application/json' } },
    )
    if (!searchRes.ok) return null
    const searchData = (await searchRes.json()) as {
      query?: { search?: Array<{ title: string }> }
    }
    const results = searchData.query?.search ?? []
    if (!results.length) return null

    const fileTitles = results.map((r) => r.title).join('|')
    const infoRes = await fetch(
      `https://commons.wikimedia.org/w/api.php?action=query&prop=imageinfo&titles=${encodeURIComponent(fileTitles)}&iiprop=url|size|mime&iiurlwidth=600&format=json&origin=*`,
      { headers: { Accept: 'application/json' } },
    )
    if (!infoRes.ok) return null
    const infoData = (await infoRes.json()) as {
      query?: { pages?: Record<string, any> }
    }
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
    return images.length ? images : null
  } catch {
    return null
  }
}

async function fetchWikiImagesForTitle(id: string | undefined, fallbackTitle: string | undefined): Promise<WikiImage[] | null> {
  const title = resolveTitle(id ?? '', fallbackTitle)
  if (!title) return null

  if (imageCache.has(title)) return imageCache.get(title) ?? null
  const existing = imageInflight.get(title)
  if (existing) return existing

  const promise = (async (): Promise<WikiImage[] | null> => {
    try {
      const wp = await fetchWikipediaImagesForTitle(title)
      if (wp?.length) {
        imageCache.set(title, wp)
        return wp
      }
      const wd = await (async (): Promise<WikiImage[] | null> => {
        const summary = await fetchWikiSummary(id, fallbackTitle)
        if (!summary?.images.length) return null
        return summary.images
      })()
      if (wd?.length) {
        imageCache.set(title, wd)
        return wd
      }
      const wc = await fetchWikimediaCommonsImages(title)
      imageCache.set(title, wc)
      return wc
    } catch {
      imageCache.set(title, null)
      return null
    }
  })()

  imageInflight.set(title, promise)
  try {
    return await promise
  } finally {
    imageInflight.delete(title)
  }
}

export function useWikiImages(id: string | undefined, fallbackTitle: string | undefined): { loading: boolean; images: WikiImage[] } {
  const title = resolveTitle(id ?? '', fallbackTitle)
  const [state, setState] = useState<{ loading: boolean; images: WikiImage[] }>({ loading: Boolean(title), images: [] })

  useEffect(() => {
    if (!title) {
      setState({ loading: false, images: [] })
      return
    }
    let cancelled = false
    const cached = imageCache.get(title)
    if (cached) {
      setState({ loading: false, images: cached })
      return
    }
    const inflight = imageInflight.get(title)
    if (inflight) {
      inflight.then((images) => {
        if (!cancelled) setState({ loading: false, images: images ?? [] })
      })
      return
    }
    setState({ loading: true, images: [] })
    const promise = fetchWikiImagesForTitle(id, fallbackTitle).then((images) => {
      imageCache.set(title, images)
      imageInflight.delete(title)
      return images ?? []
    })
    imageInflight.set(title, promise)
    promise.then((images) => {
      if (!cancelled) setState({ loading: false, images })
    })
    return () => {
      cancelled = true
    }
  }, [title])

  return state
}

export function getWikipediaLink(idOrTitle: string, fallbackTitle: string): string {
  const title = WIKI_TITLE_OVERRIDES[idOrTitle] ?? fallbackTitle
  return wikipediaPageUrl(title)
}
