import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { Html, OrbitControls } from '@react-three/drei'
import {
  BufferGeometry,
  Color,
  Float32BufferAttribute,
  IcosahedronGeometry,
  InstancedMesh,
  LineBasicMaterial,
  LineSegments,
  MeshBasicMaterial,
  Object3D,
  Vector3,
} from 'three'
import { SCENE_PALETTE } from './relationshipGraph/palette'

type NetworkKind =
  | 'center'
  | 'related'
  | 'theme'
  | 'echo'
  | 'ambient'
  | 'book'
  | 'chapter'
  | 'person'
  | 'place'
  | 'event'
  | 'userWaypoint'
  | 'originalWord'
  | 'topic'
  | 'doctrine'

type NetworkNode = {
  id: string
  kind: NetworkKind
  label: string
  detail: string
  x: number
  y: number
  z: number
  size: number
  verse?: { id: string; book: string; bookName: string; chapter: number; verse: number; text: string }
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

type NetworkThreeSceneProps = {
  nodes: NetworkNode[]
  edges: NetworkEdge[]
  focus: { x: number; y: number; z: number }
  selectedId: string | null
  onSelect: (id: string) => void
  onHoverNode?: (id: string | null) => void
  onCameraChange?: (camera: { yaw: number; pitch: number; distance: number; target: { x: number; y: number; z: number } }) => void
  paths?: { id: string; points: { x: number; y: number; z: number }[]; color: [number, number, number] }[]
  theme: 'dark' | 'light'
}

type Quality = 'high' | 'medium' | 'low'

const DUMMY = new Object3D()
const COLOR = new Color()
const WHITE = new Color(0xffffff)

function getNodeColor(kind: NetworkKind, theme: 'dark' | 'light', tier?: 'strong' | 'medium' | 'soft'): [number, number, number] {
  const palette = SCENE_PALETTE[theme].nodeColors
  switch (kind) {
    case 'center':
      return palette.center
    case 'theme':
      return palette.theme
    case 'echo':
      return palette.echo
    case 'ambient':
      return palette.ambient
    case 'book':
      return palette.book
    case 'chapter':
      return palette.chapter
    case 'person':
    case 'event':
      return palette.person
    case 'place':
      return palette.place
    case 'userWaypoint':
      return palette.verse
    case 'originalWord':
      return palette.originalWord
    case 'topic':
      return palette.topic
    case 'doctrine':
      return palette.doctrine
    case 'related':
      if (tier === 'strong') return palette.strong
      if (tier === 'medium') return palette.medium
      return palette.soft
    default:
      return palette.soft
  }
}

function getEdgeColor(kind: NetworkEdge['kind'], theme: 'dark' | 'light'): [number, number, number] {
  const palette = SCENE_PALETTE[theme].edgeColors
  switch (kind) {
    case 'theme':
      return palette.theme
    case 'spoke':
      return palette.spoke
    default:
      return palette.bridge
  }
}

function getNodeTargetDistance(kind: NetworkKind, size: number): number {
  switch (kind) {
    case 'center':
      return 130
    case 'book':
      return 140
    case 'chapter':
      return 90
    case 'theme':
      return 130
    case 'echo':
      return 110
    case 'person':
    case 'event':
    case 'userWaypoint':
      return 120
    case 'place':
      return 120
    default:
      return Math.max(70, Math.sqrt(size) * 1.8 + 30)
  }
}

function getGeometryDetail(quality: Quality): number {
  return quality === 'low' ? 0 : 1
}

function getMaxLabelsForQuality(quality: Quality): number {
  return quality === 'low' ? 6 : quality === 'medium' ? 12 : 18
}

function CameraRig({
  focus,
  selectedId,
  nodes,
  onCameraChange,
}: {
  focus: { x: number; y: number; z: number }
  selectedId: string | null
  nodes: NetworkNode[]
  onCameraChange?: NetworkThreeSceneProps['onCameraChange']
}) {
  const { camera } = useThree()
  const controlsRef = useRef<any>(null)
  const targetGoal = useRef(new Vector3(focus.x, focus.y, focus.z))
  const reportRef = useRef(0)
  const tmpDir = useRef(new Vector3())
  const tmpGoal = useRef(new Vector3())

  const selectedNode = useMemo(() => nodes.find((n) => n.id === selectedId), [nodes, selectedId])

  useEffect(() => {
    const goal = selectedNode ? new Vector3(selectedNode.x, selectedNode.y, selectedNode.z) : new Vector3(focus.x, focus.y, focus.z)
    targetGoal.current.copy(goal)
  }, [focus, selectedNode])

  useFrame((state) => {
    const controls = controlsRef.current
    if (!controls) return

    controls.target.lerp(targetGoal.current, 0.08)
    controls.update()

    if (selectedNode) {
      const desired = getNodeTargetDistance(selectedNode.kind, selectedNode.size)
      tmpDir.current.copy(camera.position).sub(controls.target).normalize()
      tmpGoal.current.copy(controls.target).addScaledVector(tmpDir.current, desired)
      camera.position.lerp(tmpGoal.current, 0.05)
    }

    const now = state.clock.elapsedTime * 1000
    if (now - reportRef.current > 150 && onCameraChange) {
      reportRef.current = now
      const distance = camera.position.distanceTo(controls.target)
      onCameraChange({
        yaw: 0,
        pitch: 0,
        distance,
        target: { x: controls.target.x, y: controls.target.y, z: controls.target.z },
      })
    }
  })

  return (
    <OrbitControls
      ref={controlsRef}
      enableDamping
      dampingFactor={0.05}
      enablePan
      enableZoom
      enableRotate
      rotateSpeed={0.6}
      zoomSpeed={0.9}
      panSpeed={0.8}
      minDistance={20}
      maxDistance={1400}
      target={[focus.x, focus.y, focus.z]}
    />
  )
}

function EdgeSegments({ nodes, edges, theme }: { nodes: NetworkNode[]; edges: NetworkEdge[]; theme: 'dark' | 'light' }) {
  const nodeById = useMemo(() => {
    const map = new Map<string, NetworkNode>()
    nodes.forEach((node) => map.set(node.id, node))
    return map
  }, [nodes])

  const geometry = useMemo(() => {
    const validEdges = edges
      .map((edge) => {
        const source = nodeById.get(edge.source)
        const target = nodeById.get(edge.target)
        if (!source || !target) return null
        return { ...edge, source, target }
      })
      .filter((e): e is NonNullable<typeof e> => Boolean(e))

    const positions = new Float32Array(validEdges.length * 2 * 3)
    const colors = new Float32Array(validEdges.length * 2 * 3)

    validEdges.forEach((edge, i) => {
      const [r, g, b] = getEdgeColor(edge.kind, theme)
      const offset = i * 6
      positions[offset] = edge.source.x
      positions[offset + 1] = edge.source.y
      positions[offset + 2] = edge.source.z
      positions[offset + 3] = edge.target.x
      positions[offset + 4] = edge.target.y
      positions[offset + 5] = edge.target.z
      colors[offset] = r / 255
      colors[offset + 1] = g / 255
      colors[offset + 2] = b / 255
      colors[offset + 3] = r / 255
      colors[offset + 4] = g / 255
      colors[offset + 5] = b / 255
    })

    const geometry = new BufferGeometry()
    geometry.setAttribute('position', new Float32BufferAttribute(positions, 3))
    geometry.setAttribute('color', new Float32BufferAttribute(colors, 3))
    return geometry
  }, [edges, nodeById, theme])

  const material = useMemo(
    () => new LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.5, depthWrite: false }),
    [],
  )

  useEffect(() => {
    return () => {
      geometry.dispose()
      material.dispose()
    }
  }, [geometry, material])

  if (!geometry.attributes.position.count) return null
  return <lineSegments geometry={geometry} material={material} />
}

