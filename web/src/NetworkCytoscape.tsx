import { useEffect, useMemo, useRef, useState } from 'react'
import cytoscape from 'cytoscape'

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

type NetworkCytoscapeProps = {
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
    node: '#6ec3ff',
    center: '#ffd66b',
    related: '#7cd992',
    theme: '#ff9e6d',
    echo: '#9aa4b2',
    book: '#c792ff',
    chapter: '#89ddff',
    ambient: '#a0b3c6',
    edge: '#2e3440',
    text: '#ecf3fa',
  },
  light: {
    bg: '#fffaf2',
    node: '#4a6fa5',
    center: '#d4a017',
    related: '#4a8b5f',
    theme: '#b85c38',
    echo: '#7d8a93',
    book: '#7a4f9f',
    chapter: '#3b7d8a',
    ambient: '#6b7b8a',
    edge: '#d4d6d9',
    text: '#1f2933',
  },
}

function buildStylesheet(theme: 'dark' | 'light'): any[] {
  const p = PALETTE[theme]
  return [
    {
      selector: 'core',
      style: {
        'active-bg-color': p.node,
        'active-bg-opacity': 0,
        'active-bg-size': 0,
        'selection-box-color': p.node,
        'selection-box-opacity': 0.15,
        'selection-box-border-color': p.node,
        'selection-box-border-width': 1,
      },
    },
    {
      selector: 'node',
      style: {
        'background-color': p.node,
        'label': 'data(label)',
        'color': p.text,
        'font-size': '10px',
        'text-valign': 'bottom',
        'text-halign': 'center',
        'text-margin-y': 4,
        'width': 'mapData(size, 10, 250, 8, 48)',
        'height': 'mapData(size, 10, 250, 8, 48)',
        'border-width': 1,
        'border-color': p.text,
        'border-opacity': 0.2,
      },
    },
    {
      selector: 'node.center',
      style: { 'background-color': p.center, 'width': 48, 'height': 48, 'font-size': '12px', 'font-weight': 'bold' },
    },
    { selector: 'node.related', style: { 'background-color': p.related } },
    { selector: 'node.theme', style: { 'background-color': p.theme, shape: 'diamond', 'font-weight': 'bold' } },
    { selector: 'node.echo', style: { 'background-color': p.echo, 'width': 12, 'height': 12 } },
    { selector: 'node.book', style: { 'background-color': p.book, 'font-weight': 'bold', 'font-size': '11px' } },
    { selector: 'node.chapter', style: { 'background-color': p.chapter } },
    { selector: 'node.ambient', style: { 'background-color': p.ambient, 'width': 10, 'height': 10 } },
    {
      selector: 'edge',
      style: {
        'width': 'mapData(weight, 0, 40, 1, 6)',
        'line-color': p.edge,
        'target-arrow-color': p.edge,
        'target-arrow-shape': 'none',
        'curve-style': 'bezier',
        'opacity': 0.55,
      },
    },
    {
      selector: 'node:selected',
      style: {
        'border-width': 3,
        'border-color': p.text,
        'border-opacity': 0.9,
      },
    },
    {
      selector: '.cy-panzoom',
      style: { 'events': 'no' },
    },
  ]
}

export default function NetworkCytoscape({
  nodes,
  edges,
  selectedId,
  onSelect,
  onHoverNode,
  theme,
}: NetworkCytoscapeProps) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const cyRef = useRef<cytoscape.Core | null>(null)
  const selectedIdRef = useRef<string | null>(selectedId)
  selectedIdRef.current = selectedId
  const [error, setError] = useState<string | null>(null)

  const elements = useMemo(() => {
    const nodeIds = new Set<string>(nodes.map((n) => n.id))
    const nodeEls = nodes.map((node) => ({
      group: 'nodes' as const,
      data: {
        id: node.id,
        label: node.label,
        detail: node.detail,
        kind: node.kind,
        size: node.size,
      },
      classes: [node.kind],
    }))
    const edgeEls = edges.map((edge) => ({
      group: 'edges' as const,
      data: {
        id: edge.id,
        source: edge.source,
        target: edge.target,
        weight: edge.weight,
      },
      classes: [edge.kind],
    }))
    // Hierarchy edges are disabled until every parent node is guaranteed to be
    // present in the visible set; missing parents cause Cytoscape to throw.
    return [...nodeEls, ...edgeEls]
  }, [nodes, edges])

  useEffect(() => {
    if (!containerRef.current) return
    const rect = containerRef.current.getBoundingClientRect()
    if (rect.height < 50) {
      setError('Network graph container is too small to render.')
      return
    }
    try {
      const cy = cytoscape({
        container: containerRef.current,
        elements,
        style: buildStylesheet(theme),
        layout: { name: 'cose', padding: 24, fit: true, randomize: true, animate: false, componentSpacing: 60, numIter: 250 },
        minZoom: 0.15,
        maxZoom: 4,
        wheelSensitivity: 0.15,
        boxSelectionEnabled: false,
        selectionType: 'single',
      })
      cyRef.current = cy

      cy.on('tap', 'node', (event) => onSelect(event.target.id()))
      cy.on('mouseover', 'node', (event) => onHoverNode?.(event.target.id()))
      cy.on('mouseout', 'node', () => onHoverNode?.(null))

      return () => {
        cy.destroy()
        cyRef.current = null
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to initialize network graph.')
      console.error('Cytoscape init error:', err)
    }
  }, [])

  useEffect(() => {
    const cy = cyRef.current
    if (!cy) return
    try {
      cy.elements().remove()
      cy.add(elements)
      const layout = cy.layout({
        name: 'cose',
        padding: 24,
        fit: true,
        randomize: true,
        animate: false,
        componentSpacing: 60,
        numIter: 250,
      })
      cy.one('layoutstop', () => {
        const currentSelected = selectedIdRef.current
        if (currentSelected) {
          const el = cy.getElementById(currentSelected)
          if (el.length) cy.fit(el, 80)
        } else {
          cy.fit(cy.elements(), 40)
        }
        if (currentSelected) cy.getElementById(currentSelected).select()
      })
      layout.run()
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to layout network graph.')
      console.error('Cytoscape layout error:', err)
    }
  }, [elements])

  useEffect(() => {
    const cy = cyRef.current
    if (!cy) return
    cy.style(buildStylesheet(theme))
  }, [theme])

  useEffect(() => {
    const cy = cyRef.current
    if (!cy || !selectedId) return
    const el = cy.getElementById(selectedId)
    if (el.length) {
      cy.elements().unselect()
      el.select()
      cy.fit(el, 80)
    }
  }, [selectedId])

  return (
    <div
      className={`network-cytoscape-shell ${theme}`}
      ref={containerRef}
      style={{ width: '100%', height: '100%', minHeight: 460, background: PALETTE[theme].bg, position: 'relative' }}
      role="img"
      aria-label="Interactive network graph"
    >
      {error && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '1rem',
            color: PALETTE[theme].text,
            background: PALETTE[theme].bg,
            zIndex: 10,
          }}
        >
          <p>{error}</p>
        </div>
      )}
    </div>
  )
}
