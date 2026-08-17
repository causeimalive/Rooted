import { useEffect, useRef, useState } from 'react'
import { useGoogleMap, OverlayView } from '@react-google-maps/api'
import { X } from 'lucide-react'

type MapRegionsProps = {
  show: boolean
  theme: 'dark' | 'light'
}

const REGION_COLORS: Record<string, string> = {
  canaan: '#c9a66b',
  galilee: '#7bb36a',
  samaria: '#d19a66',
  judea: '#d66a6a',
  philistia: '#6a9bd6',
  decapolis: '#9b6ad6',
  gilead: '#6ad6a6',
  moab: '#d6c06a',
  edom: '#d66a93',
  assyria: '#d68a6a',
  babylonia: '#6a8ad6',
  egypt: '#d6a66a',
}

export default function MapRegions({ show, theme }: MapRegionsProps) {
  const map = useGoogleMap()
  const dataLayerRef = useRef<google.maps.Data | null>(null)
  const [info, setInfo] = useState<{
    lat: number
    lng: number
    id: string
    name: string
    color: string
    format: string
    maxConfidence?: number
    minConfidence?: number
  } | null>(null)

  useEffect(() => {
    if (!map || !show) return

    const data = new google.maps.Data({ map })
    dataLayerRef.current = data

    data.loadGeoJson('/data/regions.geojson')
    data.setStyle((feature) => {
      const id = (feature.getProperty('id') as string) ?? ''
      const color = (feature.getProperty('color') as string) ?? REGION_COLORS[id] ?? '#888'
      const isIsobands = feature.getProperty('format') === 'isobands'
      const strokeColor = theme === 'dark' ? '#e8ddc9' : '#2e372a'
      return {
        fillColor: color,
        fillOpacity: isIsobands ? 0.04 : 0.18,
        strokeColor,
        strokeOpacity: isIsobands ? 0.2 : 0.65,
        strokeWeight: isIsobands ? 0.5 : 1.5,
      }
    })

    const dataClickListener = data.addListener('click', (event: google.maps.Data.MouseEvent) => {
      const name = (event.feature.getProperty('name') as string) ?? ''
      const id = (event.feature.getProperty('id') as string) ?? ''
      const color =
        (event.feature.getProperty('color') as string) ?? REGION_COLORS[id] ?? '#888'
      const format = (event.feature.getProperty('format') as string) ?? ''
      const maxConfidence = (event.feature.getProperty('max_confidence') as number) ?? undefined
      const minConfidence = (event.feature.getProperty('min_confidence') as number) ?? undefined
      const latLng = event.latLng
      if (latLng && name) {
        setInfo({
          lat: latLng.lat(),
          lng: latLng.lng(),
          id,
          name,
          color,
          format,
          maxConfidence,
          minConfidence,
        })
      }
      const stop = (event as { stop?: () => void }).stop
      if (typeof stop === 'function') stop()
    })

    const mapClickListener = map.addListener('click', () => setInfo(null))

    return () => {
      google.maps.event.removeListener(dataClickListener)
      google.maps.event.removeListener(mapClickListener)
      data.setMap(null)
      dataLayerRef.current = null
    }
  }, [map, show, theme])

  if (!info) return null

  const confidenceText =
    info.minConfidence != null && info.maxConfidence != null
      ? `Confidence: ${info.minConfidence}–${info.maxConfidence}%`
      : null

  const isDark = theme === 'dark'
  const bg = isDark ? '#1a1a1a' : '#ffffff'
  const fg = isDark ? '#f2f2f2' : '#1a1a1a'
  const muted = isDark ? '#a0a0a0' : '#555555'
  const border = isDark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.1)'
  const shadow = isDark
    ? '0 0.5rem 1.5rem rgba(0,0,0,0.6)'
    : '0 0.5rem 1.5rem rgba(0,0,0,0.18)'

  return (
    <OverlayView
      position={{ lat: info.lat, lng: info.lng }}
      mapPaneName="overlayMouseTarget"
    >
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
            minWidth: '10rem',
            maxWidth: '15rem',
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
            aria-label="Close region info"
          >
            <X size={14} />
          </button>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              marginBottom: '0.5rem',
            }}
          >
            <span
              style={{
                width: '0.875rem',
                height: '0.875rem',
                borderRadius: '50%',
                background: info.color,
                boxShadow: `0 0 0.6rem ${info.color}b0`,
                flexShrink: 0,
              }}
            />
            <span
              style={{
                fontSize: '1.05rem',
                fontWeight: 700,
                letterSpacing: '-0.02em',
              }}
            >
              {info.name}
            </span>
          </div>
          <div style={{ color: muted }}>
            <div style={{ fontWeight: 500 }}>Biblical region</div>
            {confidenceText ? (
              <div style={{ marginTop: '0.25rem' }}>{confidenceText}</div>
            ) : null}
            <div style={{ marginTop: '0.375rem', fontSize: '0.7rem', opacity: 0.85 }}>
              Source: OpenBible Geocoding Data
            </div>
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
