import React, { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react'
import { getAllCharacters, getCharacter, getCharacterPath, type CharacterPathStop } from './characters'
import { getPlace, formatPassage } from './places'
import { findVerse } from './bible'
import { SCENE_PALETTE } from './relationshipGraph/palette'
import { useI18n } from './i18n'
import { Character, Comment, Friend, GraphAnalysisSummary, Memory, MemoryType, PublicMemory, Reaction, ReactionType, ShareLevel, Verse } from './types'
import {
  deleteMemoryComment,
  deleteMemoryReaction,
  getMemoryComments,
  getMemoryReactions,
  getPublicMemories,
  saveMemoryComment,
  saveMemoryReaction,
} from './cloudStorage'
import { getCurrentUserId } from './storage'

type WayfinderTabProps = {
  memories: Memory[]
  friends: Friend[]
  selectedVerse?: Verse
  onSelect: (verseId: string) => void
  onSaveMemory: (memory: Memory) => void
  onDeleteMemory: (id: string) => void
  onSaveFriend: (friend: Friend) => void
  onDeleteFriend: (id: string) => void
  theme: 'dark' | 'light'
}

const NetworkThreeScene = lazy(() => import('./NetworkThreeScene'))

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

const SHARE_LEVEL_LABELS: Record<Memory['shareLevel'], string> = {
  private: 'Private',
  friends: 'Friends',
  public: 'Public',
}

type WayfinderGraphNode = {
  id: string
  label: string
  detail: string
  x: number
  y: number
  kind: 'character' | 'stop'
  characterId?: string
  verseId?: string
  stopIndex?: number
}

type WayfinderGraphEdge = {
  source: string
  target: string
}

const GRAPH_WIDTH = 1000
const GRAPH_HEIGHT = 460
const GRAPH_CENTER_X = GRAPH_WIDTH / 2
const GRAPH_CENTER_Y = GRAPH_HEIGHT / 2

function polarPoint(index: number, total: number, radius: number, phase = -Math.PI / 2) {
  const angle = phase + (index / Math.max(total, 1)) * Math.PI * 2
  return {
    x: GRAPH_CENTER_X + Math.cos(angle) * radius,
    y: GRAPH_CENTER_Y + Math.sin(angle) * radius,
  }
}

export default function WayfinderTab({ memories, friends, selectedVerse, onSelect, onSaveMemory, onDeleteMemory, onSaveFriend, onDeleteFriend, theme }: WayfinderTabProps) {
  const { t } = useI18n()
  const [query, setQuery] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [showMemoryForm, setShowMemoryForm] = useState(false)
  const [memoryType, setMemoryType] = useState<MemoryType>('note')
  const [memoryBody, setMemoryBody] = useState('')
  const [memoryTags, setMemoryTags] = useState('')
  const [memoryMood, setMemoryMood] = useState('')
  const [memoryColor, setMemoryColor] = useState('')
  const [memoryShareLevel, setMemoryShareLevel] = useState<Memory['shareLevel']>('private')
  const [selectedMemoryId, setSelectedMemoryId] = useState<string | null>(null)
  const [filterType, setFilterType] = useState<MemoryType | 'all'>('all')
  const [filterTag, setFilterTag] = useState('')
  const [filterMood, setFilterMood] = useState('')
  const [filterBook, setFilterBook] = useState('')
  const [filterFrom, setFilterFrom] = useState('')
  const [filterTo, setFilterTo] = useState('')
  const [filterShareLevel, setFilterShareLevel] = useState<ShareLevel | 'all'>('all')
  const [friendUserId, setFriendUserId] = useState('')
  const [friendDisplayName, setFriendDisplayName] = useState('')
  const [friendMemories, setFriendMemories] = useState<PublicMemory[]>([])
  const [selectedPublicMemory, setSelectedPublicMemory] = useState<PublicMemory | null>(null)
  const [comments, setComments] = useState<Comment[]>([])
  const [reactions, setReactions] = useState<Reaction[]>([])
  const [commentBody, setCommentBody] = useState('')
  const [graphAnalysis, setGraphAnalysis] = useState<GraphAnalysisSummary | null>(null)
  const [graphAnalysisLoaded, setGraphAnalysisLoaded] = useState(false)

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

  useEffect(() => {
    if (!friends.length) {
      setFriendMemories([])
      return
    }
    const friendIds = new Set(friends.map((f) => f.userId))
    getPublicMemories()
      .then((memories) => setFriendMemories(memories.filter((m) => friendIds.has(m.ownerUserId))))
      .catch(() => setFriendMemories([]))
  }, [friends])

  useEffect(() => {
    if (!selectedPublicMemory) {
      setComments([])
      setReactions([])
      setCommentBody('')
      return
    }
    const memoryId = selectedPublicMemory.id
    getMemoryComments(memoryId)
      .then(setComments)
      .catch(() => setComments([]))
    getMemoryReactions(memoryId)
      .then(setReactions)
      .catch(() => setReactions([]))
  }, [selectedPublicMemory])

  useEffect(() => {
    let cancelled = false
    fetch('/api/graph/analyze')
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error(`Graph analysis failed: ${res.status}`))))
      .then((summary: GraphAnalysisSummary) => {
        if (!cancelled) {
          setGraphAnalysis(summary)
          setGraphAnalysisLoaded(true)
        }
      })
      .catch(() => {
        if (!cancelled) {
          setGraphAnalysis(null)
          setGraphAnalysisLoaded(true)
        }
      })
    return () => {
      cancelled = true
    }
  }, [])

  const currentUserId = getCurrentUserId()
  const activeStop = stops[activeStopIndex]
  const activeStopVerse = activeStop ? findFirstVerse(activeStop) : undefined

  const graphModel = useMemo(() => {
    if (selectedCharacter && stops.length > 0) {
      const centerNode: WayfinderGraphNode = {
        id: `character-${selectedCharacter.id}`,
        label: selectedCharacter.name,
        detail: selectedCharacter.era,
        x: GRAPH_CENTER_X,
        y: GRAPH_CENTER_Y,
        kind: 'character',
        characterId: selectedCharacter.id,
      }
      const stopNodes = stops.map((stop, index) => {
        const point = polarPoint(index, stops.length, 150 + Math.min(index * 12, 32), -Math.PI / 2)
        const verse = findFirstVerse(stop)
        const passageLabel = stop.event.passages[0] ? formatPassage(stop.event.passages[0]) : 'Stop'
        const detail = stop.place?.name ?? stop.event.approxDate ?? passageLabel
        return {
          id: `stop-${index}`,
          label: stop.event.label,
          detail,
          x: point.x,
          y: point.y,
          kind: 'stop' as const,
          verseId: verse?.id,
          stopIndex: index,
        }
      })
      return {
        title: selectedCharacter.name,
        subtitle: selectedCharacter.summary,
        nodes: [centerNode, ...stopNodes],
        edges: stopNodes.map((stop) => ({ source: centerNode.id, target: stop.id })),
      }
    }

    const previewCharacters = filteredCharacters.slice(0, 12)
    const centerNode: WayfinderGraphNode = {
      id: 'graph-center',
      label: previewCharacters[0]?.name ?? 'Wayfinder',
      detail: previewCharacters.length > 0 ? 'Select a person to expand their path' : 'No people matched',
      x: GRAPH_CENTER_X,
      y: GRAPH_CENTER_Y,
      kind: 'character',
      characterId: previewCharacters[0]?.id,
    }
    const orbitNodes = previewCharacters.map((character, index) => {
      const point = polarPoint(index, previewCharacters.length, 160 + (index % 3) * 18, -Math.PI / 2)
      return {
        id: `preview-${character.id}`,
        label: character.name,
        detail: character.era,
        x: point.x,
        y: point.y,
        kind: 'character' as const,
        characterId: character.id,
      }
    })
    return {
      title: 'Wayfinder graph',
      subtitle: 'Select a biblical figure to see their path through Scripture.',
      nodes: [centerNode, ...orbitNodes],
      edges: orbitNodes.map((node) => ({ source: centerNode.id, target: node.id })),
    }
  }, [filteredCharacters, selectedCharacter, stops])

  const graphFocus = useMemo(() => ({ x: GRAPH_CENTER_X / 10, y: GRAPH_CENTER_Y / 10, z: 0 }), [])

  const scene = useMemo(() => {
    const nodes: any[] = graphModel.nodes.map((node) => {
      const base = {
        id: node.id,
        label: node.label,
        detail: node.detail ?? '',
        x: node.x / 10,
        y: node.y / 10,
        z: 0,
        size: node.kind === 'character' ? 140 : 90,
        kind: node.kind,
      }
      if (node.kind === 'stop') {
        const verse = node.verseId ? findVerse(node.verseId) : undefined
        return { ...base, verseId: node.verseId, stopIndex: node.stopIndex, verse }
      }
      if (node.kind === 'character') {
        return { ...base, characterId: node.characterId }
      }
      return base
    })
    const edges: any[] = graphModel.edges.map((edge) => ({
      id: `${edge.source}-${edge.target}`,
      source: edge.source,
      target: edge.target,
      weight: 1,
      kind: 'spoke' as const,
    }))
    const stopNodes = nodes.filter((node) => node.kind === 'stop' && node.stopIndex != null)
    const pathColor = SCENE_PALETTE[theme].nodeColors.person
    const points = stopNodes
      .sort((a, b) => (a.stopIndex as number) - (b.stopIndex as number))
      .map((node) => ({ x: node.x, y: node.y, z: 0 }))
    const paths = points.length > 0 ? [{ id: 'character-path', points, color: pathColor }] : []
    return { nodes, edges, paths }
  }, [graphModel, theme])

  const handleSceneSelect = (id: string) => {
    const node = graphModel.nodes.find((n) => n.id === id)
    if (!node) return
    if (node.kind === 'stop' && node.verseId) {
      onSelect(node.verseId)
      if (node.stopIndex != null) setActiveStopIndex(node.stopIndex)
      return
    }
    if (node.kind === 'character' && node.characterId) {
      setSelectedId(node.characterId)
      setQuery('')
    }
  }

  const selectedNetworkId = selectedCharacter ? `character-${selectedCharacter.id}` : null

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
      if (filterShareLevel !== 'all' && m.shareLevel !== filterShareLevel) return false
      return true
    })
  }, [sortedMemories, filterType, filterTag, filterMood, filterBook, filterFrom, filterTo, filterShareLevel])

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
      shareLevel: memoryShareLevel,
      createdAt: new Date().toISOString(),
    }
    onSaveMemory(memory)
    setMemoryBody('')
    setMemoryTags('')
    setMemoryMood('')
    setMemoryColor('')
    setMemoryShareLevel('private')
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
                <select value={memoryShareLevel} onChange={(e) => setMemoryShareLevel(e.target.value as Memory['shareLevel'])} style={{ padding: '0.35rem' }}>
                  {(['private', 'friends', 'public'] as Memory['shareLevel'][]).map((level) => (
                    <option key={level} value={level}>{SHARE_LEVEL_LABELS[level]}</option>
                  ))}
                </select>
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
              <select value={filterShareLevel} onChange={(e) => setFilterShareLevel(e.target.value as ShareLevel | 'all')} style={{ padding: '0.35rem' }}>
                <option value="all">All share levels</option>
                {(['private', 'friends', 'public'] as ShareLevel[]).map((level) => (
                  <option key={level} value={level}>{SHARE_LEVEL_LABELS[level]}</option>
                ))}
              </select>
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
                <p style={{ margin: '0.25rem 0 0', fontSize: '0.85rem', opacity: 0.8 }}>
                  Share level: {SHARE_LEVEL_LABELS[selectedMemory.shareLevel ?? 'private']}
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

          <div className="bubble-card" style={{ display: 'flex', flexDirection: 'column', minHeight: 0 }}>
            <h3>Friends</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', margin: '0.5rem 0' }}>
              <input
                type="text"
                placeholder="Friend user ID or email"
                value={friendUserId}
                onChange={(e) => setFriendUserId(e.target.value)}
                style={{ padding: '0.35rem' }}
              />
              <input
                type="text"
                placeholder="Display name (optional)"
                value={friendDisplayName}
                onChange={(e) => setFriendDisplayName(e.target.value)}
                style={{ padding: '0.35rem' }}
              />
              <button
                type="button"
                className="primary"
                onClick={() => {
                  const uid = friendUserId.trim()
                  if (!uid) return
                  onSaveFriend({
                    id: uid,
                    userId: uid,
                    displayName: friendDisplayName.trim() || undefined,
                    createdAt: new Date().toISOString(),
                  })
                  setFriendUserId('')
                  setFriendDisplayName('')
                }}
              >
                Add friend
              </button>
            </div>
            <div className="bubble-list" style={{ maxHeight: 200, overflowY: 'auto' }}>
              {friends.length === 0 && <div className="empty">No friends added.</div>}
              {friends.map((friend) => (
                <div
                  key={friend.id}
                  className="bubble-list-item"
                  style={{ textAlign: 'left', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
                >
                  <span style={{ fontSize: '0.9rem' }}>
                    {friend.displayName || friend.userId}
                    <small style={{ display: 'block', opacity: 0.7 }}>{friend.userId}</small>
                  </span>
                  <button
                    type="button"
                    className="secondary"
                    onClick={() => onDeleteFriend(friend.id)}
                    style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem' }}
                  >
                    Delete
                  </button>
                </div>
              ))}
            </div>
          </div>

          <div className="bubble-card" style={{ display: 'flex', flexDirection: 'column', minHeight: 0 }}>
            <h3>Friends' Public Journey</h3>
            <div className="bubble-list" style={{ maxHeight: 240, overflowY: 'auto' }}>
              {friendMemories.length === 0 && <div className="empty">No public memories from friends.</div>}
              {friendMemories.map((memory) => {
                const verse = findVerse(memory.verseId)
                const friend = friends.find((f) => f.userId === memory.ownerUserId)
                return (
                  <div
                    key={memory.id}
                    className="bubble-list-item"
                    onClick={() => setSelectedPublicMemory(memory)}
                    style={{ textAlign: 'left', display: 'flex', flexDirection: 'column', gap: 4, cursor: 'pointer' }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: '0.9rem' }}>
                        {verse ? `${verse.bookName} ${verse.chapter}:${verse.verse}` : memory.verseId}
                        <small style={{ display: 'block', opacity: 0.7 }}>
                          {friend?.displayName || friend?.userId || memory.ownerUserId} · {new Date(memory.createdAt).toLocaleDateString()} · {MEMORY_TYPE_LABELS[memory.type]}
                        </small>
                      </span>
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

          {selectedPublicMemory && (
            <div className="bubble-card" style={{ display: 'flex', flexDirection: 'column', minHeight: 0, padding: '0.75rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                <h4 style={{ margin: 0 }}>{MEMORY_TYPE_LABELS[selectedPublicMemory.type]}</h4>
                <button type="button" className="secondary" onClick={() => setSelectedPublicMemory(null)} style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem' }}>Back</button>
              </div>
              <p style={{ margin: '0.25rem 0', fontSize: '0.85rem' }}>
                {(() => {
                  const v = findVerse(selectedPublicMemory.verseId)
                  return v ? `${v.bookName} ${v.chapter}:${v.verse}` : selectedPublicMemory.verseId
                })()}
              </p>
              {selectedPublicMemory.body && <p style={{ margin: '0.5rem 0 0', fontSize: '0.9rem' }}>{selectedPublicMemory.body}</p>}
              {selectedPublicMemory.tags && (selectedPublicMemory.tags ?? []).length > 0 && (
                <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: '0.5rem' }}>
                  {selectedPublicMemory.tags.map((tag) => (
                    <span key={tag} style={{ fontSize: '0.75rem', padding: '0.1rem 0.35rem', borderRadius: '0.5rem', background: 'var(--surface)', color: 'var(--accent)' }}>{tag}</span>
                  ))}
                </div>
              )}
              <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.75rem' }}>
                <button className="secondary" onClick={() => onSelect(selectedPublicMemory.verseId)}>Open in Reader</button>
              </div>
              <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.75rem' }}>
                {(['like', 'pray', 'amen'] as ReactionType[]).map((type) => {
                  const count = reactions.filter((r) => r.type === type).length
                  const isMine = reactions.some((r) => r.userId === currentUserId && r.type === type)
                  return (
                    <button
                      key={type}
                      type="button"
                      className={isMine ? 'primary' : 'secondary'}
                      onClick={() => {
                        if (!currentUserId) return
                        const existing = reactions.find((r) => r.userId === currentUserId)
                        if (existing && existing.type === type) {
                          deleteMemoryReaction(selectedPublicMemory.id, currentUserId)
                            .then(() => setReactions((prev) => prev.filter((r) => r.userId !== currentUserId)))
                            .catch(() => {})
                        } else {
                          const reaction: Reaction = {
                            id: `${selectedPublicMemory.id}_${currentUserId}`,
                            memoryId: selectedPublicMemory.id,
                            userId: currentUserId,
                            type,
                            createdAt: new Date().toISOString(),
                          }
                          saveMemoryReaction(selectedPublicMemory.id, reaction)
                            .then(() => setReactions((prev) => [...prev.filter((r) => r.userId !== currentUserId), reaction]))
                            .catch(() => {})
                        }
                      }}
                      style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem' }}
                    >
                      {type} {count > 0 ? count : ''}
                    </button>
                  )
                })}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginTop: '0.75rem' }}>
                <h5 style={{ margin: 0 }}>Comments</h5>
                <div className="bubble-list" style={{ maxHeight: 140, overflowY: 'auto' }}>
                  {comments.length === 0 && <div className="empty">No comments yet.</div>}
                  {comments.map((comment) => (
                    <div key={comment.id} className="bubble-list-item" style={{ textAlign: 'left', display: 'flex', flexDirection: 'column', gap: 4 }}>
                      <span style={{ fontSize: '0.85rem' }}>
                        {comment.authorName || comment.userId}
                        <small style={{ display: 'block', opacity: 0.7 }}>{new Date(comment.createdAt).toLocaleString()}</small>
                      </span>
                      <p style={{ margin: 0, fontSize: '0.85rem' }}>{comment.body}</p>
                    </div>
                  ))}
                </div>
                {currentUserId && (
                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <input
                      type="text"
                      placeholder="Add a comment…"
                      value={commentBody}
                      onChange={(e) => setCommentBody(e.target.value)}
                      style={{ padding: '0.35rem', flex: 1 }}
                    />
                    <button
                      type="button"
                      className="primary"
                      onClick={() => {
                        if (!commentBody.trim() || !currentUserId || !selectedPublicMemory) return
                        const comment: Comment = {
                          id: crypto.randomUUID(),
                          memoryId: selectedPublicMemory.id,
                          userId: currentUserId,
                          body: commentBody.trim(),
                          createdAt: new Date().toISOString(),
                        }
                        saveMemoryComment(selectedPublicMemory.id, comment)
                          .then(() => {
                            setComments((prev) => [comment, ...prev])
                            setCommentBody('')
                          })
                          .catch(() => {})
                      }}
                      style={{ padding: '0.35rem 0.75rem' }}
                    >
                      Post
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}
        </aside>

        <section className="bubble-canvas-card" style={{ minWidth: 0, overflowY: 'auto' }}>
          <div className="bubble-card" style={{ marginBottom: '1rem' }}>
            <div className="lexicon-card-heading" style={{ marginBottom: '0.35rem' }}>
              <h3 style={{ margin: 0 }}>Graph analysis</h3>
              <span className="verse-meta-pill">Phase 5.4</span>
            </div>
            {graphAnalysisLoaded ? graphAnalysis ? (
              <>
                <div className="network-focus-metrics" style={{ marginBottom: '0.75rem' }}>
                  <div><span>Verses</span><strong>{graphAnalysis.verseCount}</strong></div>
                  <div><span>Books</span><strong>{graphAnalysis.bookCount}</strong></div>
                  <div><span>Unique terms</span><strong>{graphAnalysis.uniqueTermCount}</strong></div>
                </div>
                <div className="network-focus-metrics" style={{ marginBottom: '0.75rem' }}>
                  <div><span>Avg terms</span><strong>{graphAnalysis.averageUniqueTermsPerVerse}</strong></div>
                  <div><span>Top verse</span><strong>{graphAnalysis.topVerses[0]?.reference ?? '—'}</strong></div>
                  <div><span>Computed</span><strong>{new Date(graphAnalysis.computedAt).toLocaleTimeString()}</strong></div>
                </div>
                <div className="network-term-row" style={{ marginBottom: '0.5rem' }}>
                  {graphAnalysis.topTerms.slice(0, 6).map((term) => (
                    <span key={term.label} className="network-term-chip">{term.label} · {term.count}</span>
                  ))}
                </div>
                <div className="network-term-row" style={{ marginBottom: '0.75rem' }}>
                  {graphAnalysis.topBooks.slice(0, 5).map((book) => (
                    <span key={book.label} className="network-term-chip">{book.label} · {book.count}</span>
                  ))}
                </div>
                <div className="bubble-list" style={{ maxHeight: 140, overflowY: 'auto' }}>
                  {graphAnalysis.topVerses.slice(0, 5).map((verse) => (
                    <button key={verse.verseId} type="button" className="bubble-list-item network-context-item" onClick={() => onSelect(verse.verseId)}>
                      <span>{verse.reference}</span>
                      <small>Graph score {verse.score.toFixed(2)}</small>
                    </button>
                  ))}
                </div>
              </>
            ) : <div className="network-helper-text">No analysis available yet.</div> : <div className="network-helper-text">Loading server-side graph analysis…</div>}
          </div>

          <div className="bubble-card" style={{ marginBottom: '1rem' }}>
            <div className="lexicon-card-heading" style={{ marginBottom: '0.35rem' }}>
              <h3 style={{ margin: 0 }}>Wayfinder graph</h3>
              <span className="verse-meta-pill">{graphModel.nodes.length} nodes</span>
            </div>
            <p style={{ margin: '0 0 0.75rem', fontSize: '0.88rem', opacity: 0.8 }}>{graphModel.subtitle}</p>
            <div
              style={{
                position: 'relative',
                height: 420,
                borderRadius: '0.85rem',
                border: '1px solid color-mix(in srgb, var(--muted) 70%, transparent)',
                background: 'linear-gradient(180deg, color-mix(in srgb, var(--surface) 92%, transparent), var(--bg))',
                overflow: 'hidden',
              }}
            >
              <Suspense
                fallback={
                  <div style={{ width: '100%', height: '100%', minHeight: 420, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text)' }}>
                    Loading 3D wayfinder…
                  </div>
                }
              >
                <NetworkThreeScene
                  nodes={scene.nodes}
                  edges={scene.edges}
                  focus={graphFocus}
                  selectedId={selectedNetworkId}
                  onSelect={handleSceneSelect}
                  paths={scene.paths}
                  theme={theme}
                />
              </Suspense>
              {graphModel.nodes.length === 0 && <div className="panel empty" style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>No graph data yet.</div>}
            </div>
            {!selectedCharacter && (
              <p style={{ margin: '0.75rem 0 0', fontSize: '0.85rem', opacity: 0.75 }}>Pick a biblical figure on the left to turn the graph into a path map.</p>
            )}
          </div>

          {selectedCharacter ? (
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
          ) : (
            <div className="panel empty" style={{ minHeight: 220, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              Select a biblical figure to see their path through Scripture.
            </div>
          )}
        </section>
      </div>
    </div>
  )
}