function NodeInstancer({
  nodes,
  selectedId,
  onSelect,
  onHoverNode,
  theme,
  quality,
}: {
  nodes: NetworkNode[]
  selectedId: string | null
  onSelect: (id: string) => void
  onHoverNode?: (id: string | null) => void
  theme: 'dark' | 'light'
  quality: Quality
}) {
  const meshRef = useRef<InstancedMesh | null>(null)
  const geometry = useMemo(() => new IcosahedronGeometry(1, getGeometryDetail(quality)), [quality])
  const material = useMemo(() => new MeshBasicMaterial({ color: WHITE }), [])
  const nodeIds = useRef<string[]>([])
  const hoveredId = useRef<string | null>(null)

  useEffect(() => {
    if (!meshRef.current) return
    nodeIds.current = nodes.map((node) => node.id)

    for (let i = 0; i < nodes.length; i++) {
      const node = nodes[i]
      DUMMY.position.set(node.x, node.y, node.z)
      const scale = Math.max(1.0, Math.sqrt(node.size) * 0.25)
      const isSelected = node.id === selectedId
      DUMMY.scale.setScalar(isSelected ? scale * 1.25 : scale)
      DUMMY.updateMatrix()
      meshRef.current.setMatrixAt(i, DUMMY.matrix)

      const [r, g, b] = getNodeColor(node.kind, theme, node.tier)
      const selectedBoost = isSelected ? 1.25 : 1
      COLOR.setRGB((r / 255) * selectedBoost, (g / 255) * selectedBoost, (b / 255) * selectedBoost)
      meshRef.current.setColorAt(i, COLOR)
    }

    meshRef.current.instanceMatrix.needsUpdate = true
    if (meshRef.current.instanceColor) meshRef.current.instanceColor.needsUpdate = true
  }, [nodes, theme, selectedId])

  const handlePointerMove = (event: any) => {
    const instanceId: number | undefined = event.instanceId
    const next = instanceId != null ? nodeIds.current[instanceId] ?? null : null
    if (hoveredId.current !== next) {
      hoveredId.current = next
      onHoverNode?.(next)
    }
  }

  const handleClick = (event: any) => {
    event.stopPropagation()
    const instanceId: number | undefined = event.instanceId
    if (instanceId != null) {
      const id = nodeIds.current[instanceId]
      if (id) onSelect(id)
    }
  }

  const handlePointerLeave = () => {
    hoveredId.current = null
    onHoverNode?.(null)
  }

  return (
    <instancedMesh
      ref={meshRef}
      args={[geometry, material, nodes.length]}
      onClick={handleClick}
      onPointerMove={handlePointerMove}
      onPointerLeave={handlePointerLeave}
      frustumCulled
    />
  )
}

