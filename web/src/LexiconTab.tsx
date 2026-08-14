import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import { getVersesWithWord, lookupLexicon, searchLexicon } from './bible'
import { getTestamentForBook, type Testament } from './bookTaxonomy'
import { LexiconEntry } from './types'
import { useI18n } from './i18n'
import {
  loadOpenBibleNames,
  searchOpenBibleNames,
  type OpenBibleNameCategory,
  type OpenBibleNameEntry,
} from './openbibleNames'

type TestamentFilter = 'all' | Testament

type LexiconTabProps = {
  query: string
  onQuery: (value: string) => void
  onSelect: (verseId: string) => void
  mode?: 'names' | 'entry'
}

const NAME_GROUPS: Array<{
  category: OpenBibleNameCategory
  title: string
  description: string
}> = [
  { category: 'people', title: 'People', description: 'Human figures, rulers, families, and lineages.' },
  { category: 'places', title: 'Places', description: 'Cities, regions, lands, and geographic locations.' },
  { category: 'divine', title: 'Divine names', description: 'God, angels, Satan, and other supernatural names.' },
  { category: 'uncertain', title: 'Uncertain entries', description: 'Entries flagged as approximate, uncertain, or ambiguous.' },
]

const panelStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '1rem',
}

const cardStyle: CSSProperties = {
  background: 'var(--surface)',
  border: '1px solid color-mix(in srgb, var(--accent) 18%, var(--muted))',
  borderRadius: '1rem',
  padding: '1rem',
  boxShadow: '0 10px 26px rgba(15, 23, 42, 0.05)',
}

const badgeStyle: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: '0.25rem',
  padding: '0.2rem 0.55rem',
  borderRadius: '999px',
  border: '1px solid color-mix(in srgb, var(--accent) 38%, var(--muted))',
  background: 'color-mix(in srgb, var(--bg) 15%, var(--surface))',
  color: 'var(--text-muted)',
  fontSize: '0.72rem',
  letterSpacing: '0.03em',
  textTransform: 'uppercase',
}

const groupStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '0.55rem',
}

const groupDescriptionStyle: CSSProperties = {
  margin: '0.15rem 0 0',
  color: 'var(--text-muted)',
  fontSize: '0.84rem',
}

const chipRowStyle: CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: '0.35rem',
  marginTop: '0.5rem',
}

const chipStyle: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  padding: '0.18rem 0.5rem',
  borderRadius: '999px',
  border: '1px solid var(--muted)',
  background: 'color-mix(in srgb, var(--bg) 12%, var(--surface))',
  color: 'var(--text-muted)',
  fontSize: '0.74rem',
}

const metaLineStyle: CSSProperties = {
  marginTop: '0.45rem',
  color: 'var(--text-muted)',
  fontSize: '0.85rem',
}

function categoryTitle(category: OpenBibleNameCategory): string {
  return NAME_GROUPS.find((group) => group.category === category)?.title ?? category
}

