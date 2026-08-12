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
  bounceId?: string | null
  onSelect: (id: string) => void
}

function buildIcon(active: boolean, relevant: boolean, palette: MapMarkersProps['palette']) {
  return {
    path: google.maps.SymbolPath.CIRCLE,
    scale: active ? 13 : relevant ? 10 : 8,
    fillColor: active ? palette.markerActive : relevant ? palette.markerRelevant : palette.markerDefault,
    fillOpacity: 1,
    strokeColor: active ? palette.markerActiveStroke : palette.markerStroke,
    strokeWeight: active ? 3 : 1.5,
  }
}

export default function MapMarkers({
  places,
  palette,
  theme,
  relevantIds,
  activePlaceId,
  bounceId,
  onSelect,
}: MapMarkersProps) {
  const map = useGoogleMap()
  const markersRef = useRef<Map<string, google.maps.Marker>>(new Map())
  const clustererRef = useRef<MarkerClusterer | null>(null)

  const onSelectRef = useRef(onSelect)
  const activePlaceIdRef = useRef(activePlaceId)
  const relevantIdsRef = useRef(relevantIds)
  const bounceIdRef = useRef(bounceId)

  onSelectRef.current = onSelect
  activePlaceIdRef.current = activePlaceId
  relevantIdsRef.current = relevantIds
  bounceIdRef.current = bounceId

  useEffect(() => {
    if (!map || !places.length) return

    const clusterer = new MarkerClusterer({
      map,
      algorithm: new SuperClusterAlgorithm({ radius: 80, maxZoom: 18 }),
      renderer: {
        render: (cluster: { count: number; position: google.maps.LatLng }) => {
          const count = cluster.count
          const scale = 26 + Math.min(count / 4, 24)
          return new google.maps.Marker({
            position: cluster.position,
            icon: {
              path: google.maps.SymbolPath.CIRCLE,
              scale,
              fillColor: palette.markerRelevant,
              fillOpacity: 0.92,
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
        animation: place.id === bounceIdRef.current ? google.maps.Animation.BOUNCE : undefined,
      })
      listeners.push(marker.addListener('click', () => onSelectRef.current(place.id)))
      newMarkers.set(place.id, marker)
    }
    clusterer.addMarkers(Array.from(newMarkers.values()))
    markersRef.current = newMarkers

    return () => {
      listeners.forEach((l) => l.remove())
      clusterer.clearMarkers()
      ;(clusterer as any).setMap(null)
      newMarkers.forEach((m) => m.setMap(null))
      markersRef.current = new Map()
      clustererRef.current = null
    }
  }, [map, places, palette, theme])

  useEffect(() => {
    if (!clustererRef.current) return
    markersRef.current.forEach((marker, id) => {
      const active = id === activePlaceId
      const relevant = relevantIds.has(id)
      marker.setIcon(buildIcon(active, relevant, palette))
      marker.setAnimation(id === bounceId ? google.maps.Animation.BOUNCE : null)
    })
  }, [activePlaceId, relevantIds, bounceId, palette])

  return null
}
