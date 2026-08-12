import { useMemo, useRef } from 'react'
import ForceGraph3D from 'react-force-graph-3d'

type Verse = {
  id: string
  book: string
  bookName: string
  chapter: number
  verse: number
  text: string
}

type NetworkKind = 'center' | 'related' | 'theme' | 'echo' | 'ambient' | 'book' | 'chapter'

type NetworkNode = {
  id: string
  kind: NetworkKind
  label: string
  detail: string
  x: number
  y: number
  z: number
  size: number
  verse?: Verse
  score?: number
  tier?: 'strong' | 'medium' | 'soft'
  jumpVerseId?: string
  parentId?: string
  bookId?: string
  bookName?: string
  chapterNumber?: number
}

type NetworkEdge = {
  id: string
  source: string
  target: string
  weight: number
  kind: 'spoke' | 'bridge' | 'theme'
}

type NetworkForceGraph3DProps = {
  nodes: NetworkNode[]
  edges: NetworkEdge[]
  focus: { x: number; y: number; z: number }
  selectedId: string | null
  onSelect: (id: string) => void
  onHoverNode?: (id: string | null) => void
  onCameraChange?: (camera: { yaw: number; pitch: number; distance: number }) => void
  theme: 'dark' | 'light'
}

const PALETTE = {
  dark: {
    bg: '#101318',
    center: '#ffd66b',
    related: '#7cd992',
    theme: '#ff9e6d',
    echo: '#9aa4b2',
    book: '#c792ff',
    chapter: '#89ddff',
    ambient: '#a0b3c6',
    node: '#6ec3ff',
    edge: '#2e3440',
    selected: '#ffffff',
  },
  light: {
    bg: '#fffaf2',
    center: '#d4a017',
    related: '#4a8b5f',
    theme: '#b85c38',
    echo: '#7d8a93',
    book: '#7a4f9f',
    chapter: '#3b7d8a',
    ambient: '#6b7b8a',
    node: '#4a6fa5',
    edge: '#d4d6d9',
    selected: '#000000',
  },
}

export default function NetworkForceGraph3D({
  nodes,
  edges,
  selectedId,
  onSelect,
  onHoverNode,
  theme,
}: NetworkForceGraph3DProps) {
  const fgRef = useRef<any>(null)
  const palette = PALETTE[theme]

  const graphData = useMemo(
    () => ({
      nodes: nodes.map((node) => ({ ...node })),
      links: edges.map((edge) => ({ ...edge, source: edge.source, target: edge.target })),
    }),
    [nodes, edges],
  )

  const getNodeColor = (node: any) => {
    if (node.id === selectedId) return palette.selected
    return (palette as any)[node.kind] ?? palette.node
  }

  const getNodeLabel = (node: any) => `${node.label}\n${node.detail}`

  const getLinkWidth = (link: any) => Math.max(0.5, (link.weight || 0.5) / 8)

  return (
    <div
      className={`network-force-graph-3d-shell ${theme}`}
      style={{ width: '100%', height: '100%', minHeight: 460, background: palette.bg, position: 'relative' }}
    >
      <ForceGraph3D
        ref={fgRef}
        graphData={graphData}
        backgroundColor={palette.bg}
        nodeRelSize={6}
        nodeResolution={16}
        nodeLabel={getNodeLabel}
        nodeColor={getNodeColor}
        nodeOpacity={0.95}
        linkColor={() => palette.edge}
        linkOpacity={0.55}
        linkWidth={getLinkWidth}
        onNodeClick={(node: any) => onSelect(node.id)}
        onNodeHover={(node: any) => onHoverNode?.(node ? node.id : null)}
        onEngineStop={() => fgRef.current?.zoomToFit(400)}
        warmupTicks={30}
        cooldownTicks={100}
        cooldownTime={5000}
        enableNodeDrag={false}
      />
    </div>
  )
}