export default function LexiconTab({ query, onQuery, onSelect }: LexiconTabProps) {
  const { t } = useI18n()
  const [debouncedQuery, setDebouncedQuery] = useState(query)
  const [testamentFilter, setTestamentFilter] = useState<TestamentFilter>('all')
  const [namesLoaded, setNamesLoaded] = useState(false)

  useEffect(() => {
    const handle = window.setTimeout(() => setDebouncedQuery(query), 120)
    return () => window.clearTimeout(handle)
  }, [query])

  useEffect(() => {
    let cancelled = false
    void loadOpenBibleNames().finally(() => {
      if (!cancelled) setNamesLoaded(true)
    })
    return () => {
      cancelled = true
    }
  }, [])

  const trimmedQuery = debouncedQuery.trim()
  const entry = useMemo(() => lookupLexicon(debouncedQuery), [debouncedQuery])
  const suggestions = useMemo(() => (trimmedQuery ? searchLexicon(debouncedQuery) : []), [debouncedQuery, trimmedQuery])
  const nameResults = useMemo(
    () => (namesLoaded && trimmedQuery ? searchOpenBibleNames(debouncedQuery, { testament: testamentFilter }) : []),
    [debouncedQuery, namesLoaded, testamentFilter, trimmedQuery],
  )
  const groupedNameResults = useMemo(() => {
    const groups = new Map<OpenBibleNameCategory, OpenBibleNameEntry[]>()
    for (const group of NAME_GROUPS) groups.set(group.category, [])
    for (const name of nameResults) {
      groups.get(name.category)?.push(name)
    }
    return groups
  }, [nameResults])
  const allVerses = useMemo(
    () => getVersesWithWord(entry ? entry.word : debouncedQuery),
    [entry, debouncedQuery],
  )
  const verses = useMemo(
    () => (testamentFilter === 'all' ? allVerses : allVerses.filter((v) => getTestamentForBook(v.book) === testamentFilter)),
    [allVerses, testamentFilter],
  )

  const renderTestamentButtons = () =>
    allVerses.length > 0 ? (
      <div className="map-style-toggle">
        <button type="button" className={testamentFilter === 'all' ? 'active' : ''} onClick={() => setTestamentFilter('all')}>
          {t('allTestaments')}
        </button>
        <button type="button" className={testamentFilter === 'OT' ? 'active' : ''} onClick={() => setTestamentFilter('OT')}>
          {t('oldTestament')}
        </button>
        <button type="button" className={testamentFilter === 'NT' ? 'active' : ''} onClick={() => setTestamentFilter('NT')}>
          {t('newTestament')}
        </button>
      </div>
    ) : null

  const renderVerseList = (items: typeof verses) => (
    <div className="verse-list">
      {items.slice(0, 50).map((v) => (
        <div key={v.id} className="verse-card" onClick={() => onSelect(v.id)}>
          <div className="verse-ref">
            {v.bookName} {v.chapter}:{v.verse}
          </div>
          <div className="verse-text">{v.text}</div>
        </div>
      ))}
    </div>
  )

  const renderNameCards = (items: OpenBibleNameEntry[]) => (
    <div className="verse-list">
      {items.map((name) => {
        const firstReference = name.references[0]
        return (
          <div
            key={name.id}
            className="verse-card"
            style={{ cursor: firstReference ? 'pointer' : 'default' }}
            onClick={() => firstReference && onSelect(firstReference.verseId)}
          >
            <div className="verse-ref">
              <span>{name.word}</span>
              <small>{categoryTitle(name.category)} · {name.language}</small>
            </div>
            <div className="verse-text">{name.definition}</div>
            {name.glosses.length > 0 && <div style={metaLineStyle}>{name.glosses.slice(0, 3).join(' • ')}</div>}
            {name.references.length > 0 && (
              <div style={chipRowStyle}>
                {name.references.slice(0, 4).map((ref) => (
                  <span key={ref.verseId} style={chipStyle}>
                    {ref.label}
                  </span>
                ))}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )

  return (
    <div style={panelStyle}>
      {suggestions.length > 0 && (
        <div className="lexicon-suggestions">
          {suggestions.map((s) => (
            <button key={s.word} className="suggestion" onClick={() => onQuery(s.word)}>
              {s.word}
            </button>
          ))}
        </div>
      )}

      {entry && (
        <section style={cardStyle}>
          <div className="lexicon-card-heading" style={{ marginBottom: '0.35rem' }}>
            <h3 style={{ margin: 0, color: 'var(--accent)', textTransform: 'capitalize' }}>{entry.word}</h3>
            <span style={badgeStyle}>Local lexicon</span>
          </div>
          <div className="meaning-box">
            <h4>{t('kjvSense')}</h4>
            <p>{entry.kjvMeaning}</p>
          </div>
          <div className="meaning-box" style={{ borderLeftColor: '#4ade80' }}>
            <h4>{t('modern')}</h4>
            <p>{entry.modernMeaning}</p>
          </div>
          <div className="meaning-box" style={{ borderLeftColor: '#a78bfa' }}>
            <h4>{t('context')}</h4>
            <p>{entry.historicalContext}</p>
          </div>
          <h4 className="section-title">
            {t('versesUsing')} ({verses.length})
          </h4>
          {renderTestamentButtons()}
          {renderVerseList(verses)}
        </section>
      )}

      {trimmedQuery && (
        <section style={cardStyle}>
          <div className="lexicon-card-heading" style={{ marginBottom: '0.35rem' }}>
            <h4 className="section-title" style={{ marginBottom: 0 }}>
              Bible names
            </h4>
            <span style={badgeStyle}>UBS names</span>
          </div>
          <p style={{ margin: '0.15rem 0 0', color: 'var(--text-muted)', fontSize: '0.9rem' }}>
            Hebrew and Greek name data from the UBS name database, grouped by study category.
          </p>
          {renderTestamentButtons()}
          {!namesLoaded ? (
            <div className="empty">Loading UBS names…</div>
          ) : nameResults.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              {NAME_GROUPS.map((group) => {
                const items = groupedNameResults.get(group.category) ?? []
                if (!items.length) return null
                return (
                  <section key={group.category} style={groupStyle}>
                    <div className="lexicon-card-heading" style={{ marginBottom: 0 }}>
                      <div>
                        <h4 className="section-title" style={{ marginBottom: '0.15rem' }}>
                          {group.title} ({items.length})
                        </h4>
                        <p style={groupDescriptionStyle}>{group.description}</p>
                      </div>
                      <span style={badgeStyle}>UBS</span>
                    </div>
                    {renderNameCards(items)}
                  </section>
                )
              })}
            </div>
          ) : (
            <div className="empty">No UBS name match for “{debouncedQuery}”.</div>
          )}
        </section>
      )}

      {trimmedQuery && !entry && verses.length > 0 && (
        <section style={cardStyle}>
          <div className="lexicon-card-heading" style={{ marginBottom: '0.35rem' }}>
            <h4 className="section-title" style={{ marginBottom: 0 }}>
              {t('versesUsing')} ({verses.length})
            </h4>
            <span style={badgeStyle}>KJV verses</span>
          </div>
          {renderTestamentButtons()}
          {renderVerseList(verses)}
        </section>
      )}

      {trimmedQuery && !entry && verses.length === 0 && !namesLoaded && <div className="empty">Loading study data…</div>}

      {!trimmedQuery && <div className="empty">Use the search bar above to look up a word or name.</div>}
    </div>
  )
}
