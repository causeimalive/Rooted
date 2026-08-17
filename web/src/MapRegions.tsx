import { useEffect, useRef } from 'react'
import { useGoogleMap } from '@react-google-maps/api'

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
      const name = event.feature.getProperty('name') as string
      // eslint-disable-next-line no-console
      console.log('Region clicked:', name)
    })

    return () => {
      data.setMap(null)
      dataLayerRef.current = null
    }
  }, [map, show, theme])

  return null
}
