import { useEffect, useRef, useState } from 'react'
import { useGoogleMap, OverlayView } from '@react-google-maps/api'
import { X } from 'lucide-react'

type MapRoutesProps = {
  show: boolean
  theme: 'dark' | 'light'
}

type RouteProperties = {
  id: string
  name: string
  kind: 'road' | 'sea' | string
  era?: string
  description?: string
  source?: string
}

type RouteFeature = {
  type: 'Feature'
  properties: RouteProperties
  geometry: { type: 'LineString'; coordinates: [number, number][] }
}

type RouteCollection = {
  type: 'FeatureCollection'
  features: RouteFeature[]
}

const ROAD_COLOR = { dark: '#c4a87a', light: '#8c6d3f' }
const SEA_COLOR = { dark: '#6e8c9c', light: '#4a6c7c' }

function colorFor(kind: string, theme: 'dark' | 'light') {
  return kind === 'sea' ? SEA_COLOR[theme] : ROAD_COLOR[theme]
}

export default function MapRoutes({ show, theme }: MapRoutesProps) {
  const map = useGoogleMap()
  const polylinesRef = useRef<google.maps.Polyline[]>([])
  const [info, setInfo] = useState<{
    lat: number
    lng: number
    properties: RouteProperties
  } | null>(null)

  useEffect(() => {
    if (!map || !show) {
      setInfo(null)
      return
    }

    let cancelled = false
    const listeners: google.maps.MapsEventListener[] = []

    fetch('/data/road-network.geojson')
      .then((res) => res.json() as Promise<RouteCollection>)
      .then((data) => {
        if (cancelled) return

        const polylines = data.features.map((feature) => {
          const kind = feature.properties.kind ?? 'road'
          const color = colorFor(kind, theme)
          const isSea = kind === 'sea'
          const path = feature.geometry.coordinates.map(([lng, lat]) => ({ lat, lng }))

          const arrowIcon: google.maps.IconSequence = {
            icon: {
              path: google.maps.SymbolPath.FORWARD_OPEN_ARROW,
              scale: 2.2,
              strokeColor: color,
              strokeOpacity: 0.9,
              strokeWeight: 1.4,
            },
            offset: '6%',
            repeat: '14%',
          }

          const dashIcon: google.maps.IconSequence = {
            icon: {
              path: 'M 0,-1 0,1',
              strokeOpacity: 1,
              scale: 3,
            },
            offset: '0',
            repeat: '12px',
          }

          const polyline = new google.maps.Polyline({
            map,
            path,
            strokeColor: color,
            strokeOpacity: isSea ? 0 : 0.82,
            strokeWeight: isSea ? 8 : 2.2,
            icons: isSea ? [dashIcon, arrowIcon] : [arrowIcon],
            zIndex: 5,
          })
          ;(polyline as any).__baseWeight = isSea ? 8 : 2.2
          ;(polyline as any).__baseOpacity = isSea ? 0 : 0.82

          listeners.push(
            polyline.addListener('mouseover', () => {
              polyline.setOptions({
                strokeWeight: isSea ? 8 : 3.4,
                strokeOpacity: isSea ? 0.08 : 1,
                zIndex: 10,
              })
            }),
          )
          listeners.push(
            polyline.addListener('mouseout', () => {
              polyline.setOptions({
                strokeWeight: (polyline as any).__baseWeight,
                strokeOpacity: (polyline as any).__baseOpacity,
                zIndex: 5,
              })
            }),
          )
          listeners.push(
            polyline.addListener('click', (event: google.maps.PolyMouseEvent) => {
              const latLng = event.latLng
              if (!latLng) return
              setInfo({
                lat: latLng.lat(),
                lng: latLng.lng(),
                properties: feature.properties,
              })
            }),
          )

          return polyline
        })

        polylinesRef.current = polylines
      })
      .catch(() => {
        polylinesRef.current = []
      })

    const mapClickListener = map.addListener('click', () => setInfo(null))

    return () => {
      cancelled = true
      listeners.forEach((l) => l.remove())
      google.maps.event.removeListener(mapClickListener)
      polylinesRef.current.forEach((p) => p.setMap(null))
      polylinesRef.current = []
      setInfo(null)
    }
  }, [map, show, theme])

  if (!info) return null

  const { properties } = info
  const kind = properties.kind ?? 'road'
  const color = colorFor(kind, theme)
  const isDark = theme === 'dark'
  const bg = isDark ? '#1a1a1a' : '#ffffff'
  const fg = isDark ? '#f2f2f2' : '#1a1a1a'
  const muted = isDark ? '#a0a0a0' : '#555555'
  const border = isDark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.1)'
  const shadow = isDark
    ? '0 0.5rem 1.5rem rgba(0,0,0,0.6)'
    : '0 0.5rem 1.5rem rgba(0,0,0,0.18)'

  return (
    <OverlayView position={{ lat: info.lat, lng: info.lng }} mapPaneName="overlayMouseTarget">
      <div
        style={{
          position: 'absolute',
          transform: 'translate(-50%, -100%) translateY(-10px)',
          zIndex: 20,
        }}
      >
        <div
          style={{
            position: 'relative',
            minWidth: '12rem',
            maxWidth: '17rem',
            padding: '0.75rem 1rem',
            background: bg,
            color: fg,
            borderRadius: '0.625rem',
            border: `1px solid ${border}`,
            boxShadow: shadow,
            fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, sans-serif',
            fontSize: '0.85rem',
            lineHeight: 1.4,
          }}
          onMouseDown={(e) => e.stopPropagation()}
        >
          <button
            type="button"
            onClick={() => setInfo(null)}
            style={{
              position: 'absolute',
              top: '0.35rem',
              right: '0.35rem',
              background: 'transparent',
              border: 'none',
              color: muted,
              cursor: 'pointer',
              padding: '0.2rem',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
            aria-label="Close route info"
          >
            <X size={14} />
          </button>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
            <span
              style={{
                width: '1.6rem',
                height: '0.2rem',
                borderRadius: '999px',
                background: color,
                flexShrink: 0,
              }}
            />
            <span style={{ fontSize: '1.02rem', fontWeight: 700, letterSpacing: '-0.02em' }}>
              {properties.name}
            </span>
          </div>
          <div style={{ color: muted }}>
            <div style={{ fontWeight: 500 }}>
              {kind === 'sea' ? 'Sea route' : 'Overland route'}
              {properties.era ? ` \u00b7 ${properties.era}` : ''}
            </div>
            {properties.description ? (
              <div style={{ marginTop: '0.4rem', color: fg, opacity: 0.9 }}>{properties.description}</div>
            ) : null}
            {properties.source ? (
              <div style={{ marginTop: '0.375rem', fontSize: '0.7rem', opacity: 0.75 }}>
                {properties.source}
              </div>
            ) : null}
          </div>
        </div>
        <div
          style={{
            position: 'absolute',
            bottom: '-6px',
            left: '50%',
            transform: 'translateX(-50%)',
            width: 0,
            height: 0,
            borderLeft: '6px solid transparent',
            borderRight: '6px solid transparent',
            borderTop: `6px solid ${bg}`,
          }}
        />
      </div>
    </OverlayView>
  )
}
