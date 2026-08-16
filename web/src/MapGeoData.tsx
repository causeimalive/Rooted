import { useEffect, useRef } from 'react'
import { useGoogleMap } from '@react-google-maps/api'

type MapGeoDataProps = {
  show: boolean
  theme: 'dark' | 'light'
}

export default function MapGeoData({ show, theme }: MapGeoDataProps) {
  const map = useGoogleMap()
  const dataLayerRef = useRef<google.maps.Data | null>(null)

  useEffect(() => {
    if (!map || !show) return

    const data = new google.maps.Data({ map })
    dataLayerRef.current = data

    data.loadGeoJson('/data/natural-earth.geojson')
    data.setStyle((feature) => {
      const layer = (feature.getProperty('layer') as string) ?? 'coastline'
      if (layer === 'border') {
        const stroke = theme === 'dark' ? '#5c6570' : '#8b94a0'
        return {
          fillColor: 'transparent',
          fillOpacity: 0,
          strokeColor: stroke,
          strokeOpacity: 0.55,
          strokeWeight: 1,
        }
      }
      if (layer === 'river') {
        const color = theme === 'dark' ? '#5c8c9c' : '#4a7c8c'
        return {
          strokeColor: color,
          strokeOpacity: 0.7,
          strokeWeight: 1.5,
        }
      }
      const coast = theme === 'dark' ? '#8a919e' : '#6d675b'
      return {
        strokeColor: coast,
        strokeOpacity: 0.75,
        strokeWeight: 1.5,
      }
    })

    return () => {
      data.setMap(null)
      dataLayerRef.current = null
    }
  }, [map, show, theme])

  return null
}
