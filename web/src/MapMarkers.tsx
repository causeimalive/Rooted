import { useEffect, useRef } from 'react'
import { useGoogleMap } from '@react-google-maps/api'
import { MarkerClusterer, SuperClusterAlgorithm } from '@googlemaps/markerclusterer'
import type { Place } from './types'

type MapMarkersProps = {
  places: Place[]
  palette: {
    markerDefault: string
    markerRelevant: string
    markerActive: string
    markerStroke: string
    markerActiveStroke: string
  }
  theme: 'dark' | 'light'
  relevantIds: Set<string>
  activePlaceId?: string
  onSelect: (id: string) => void
}

const BOUNCE_DURATION = 1400
const SPIDERFY_PIXEL_THRESHOLD = 24

function buildIcon(active: boolean, relevant: boolean, palette: MapMarkersProps['palette']) {
  return {
    path: google.maps.SymbolPath.CIRCLE,
    scale: active ? 10 : relevant ? 8 : 5,
    fillColor: active ? palette.markerActive : relevant ? palette.markerRelevant : palette.markerDefault,
    fillOpacity: 1,
    strokeColor: active ? palette.markerActiveStroke : palette.markerStroke,
    strokeWeight: active ? 2.5 : 1,
  }
}

function getZIndex(active: boolean, relevant: boolean) {
  return active ? 100 : relevant ? 50 : 10
}

// Google's legacy Marker API only uses fast canvas-based ("optimized")
// rendering when a marker has no text `label`; any labeled marker falls
// back to a real DOM element that has to be repositioned by JS on every
// pan/zoom frame. Cluster bubbles previously used icon+label together,
// which forced every visible cluster into that slow path. Baking the count
// directly into an SVG icon keeps clusters on the fast canvas path too.
const clusterIconCache = new Map<string, google.maps.Icon>()

function buildClusterIcon(count: number, theme: 'dark' | 'light') {
  const cacheKey = `${theme}:${count}`
  const cached = clusterIconCache.get(cacheKey)
  if (cached) return cached

  const radius = 20 + Math.min(count / 8, 16)
  const size = Math.ceil(radius * 2 + 4)
  const center = size / 2

  const isDark = theme === 'dark'
  let fill: string
  let stroke: string
  let textColor: string
  if (count < 10) {
    fill = isDark ? '#3e4d5e' : '#dcc69a'
    stroke = isDark ? '#90a4bc' : '#a68f65'
    textColor = isDark ? '#f2f6fa' : '#2a2a2a'
  } else if (count < 50) {
    fill = isDark ? '#2e3a4a' : '#c9a66b'
    stroke = isDark ? '#7d8fa3' : '#8c7349'
    textColor = isDark ? '#e8edf2' : '#2a2a2a'
  } else {
    fill = isDark ? '#1b2532' : '#a8824f'
    stroke = isDark ? '#5c738f' : '#7c6239'
    textColor = isDark ? '#ffffff' : '#1a1a1a'
  }

  const fontSize = Math.max(10, Math.min(16, radius * 0.42))
  const label = count > 999 ? '999+' : count.toString()

  const strokeWidth = count >= 50 ? 2 : 1.5
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">` +
    `<circle cx="${center}" cy="${center}" r="${radius}" fill="${fill}" fill-opacity="0.78" stroke="${stroke}" stroke-width="${strokeWidth}"/>` +
    `<text x="50%" y="52%" text-anchor="middle" dominant-baseline="middle" font-family="system-ui, -apple-system, sans-serif" font-size="${fontSize}" font-weight="600" fill="${textColor}">${label}</text>` +
    `</svg>`

  const icon: google.maps.Icon = {
    url: `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`,
    scaledSize: new google.maps.Size(size, size),
    anchor: new google.maps.Point(center, center),
  }
  clusterIconCache.set(cacheKey, icon)
  return icon
}

function metersPerPixel(lat: number, zoom: number) {
  return (156543.03392 * Math.cos((lat * Math.PI) / 180)) / Math.pow(2, zoom)
}

function haversineMeters(a: google.maps.LatLng, b: google.maps.LatLng) {
  const R = 6371000
  const lat1 = (a.lat() * Math.PI) / 180
  const lat2 = (b.lat() * Math.PI) / 180
  const dLat = lat2 - lat1
  const dLng = ((b.lng() - a.lng()) * Math.PI) / 180
  const sinDLat = Math.sin(dLat / 2)
  const sinDLng = Math.sin(dLng / 2)
  const h = sinDLat * sinDLat + Math.cos(lat1) * Math.cos(lat2) * sinDLng * sinDLng
  return 2 * R * Math.asin(Math.sqrt(h))
}

// Compass bearing (radians, 0 = north, clockwise positive) from a to b.
function bearingRadians(a: google.maps.LatLng, b: google.maps.LatLng) {
  const lat1 = (a.lat() * Math.PI) / 180
  const lat2 = (b.lat() * Math.PI) / 180
  const dLng = ((b.lng() - a.lng()) * Math.PI) / 180
  const y = Math.sin(dLng) * Math.cos(lat2)
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng)
  return Math.atan2(y, x)
}

