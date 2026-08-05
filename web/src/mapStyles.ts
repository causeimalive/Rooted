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

// A dark map tuned to sit alongside the app's dark (olive/charcoal) theme rather
// than the generic Google "night mode" blue-grays.
export const STANDARD_DARK_MAP_STYLE: google.maps.MapTypeStyle[] = [
  { elementType: 'geometry', stylers: [{ color: '#0f1418' }] },
  { elementType: 'labels.icon', stylers: [{ visibility: 'off' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#0f1418' }, { weight: 2.4 }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#d8ccb0' }] },
  { featureType: 'administrative', elementType: 'geometry.stroke', stylers: [{ color: '#746040' }] },
  { featureType: 'administrative.country', elementType: 'labels.text.fill', stylers: [{ color: '#dbc07e' }] },
  { featureType: 'administrative.land_parcel', stylers: [{ visibility: 'off' }] },
  { featureType: 'administrative.neighborhood', stylers: [{ visibility: 'off' }] },
  { featureType: 'administrative.locality', elementType: 'labels.text.fill', stylers: [{ color: '#b3aa95' }] },
  { featureType: 'landscape', elementType: 'geometry', stylers: [{ color: '#171d22' }] },
  { featureType: 'landscape.natural', elementType: 'geometry', stylers: [{ color: '#22302a' }] },
  { featureType: 'landscape.man_made', elementType: 'geometry', stylers: [{ color: '#14191d' }] },
  { featureType: 'poi', stylers: [{ visibility: 'off' }] },
  { featureType: 'poi.park', elementType: 'geometry', stylers: [{ color: '#23301f' }, { visibility: 'on' }] },
  { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#233039' }] },
  { featureType: 'road', elementType: 'labels.text.fill', stylers: [{ color: '#cdb88d' }] },
  { featureType: 'road.arterial', elementType: 'geometry', stylers: [{ color: '#222c33' }] },
  { featureType: 'road.highway', elementType: 'geometry', stylers: [{ color: '#334150' }] },
  { featureType: 'transit', stylers: [{ visibility: 'off' }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#091115' }] },
  { featureType: 'water', elementType: 'labels.text.fill', stylers: [{ color: '#7a8a90' }] },
]

export type ThemeMode = 'dark' | 'light'

export function getMapStyle(theme: ThemeMode): google.maps.MapTypeStyle[] {
  return theme === 'dark' ? STANDARD_DARK_MAP_STYLE : STANDARD_LIGHT_MAP_STYLE
}
