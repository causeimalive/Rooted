import { useEffect, useMemo, useRef, useState, useCallback, type ChangeEvent } from 'react'
import * as d3 from 'd3'
import { Maximize2, Undo2 } from 'lucide-react'
import { useVersions } from '@youversion/platform-react-hooks'
import { useI18n } from './i18n'
import { useRootedNetwork, type NetworkNode } from './useRootedNetwork'
import { useEntityData } from './useEntityData'
import { getAllVerses, loadBible } from './bible'
import { type Verse } from './types'
import NetworkScene from './NetworkScene'
import NetworkVersePopup from './NetworkVersePopup'

const TAG_KIND: Record<string, string | undefined> = {
  div: 'theme',
  dq: 'theme',
  ndq: 'echo',
  per: 'book',
  geo: 'ambient',
  grp: 'chapter',
}

const TIER = (count: number): 'strong' | 'medium' | 'soft' =>
  count > 5 ? 'strong' : count > 2 ? 'medium' : 'soft'

type RootedNetwork3DSceneProps = {
  theme: 'dark' | 'light'
  onVerseSelect?: (verse: Verse | null) => void
}

type TreeNode = NetworkNode & { children?: TreeNode[] }

const FOCUS = { x: 0, y: 0, z: 0 }

const makeWireframeTree = (): { nodes: any[]; edges: any[] } => {
  return { nodes: [], edges: [] }
}

const kindForType = (type: NetworkNode['type']): string => {
  switch (type) {
    case 'version':
      return 'center'
    case 'book':
      return 'book'
    case 'chapter':
      return 'chapter'
    case 'verse':
    default:
      return 'related'
  }
}

const sizeForType = (type: NetworkNode['type']): number => {
  switch (type) {
    case 'version':
      return 10
    case 'book':
      return 6
    case 'chapter':
      return 4
    case 'verse':
    default:
      return 2
  }
}

const tierForType = (type: NetworkNode['type']): string => {
  switch (type) {
    case 'version':
      return 'strong'
    case 'book':
      return 'strong'
    case 'chapter':
      return 'medium'
    case 'verse':
    default:
      return 'soft'
  }
}