// Offset a lat/lng by a distance (meters) along a compass bearing (radians).
function offsetLatLng(center: google.maps.LatLng, bearing: number, meters: number) {
  const dLat = (meters * Math.cos(bearing)) / 111320
  const dLng = (meters * Math.sin(bearing)) / (111320 * Math.cos((center.lat() * Math.PI) / 180))
  return new google.maps.LatLng(center.lat() + dLat, center.lng() + dLng)
}

type SpiderfyState = {
  key: string
  lines: google.maps.Polyline[]
  markers: google.maps.Marker[]
  clickListener: google.maps.MapsEventListener
  zoomListener: google.maps.MapsEventListener
  dragListener: google.maps.MapsEventListener
}

export default function MapMarkers({
  places,
  palette,
  theme,
  relevantIds,
  activePlaceId,
  onSelect,
}: MapMarkersProps) {
  const map = useGoogleMap()
  const markersRef = useRef<Map<string, google.maps.Marker>>(new Map())
  const clustererRef = useRef<MarkerClusterer | null>(null)
  const bounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const prevActiveRef = useRef<string | undefined>(undefined)
  const spiderfyRef = useRef<SpiderfyState | null>(null)

  const onSelectRef = useRef(onSelect)
  const activePlaceIdRef = useRef(activePlaceId)
  const relevantIdsRef = useRef(relevantIds)

  onSelectRef.current = onSelect
  activePlaceIdRef.current = activePlaceId
  relevantIdsRef.current = relevantIds

  useEffect(() => {
    if (!map || !places.length) return

    const collapseSpiderfy = () => {
      const s = spiderfyRef.current
      if (!s) return
      s.lines.forEach((l) => l.setMap(null))
      s.markers.forEach((m) => {
        google.maps.event.clearInstanceListeners(m)
        m.setMap(null)
      })
      google.maps.event.removeListener(s.clickListener)
      google.maps.event.removeListener(s.zoomListener)
      google.maps.event.removeListener(s.dragListener)
      spiderfyRef.current = null
    }

    const spiderfy = (
      clusterMap: google.maps.Map,
      center: google.maps.LatLng,
      clusterMarkers: google.maps.Marker[],
      key: string,
    ) => {
      const zoom = clusterMap.getZoom() ?? 6
      const mpp = metersPerPixel(center.lat(), zoom)
      const count = clusterMarkers.length
      const minVisiblePixels = Math.min(70, 22 + count * 5)
      const maxVisiblePixels = 90
      const clusterIcon = buildClusterIcon(count, theme)
      const clusterRadiusPx = Math.max(0, ((clusterIcon.scaledSize as google.maps.Size).width ?? 0) / 2 - 2)
      const clusterRadiusMeters = clusterRadiusPx * mpp
      const lines: google.maps.Polyline[] = []
      const satellites: google.maps.Marker[] = []

      // Use each marker's true bearing/distance from the cluster center so
      // the fanned-out dots point toward their real relative location.
      // Markers that share (near) identical coordinates have no meaningful
      // bearing, so they're spaced evenly among themselves as a fallback.
      const EPSILON_METERS = 0.5
      const withGeometry = clusterMarkers.map((marker) => {
        const pos = marker.getPosition() ?? center
        const distanceMeters = haversineMeters(center, pos)
        return { marker, pos, distanceMeters }
      })
      const zeroDistance = withGeometry.filter((w) => w.distanceMeters <= EPSILON_METERS)
      const bearingById = new Map<google.maps.Marker, number>()
      withGeometry.forEach((w) => {
        if (w.distanceMeters > EPSILON_METERS) {
          bearingById.set(w.marker, bearingRadians(center, w.pos))
        }
      })
      zeroDistance.forEach((w, i) => {
        bearingById.set(w.marker, (2 * Math.PI * i) / zeroDistance.length)
      })

      withGeometry.forEach(({ marker: original, distanceMeters }) => {
        const bearing = bearingById.get(original) ?? 0
        const actualPixels = distanceMeters / mpp
        const radiusPixels = Math.min(maxVisiblePixels, Math.max(minVisiblePixels, actualPixels))
        const satPos = offsetLatLng(center, bearing, radiusPixels * mpp)

        const lineStart = offsetLatLng(center, bearing, clusterRadiusMeters)
        const line = new google.maps.Polyline({
          map: clusterMap,
          path: [lineStart, satPos],
          strokeColor: theme === 'dark' ? '#7d8fa3' : '#8c7349',
          strokeOpacity: 0.45,
          strokeWeight: 1,
          zIndex: 900,
        })
        lines.push(line)

        const placeId = (original as any).__placeId as string | undefined
        const satellite = new google.maps.Marker({
          map: clusterMap,
          position: satPos,
          title: original.getTitle() ?? undefined,
          icon: original.getIcon() as any,
          zIndex: 950,
        })
        satellite.addListener('click', () => {
          if (placeId) onSelectRef.current(placeId)
        })
        satellites.push(satellite)
      })

      const clickListener = clusterMap.addListener('click', collapseSpiderfy)
      const zoomListener = clusterMap.addListener('zoom_changed', collapseSpiderfy)
      const dragListener = clusterMap.addListener('dragstart', collapseSpiderfy)

      spiderfyRef.current = { key, lines, markers: satellites, clickListener, zoomListener, dragListener }
    }

    const clusterer = new MarkerClusterer({
      map,
      algorithm: new SuperClusterAlgorithm({ radius: 80, maxZoom: 16, minPoints: 3 }),
      onClusterClick: (_event, cluster, clusterMap) => {
        const clusterMarkers = (cluster as any).markers as google.maps.Marker[] | undefined
        const center = cluster.position
        const key = `${center.lat().toFixed(5)},${center.lng().toFixed(5)},${cluster.count}`

        const wasSpiderfied = spiderfyRef.current?.key === key
        collapseSpiderfy()
        if (wasSpiderfied) return

        if (clusterMarkers && clusterMarkers.length > 1) {
          const zoom = clusterMap.getZoom() ?? 6
          const mpp = metersPerPixel(center.lat(), zoom)
          let maxPixels = 0
          for (const m of clusterMarkers) {
            const pos = m.getPosition()
            if (!pos) continue
            maxPixels = Math.max(maxPixels, haversineMeters(center, pos) / mpp)
          }
          if (maxPixels < SPIDERFY_PIXEL_THRESHOLD) {
            spiderfy(clusterMap, center, clusterMarkers, key)
            return
          }
        }

        const bounds = cluster.bounds
        if (bounds) clusterMap.fitBounds(bounds, 40)
      },
      renderer: {
        render: (cluster: { count: number; position: google.maps.LatLng }) => {
          return new google.maps.Marker({
            position: cluster.position,
            icon: buildClusterIcon(cluster.count, theme),
            zIndex: 800,
            optimized: true,
          })
        },
      } as any,
    })
    clustererRef.current = clusterer

    const newMarkers = new Map<string, google.maps.Marker>()
    const listeners: google.maps.MapsEventListener[] = []
    for (const place of places) {
      const active = place.id === activePlaceIdRef.current
      const relevant = relevantIdsRef.current.has(place.id)
      const marker = new google.maps.Marker({
        position: { lat: place.lat, lng: place.lng },
        title: place.name,
        icon: buildIcon(active, relevant, palette),
        zIndex: getZIndex(active, relevant),
        optimized: true,
      })
      ;(marker as any).__placeId = place.id
      listeners.push(marker.addListener('click', () => onSelectRef.current(place.id)))
      newMarkers.set(place.id, marker)
    }
    clusterer.addMarkers(Array.from(newMarkers.values()))
    markersRef.current = newMarkers

    return () => {
      collapseSpiderfy()
      if (bounceTimerRef.current) clearTimeout(bounceTimerRef.current)
      listeners.forEach((l) => l.remove())
      clusterer.clearMarkers()
      ;(clusterer as any).setMap(null)
      newMarkers.forEach((m) => m.setMap(null))
      markersRef.current = new Map()
      clustererRef.current = null
    }
  }, [map, places, palette, theme])

  useEffect(() => {
    if (!markersRef.current.size) return
    markersRef.current.forEach((marker, id) => {
      const active = id === activePlaceIdRef.current
      const relevant = relevantIds.has(id)
      marker.setIcon(buildIcon(active, relevant, palette))
      marker.setZIndex(getZIndex(active, relevant))
    })
  }, [relevantIds, palette])

  useEffect(() => {
    if (!markersRef.current.size) return
    const update = (id: string | undefined) => {
      if (!id) return
      const marker = markersRef.current.get(id)
      if (!marker) return
      const active = id === activePlaceId
      const relevant = relevantIdsRef.current.has(id)
      marker.setIcon(buildIcon(active, relevant, palette))
      marker.setZIndex(getZIndex(active, relevant))
    }
    update(prevActiveRef.current)
    update(activePlaceId)
  }, [activePlaceId, palette])

  useEffect(() => {
    if (bounceTimerRef.current) {
      clearTimeout(bounceTimerRef.current)
      bounceTimerRef.current = null
    }
    const previous = prevActiveRef.current
    if (previous) {
      const prev = markersRef.current.get(previous)
      if (prev) prev.setAnimation(null)
    }
    prevActiveRef.current = activePlaceId
    if (!activePlaceId) return
    const marker = markersRef.current.get(activePlaceId)
    if (!marker) return
    marker.setAnimation(google.maps.Animation.BOUNCE)
    bounceTimerRef.current = setTimeout(() => {
      marker.setAnimation(null)
      bounceTimerRef.current = null
    }, BOUNCE_DURATION)
  }, [activePlaceId])

  return null
}