function LabelRenderer({
  nodes,
  selectedId,
  hoveredId,
  theme,
  quality,
}: {
  nodes: NetworkNode[]
  selectedId: string | null
  hoveredId: string | null
  theme: 'dark' | 'light'
  quality: Quality
}) {
  const nodeById = useMemo(() => {
    const map = new Map<string, NetworkNode>()
    nodes.forEach((node) => map.set(node.id, node))
    return map
  }, [nodes])

  const maxLabels = getMaxLabelsForQuality(quality)

  const labelIds = useMemo(() => {
    const ids: string[] = []
    if (selectedId) ids.push(selectedId)
    if (hoveredId && hoveredId !== selectedId) ids.push(hoveredId)

    nodes.forEach((node) => {
      if (node.kind === 'center') ids.push(node.id)
    })

    const themes = nodes.filter((n) => n.kind === 'theme' && (n.score ?? 0) >= 0)
    const topRelated = nodes.filter((n) => n.kind === 'related').sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
    const books = nodes.filter((n) => n.kind === 'book')
    const people = nodes.filter((n) => n.kind === 'person')
    const places = nodes.filter((n) => n.kind === 'place')

    const pool = [...ids]
    for (const node of themes) if (!pool.includes(node.id)) pool.push(node.id)
    for (const node of topRelated) if (!pool.includes(node.id)) pool.push(node.id)
    for (const node of people) if (!pool.includes(node.id)) pool.push(node.id)
    for (const node of places) if (!pool.includes(node.id)) pool.push(node.id)
    for (const node of books) if (!pool.includes(node.id)) pool.push(node.id)

    return pool.slice(0, maxLabels)
  }, [nodes, selectedId, hoveredId, maxLabels])

  return (
    <>
      {labelIds.map((id) => {
        const node = nodeById.get(id)
        if (!node) return null
        const isActive = id === selectedId || id === hoveredId
        const [r, g, b] = getNodeColor(node.kind, theme, node.tier)
        const labelColor = `rgb(${r}, ${g}, ${b})`
        const yOffset = Math.max(0.6, Math.sqrt(node.size) * 0.12) + 1.4

        return (
          <Html key={id} position={[node.x, node.y, node.z + yOffset]}>
            <div
              style={{
                color: 'white',
                fontSize: '0.72rem',
                fontWeight: 600,
                lineHeight: 1.15,
                padding: '3px 7px',
                borderRadius: '6px',
                background: `rgba(${Math.max(0, r - 40)}, ${Math.max(0, g - 40)}, ${Math.max(0, b - 40)}, 0.75)`,
                border: `1px solid ${labelColor}`,
                textShadow: '0 1px 2px rgba(0,0,0,0.85)',
                whiteSpace: 'nowrap',
                pointerEvents: 'none',
                transform: 'translate(-50%, -100%)',
              }}
            >
              <div>{node.label}</div>
              {isActive && node.detail && (
                <div style={{ fontSize: '0.62rem', opacity: 0.9, marginTop: 2 }}>{node.detail}</div>
              )}
            </div>
          </Html>
        )
      })}
    </>
  )
}

