import { getMapStyle } from './mapStyles'

export type MapBaseLayer = 'antique' | 'roadmap' | 'satellite'

export const BASE_LAYERS: { id: MapBaseLayer; label: string }[] = [
  { id: 'antique', label: 'Antique' },
  { id: 'roadmap', label: 'Modern' },
  { id: 'satellite', label: 'Satellite' },
]

export function getMapOptions(
  base: MapBaseLayer,
  theme: 'dark' | 'light',
): google.maps.MapOptions {
  const isSatellite = base === 'satellite'
  const isAntique = base === 'antique'
  return {
    mapTypeId: isSatellite
      ? (google?.maps?.MapTypeId?.SATELLITE ?? ('satellite' as google.maps.MapTypeId))
      : (google?.maps?.MapTypeId?.ROADMAP ?? ('roadmap' as google.maps.MapTypeId)),
    styles: isAntique ? getMapStyle(theme) : [],
    disableDefaultUI: true,
    zoomControl: true,
    clickableIcons: false,
    gestureHandling: 'greedy',
  }
}

export function isTileLayer(base: MapBaseLayer) {
  return base === 'antique' || base === 'roadmap'
}
