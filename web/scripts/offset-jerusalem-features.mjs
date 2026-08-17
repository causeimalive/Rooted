// Gives Jerusalem's many sub-features (gates, halls, pools, districts, etc.)
// distinct approximate coordinates instead of sharing one city centroid.
//
// Offsets are bearing (compass degrees, 0=N/90=E/180=S/270=W) + distance in
// meters from the Old City / Temple Mount centroid, based on commonly
// published approximate positions in Bible atlases (e.g. the wall circuit in
// Nehemiah 3). These are reasonable traditional approximations, not precise
// archaeological findings — several gate identifications are debated.
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const placesPath = path.join(__dirname, '../public/data/places.json')

const CENTER = { lat: 31.7767, lng: 35.2342 }

// id -> [bearingDegrees, distanceMeters]
const OFFSETS = {
  // Nehemiah's wall-circuit gates (approximate traditional positions)
  'sheep-gate': [30, 300],
  'fish-gate': [350, 350],
  'gate-of-yeshanah': [320, 350], // Old Gate
  'valley-gate': [260, 500],
  'dung-gate': [190, 400],
  'fountain-gate': [160, 500],
  'water-gate': [100, 350],
  'horse-gate': [130, 300],
  'east-gate': [90, 250],
  'muster-gate': [20, 350], // Inspection Gate, closes the circuit
  // Later/other named gates
  'ephraim-gate': [340, 400],
  'corner-gate': [300, 450],
  'benjamin-gate': [355, 300],
  'new-gate': [10, 300],
  'potsherd-gate': [200, 420],
  'middle-gate': [0, 150],
  'north-gate': [0, 200],
  'south-gate': [180, 200],
  'west-gate': [270, 200],
  'beautiful-gate': [95, 150],
  'peoples-gate': [60, 200],
  'gate-of-the-guard': [110, 250],
  'gate-of-the-foundation': [120, 280],
  'shallecheth': [250, 200],
  sur: [240, 220],
  // Hills, districts, structures near the Old City
  angle: [45, 350],
  gareb: [300, 600],
  goah: [305, 650],
  'hall-of-judgment': [155, 220],
  'hall-of-pillars': [162, 240],
  'hall-of-the-throne': [168, 260],
  'house-of-the-forest-of-lebanon': [165, 220],
  'lower-pool': [155, 350],
  'old-pool': [165, 450],
  'upper-pool': [170, 300],
  millo: [175, 300],
  mortar: [80, 200],
  parbar: [100, 150],
  'second-quarter': [350, 300],
  silla: [180, 320],
  'solomons-portico': [95, 180],
  'tower-of-the-ovens': [275, 480],
  uzza: [150, 350],
  zion: [175, 350],
  'east-square': [95, 220],
  // Alternate/poetic names for Jerusalem itself — keep essentially centered
  ariel: [0, 0],
  jebus: [0, 0],
  salem: [0, 0],
  'the-lord-is-there': [0, 0],
}

function offsetLatLng(center, bearingDeg, meters) {
  if (!meters) return { lat: center.lat, lng: center.lng }
  const bearing = (bearingDeg * Math.PI) / 180
  const dLat = (meters * Math.cos(bearing)) / 111320
  const dLng = (meters * Math.sin(bearing)) / (111320 * Math.cos((center.lat * Math.PI) / 180))
  return { lat: center.lat + dLat, lng: center.lng + dLng }
}

const places = JSON.parse(fs.readFileSync(placesPath, 'utf8'))
let updated = 0
for (const place of places) {
  const offset = OFFSETS[place.id]
  if (!offset) continue
  const [bearing, meters] = offset
  const { lat, lng } = offsetLatLng(CENTER, bearing, meters)
  place.lat = Number(lat.toFixed(6))
  place.lng = Number(lng.toFixed(6))
  updated++
}

fs.writeFileSync(placesPath, JSON.stringify(places, null, 2) + '\n')
console.log(`Updated coordinates for ${updated} Jerusalem-area features`)