export default function RootedNetwork3DScene({ theme, onVerseSelect }: RootedNetwork3DSceneProps) {
  const { language } = useI18n()
  const { versions, loading: versionsLoading } = useVersions(language, undefined, { all_available: true, page_size: 99 })
  const [selectedVersionId, setSelectedVersionId] = useState<number | null>(null)

  useEffect(() => {
    if (!selectedVersionId && versions?.data?.length) {
      setSelectedVersionId(versions.data[0].id)
    }
  }, [selectedVersionId, versions])

  const versionId = selectedVersionId ?? versions?.data?.[0]?.id ?? 1
  const { nodes, loading, drillIn, drillOut, reset, version } = useRootedNetwork(language, versionId)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [selectedVerse, setSelectedVerse] = useState<NetworkNode | null>(null)

  const { tagsByVerseId, loading: entityLoading } = useEntityData()
  const [bookNumberByCode, setBookNumberByCode] = useState<Map<string, number>>(new Map())

  useEffect(() => {
    let cancelled = false
    const build = () => {
      const all = getAllVerses()
      const map = new Map<string, number>()
      const seen = new Set<string>()
      for (const v of all) {
        if (seen.has(v.book)) continue
        seen.add(v.book)
        map.set(v.book, map.size + 1)
      }
      if (!cancelled) setBookNumberByCode(map)
    }
    if (getAllVerses().length) {
      build()
    } else {
      loadBible().then(build)
    }
    return () => {
      cancelled = true
    }
  }, [])

  const { sceneNodes, edges } = useMemo(() => {
    const root: TreeNode = { id: 'root', type: 'version' as never, label: 'Bible', children: [] }
    const versionMap = new Map<string, TreeNode>()
    const bookMap = new Map<string, TreeNode>()
    const chapterMap = new Map<string, TreeNode>()

    nodes.forEach((n) => {
      const node: TreeNode = { ...n, children: [] }
      if (n.type === 'version') {
        root.children?.push(node)
        versionMap.set(n.id, node)
      } else if (n.type === 'book' && n.parentId) {
        const parent = versionMap.get(n.parentId)
        parent?.children?.push(node)
        bookMap.set(n.id, node)
      } else if (n.type === 'chapter' && n.parentId) {
        const parent = bookMap.get(n.parentId)
        parent?.children?.push(node)
        chapterMap.set(n.id, node)
      } else if (n.type === 'verse' && n.parentId) {
        const parent = chapterMap.get(n.parentId)
        parent?.children?.push(node)
      }
    })

    const h = d3.hierarchy<TreeNode>(root, (d) => d.children)
    const layout = d3
      .tree<TreeNode>()
      .nodeSize([32, 40])
      .separation((a, b) => (a.parent === b.parent ? 1.5 : 2.2))(h)

    const spread = Math.PI * 0.92
    const all = layout.descendants()
    let minX = Infinity
    let maxX = -Infinity
    all.forEach((d) => {
      minX = Math.min(minX, d.x)
      maxX = Math.max(maxX, d.x)
    })
    const xSpan = Math.max(1, maxX - minX)
    all.forEach((d) => {
      const nx = (d.x - minX) / xSpan
      const angle = (nx - 0.5) * spread
      const r = Math.max(0, d.y)
      const newX = r * Math.sin(angle)
      const newY = r * Math.cos(angle)
      const newZ = Math.sin(newX * 0.025) * r * 0.12 + (d.depth - 1) * 18
      d.x = newX
      d.y = -newY
      ;(d as any).z = newZ
    })

    const versionNode = all.find((d) => d.data.type === 'version')
    const yShift = versionNode ? -versionNode.y : 0
    all.forEach((d) => {
      d.y += yShift
    })

    const sceneNodes = all
      .filter((d) => d.data.id !== 'root')
      .map((d) => ({
        id: d.data.id,
        kind: kindForType(d.data.type) as never,
        label: d.data.type === 'verse' ? '' : d.data.label,
        detail: d.data.detail ?? d.data.type,
        x: d.x,
        y: d.y,
        z: (d as any).z ?? 0,
        size: sizeForType(d.data.type),
        tier: tierForType(d.data.type) as never,
      }))

    const edges = layout
      .links()
      .filter((l) => l.source.data.id !== 'root')
      .map((l) => {
        const sourceType = l.source.data.type
        const weight = sourceType === 'version' ? 40 : sourceType === 'book' ? 30 : sourceType === 'chapter' ? 18 : 10
        return {
          id: `${l.source.data.id}-${l.target.data.id}`,
          source: l.source.data.id,
          target: l.target.data.id,
          weight,
          kind: 'spoke' as const,
        }
      })

    const tree = makeWireframeTree()
    tree.nodes.forEach((n) => {
      n.y += yShift
    })
    return { sceneNodes: [...sceneNodes, ...tree.nodes], edges: [...edges, ...tree.edges] }
  }, [nodes])

  const entityGraph = useMemo(() => {
    if (!selectedVerse || !selectedVerse.bookId || selectedVerse.chapter == null || selectedVerse.verse == null) {
      return null
    }
    const bookNumber = bookNumberByCode.get(selectedVerse.bookId)
    if (!bookNumber) return null
    const verseKey = `${String(bookNumber).padStart(2, '0')}${String(selectedVerse.chapter).padStart(3, '0')}${String(selectedVerse.verse).padStart(3, '0')}`
    const tags = tagsByVerseId[verseKey]
    if (!tags || Object.keys(tags).length === 0) return null
    const tagEntries = Object.entries(tags)
    const center = {
      id: selectedVerse.id,
      kind: 'center',
      label: selectedVerse.label,
      detail: selectedVerse.detail ?? selectedVerse.label,
      x: 0,
      y: 0,
      z: 0,
      size: 8,
      tier: 'strong',
    }
    const entityNodes = tagEntries.map(([tag, count], i) => {
      const angle = (i / tagEntries.length) * Math.PI * 2
      const r = 120
      return {
        id: `ent-${verseKey}-${tag}`,
        kind: (TAG_KIND[tag] ?? 'related') as never,
        label: tag.toUpperCase(),
        detail: `${count} word${count === 1 ? '' : 's'}`,
        x: Math.cos(angle) * r,
        y: Math.sin(angle) * r,
        z: i % 2 === 0 ? 35 : -35,
        size: 3.5 + Math.min(4, count * 0.4),
        tier: TIER(count) as never,
        parentId: selectedVerse.id,
      }
    })
    const entityEdges = tagEntries.map(([tag, count]) => ({
      id: `ent-e-${verseKey}-${tag}`,
      source: selectedVerse.id,
      target: `ent-${verseKey}-${tag}`,
      weight: 12 + count * 2,
      kind: 'spoke' as const,
    }))
    return { nodes: [center, ...entityNodes], edges: entityEdges }
  }, [selectedVerse, bookNumberByCode, tagsByVerseId])

  const displayNodes = entityGraph ? (entityGraph.nodes as never) : sceneNodes
  const displayEdges = entityGraph ? (entityGraph.edges as never) : edges

  const handleSelect = (id: string) => {
    if (id.startsWith('tree-')) return
    const node = nodes.find((n) => n.id === id)
    if (!node) return
    setSelectedId(id)
    if (node.type === 'verse') {
      setSelectedVerse(node)
      const book = nodes.find((n) => n.type === 'book' && n.bookId === node.bookId)
      onVerseSelect?.({
        id: node.id,
        verseId: node.id,
        book: node.bookId!,
        bookName: book?.label ?? node.bookId!,
        chapter: node.chapter!,
        verse: node.verse!,
        text: node.detail ?? node.label,
        body: node.detail ?? node.label,
        translation: version?.abbreviation ?? '',
        updatedAt: new Date().toISOString(),
      })
    } else {
      setSelectedVerse(null)
      onVerseSelect?.(null)
      drillIn(node)
    }
  }

  const handleVersionChange = (e: ChangeEvent<HTMLSelectElement>) => {
    setSelectedVersionId(Number(e.target.value))
    setSelectedId(null)
    setSelectedVerse(null)
    onVerseSelect?.(null)
    reset()
  }

  const handleReset = () => {
    setSelectedId(null)
    setSelectedVerse(null)
    onVerseSelect?.(null)
    reset()
  }

  const handleDrillOut = () => {
    setSelectedId(null)
    setSelectedVerse(null)
    onVerseSelect?.(null)
    drillOut()
  }

  const handleClose = () => {
    setSelectedId(null)
    setSelectedVerse(null)
    onVerseSelect?.(null)
  }

  const treeHudRef = useRef<HTMLImageElement>(null)
  const handleCameraChange = useCallback(
    ({ yaw, pitch, distance }: { yaw: number; pitch: number; distance: number }) => {
      const el = treeHudRef.current
      if (!el) return
      el.style.transform = `perspective(600px) rotateX(${pitch * 80}deg) rotateY(${yaw * 80}deg)`
    },
    []
  )

  return (
    <div className={`yv-network-3d yv-network-3d-${theme}`}>
      <div className="yv-network-3d-hud">
        <select
          className="yv-network-3d-select"
          value={versionId}
          onChange={handleVersionChange}
          disabled={versionsLoading || !versions?.data?.length}
        >
          {versions?.data?.map((v) => (
            <option key={v.id} value={v.id}>
              {v.title || v.abbreviation || v.id}
            </option>
          ))}
        </select>
        <div className="yv-network-3d-actions">
          <button type="button" onClick={handleReset} aria-label="Reset view" title="Reset view">
            <Maximize2 size={16} />
          </button>
          <button type="button" onClick={handleDrillOut} aria-label="Zoom out one level" title="Zoom out one level">
            <Undo2 size={16} />
          </button>
        </div>
      </div>
      {(loading || entityLoading) && <div className="yv-network-3d-loading">Loading…</div>}
      <img
        src="/rooted.png"
        alt=""
        ref={treeHudRef}
        className="yv-network-3d-hud-tree"
        aria-hidden="true"
      />
      <NetworkScene
        nodes={displayNodes as any}
        edges={displayEdges as any}
        focus={FOCUS}
        selectedId={selectedId}
        onSelect={handleSelect}
        onCameraChange={handleCameraChange}
        theme={theme}
      />
      <NetworkVersePopup verse={selectedVerse} onClose={handleClose} theme={theme} />
    </div>
  )
}
