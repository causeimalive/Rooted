import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const dataDir = path.join(__dirname, '../public/data')
const placesPath = path.join(dataDir, 'places.json')
const biblePath = path.join(dataDir, 'bible.json')
const outPlacesPath = path.join(dataDir, 'places.json')
const metaPath = path.join(dataDir, 'places-meta.json')

const openBibleSources = [
  { path: path.join(dataDir, 'openbible/ubs-names-ot.xml'), source: 'ot' },
  { path: path.join(dataDir, 'openbible/ubs-names-nt.xml'), source: 'nt' },
]

function readJson(p) {
  return JSON.parse(fs.readFileSync(p, 'utf8'))
}

function writeJson(p, data) {
  fs.writeFileSync(p, JSON.stringify(data, null, 2))
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function decodeXmlEntities(value) {
  return value
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCharCode(Number.parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCharCode(Number.parseInt(dec, 10)))
}

function extractTagValues(block, tag) {
  const pattern = new RegExp(`<${escapeRegex(tag)}>([\\s\\S]*?)<\\/${escapeRegex(tag)}>`, 'g')
  return Array.from(block.matchAll(pattern), (match) => decodeXmlEntities(match[1].trim())).filter(Boolean)
}

function extractTagValue(block, tag) {
  return extractTagValues(block, tag)[0] ?? ''
}

function buildBookMaps() {
  const verses = readJson(biblePath)
  const bookCodeByNumber = new Map()
  const bookNameByCode = new Map()
  const seenBooks = new Set()
  for (const v of verses) {
    if (!seenBooks.has(v.book)) {
      seenBooks.add(v.book)
      bookCodeByNumber.set(bookCodeByNumber.size + 1, v.book)
    }
    if (!bookNameByCode.has(v.book)) bookNameByCode.set(v.book, v.bookName)
  }
  return { bookCodeByNumber, bookNameByCode }
}

function decodeReference(raw, bookCodeByNumber, bookNameByCode) {
  const trimmed = raw.trim()
  if (!/^\d{8,11}$/.test(trimmed)) return null
  const bookNumber = Number(trimmed.slice(0, 2))
  const chapter = Number(trimmed.slice(2, 5))
  const verse = Number(trimmed.slice(5, 8))
  const bookCode = bookCodeByNumber.get(bookNumber)
  if (!bookCode || !Number.isFinite(chapter) || !Number.isFinite(verse)) return null
  const bookName = bookNameByCode.get(bookCode) ?? bookCode
  return { book: bookName, chapter, verse }
}

function passageKey(p) {
  return `${p.book}:${p.startChapter ?? p.chapter}:${p.startVerse ?? p.verse ?? 0}`
}

function referenceToPassage(ref) {
  return {
    book: ref.book,
    startChapter: ref.chapter,
    endChapter: ref.chapter,
    startVerse: ref.verse,
    endVerse: ref.verse,
  }
}

function normalizedText(entry) {
  return [
    entry.word,
    ...entry.glosses,
    entry.definition,
    entry.alternate ?? '',
    entry.form ?? '',
    entry.domain ?? '',
  ].join(' ').toLowerCase()
}

const placePatterns = [
  /\bcity\b/, /\btown\b/, /\bvillage\b/, /\bterritory\b/, /\bregion\b/,
  /\bland\b/, /\bmount\b/, /\bmountain\b/, /\bhill\b/, /\bvalley\b/,
  /\bsea\b/, /\briver\b/, /\blake\b/, /\bisland\b/, /\bcoast\b/,
  /\bprovince\b/, /\bdistrict\b/, /\bwilderness\b/, /\bdesert\b/, /\bplain\b/,
  /\bharbor\b/, /\bport\b/, /\broad\b/, /\bspring\b/, /\bwell\b/,
  /\bplace\b/, /\blocation\b/, /\bpool\b/, /\bgate\b/, /\bfortress\b/,
  /\btower\b/, /\bfield\b/, /\bgarden\b/, /\bpromised land\b/, /\bcountry\b/,
]

const uncertainPatterns = [
  /uncertain/, /unknown/, /possibly/, /perhaps/, /probably/, /location uncertain/,
  /uncertain location/, /traditionally associated/, /\?/,
]

function classifyPlace(entry) {
  const text = normalizedText(entry)
  if (uncertainPatterns.some((p) => p.test(text))) return 'uncertain'
  return placePatterns.some((p) => p.test(text)) ? 'place' : 'people'
}

function parseOpenBiblePlaces(text, source, bookMaps) {
  const { bookCodeByNumber, bookNameByCode } = bookMaps
  const places = []
  const entryPattern = /<Entry>([\s\S]*?)<\/Entry>/g
  const matches = Array.from(text.matchAll(entryPattern))
  for (const [entryIndex, entryMatch] of matches.entries()) {
    const entryBlock = entryMatch[1]
    const baseId = extractTagValue(entryBlock, 'ID') || `${source}-${entryIndex + 1}`
    const word = extractTagValue(entryBlock, 'Word')
    const subentries = Array.from(entryBlock.matchAll(/<Subentry>([\s\S]*?)<\/Subentry>/g))
    for (const [subIndex, subentryMatch] of subentries.entries()) {
      const subBlock = subentryMatch[1]
      const glosses = extractTagValues(subBlock, 'Gloss-EN')
      const definition = extractTagValue(subBlock, 'Definition-EN')
      const alternate = extractTagValue(subBlock, 'Alternate')
      const form = extractTagValue(subBlock, 'Form')
      const domain = extractTagValue(subBlock, 'Domain')
      const references = extractTagValues(subBlock, 'Verse')
        .map((raw) => decodeReference(raw, bookCodeByNumber, bookNameByCode))
        .filter(Boolean)
      const entry = { word, glosses, definition, alternate, form, domain, references }
      if (classifyPlace(entry) !== 'place') continue
      const names = [word, ...glosses, alternate].filter(Boolean)
      const passages = references.map(referenceToPassage)
      for (const name of names) {
        places.push({
          id: `${source}:${baseId}:${subIndex}`,
          name: name.trim(),
          names,
          definition,
          source,
          passages,
        })
      }
    }
  }
  return places
}

function normalizeName(name) {
  return name.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim()
}

function buildPlaceIndex(places) {
  const byName = new Map()
  for (const place of places) {
    const keys = [place.name, ...(place.aliases ?? [])].filter(Boolean).map(normalizeName)
    for (const k of new Set(keys)) {
      if (!byName.has(k)) byName.set(k, [])
      byName.get(k).push(place)
    }
  }
  return byName
}

const isCheck = process.argv.includes('--check')

console.log('Loading places and bible...')
const places = readJson(placesPath)
const bookMaps = buildBookMaps()

console.log(`Loaded ${places.length} places, ${bookMaps.bookCodeByNumber.size} books`)

console.log('Parsing OpenBible UBS place names...')
const openBiblePlaces = []
for (const { path: p, source } of openBibleSources) {
  const text = fs.readFileSync(p, 'utf8')
  const parsed = parseOpenBiblePlaces(text, source, bookMaps)
  openBiblePlaces.push(...parsed)
}

console.log(`Found ${openBiblePlaces.length} OpenBible place name forms`)

const placeIndex = buildPlaceIndex(places)
const matched = new Set()

for (const ob of openBiblePlaces) {
  const key = normalizeName(ob.name)
  const candidates = placeIndex.get(key)
  if (!candidates) continue
  for (const place of candidates) {
    matched.add(place.id)
    place.aliases ??= []
    for (const alias of ob.names) {
      const a = alias.trim()
      if (a && a.toLowerCase() !== place.name.toLowerCase() && !place.aliases.includes(a)) {
        place.aliases.push(a)
      }
    }
    place.openbibleId ??= ob.id
    place.sources ??= []
    if (!place.sources.includes('openbible')) place.sources.push('openbible')
    place.passages = place.passages || []
    for (const p of ob.passages) {
      const k = passageKey(p)
      if (!place.passages.some((x) => passageKey(x) === k)) place.passages.push(p)
    }
  }
}

for (const place of places) {
  place.aliases ??= []
  place.sources ??= []
  if (place.sources.length === 0) place.sources.push('rooted')
  if (place.uncertainty === undefined) place.uncertainty = 0
  if (place.category === undefined) place.category = place.region === 'settlement' ? 'settlement' : 'place'
}

const meta = {
  updatedAt: new Date().toISOString(),
  count: places.length,
  openBibleNameForms: openBiblePlaces.length,
  matchedFromOpenBible: matched.size,
  unmatchedFromOpenBible: openBiblePlaces.length - matched.size,
  sources: ['rooted', 'openbible'],
}

if (isCheck) {
  console.log('Gazetteer check:')
  console.log(JSON.stringify(meta, null, 2))
  const missing = places.filter((p) => p.lat === undefined || p.lng === undefined)
  console.log(`Places missing coordinates: ${missing.length}`)
  process.exit(0)
}

writeJson(outPlacesPath, places)
writeJson(metaPath, meta)
console.log(`Wrote ${places.length} places to ${outPlacesPath}`)
console.log(`Wrote meta to ${metaPath}`)
console.log(JSON.stringify(meta, null, 2))
