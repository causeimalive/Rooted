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

  const entry = useMemo(() => lookupLexicon(debouncedQuery), [debouncedQuery])
  const suggestions = useMemo(() => (debouncedQuery.trim() ? searchLexicon(debouncedQuery) : []), [debouncedQuery])
  const nameResults = useMemo(
    () => (namesLoaded && debouncedQuery.trim() ? searchOpenBibleNames(debouncedQuery, { testament: testamentFilter }) : []),
    [debouncedQuery, namesLoaded, testamentFilter],
  )
  // Search verses by whatever the user typed (not just when a curated
  // dictionary entry exists), so any Bible word can be explored.
  const allVerses = useMemo(
    () => getVersesWithWord(entry ? entry.word : debouncedQuery),
    [entry, debouncedQuery],
  )
  const verses = useMemo(
    () => (testamentFilter === 'all' ? allVerses : allVerses.filter((v) => getTestamentForBook(v.book) === testamentFilter)),
    [allVerses, testamentFilter],
  )

  const hasQuery = debouncedQuery.trim().length > 0
  const showNameResults = nameResults.length > 0

  const pick = (e: LexiconEntry) => {
    setQuery(e.word)
  }

  const renderTestamentButtons = () =>
    allVerses.length > 0 ? (
      <div className="map-style-toggle">
        <button type="button" className={testamentFilter === 'all' ? 'active' : ''} onClick={() => setTestamentFilter('all')}>{t('allTestaments')}</button>
        <button type="button" className={testamentFilter === 'OT' ? 'active' : ''} onClick={() => setTestamentFilter('OT')}>{t('oldTestament')}</button>
        <button type="button" className={testamentFilter === 'NT' ? 'active' : ''} onClick={() => setTestamentFilter('NT')}>{t('newTestament')}</button>
      </div>
    ) : null

  return (
    <div className="panel" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      <div className="search-bar">
        <input
          type="text"
          placeholder={t('searchPlaceholder')}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <button onClick={() => setQuery(query)}><Search size={16} /></button>
      </div>

      {suggestions.length > 0 && (
        <div className="lexicon-suggestions">
          {suggestions.map((s) => (
            <button key={s.word} className="suggestion" onClick={() => pick(s)}>{s.word}</button>
          ))}
        </div>
      )}

      {entry && (
        <div className="lexicon-card">
          <h3>{entry.word}</h3>
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
          <div className="verse-list">
            {verses.slice(0, 50).map((v) => (
              <div key={v.id} className="verse-card" onClick={() => onSelect(v.id)}>
                <div className="verse-ref">{v.bookName} {v.chapter}:{v.verse}</div>
                <div className="verse-text">{v.text}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {showNameResults && (
        <div className="lexicon-card">
          <h4 className="section-title">Bible names ({nameResults.length})</h4>
          {renderTestamentButtons()}
          <div className="verse-list">
            {nameResults.map((name) => {
              const firstReference = name.references[0]
              return (
                <div key={name.id} className="verse-card" onClick={() => firstReference && onSelect(firstReference.verseId)}>
                  <div className="verse-ref">
                    <span>{name.word}</span>
                    <small>{name.language}</small>
                  </div>
                  <div className="verse-text">{name.definition}</div>
                  {name.glosses.length > 0 && (
                    <div style={{ marginTop: '0.45rem', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                      {name.glosses.slice(0, 3).join(' • ')}
                    </div>
                  )}
                  {name.references.length > 0 && (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem', marginTop: '0.5rem' }}>
                      {name.references.slice(0, 4).map((ref) => (
                        <span
                          key={ref.verseId}
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            borderRadius: '999px',
                            padding: '0.18rem 0.55rem',
                            border: '1px solid var(--muted)',
                            background: 'color-mix(in srgb, var(--surface) 88%, var(--bg))',
                            color: 'var(--text-muted)',
                            fontSize: '0.76rem',
                          }}
                        >
                          {ref.label}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {hasQuery && !entry && !showNameResults && verses.length > 0 && (
        <div className="lexicon-card">
          <h4 className="section-title">{t('versesUsing')} ({verses.length})</h4>
          {renderTestamentButtons()}
          <div className="verse-list">
            {verses.slice(0, 50).map((v) => (
              <div key={v.id} className="verse-card" onClick={() => onSelect(v.id)}>
                <div className="verse-ref">{v.bookName} {v.chapter}:{v.verse}</div>
                <div className="verse-text">{v.text}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {hasQuery && !entry && !showNameResults && verses.length === 0 && (
        <div className="empty">{t('lexiconNotFound', { term: debouncedQuery })}</div>
      )}

      {!hasQuery && <div className="empty">{t('lexiconEmpty')}</div>}
    </div>
  )
}
