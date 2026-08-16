import { useEffect, useRef } from 'react'
import { useGoogleMap } from '@react-google-maps/api'

type MapRoutesProps = {
  show: boolean
  theme: 'dark' | 'light'
}

export default function MapRoutes({ show, theme }: MapRoutesProps) {
  const map = useGoogleMap()
  const dataLayerRef = useRef<google.maps.Data | null>(null)

  useEffect(() => {
    if (!map || !show) return

    const data = new google.maps.Data({ map })
    dataLayerRef.current = data

    data.loadGeoJson('/data/road-network.geojson')
    data.setStyle((feature) => {
      const kind = (feature.getProperty('kind') as string) ?? 'road'
      const color =
        kind === 'sea'
          ? theme === 'dark' ? '#6e8c9c' : '#4a6c7c'
          : theme === 'dark' ? '#c4a87a' : '#8c6d3f'
      return {
        strokeColor: color,
        strokeOpacity: 0.8,
        strokeWeight: kind === 'sea' ? 1.5 : 2,
      }
    })

    data.addListener('click', (event: google.maps.Data.MouseEvent) => {
      const name = event.feature.getProperty('name') as string
      // eslint-disable-next-line no-console
      console.log('Route clicked:', name)
    })

    return () => {
      data.setMap(null)
      dataLayerRef.current = null
    }
  }, [map, show, theme])

  return null
}
