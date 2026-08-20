import { readFileSync, writeFileSync } from 'node:fs'
import { ApiClient, BibleClient, type BibleVersion } from '@youversion/platform-core'
import { resolveVersionSources, type VersionMenuEntry } from '../src/bibleSources.ts'
import { probeApiBiblePassage } from '../src/apiBible.ts'
import { probeBibleApiPassage } from '../src/bibleApiFallback.ts'
import { probeNltPassage } from '../src/nlt.ts'
import { osisToUsfm } from '../src/usfm.ts'

const envPath = new URL('../.env', import.meta.url)
const envText = readFileSync(envPath, 'utf-8')
for (const line of envText.split(/\r?\n/)) {
  const match = line.match(/^VITE_(\w+)=(.*)$/)
  if (!match) continue
  const [, key, value] = match
  process.env[`VITE_${key}`] = value
}

const apiClient = new ApiClient({
  appKey: process.env.VITE_YVP_APP_KEY,
  apiHost: 'rootedinchrist.faith/api/youversion',
  installationId: crypto.randomUUID(),
  timeout: 15000,
})
const bibleClient = new BibleClient(apiClient)

const PROBE_REFS: Array<{ bookId: string; chapter: number }> = [
  { bookId: 'Gen', chapter: 1 },
  { bookId: 'Exod', chapter: 20 },
  { bookId: 'Psa', chapter: 19 },
  { bookId: 'Jon', chapter: 1 },
  { bookId: 'Mat', chapter: 5 },
  { bookId: 'Act', chapter: 1 },
  { bookId: '1Co', chapter: 13 },
  { bookId: 'Rev', chapter: 1 },
]

const LOCAL_KJV: VersionMenuEntry = {
  id: -1,
  title: 'King James Version',
  abbreviation: 'KJV',
  localized_title: 'King James Version',
  localized_abbreviation: 'KJV',
}

const LOCAL_NLT: VersionMenuEntry = {
  id: -2,
  title: 'New Living Translation',
  abbreviation: 'NLT',
  localized_title: 'New Living Translation',
  localized_abbreviation: 'NLT',
}

function formatRef(ref: { bookId: string; chapter: number }): string {
  return `${ref.bookId}.${ref.chapter}`
}

async function fetchAllVersions(): Promise<BibleVersion[]> {
  const results: BibleVersion[] = []
  let pageToken: string | undefined
  do {
    const page = await bibleClient.getVersions('en*', undefined, { page_size: 99, page_token: pageToken })
    results.push(...page.data)
    pageToken = page.next_page_token ?? undefined
  } while (pageToken)
  return results
}

async function probeVersion(
  version: VersionMenuEntry,
): Promise<{ ok: boolean; failures: string[]; details: Record<string, string> }> {
  const failures: string[] = []
  const details: Record<string, string> = {}
  for (const ref of PROBE_REFS) {
    const sources = await resolveVersionSources(version)
    if (sources.length === 0) {
      const key = formatRef(ref)
      failures.push(key)
      details[key] = 'no sources'
      continue
    }

    let success = false
    let lastError = 'unknown'
    for (const source of sources) {
      try {
        if (source.kind === 'localKjv') {
          success = true
          break
        } else if (source.kind === 'localNlt') {
          if (await probeNltPassage(ref.bookId, ref.chapter)) {
            success = true
            break
          }
          lastError = 'nlt probe failed'
        } else if (source.kind === 'apiBible') {
          if (await probeApiBiblePassage(source.bibleId, ref)) {
            success = true
            break
          }
          lastError = 'api.bible probe failed'
        } else if (source.kind === 'bibleApi') {
          if (await probeBibleApiPassage(version, ref)) {
            success = true
            break
          }
          lastError = 'bible-api.com probe failed'
        } else if (source.kind === 'youversion') {
          const usfmRef = formatRef({ bookId: osisToUsfm(ref.bookId), chapter: ref.chapter })
          const passage = await bibleClient.getPassage(version.id, usfmRef, 'html', true, true)
          if (passage?.content && passage.content.length > 0) {
            success = true
            break
          }
          lastError = 'youversion empty or missing'
        }
      } catch (error) {
        lastError = error instanceof Error ? error.message : String(error)
      }
    }

    if (!success) {
      const key = formatRef(ref)
      failures.push(key)
      details[key] = lastError
    }
  }
  return { ok: failures.length === 0, failures, details }
}

async function main() {
  const versions = await fetchAllVersions()
  const allVersions: VersionMenuEntry[] = [LOCAL_KJV, LOCAL_NLT, ...versions]
  const working: number[] = []
  const report: Array<{
    id: number
    title: string
    abbreviation: string | undefined
    ok: boolean
    failures: string[]
    details: Record<string, string>
  }> = []

  for (const version of allVersions) {
    const result = await probeVersion(version)
    report.push({
      id: version.id,
      title: version.title,
      abbreviation: version.abbreviation,
      ok: result.ok,
      failures: result.failures,
      details: result.details,
    })
    if (result.ok) working.push(version.id)
    console.log(
      `${result.ok ? 'OK' : 'FAIL'} ${version.id}: ${version.title} (${version.abbreviation ?? ''}) ${
        result.failures.join(', ') || ''
      }`,
    )
  }

  const outPath = new URL('../src/workingVersionIds.ts', import.meta.url)
  const reportPath = new URL('../public/data/version-probe-report.json', import.meta.url)
  writeFileSync(outPath, `export const WORKING_VERSION_IDS: number[] = [${working.join(', ')}]\n`)
  writeFileSync(reportPath, JSON.stringify(report, null, 2))
  console.log(`\nWorking versions: ${working.length} / ${allVersions.length}`)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
