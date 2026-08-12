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

function buildIcon(active: boolean, relevant: boolean, palette: MapMarkersProps['palette']) {
  return {
    path: google.maps.SymbolPath.CIRCLE,
    scale: active ? 11 : relevant ? 9 : 6,
    fillColor: active ? palette.markerActive : relevant ? palette.markerRelevant : palette.markerDefault,
    fillOpacity: 1,
    strokeColor: active ? palette.markerActiveStroke : palette.markerStroke,
    strokeWeight: active ? 2.5 : 1,
  }
}

function getZIndex(active: boolean, relevant: boolean) {
  return active ? 100 : relevant ? 50 : 10
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

  const onSelectRef = useRef(onSelect)
  const activePlaceIdRef = useRef(activePlaceId)
  const relevantIdsRef = useRef(relevantIds)

  onSelectRef.current = onSelect
  activePlaceIdRef.current = activePlaceId
  relevantIdsRef.current = relevantIds

  useEffect(() => {
    if (!map || !places.length) return

    const clusterer = new MarkerClusterer({
      map,
      algorithm: new SuperClusterAlgorithm({ radius: 80, maxZoom: 17, minPoints: 2 }),
      onClusterClick: (_event, cluster, clusterMap) => {
        const bounds = cluster.bounds
        if (bounds) clusterMap.fitBounds(bounds, 48)
      },
      renderer: {
        render: (cluster: { count: number; position: google.maps.LatLng }) => {
          const count = cluster.count
          const scale = 22 + Math.min(count / 6, 20)
          return new google.maps.Marker({
            position: cluster.position,
            icon: {
              path: google.maps.SymbolPath.CIRCLE,
              scale,
              fillColor: palette.markerRelevant,
              fillOpacity: 0.88,
              strokeColor: palette.markerStroke,
              strokeWeight: 2,
            },
            label: {
              text: count.toString(),
              color: theme === 'dark' ? '#101318' : '#fffaf2',
              fontSize: '12px',
              fontWeight: '600',
            },
            zIndex: 1000,
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
      })
      listeners.push(marker.addListener('click', () => onSelectRef.current(place.id)))
      newMarkers.set(place.id, marker)
    }
    clusterer.addMarkers(Array.from(newMarkers.values()))
    markersRef.current = newMarkers

    return () => {
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
    update(activePlaceIdRef.current)
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
