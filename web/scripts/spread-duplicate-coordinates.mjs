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
//
// It runs a few passes: spreading a group can (rarely) land a point on
// top of an unrelated place that was never part of that group, so each
// pass re-groups by coordinate and, for any group that still collides,
// nudges it again with a different radius/angle offset. This converges
// quickly and is idempotent -- re-running against already-spread data is
// a no-op unless a fresh collision needs resolving.

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const placesPath = path.join(__dirname, '../public/data/places.json')

const COORD_PRECISION = 4 // ~11m grid, matches typical geocoding rounding
const MAX_PASSES = 4

function coordKey(place) {
  return `${place.lat.toFixed(COORD_PRECISION)},${place.lng.toFixed(COORD_PRECISION)}`
}

function groupByCoord(places) {
  const groups = new Map()
  for (const place of places) {
    const key = coordKey(place)
    const arr = groups.get(key) ?? []
    arr.push(place)
    groups.set(key, arr)
  }
  return [...groups.values()].filter((group) => group.length > 1)
}

// Offset a lat/lng by a distance (meters) along a bearing (radians),
// mirroring the approximation used for spiderfy in MapMarkers.tsx.
function offsetLatLng(lat, lng, bearingRad, meters) {
  const dLat = (meters * Math.cos(bearingRad)) / 111320
  const dLng = (meters * Math.sin(bearingRad)) / (111320 * Math.cos((lat * Math.PI) / 180))
  return { lat: lat + dLat, lng: lng + dLng }
}

// Deterministic pseudo-random angle derived from a place id, used to
// perturb later passes so they don't reproduce the same collision.
function hashAngle(id) {
  let hash = 0
  for (const ch of id) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0
  return ((hash % 3600) / 3600) * 2 * Math.PI
}

const places = JSON.parse(fs.readFileSync(placesPath, 'utf8'))

let placesMoved = 0
let groupsSpread = 0

for (let pass = 0; pass < MAX_PASSES; pass += 1) {
  const dupGroups = groupByCoord(places)
  if (dupGroups.length === 0) break

  for (const group of dupGroups) {
    groupsSpread += 1
    // Deterministic order so re-running this script is a no-op.
    group.sort((a, b) => a.id.localeCompare(b.id))

    const centerLat = group[0].lat
    const centerLng = group[0].lng
    const radiusMeters = 120 + Math.min(group.length * 15, 260) + pass * 60

    group.forEach((place, index) => {
      const angle = (2 * Math.PI * index) / group.length + hashAngle(place.id) * 0.15 + pass * 0.9
      const { lat, lng } = offsetLatLng(centerLat, centerLng, angle, radiusMeters)
      place.lat = Number(lat.toFixed(6))
      place.lng = Number(lng.toFixed(6))
      placesMoved += 1
    })
  }
}

const remaining = groupByCoord(places)

fs.writeFileSync(placesPath, JSON.stringify(places))
console.log(`Spread ${groupsSpread} coordinate group occurrences covering ${placesMoved} place moves`)
console.log(`Remaining shared-coordinate groups: ${remaining.length}`)
console.log(`File size: ${(fs.statSync(placesPath).size / 1024 / 1024).toFixed(2)} MB`)
