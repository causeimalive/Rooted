import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const placesPath = path.join(__dirname, '../public/data/places.json')
const metaPath = path.join(__dirname, '../public/data/places-meta.json')

// A legitimate alias or passage reference should only ever belong to a
// small handful of places. Anything shared across a large fraction of the
// gazetteer is a symptom of the build-gazetteer.mjs matching bug, where a
// too-generic normalized name matched a huge candidate list and fanned an
// OpenBible entry's aliases/passages out to every one of those places.
const SHARED_THRESHOLD = 10

function passageKey(p) {
  return `${p.book}:${p.startChapter}:${p.startVerse}`
}

const places = JSON.parse(fs.readFileSync(placesPath, 'utf8'))

const aliasFreq = new Map()
for (const place of places) {
  for (const alias of place.aliases ?? []) {
    aliasFreq.set(alias, (aliasFreq.get(alias) ?? 0) + 1)
  }
}

const passageFreq = new Map()
for (const place of places) {
  for (const passage of place.passages ?? []) {
    const key = passageKey(passage)
    passageFreq.set(key, (passageFreq.get(key) ?? 0) + 1)
  }
}

let aliasesBefore = 0
let aliasesAfter = 0
let passagesBefore = 0
let passagesAfter = 0

for (const place of places) {
  const aliases = place.aliases ?? []
  aliasesBefore += aliases.length
  place.aliases = aliases.filter((a) => (aliasFreq.get(a) ?? 0) <= SHARED_THRESHOLD)
  aliasesAfter += place.aliases.length

  const passages = place.passages ?? []
  passagesBefore += passages.length
  place.passages = passages.filter((p) => (passageFreq.get(passageKey(p)) ?? 0) <= SHARED_THRESHOLD)
  passagesAfter += place.passages.length
}

fs.writeFileSync(placesPath, JSON.stringify(places))

if (fs.existsSync(metaPath)) {
  const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'))
  meta.dataCleanup = {
    date: new Date().toISOString(),
    note: 'Removed aliases/passages shared across more than 10 places (build-gazetteer.mjs matching bug fan-out)',
    aliasesBefore,
    aliasesAfter,
    passagesBefore,
    passagesAfter,
  }
  fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2))
}

console.log(`Aliases: ${aliasesBefore} -> ${aliasesAfter}`)
console.log(`Passages: ${passagesBefore} -> ${passagesAfter}`)
console.log(`File size: ${(fs.statSync(placesPath).size / 1024 / 1024).toFixed(2)} MB`)
