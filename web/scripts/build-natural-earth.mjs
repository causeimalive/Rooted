import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const outDir = path.join(__dirname, '../public/data')
const outGeoJson = path.join(outDir, 'natural-earth.geojson')
const outMeta = path.join(outDir, 'natural-earth-meta.json')

const BBOX = { west: -12, east: 63, south: 12, north: 45 }

const SOURCES = [
  {
    layer: 'coastline',
    url: 'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_110m_coastline.geojson',
    filter: () => true,
  },
  {
    layer: 'river',
    url: 'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_110m_rivers_lake_centerlines.geojson',
    filter: (feature) => {
      const scalerank = feature.properties?.scalerank ?? 10
      return scalerank <= 7
    },
  },
  {
    layer: 'border',
    url: 'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_110m_admin_0_countries.geojson',
    filter: () => true,
  },
]

function coordInBbox(coord) {
  const [lng, lat] = coord
  return lng >= BBOX.west && lng <= BBOX.east && lat >= BBOX.south && lat <= BBOX.north
}

function lineInBbox(coords) {
  return coords.some(coordInBbox)
}

function ringInBbox(ring) {
  return ring.some(coordInBbox)
}

function polygonInBbox(polygon) {
  return polygon.some(ringInBbox)
}

function multiPolygonInBbox(multi) {
  return multi.some(polygonInBbox)
}

function featureInBbox(feature) {
  const { geometry } = feature
  if (!geometry) return false
  switch (geometry.type) {
    case 'LineString':
      return lineInBbox(geometry.coordinates)
    case 'MultiLineString':
      return geometry.coordinates.some(lineInBbox)
    case 'Polygon':
      return polygonInBbox(geometry.coordinates)
    case 'MultiPolygon':
      return multiPolygonInBbox(geometry.coordinates)
    default:
      return false
  }
}

async function fetchJson(url) {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Failed to fetch ${url}: ${res.status} ${res.statusText}`)
  return res.json()
}

async function main() {
  const collected = []
  const counts = {}

  for (const { layer, url, filter } of SOURCES) {
    console.log(`Fetching ${layer}...`)
    const data = await fetchJson(url)
    const features = data.features || []
    const kept = features
      .filter((f) => filter(f) && featureInBbox(f))
      .map((f) => ({
        ...f,
        properties: { ...f.properties, layer },
      }))
    console.log(`  kept ${kept.length} / ${features.length}`)
    counts[layer] = kept.length
    collected.push(...kept)
  }

  const output = { type: 'FeatureCollection', features: collected }
  fs.writeFileSync(outGeoJson, JSON.stringify(output))
  fs.writeFileSync(outMeta, JSON.stringify({ updatedAt: new Date().toISOString(), counts, bbox: BBOX }, null, 2))

  console.log(`Wrote ${collected.length} features to ${outGeoJson}`)
  console.log(`Meta: ${outMeta}`)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
