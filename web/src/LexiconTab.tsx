import { useEffect, useMemo, useState } from 'react'
import { Search } from 'lucide-react'
import { getVersesWithWord, lookupLexicon, searchLexicon } from './bible'
import { getTestamentForBook, type Testament } from './bookTaxonomy'
import { LexiconEntry } from './types'
import { useI18n } from './i18n'
import { loadOpenBibleNames, searchOpenBibleNames } from './openbibleNames'

type TestamentFilter = 'all' | Testament

export default function LexiconTab({ onSelect }: { onSelect: (verseId: string) => void }) {
  const { t } = useI18n()
  const [query, setQuery] = useState('')
  const [debouncedQuery, setDebouncedQuery] = useState('')
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
        <button type="button" className={testamentFilter === 'all' ? 'active' : ''} onClick={() => setTestamentFilter('all')}>{t('allTestaments')}</button>
        <button type="button" className={testamentFilter === 'OT' ? 'active' : ''} onClick={() => setTestamentFilter('OT')}>{t('oldTestament')}</button>
        <button type="button" className={testamentFilter === 'NT' ? 'active' : ''} onClick={() => setTestamentFilter('NT')}>{t('newTestament')}</button>
      </div>
    ) : null

  const renderVerseList = (items: typeof verses) => (
    <div className="verse-list">
      {items.slice(0, 50).map((v) => (
        <div key={v.id} className="verse-card" onClick={() => onSelect(v.id)}>
          <div className="verse-ref">{v.bookName} {v.chapter}:{v.verse}</div>
          <div className="verse-text">{v.text}</div>
        </div>
      ))}
    </div>
  )

  return (
    <div className="panel lexicon-panel">
      <div className="lexicon-header-card">
        <div className="search-bar lexicon-search">
          <span className="search-icon"><Search size={14} /></span>
          <input
            type="text"
            placeholder={t('searchPlaceholder')}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label={t('searchPlaceholder')}
          />
          {query && (
            <button type="button" className="search-clear" onClick={() => setQuery('')} aria-label={t('delete')}>
              ×
            </button>
          )}
        </div>
        <p className="lexicon-help">
          Search a word to see KJV usage and UBS Bible-name entries, then jump into the verses.
        </p>
      </div>

      {suggestions.length > 0 && (
        <div className="lexicon-suggestions">
          {suggestions.map((s) => (
            <button key={s.word} className="suggestion" onClick={() => setQuery(s.word)}>{s.word}</button>
          ))}
        </div>
      )}

      {entry && (
        <section className="lexicon-card">
          <div className="lexicon-card-heading">
            <h3>{entry.word}</h3>
            <span className="source-badge">Local lexicon</span>
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
          <h4 className="section-title">{t('versesUsing')} ({verses.length})</h4>
          {renderTestamentButtons()}
          {renderVerseList(verses)}
        </section>
      )}

      {trimmedQuery && (
        <section className="lexicon-card">
          <div className="lexicon-card-heading">
            <h4 className="section-title">Bible names</h4>
            <span className="source-badge">UBS names</span>
          </div>
          <p className="lexicon-help lexicon-help-inline">
            Hebrew and Greek name data from the UBS name database.
          </p>
          {renderTestamentButtons()}
          {!namesLoaded ? (
            <div className="empty">Loading UBS names…</div>
          ) : nameResults.length > 0 ? (
            <div className="verse-list">
              {nameResults.map((name) => {
                const firstReference = name.references[0]
                return (
                  <div key={name.id} className="verse-card lexicon-name-card" onClick={() => firstReference && onSelect(firstReference.verseId)}>
                    <div className="verse-ref">
                      <span>{name.word}</span>
                      <small>{name.language}</small>
                    </div>
                    <div className="verse-text">{name.definition}</div>
                    {name.glosses.length > 0 && (
                      <div className="lexicon-meta-line">{name.glosses.slice(0, 3).join(' • ')}</div>
                    )}
                    {name.references.length > 0 && (
                      <div className="lexicon-chip-row">
                        {name.references.slice(0, 4).map((ref) => (
                          <span key={ref.verseId} className="lexicon-chip">{ref.label}</span>
                        ))}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          ) : (
            <div className="empty">No UBS name match for “{debouncedQuery}”.</div>
          )}
        </section>
      )}

      {trimmedQuery && !entry && verses.length > 0 && (
        <section className="lexicon-card">
          <div className="lexicon-card-heading">
            <h4 className="section-title">{t('versesUsing')} ({verses.length})</h4>
            <span className="source-badge">KJV verses</span>
          </div>
          {renderTestamentButtons()}
          {renderVerseList(verses)}
        </section>
      )}

      {trimmedQuery && !entry && verses.length === 0 && (
        <div className="empty">{t('lexiconNotFound', { term: debouncedQuery })}</div>
      )}

      {!trimmedQuery && <div className="empty">{t('lexiconEmpty')}</div>}
    </div>
  )
}
