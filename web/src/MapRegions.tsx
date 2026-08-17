import { useEffect, useRef, useState } from 'react'
import { useGoogleMap, InfoWindow } from '@react-google-maps/api'

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

    data.addListener('click', (event: google.maps.Data.MouseEvent) => {
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
    })

    return () => {
      data.setMap(null)
      dataLayerRef.current = null
    }
  }, [map, show, theme])

  if (!info) return null

  const confidenceText =
    info.minConfidence != null && info.maxConfidence != null
      ? `Confidence: ${info.minConfidence}–${info.maxConfidence}%`
      : null

  return (
    <InfoWindow
      position={{ lat: info.lat, lng: info.lng }}
      onCloseClick={() => setInfo(null)}
      options={{
        pixelOffset: new google.maps.Size(0, -12),
        maxWidth: 220,
      }}
    >
      <div
        style={{
          fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, sans-serif',
          minWidth: '8.5rem',
          padding: '0.5rem 0.25rem',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            marginBottom: '0.375rem',
          }}
        >
          <span
            style={{
              width: '0.875rem',
              height: '0.875rem',
              borderRadius: '50%',
              background: info.color,
              boxShadow: `0 0 0.5rem ${info.color}80`,
              flexShrink: 0,
            }}
          />
          <span
            style={{
              fontSize: '1.05rem',
              fontWeight: 700,
              color: '#2a2a2a',
              letterSpacing: '-0.02em',
            }}
          >
            {info.name}
          </span>
        </div>
        <div
          style={{
            fontSize: '0.75rem',
            color: '#6b6b6b',
            lineHeight: 1.4,
          }}
        >
          <div style={{ fontWeight: 500 }}>Biblical region</div>
          {confidenceText ? <div style={{ marginTop: '0.125rem' }}>{confidenceText}</div> : null}
          <div style={{ marginTop: '0.25rem', fontSize: '0.68rem', opacity: 0.7 }}>
            Source: OpenBible Geocoding Data
          </div>
        </div>
      </div>
    </InfoWindow>
  )
}
