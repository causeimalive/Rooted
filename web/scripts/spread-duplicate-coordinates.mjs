import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

// Many biblical place entries share an identified/traditional site with
// several other named entries (alternate names, nearby-but-uncertain sites,
// or broader regions), so they were geocoded to the exact same lat/lng.
// Visually this makes the map show a single stacked marker where the
// cluster count and spiderfy-fan-out imply many distinct locations, which
// looks broken even though the underlying data/count is accurate. This
// script nudges each member of a shared-coordinate group onto a small
// circle around the original point so they render as distinct markers.

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const placesPath = path.join(__dirname, '../public/data/places.json')

const COORD_PRECISION = 4 // ~11m grid, matches typical geocoding rounding

function coordKey(place) {
  return `${place.lat.toFixed(COORD_PRECISION)},${place.lng.toFixed(COORD_PRECISION)}`
}

// Offset a lat/lng by a distance (meters) along a bearing (radians),
// mirroring the approximation used for spiderfy in MapMarkers.tsx.
function offsetLatLng(lat, lng, bearingRad, meters) {
  const dLat = (meters * Math.cos(bearingRad)) / 111320
  const dLng = (meters * Math.sin(bearingRad)) / (111320 * Math.cos((lat * Math.PI) / 180))
  return { lat: lat + dLat, lng: lng + dLng }
}

const places = JSON.parse(fs.readFileSync(placesPath, 'utf8'))

const groups = new Map()
for (const place of places) {
  const key = coordKey(place)
  const arr = groups.get(key) ?? []
  arr.push(place)
  groups.set(key, arr)
}

let groupsSpread = 0
let placesMoved = 0

for (const group of groups.values()) {
  if (group.length < 2) continue
  groupsSpread += 1

  // Deterministic order so re-running this script is a no-op.
  group.sort((a, b) => a.id.localeCompare(b.id))

  const centerLat = group[0].lat
  const centerLng = group[0].lng
  const radiusMeters = 120 + Math.min(group.length * 15, 260)

  group.forEach((place, index) => {
    const angle = (2 * Math.PI * index) / group.length
    const { lat, lng } = offsetLatLng(centerLat, centerLng, angle, radiusMeters)
    place.lat = Number(lat.toFixed(6))
    place.lng = Number(lng.toFixed(6))
    placesMoved += 1
  })
}

fs.writeFileSync(placesPath, JSON.stringify(places))
console.log(`Spread ${groupsSpread} coordinate groups covering ${placesMoved} places`)
console.log(`File size: ${(fs.statSync(placesPath).size / 1024 / 1024).toFixed(2)} MB`)
