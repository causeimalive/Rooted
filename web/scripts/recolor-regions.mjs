import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const outDir = path.join(__dirname, '../public/data')
const outGeoJson = path.join(outDir, 'regions.geojson')

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

const data = JSON.parse(fs.readFileSync(outGeoJson, 'utf8'))
for (const feature of data.features) {
  const id = feature.properties?.id ?? ''
  if (id && id in REGION_COLORS) {
    feature.properties = {
      ...feature.properties,
      color: REGION_COLORS[id],
    }
  }
}
fs.writeFileSync(outGeoJson, JSON.stringify(data))
console.log(`Recolored ${data.features.length} regions`)
