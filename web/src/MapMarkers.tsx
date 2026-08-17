import { useEffect, useMemo, useRef, useState } from 'react'
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
const VIEWPORT_BUFFER = 0.5

type BoundsLiteral = {
  north: number
  east: number
  south: number
  west: number
}

function buildIcon(
  active: boolean,
  relevant: boolean,
  palette: MapMarkersProps['palette'],
) {
  return {
    path: google.maps.SymbolPath.CIRCLE,
    scale: active ? 10 : relevant ? 8 : 5,
    fillColor: active
      ? palette.markerActive
      : relevant
        ? palette.markerRelevant
        : palette.markerDefault,
    fillOpacity: 1,
    strokeColor: active ? palette.markerActiveStroke : palette.markerStroke,
    strokeWeight: active ? 2.5 : 1,
  }
}

function getZIndex(active: boolean, relevant: boolean) {
  return active ? 100 : relevant ? 50 : 10
}

function visibleIdsForBounds(
  bounds: BoundsLiteral | null,
  places: Place[],
  activePlaceId?: string,
): Set<string> {
  const visible = new Set<string>()
  if (activePlaceId) visible.add(activePlaceId)
  if (!bounds) return visible

  const latSpan = bounds.north - bounds.south
  const lngSpan = bounds.east - bounds.west
  const minLat = bounds.south - latSpan * VIEWPORT_BUFFER
  const maxLat = bounds.north + latSpan * VIEWPORT_BUFFER
  const minLng = bounds.west - lngSpan * VIEWPORT_BUFFER
  const maxLng = bounds.east + lngSpan * VIEWPORT_BUFFER

  for (const place of places) {
    if (
      place.lat >= minLat &&
      place.lat <= maxLat &&
      place.lng >= minLng &&
      place.lng <= maxLng
    ) {
      visible.add(place.id)
    }
  }
  return visible
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
  const clustererRef = useRef<MarkerClusterer | null>(null)
  const markersRef = useRef<Map<string, google.maps.Marker>>(new Map())
  const [viewportBounds, setViewportBounds] = useState<BoundsLiteral | null>(null)
  const bounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const prevActiveRef = useRef<string | undefined>(undefined)

  const onSelectRef = useRef(onSelect)
  const activePlaceIdRef = useRef(activePlaceId)
  const relevantIdsRef = useRef(relevantIds)

  onSelectRef.current = onSelect
  activePlaceIdRef.current = activePlaceId
  relevantIdsRef.current = relevantIds

  const placesById = useMemo(() => {
    const byId = new Map<string, Place>()
    for (const place of places) byId.set(place.id, place)
    return byId
  }, [places])

  const visibleIds = useMemo(
    () => visibleIdsForBounds(viewportBounds, places, activePlaceId),
    [viewportBounds, places, activePlaceId],
  )

  // Track viewport changes
  useEffect(() => {
    if (!map) return
    const update = () => {
      const b = map.getBounds()
      if (!b) return
      const ne = b.getNorthEast()
      const sw = b.getSouthWest()
      setViewportBounds({
        north: ne.lat(),
        east: ne.lng(),
        south: sw.lat(),
        west: sw.lng(),
      })
    }
    update()
    const listener = map.addListener('idle', update)
    return () => {
      google.maps.event.removeListener(listener)
    }
  }, [map])

  // Initialize / recreate the clusterer
  useEffect(() => {
    if (!map) return

    const clusterer = new MarkerClusterer({
      map,
      algorithm: new SuperClusterAlgorithm({
        radius: 60,
        maxZoom: 16,
        minPoints: 3,
      }),
      onClusterClick: (_event, cluster, clusterMap) => {
        const bounds = cluster.bounds
        if (bounds) clusterMap.fitBounds(bounds, 40)
      },
      renderer: {
        render: (cluster: { count: number; position: google.maps.LatLng }) => {
          const count = cluster.count
          const scale = 22 + Math.min(count / 5, 16)
          return new google.maps.Marker({
            position: cluster.position,
            icon: {
              path: google.maps.SymbolPath.CIRCLE,
              scale,
              fillColor: theme === 'dark' ? '#2e3a4a' : '#c9a66b',
              fillOpacity: 0.72,
              strokeColor: theme === 'dark' ? '#7d8fa3' : '#8c7349',
              strokeWeight: 1.5,
            },
            label: {
              text: count.toString(),
              color: theme === 'dark' ? '#e8edf2' : '#2a2a2a',
              fontSize: '10px',
              fontWeight: '600',
            },
            zIndex: 800,
          })
        },
      } as any,
    })
    clustererRef.current = clusterer

    return () => {
      clusterer.clearMarkers()
      ;(clusterer as any).setMap(null)
      clustererRef.current = null
    }
  }, [map, theme])

  // Add or remove markers as the viewport changes
  useEffect(() => {
    const clusterer = clustererRef.current
    if (!clusterer) return

    const current = markersRef.current
    const toRemove: google.maps.Marker[] = []

    for (const [id, marker] of current) {
      if (!visibleIds.has(id)) {
        toRemove.push(marker)
        marker.setMap(null)
        google.maps.event.clearInstanceListeners(marker)
      }
    }
    if (toRemove.length) {
      clusterer.removeMarkers(toRemove)
      toRemove.forEach((m) => current.delete((m as any).__placeId))
    }

    const toAdd: google.maps.Marker[] = []
    for (const id of visibleIds) {
      if (current.has(id)) continue
      const place = placesById.get(id)
      if (!place) continue
      const active = id === activePlaceIdRef.current
      const relevant = relevantIdsRef.current.has(id)
      const marker = new google.maps.Marker({
        position: { lat: place.lat, lng: place.lng },
        title: place.name,
        icon: buildIcon(active, relevant, palette),
        zIndex: getZIndex(active, relevant),
      })
      ;(marker as any).__placeId = id
      marker.addListener('click', () => onSelectRef.current(place.id))
      toAdd.push(marker)
      current.set(id, marker)
    }
    if (toAdd.length) clusterer.addMarkers(toAdd)
  }, [visibleIds, palette, placesById])

  // Update icons when relevance changes
  useEffect(() => {
    if (!markersRef.current.size) return
    for (const [id, marker] of markersRef.current) {
      const active = id === activePlaceIdRef.current
      const relevant = relevantIds.has(id)
      marker.setIcon(buildIcon(active, relevant, palette))
      marker.setZIndex(getZIndex(active, relevant))
    }
  }, [relevantIds, palette])

  // Update icons when the active place changes
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

  // Bounce animation for the active marker
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