function LODController({ onQuality }: { onQuality: (q: Quality) => void }) {
  const { clock } = useThree()
  const sampleStart = useRef(clock.getElapsedTime())
  const frames = useRef(0)
  const done = useRef(false)

  useFrame(() => {
    if (done.current) return
    frames.current += 1
    const elapsed = clock.getElapsedTime() - sampleStart.current
    if (elapsed >= 2) {
      done.current = true
      const fps = frames.current / elapsed
      onQuality(fps >= 55 ? 'high' : fps >= 30 ? 'medium' : 'low')
    }
  })

  return null
}

function SceneContent(props: NetworkThreeSceneProps & { quality: Quality }) {
  const { scene } = useThree()
  const [r, g, b] = SCENE_PALETTE[props.theme].clearColor
  const clear = useMemo(() => new Color(r, g, b), [r, g, b])
  const [hoveredId, setHoveredId] = useState<string | null>(null)

  useEffect(() => {
    scene.background = clear
  }, [clear, scene])

  const handleHover = useCallback(
    (id: string | null) => {
      setHoveredId(id)
      props.onHoverNode?.(id)
    },
    [props.onHoverNode],
  )

  return (
    <>
      <CameraRig focus={props.focus} selectedId={props.selectedId} nodes={props.nodes} onCameraChange={props.onCameraChange} />
      <EdgeSegments nodes={props.nodes} edges={props.edges} theme={props.theme} />
      <NodeInstancer
        nodes={props.nodes}
        selectedId={props.selectedId}
        onSelect={props.onSelect}
        onHoverNode={handleHover}
        theme={props.theme}
        quality={props.quality}
      />
      <LabelRenderer
        nodes={props.nodes}
        selectedId={props.selectedId}
        hoveredId={hoveredId}
        theme={props.theme}
        quality={props.quality}
      />
    </>
  )
}

function Network3DScene(props: NetworkThreeSceneProps) {
  const { theme } = props
  const [r, g, b] = SCENE_PALETTE[theme].clearColor
  const [quality, setQuality] = useState<Quality>('high')

  return (
    <div
      className={`network-three-scene-shell ${theme}`}
      style={{ width: '100%', height: '100%', minHeight: 460, background: `rgb(${r * 255}, ${g * 255}, ${b * 255})` }}
    >
      <Canvas
        camera={{ fov: 60, near: 1, far: 4000, position: [props.focus.x, props.focus.y, props.focus.z + 260] }}
        style={{ width: '100%', height: '100%' }}
        gl={{ antialias: true, alpha: false }}
        dpr={quality === 'low' ? 1 : [1, 1.5]}
      >
        <SceneContent {...props} quality={quality} />
        <LODController onQuality={setQuality} />
      </Canvas>
    </div>
  )
}

