export const STANDARD_LIGHT_MAP_STYLE: google.maps.MapTypeStyle[] = [
  { elementType: 'geometry', stylers: [{ color: '#f4ead7' }] },
  { elementType: 'labels.icon', stylers: [{ visibility: 'off' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#fff8eb' }, { weight: 2 }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#4a3e2f' }] },
  { featureType: 'administrative', elementType: 'geometry.stroke', stylers: [{ color: '#93836b' }, { weight: 0.8 }] },
  { featureType: 'administrative.country', elementType: 'labels.text.fill', stylers: [{ color: '#635646' }] },
  { featureType: 'administrative.land_parcel', stylers: [{ visibility: 'off' }] },
  { featureType: 'administrative.locality', elementType: 'labels.text.fill', stylers: [{ color: '#6b5b49' }] },
  { featureType: 'landscape', elementType: 'geometry', stylers: [{ color: '#f0e3ce' }] },
  { featureType: 'landscape.man_made', elementType: 'geometry', stylers: [{ color: '#f7f0e3' }] },
  { featureType: 'landscape.natural', elementType: 'geometry', stylers: [{ color: '#e8ddc9' }] },
  { featureType: 'poi', stylers: [{ visibility: 'off' }] },
  { featureType: 'poi.park', elementType: 'geometry', stylers: [{ color: '#e1d7bf' }, { visibility: 'on' }] },
  { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#d0c1aa' }] },
  { featureType: 'road', elementType: 'labels.text.fill', stylers: [{ color: '#6d665d' }] },
  { featureType: 'road.highway', elementType: 'geometry', stylers: [{ color: '#b9a483' }] },
  { featureType: 'road.local', elementType: 'geometry', stylers: [{ color: '#e4d8c8' }] },
  { featureType: 'transit', stylers: [{ visibility: 'off' }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#a4bcc3' }] },
  { featureType: 'water', elementType: 'labels.text.fill', stylers: [{ color: '#506b72' }] },
]

// A dark map tuned to match the app's dark-mode header search bar, which uses
// color-mix(in srgb, var(--bg) 28%, var(--surface)) ≈ #161a20.
// All map colors are derived from that same neutral gray family.
export const STANDARD_DARK_MAP_STYLE: google.maps.MapTypeStyle[] = [
  { elementType: 'geometry', stylers: [{ color: '#161a20' }] },
  { elementType: 'labels.icon', stylers: [{ visibility: 'off' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#161a20' }, { weight: 2.4 }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#bcc2c9' }] },
  { featureType: 'administrative', elementType: 'geometry.stroke', stylers: [{ color: '#3a4148' }] },
  { featureType: 'administrative.country', elementType: 'labels.text.fill', stylers: [{ color: '#c8ced5' }] },
  { featureType: 'administrative.land_parcel', stylers: [{ visibility: 'off' }] },
  { featureType: 'administrative.neighborhood', stylers: [{ visibility: 'off' }] },
  { featureType: 'administrative.locality', elementType: 'labels.text.fill', stylers: [{ color: '#aeb4bc' }] },
  { featureType: 'landscape', elementType: 'geometry', stylers: [{ color: '#181c22' }] },
  { featureType: 'landscape.natural', elementType: 'geometry', stylers: [{ color: '#1a1f26' }] },
  { featureType: 'landscape.man_made', elementType: 'geometry', stylers: [{ color: '#13171d' }] },
  { featureType: 'poi', stylers: [{ visibility: 'off' }] },
  { featureType: 'poi.park', elementType: 'geometry', stylers: [{ color: '#181d24' }, { visibility: 'on' }] },
  { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#222830' }] },
  { featureType: 'road', elementType: 'labels.text.fill', stylers: [{ color: '#b2b8c0' }] },
  { featureType: 'road.arterial', elementType: 'geometry', stylers: [{ color: '#1c2229' }] },
  { featureType: 'road.highway', elementType: 'geometry', stylers: [{ color: '#282e36' }] },
  { featureType: 'transit', stylers: [{ visibility: 'off' }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#0e1216' }] },
  { featureType: 'water', elementType: 'labels.text.fill', stylers: [{ color: '#6e747c' }] },
]

export type ThemeMode = 'dark' | 'light'

export function getMapStyle(theme: ThemeMode): google.maps.MapTypeStyle[] {
  return theme === 'dark' ? STANDARD_DARK_MAP_STYLE : STANDARD_LIGHT_MAP_STYLE
}
