import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const outDir = path.join(__dirname, '../public/data')
const outGeoJson = path.join(outDir, 'regions.geojson')
const outMeta = path.join(outDir, 'regions-meta.json')

const GEOMETRY_INDEX_URL =
  'https://raw.githubusercontent.com/openbibleinfo/Bible-Geocoding-Data/main/data/geometry.jsonl'
const RAW_BASE =
  'https://raw.githubusercontent.com/openbibleinfo/Bible-Geocoding-Data/main/geometry/'

const BBOX = { west: -12, east: 63, south: 12, north: 45 }

const REGION_COLORS = {
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
  ammon: '#8c7a5a',
  aram: '#7a6a8c',
  arabia: '#c29b6b',
  bashan: '#7a9b6b',
  bithynia: '#6b7a9b',
  cappadocia: '#9b6b7a',
  cilicia: '#6b9b9b',
  cush: '#9b8b6b',
  macedonia: '#7a5a9b',
  phoenicia: '#9b5a7b',
  syria: '#6b9b7a',
  achaia: '#9b7a5b',
  asia: '#5b6b9b',
  phrygia: '#9b9b6b',
}

const WANTED_REGIONS = Object.keys(REGION_COLORS)
const WANTED_REGIONS_SET = new Set(WANTED_REGIONS)

function hashColor(id) {
  let hash = 0
  for (let i = 0; i < id.length; i++) {
    hash = id.charCodeAt(i) + ((hash << 5) - hash)
  }
  const hue = Math.abs(hash) % 360
  return `hsl(${hue}, 60%, 55%)`
}

function coordInBbox(coord) {
  const [lng, lat] = coord
  return lng >= BBOX.west && lng <= BBOX.east && lat >= BBOX.south && lat <= BBOX.north
}

function ringInBbox(ring) {
  return ring.some(coordInBbox)
}

function polygonInBbox(polygon) {
  return polygon.some(ringInBbox)
}

function featureInBbox(feature) {
  const { geometry } = feature
  if (!geometry) return false
  switch (geometry.type) {
    case 'Polygon':
      return polygonInBbox(geometry.coordinates)
    case 'MultiPolygon':
      return geometry.coordinates.some(polygonInBbox)
    default:
      return false
  }
}

function normalizeId(name) {
  const base = name.split(/[\s\-]/)[0].toLowerCase()
  return base.replace(/[^a-z]/g, '')
}

function isWanted(name) {
  const id = normalizeId(name)
  return WANTED_REGIONS_SET.has(id)
}

async function fetchText(url) {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Failed to fetch ${url}: ${res.status} ${res.statusText}`)
  return res.text()
}

async function fetchJson(url) {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Failed to fetch ${url}: ${res.status} ${res.statusText}`)
  return res.json()
}

async function main() {
  const indexText = await fetchText(GEOMETRY_INDEX_URL)
  const entries = indexText
    .split('\n')
    .map((line) => {
      try {
        return line.trim() ? JSON.parse(line) : null
      } catch {
        return null
      }
    })
    .filter(Boolean)

  console.log(`Loaded ${entries.length} geometry entries`)

  const collectedById = new Map()
  const meta = {
    updatedAt: new Date().toISOString(),
    source: 'OpenBible Bible Geocoding Data (CC-BY)',
    sourceUrl: 'https://github.com/openbibleinfo/Bible-Geocoding-Data',
    regions: [],
  }

  for (const entry of entries) {
    if (entry.land_or_water !== 'land') continue
    if (entry.source !== 'ancient') continue
    if (!isWanted(entry.name)) continue
    const filename = entry.isobands_geojson_file || entry.geojson_file
    if (!filename) continue

    const id = normalizeId(entry.name)
    const url = `${RAW_BASE}${filename}`
    try {
      const feature = await fetchJson(url)
      if (!featureInBbox(feature)) {
        console.log(`Skipping ${entry.name} (${filename}) — outside bbox`)
        continue
      }

      const color = REGION_COLORS[id] ?? hashColor(id)
      feature.properties = {
        ...feature.properties,
        id,
        name: entry.name,
        source: 'OpenBible Geocoding Data',
        license: 'CC-BY',
        era: 'ancient',
        ...(color ? { color } : {}),
      }

      const existing = collectedById.get(id)
      if (!existing || (existing.properties?.format !== 'isobands' && feature.properties?.format === 'isobands')) {
        collectedById.set(id, feature)
        meta.regions = meta.regions.filter((r) => r.id !== id)
        meta.regions.push({ id, name: entry.name, file: filename })
      }
      console.log(`Added ${entry.name} (${filename})`)
    } catch (error) {
      console.warn(`Could not load ${entry.name} (${filename}):`, error.message)
    }
  }

  const collected = Array.from(collectedById.values())
  const output = { type: 'FeatureCollection', features: collected }
  fs.writeFileSync(outGeoJson, JSON.stringify(output))
  fs.writeFileSync(outMeta, JSON.stringify(meta, null, 2))

  console.log(`Wrote ${collected.length} regions to ${outGeoJson}`)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