function Network2DFallback({
  nodes,
  edges,
  focus,
  selectedId,
  onSelect,
  onHoverNode,
  theme,
}: Omit<NetworkThreeSceneProps, 'onCameraChange' | 'paths'>) {
  const svgRef = useRef<SVGSVGElement | null>(null)
  const containerRef = useRef<HTMLDivElement | null>(null)
  const [scale, setScale] = useState(1)
  const [translate, setTranslate] = useState({ x: 0, y: 0 })
  const [isDragging, setIsDragging] = useState(false)
  const dragStart = useRef({ x: 0, y: 0 })
  const translateStart = useRef({ x: 0, y: 0 })
  const [hoveredId, setHoveredId] = useState<string | null>(null)
  const [r, g, b] = SCENE_PALETTE[theme].clearColor

  const nodeById = useMemo(() => {
    const map = new Map<string, NetworkNode>()
    nodes.forEach((node) => map.set(node.id, node))
    return map
  }, [nodes])

  const edgeList = useMemo(() => {
    return edges
      .map((edge) => ({ edge, source: nodeById.get(edge.source), target: nodeById.get(edge.target) }))
      .filter((e): e is { edge: NetworkEdge; source: NetworkNode; target: NetworkNode } => Boolean(e.source && e.target))
  }, [edges, nodeById])

  const center = useMemo(() => {
    const x = nodes.reduce((sum, n) => sum + n.x, 0) / Math.max(nodes.length, 1)
    const y = nodes.reduce((sum, n) => sum + n.y, 0) / Math.max(nodes.length, 1)
    return { x, y }
  }, [nodes])

  useEffect(() => {
    setTranslate({ x: -center.x * scale, y: -center.y * scale })
  }, [center.x, center.y, scale])

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault()
    const next = Math.max(0.2, Math.min(4, scale * (1 - e.deltaY * 0.001)))
    setScale(next)
  }

  const handleMouseDown = (e: React.MouseEvent) => {
    setIsDragging(true)
    dragStart.current = { x: e.clientX, y: e.clientY }
    translateStart.current = { ...translate }
  }

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging) return
    const dx = (e.clientX - dragStart.current.x) / scale
    const dy = (e.clientY - dragStart.current.y) / scale
    setTranslate({ x: translateStart.current.x + dx, y: translateStart.current.y + dy })
  }

  const handleMouseUp = () => setIsDragging(false)
  const handleMouseLeave = () => setIsDragging(false)

  const handleNodeClick = (id: string) => () => onSelect(id)
  const handleNodeEnter = (id: string) => () => {
    setHoveredId(id)
    onHoverNode?.(id)
  }
  const handleNodeLeave = () => {
    setHoveredId(null)
    onHoverNode?.(null)
  }

  return (
    <div
      ref={containerRef}
      className={`network-three-scene-shell network-2d-fallback ${theme}`}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseLeave}
      onWheel={handleWheel}
      style={{
        width: '100%',
        height: '100%',
        minHeight: 460,
        background: `rgb(${r * 255}, ${g * 255}, ${b * 255})`,
        overflow: 'hidden',
        cursor: isDragging ? 'grabbing' : 'grab',
        touchAction: 'none',
      }}
    >
      <svg
        ref={svgRef}
        width="100%"
        height="100%"
        style={{ display: 'block' }}
        preserveAspectRatio="xMidYMid slice"
        viewBox={`0 0 ${containerRef.current?.clientWidth || 800} ${containerRef.current?.clientHeight || 460}`}
      >
        <g transform={`translate(${translate.x + (containerRef.current?.clientWidth || 800) / 2}, ${translate.y + (containerRef.current?.clientHeight || 460) / 2}) scale(${scale})`}>
          {edgeList.map(({ edge, source, target }) => {
            const [er, eg, eb] = getEdgeColor(edge.kind, theme)
            return (
              <line
                key={edge.id}
                x1={source.x}
                y1={source.y}
                x2={target.x}
                y2={target.y}
                stroke={`rgb(${er}, ${eg}, ${eb})`}
                strokeOpacity={0.4}
                strokeWidth={1 / scale}
              />
            )
          })}
          {nodes.map((node) => {
            const [nr, ng, nb] = getNodeColor(node.kind, theme, node.tier)
            const isSelected = node.id === selectedId
            const isHovered = node.id === hoveredId
            const radius = Math.max(2, Math.sqrt(node.size) * 0.35) * (isSelected ? 1.2 : isHovered ? 1.1 : 1)
            return (
              <g
                key={node.id}
                transform={`translate(${node.x}, ${node.y})`}
                onClick={handleNodeClick(node.id)}
                onMouseEnter={handleNodeEnter(node.id)}
                onMouseLeave={handleNodeLeave}
                style={{ cursor: 'pointer' }}
              >
                <circle r={radius} fill={`rgb(${nr}, ${ng}, ${nb})`} stroke="white" strokeWidth={isSelected ? 2 : 0.5} strokeOpacity={0.8} />
                {(isSelected || isHovered || node.kind === 'center') && (
                  <text y={radius + 10} textAnchor="middle" fill={`rgb(${nr}, ${ng}, ${nb})`} fontSize={10} fontWeight={600} style={{ pointerEvents: 'none' }}>
                    {node.label.length > 24 ? `${node.label.slice(0, 24)}…` : node.label}
                  </text>
                )}
              </g>
            )
          })}
        </g>
      </svg>
    </div>
  )
}

function isWebGLAvailable(): boolean {
  if (typeof document === 'undefined') return true
  try {
    const canvas = document.createElement('canvas')
    const gl = canvas.getContext('webgl2') || canvas.getContext('webgl')
    return !!gl
  } catch {
    return false
  }
}

function isLowEndDevice(): boolean {
  if (typeof navigator === 'undefined') return false
  const cores = navigator.hardwareConcurrency ?? 8
  const memory = (navigator as any).deviceMemory ?? 8
  const prefersReduced = typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
  return cores <= 4 || memory <= 4 || prefersReduced
}

function NetworkThreeScene(props: NetworkThreeSceneProps) {
  const [useFallback, setUseFallback] = useState(() => !isWebGLAvailable() || isLowEndDevice())

  useEffect(() => {
    setUseFallback(!isWebGLAvailable() || isLowEndDevice())
  }, [])

  if (useFallback) {
    return <Network2DFallback {...props} />
  }

  return <Network3DScene {...props} />
}

export default React.memo(NetworkThreeScene, (prev, next) => {
  return (
    prev.nodes === next.nodes &&
    prev.edges === next.edges &&
    prev.focus === next.focus &&
    prev.selectedId === next.selectedId &&
    prev.theme === next.theme
  )
})
