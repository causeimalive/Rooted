import { useMemo, useState } from 'react'
import { getAllCharacters, getCharacter, getCharacterPath, type CharacterPathStop } from './characters'
import { getPlace, formatPassage } from './places'
import { findVerse } from './bible'
import { useI18n } from './i18n'
import { Bookmark, Character, Verse } from './types'

type WayfinderTabProps = {
  bookmarks: Bookmark[]
  onSelect: (verseId: string) => void
}

function findFirstVerse(stop: CharacterPathStop): Verse | undefined {
  const passage = stop.event.passages[0]
  if (!passage) return undefined
  const book = passage.book
  const chapter = passage.startChapter
  const verse = passage.startVerse ?? 1
  return (
    findVerse(`${book}.${chapter}.${verse}`) ??
    findVerse(`${book.toUpperCase()}.${chapter}.${verse}`) ??
    findVerse(`${book.toLowerCase()}.${chapter}.${verse}`)
  )
}

export default function WayfinderTab({ bookmarks, onSelect }: WayfinderTabProps) {
  const { t } = useI18n()
  const [query, setQuery] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const allCharacters = useMemo(() => getAllCharacters().sort((a, b) => a.name.localeCompare(b.name)), [])
  const filteredCharacters = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return allCharacters.slice(0, 80)
    return allCharacters
      .filter((c) => c.name.toLowerCase().includes(q) || c.aliases?.some((a) => a.toLowerCase().includes(q)))
      .slice(0, 80)
  }, [allCharacters, query])

  const selectedCharacter = useMemo(() => (selectedId ? getCharacter(selectedId) ?? null : null), [selectedId])
  const stops = useMemo<CharacterPathStop[]>(() => (selectedCharacter ? getCharacterPath(selectedCharacter) : []), [selectedCharacter])

  const sortedBookmarks = useMemo(
    () =>
      [...bookmarks]
        .filter((b) => b.verseId)
        .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()),
    [bookmarks],
  )

  return (
    <div className="panel bubble-layout wayfinder-panel" style={{ gap: '0.75rem' }}>
      <div className="bubble-header wayfinder-header" style={{ alignItems: 'start' }}>
        <div>
          <h2>{t('wayfinderTitle')}</h2>
          <p>{t('wayfinderHint')}</p>
        </div>
      </div>

      <div className="wayfinder-grid" style={{ display: 'grid', gridTemplateColumns: '320px 1fr', gap: '1rem', flex: 1, minHeight: 0 }}>
        <aside className="wayfinder-sidebar" style={{ display: 'flex', flexDirection: 'column', gap: '1rem', minWidth: 0 }}>
          <div className="bubble-card" style={{ display: 'flex', flexDirection: 'column', minHeight: 0 }}>
            <h3>{t('characters')}</h3>
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search people…"
              style={{ width: '100%', margin: '0.65rem 0' }}
            />
            <div className="bubble-list" style={{ maxHeight: 280, overflowY: 'auto' }}>
              {filteredCharacters.map((character) => (
                <button
                  key={character.id}
                  className="bubble-list-item"
                  onClick={() => setSelectedId(character.id)}
                  style={{ textAlign: 'left' }}
                >
                  <span>{character.name}</span>
                  <small>{character.era}{character.approxDateRange ? ` · ${character.approxDateRange}` : ''}</small>
                </button>
              ))}
            </div>
          </div>

          <div className="bubble-card" style={{ display: 'flex', flexDirection: 'column', minHeight: 0 }}>
            <h3>My Journey</h3>
            <div className="bubble-list" style={{ maxHeight: 200, overflowY: 'auto' }}>
              {sortedBookmarks.length === 0 && <div className="empty">No bookmarks yet.</div>}
              {sortedBookmarks.map((bookmark) => {
                const verse = findVerse(bookmark.verseId)
                return (
                  <button
                    key={bookmark.id}
                    className="bubble-list-item"
                    onClick={() => onSelect(bookmark.verseId)}
                    style={{ textAlign: 'left' }}
                  >
                    <span>{verse ? `${verse.bookName} ${verse.chapter}:${verse.verse}` : bookmark.verseId}</span>
                    <small>{new Date(bookmark.createdAt).toLocaleDateString()}</small>
                  </button>
                )
              })}
            </div>
          </div>
        </aside>

        <section className="bubble-canvas-card" style={{ minWidth: 0, overflowY: 'auto' }}>
          {!selectedCharacter ? (
            <div className="panel empty" style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              Select a biblical figure to see their path through Scripture.
            </div>
          ) : (
            <div className="bubble-card" style={{ height: 'auto' }}>
              <div style={{ marginBottom: '1rem' }}>
                <h3 style={{ margin: 0 }}>{selectedCharacter.name}</h3>
                {selectedCharacter.era && (
                  <p style={{ margin: '0.25rem 0 0', opacity: 0.8 }}>{selectedCharacter.era}{selectedCharacter.approxDateRange ? ` · ${selectedCharacter.approxDateRange}` : ''}</p>
                )}
                {selectedCharacter.summary && (
                  <p style={{ margin: '0.5rem 0 0', fontSize: '0.92rem', lineHeight: 1.5 }}>{selectedCharacter.summary}</p>
                )}
              </div>

              <div className="wayfinder-timeline" style={{ position: 'relative', paddingLeft: '1.25rem' }}>
                <div
                  className="wayfinder-timeline-line"
                  style={{
                    position: 'absolute',
                    left: 7,
                    top: 12,
                    bottom: 12,
                    width: 2,
                    background: 'var(--muted)',
                    borderRadius: 1,
                  }}
                />
                {stops.map((stop, index) => {
                  const verse = findFirstVerse(stop)
                  return (
                    <div key={index} className="wayfinder-stop" style={{ position: 'relative', paddingBottom: '1rem' }}>
                      <div
                        className="wayfinder-stop-marker"
                        style={{
                          position: 'absolute',
                          left: '-1.25rem',
                          top: 6,
                          width: 12,
                          height: 12,
                          borderRadius: '50%',
                          background: 'var(--accent)',
                          border: '2px solid var(--bg)',
                        }}
                      />
                      <div className="wayfinder-stop-body" style={{ paddingLeft: '0.5rem' }}>
                        <strong style={{ fontSize: '1.05rem' }}>{stop.event.label}</strong>
                        <small style={{ display: 'block', opacity: 0.8, marginTop: 2 }}>
                          {stop.event.approxDate ? `· ${stop.event.approxDate} ` : ''}
                          {stop.place ? `· ${stop.place.name} ` : ''}
                          {stop.event.passages.length > 0 ? `· ${formatPassage(stop.event.passages[0])}` : ''}
                        </small>
                        {verse && (
                          <>
                            <p style={{ margin: '0.35rem 0 0', fontSize: '0.9rem', opacity: 0.9 }}>{verse.text.slice(0, 180)}…</p>
                            <button className="secondary" style={{ marginTop: '0.5rem' }} onClick={() => onSelect(verse.id)}>
                              Open {verse.bookName} {verse.chapter}:{verse.verse}
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  )
}
