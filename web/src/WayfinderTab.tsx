import { useEffect, useMemo, useRef, useState } from 'react'
import { getAllCharacters, getCharacter, getCharacterPath, type CharacterPathStop } from './characters'
import { getPlace, formatPassage } from './places'
import { findVerse } from './bible'
import { useI18n } from './i18n'
import { Character, Memory, MemoryType, Verse } from './types'

type WayfinderTabProps = {
  memories: Memory[]
  selectedVerse?: Verse
  onSelect: (verseId: string) => void
  onSaveMemory: (memory: Memory) => void
  onDeleteMemory: (id: string) => void
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

const MEMORY_TYPE_LABELS: Record<MemoryType, string> = {
  note: 'Note',
  prayer: 'Prayer',
  highlight: 'Highlight',
  photo: 'Photo',
  bookmark: 'Bookmark',
}

export default function WayfinderTab({ memories, selectedVerse, onSelect, onSaveMemory, onDeleteMemory }: WayfinderTabProps) {
  const { t } = useI18n()
  const [query, setQuery] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [showMemoryForm, setShowMemoryForm] = useState(false)
  const [memoryType, setMemoryType] = useState<MemoryType>('note')
  const [memoryBody, setMemoryBody] = useState('')
  const [memoryTags, setMemoryTags] = useState('')
  const [memoryMood, setMemoryMood] = useState('')
  const [memoryColor, setMemoryColor] = useState('')
  const [selectedMemoryId, setSelectedMemoryId] = useState<string | null>(null)
  const [filterType, setFilterType] = useState<MemoryType | 'all'>('all')
  const [filterTag, setFilterTag] = useState('')
  const [filterMood, setFilterMood] = useState('')
  const [filterBook, setFilterBook] = useState('')
  const [filterFrom, setFilterFrom] = useState('')
  const [filterTo, setFilterTo] = useState('')

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

  const [activeStopIndex, setActiveStopIndex] = useState(0)
  const [isPlaying, setIsPlaying] = useState(false)
  const intervalRef = useRef<number | null>(null)

  useEffect(() => {
    setActiveStopIndex(0)
    setIsPlaying(false)
  }, [selectedId])

  useEffect(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current)
      intervalRef.current = null
    }
    if (!isPlaying || !stops.length) return
    if (activeStopIndex >= stops.length - 1) {
      setIsPlaying(false)
      return
    }
    intervalRef.current = window.setInterval(() => {
      setActiveStopIndex((prev) => {
        if (prev >= stops.length - 1) return prev
        return prev + 1
      })
    }, 2000)
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
        intervalRef.current = null
      }
    }
  }, [isPlaying, activeStopIndex, stops])

  const activeStop = stops[activeStopIndex]
  const activeStopVerse = activeStop ? findFirstVerse(activeStop) : undefined

  const sortedMemories = useMemo(
    () =>
      [...memories]
        .filter((m) => m.verseId)
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),
    [memories],
  )

  const filteredMemories = useMemo(() => {
    return sortedMemories.filter((m) => {
      if (filterType !== 'all' && m.type !== filterType) return false
      if (filterTag && !(m.tags ?? []).some((t) => t.toLowerCase().includes(filterTag.toLowerCase()))) return false
      if (filterMood && !m.mood?.toLowerCase().includes(filterMood.toLowerCase())) return false
      if (filterBook) {
        const v = findVerse(m.verseId)
        if (!v || !v.bookName.toLowerCase().includes(filterBook.toLowerCase())) return false
      }
      if (filterFrom) {
        const d = new Date(m.createdAt)
        if (d < new Date(filterFrom)) return false
      }
      if (filterTo) {
        const d = new Date(m.createdAt)
        const to = new Date(filterTo)
        to.setHours(23, 59, 59, 999)
        if (d > to) return false
      }
      return true
    })
  }, [sortedMemories, filterType, filterTag, filterMood, filterBook, filterFrom, filterTo])

  const selectedMemory = useMemo(() => memories.find((m) => m.id === selectedMemoryId) ?? null, [memories, selectedMemoryId])

  const handleSaveMemory = () => {
    if (!selectedVerse) return
    const memory: Memory = {
      id: crypto.randomUUID(),
      verseId: selectedVerse.id,
      type: memoryType,
      body: memoryBody.trim() || undefined,
      color: memoryColor.trim() || undefined,
      tags: memoryTags.split(',').map((s) => s.trim()).filter(Boolean),
      mood: memoryMood.trim() || undefined,
      shareLevel: 'private',
      createdAt: new Date().toISOString(),
    }
    onSaveMemory(memory)
    setMemoryBody('')
    setMemoryTags('')
    setMemoryMood('')
    setMemoryColor('')
    setShowMemoryForm(false)
  }

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
            {!selectedVerse ? (
              <p style={{ fontSize: '0.88rem', opacity: 0.8 }}>Select a verse in the Reader to add a memory here.</p>
            ) : (
              <button
                type="button"
                className="secondary"
                style={{ margin: '0.5rem 0' }}
                onClick={() => setShowMemoryForm((s) => !s)}
              >
                {showMemoryForm ? 'Cancel' : 'Add memory'}
              </button>
            )}
            {showMemoryForm && selectedVerse && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', margin: '0.5rem 0' }}>
                <select value={memoryType} onChange={(e) => setMemoryType(e.target.value as MemoryType)} style={{ padding: '0.35rem' }}>
                  {(['note', 'prayer', 'highlight', 'photo', 'bookmark'] as MemoryType[]).map((type) => (
                    <option key={type} value={type}>{MEMORY_TYPE_LABELS[type]}</option>
                  ))}
                </select>
                <textarea
                  placeholder="Write a thought, prayer, or note…"
                  value={memoryBody}
                  onChange={(e) => setMemoryBody(e.target.value)}
                  rows={3}
                  style={{ padding: '0.4rem', resize: 'vertical' }}
                />
                <input
                  type="text"
                  placeholder="Tags (comma separated)"
                  value={memoryTags}
                  onChange={(e) => setMemoryTags(e.target.value)}
                  style={{ padding: '0.35rem' }}
                />
                <input
                  type="text"
                  placeholder="Mood"
                  value={memoryMood}
                  onChange={(e) => setMemoryMood(e.target.value)}
                  style={{ padding: '0.35rem' }}
                />
                <input
                  type="text"
                  placeholder="Color (e.g. #d7be7d)"
                  value={memoryColor}
                  onChange={(e) => setMemoryColor(e.target.value)}
                  style={{ padding: '0.35rem' }}
                />
                <button type="button" className="primary" onClick={handleSaveMemory}>
                  Save memory
                </button>
              </div>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', margin: '0.5rem 0' }}>
              <select value={filterType} onChange={(e) => setFilterType(e.target.value as MemoryType | 'all')} style={{ padding: '0.35rem' }}>
                <option value="all">All types</option>
                {(['note', 'prayer', 'highlight', 'photo', 'bookmark'] as MemoryType[]).map((type) => (
                  <option key={type} value={type}>{MEMORY_TYPE_LABELS[type]}</option>
                ))}
              </select>
              <input
                type="text"
                placeholder="Book…"
                value={filterBook}
                onChange={(e) => setFilterBook(e.target.value)}
                style={{ padding: '0.35rem' }}
              />
              <input
                type="text"
                placeholder="Tag…"
                value={filterTag}
                onChange={(e) => setFilterTag(e.target.value)}
                style={{ padding: '0.35rem' }}
              />
              <input
                type="text"
                placeholder="Mood…"
                value={filterMood}
                onChange={(e) => setFilterMood(e.target.value)}
                style={{ padding: '0.35rem' }}
              />
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <input
                  type="date"
                  value={filterFrom}
                  onChange={(e) => setFilterFrom(e.target.value)}
                  style={{ padding: '0.35rem', flex: 1 }}
                />
                <input
                  type="date"
                  value={filterTo}
                  onChange={(e) => setFilterTo(e.target.value)}
                  style={{ padding: '0.35rem', flex: 1 }}
                />
              </div>
            </div>

            {selectedMemory && (
              <div className="bubble-card" style={{ margin: '0.5rem 0', padding: '0.75rem', background: 'var(--surface)', borderRadius: '0.5rem' }}>
                <h4 style={{ margin: 0 }}>{MEMORY_TYPE_LABELS[selectedMemory.type]} · {new Date(selectedMemory.createdAt).toLocaleString()}</h4>
                <p style={{ margin: '0.25rem 0', fontSize: '0.85rem' }}>
                  {(() => {
                    const v = findVerse(selectedMemory.verseId)
                    return v ? `${v.bookName} ${v.chapter}:${v.verse}` : selectedMemory.verseId
                  })()}
                </p>
                {selectedMemory.body && <p style={{ margin: '0.5rem 0 0', fontSize: '0.9rem' }}>{selectedMemory.body}</p>}
                {selectedMemory.mood && <p style={{ margin: '0.25rem 0 0', fontSize: '0.85rem', opacity: 0.8 }}>Mood: {selectedMemory.mood}</p>}
                {selectedMemory.color && (
                  <p style={{ margin: '0.25rem 0 0', fontSize: '0.85rem' }}>
                    Color: <span style={{ color: selectedMemory.color }}>{selectedMemory.color}</span>
                  </p>
                )}
                {(selectedMemory.tags ?? []).length > 0 && (
                  <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: '0.5rem' }}>
                    {(selectedMemory.tags ?? []).map((tag) => (
                      <span key={tag} style={{ fontSize: '0.75rem', padding: '0.1rem 0.35rem', borderRadius: '0.5rem', background: 'var(--bg)', color: 'var(--accent)' }}>
                        {tag}
                      </span>
                    ))}
                  </div>
                )}
                <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.75rem' }}>
                  <button className="secondary" onClick={() => onSelect(selectedMemory.verseId)}>Open in Reader</button>
                  <button className="secondary" onClick={() => onDeleteMemory(selectedMemory.id)}>Delete</button>
                  <button className="secondary" onClick={() => setSelectedMemoryId(null)}>Close</button>
                </div>
              </div>
            )}

            <div className="bubble-list" style={{ maxHeight: 240, overflowY: 'auto' }}>
              {filteredMemories.length === 0 && <div className="empty">No memories match.</div>}
              {filteredMemories.map((memory) => {
                const verse = findVerse(memory.verseId)
                return (
                  <div
                    key={memory.id}
                    className="bubble-list-item"
                    onClick={() => setSelectedMemoryId(memory.id)}
                    style={{ textAlign: 'left', display: 'flex', flexDirection: 'column', gap: 4, cursor: 'pointer' }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <button
                        className="unstyled"
                        onClick={(e) => {
                          e.stopPropagation()
                          onSelect(memory.verseId)
                        }}
                        style={{ textAlign: 'left', color: 'var(--text)', fontSize: '0.9rem' }}
                      >
                        <span>{verse ? `${verse.bookName} ${verse.chapter}:${verse.verse}` : memory.verseId}</span>
                        <small style={{ display: 'block', opacity: 0.7 }}>{new Date(memory.createdAt).toLocaleDateString()} · {MEMORY_TYPE_LABELS[memory.type]}</small>
                      </button>
                      <button
                        type="button"
                        className="secondary"
                        onClick={(e) => {
                          e.stopPropagation()
                          onDeleteMemory(memory.id)
                        }}
                        style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem' }}
                      >
                        Delete
                      </button>
                    </div>
                    {memory.body && <p style={{ margin: 0, fontSize: '0.85rem', opacity: 0.9 }}>{memory.body}</p>}
                    {memory.tags && memory.tags.length > 0 && (
                      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                        {memory.tags.map((tag) => (
                          <span key={tag} style={{ fontSize: '0.75rem', padding: '0.1rem 0.35rem', borderRadius: '0.5rem', background: 'var(--surface)', color: 'var(--accent)' }}>{tag}</span>
                        ))}
                      </div>
                    )}
                  </div>
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

              <div
                className="wayfinder-player"
                style={{
                  display: 'flex',
                  flexWrap: 'wrap',
                  gap: '0.75rem',
                  alignItems: 'center',
                  marginBottom: '1rem',
                  padding: '0.75rem',
                  background: 'var(--surface)',
                  borderRadius: '0.5rem',
                }}
              >
                <button
                  type="button"
                  className="secondary"
                  onClick={() => setActiveStopIndex((i) => Math.max(0, i - 1))}
                >
                  Previous
                </button>
                <button
                  type="button"
                  className="primary"
                  onClick={() => setIsPlaying((p) => !p)}
                >
                  {isPlaying ? 'Pause' : 'Play'}
                </button>
                <button
                  type="button"
                  className="secondary"
                  onClick={() => setActiveStopIndex((i) => Math.min(stops.length - 1, i + 1))}
                >
                  Next
                </button>
                <span style={{ marginLeft: 'auto', fontSize: '0.9rem', opacity: 0.8 }}>
                  {activeStopIndex + 1} / {stops.length}
                </span>
              </div>

              {activeStop && (
                <div className="bubble-card" style={{ marginBottom: '1rem', background: 'var(--bg)' }}>
                  <h4 style={{ margin: 0 }}>{activeStop.event.label}</h4>
                  <small style={{ display: 'block', opacity: 0.8, marginTop: 2 }}>
                    {activeStop.event.approxDate ? `· ${activeStop.event.approxDate} ` : ''}
                    {activeStop.place ? `· ${activeStop.place.name} ` : ''}
                    {activeStop.event.passages.length > 0 ? `· ${formatPassage(activeStop.event.passages[0])}` : ''}
                  </small>
                  {activeStopVerse && (
                    <>
                      <p style={{ margin: '0.5rem 0 0', fontSize: '0.9rem', opacity: 0.9 }}>{activeStopVerse.text.slice(0, 180)}…</p>
                      <button className="secondary" style={{ marginTop: '0.5rem' }} onClick={() => onSelect(activeStopVerse.id)}>
                        Open {activeStopVerse.bookName} {activeStopVerse.chapter}:{activeStopVerse.verse}
                      </button>
                    </>
                  )}
                </div>
              )}

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
                  const isActive = index === activeStopIndex
                  const verse = findFirstVerse(stop)
                  return (
                    <div
                      key={index}
                      className="wayfinder-stop"
                      onClick={() => setActiveStopIndex(index)}
                      style={{ position: 'relative', paddingBottom: '1rem', cursor: 'pointer', opacity: isActive ? 1 : 0.7 }}
                    >
                      <div
                        className="wayfinder-stop-marker"
                        style={{
                          position: 'absolute',
                          left: '-1.25rem',
                          top: 6,
                          width: 12,
                          height: 12,
                          borderRadius: '50%',
                          background: isActive ? 'var(--accent)' : 'var(--muted)',
                          border: '2px solid var(--bg)',
                        }}
                      />
                      <div className="wayfinder-stop-body" style={{ paddingLeft: '0.5rem' }}>
                        <strong style={{ fontSize: '1.05rem', color: isActive ? 'var(--accent)' : 'var(--text)' }}>{stop.event.label}</strong>
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
