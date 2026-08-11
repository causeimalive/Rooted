import { useEffect, useMemo, useRef, useState } from 'react'

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
  score?: number
  tier?: 'strong' | 'medium' | 'soft'
  jumpVerseId?: string
  parentId?: string
}

type NetworkEdgeKind = 'spoke' | 'bridge' | 'theme'

type NetworkEdge = {
  id: string
  source: string
  target: string
  weight: number
  kind: NetworkEdgeKind
}

type FocusPoint = {
  x: number
  y: number
  z: number
}

type NetworkSceneProps = {
  nodes: NetworkNode[]
  edges: NetworkEdge[]
  focus: FocusPoint
  selectedId: string | null
  onSelect: (id: string) => void
  onHoverNode?: (id: string | null) => void
  onCameraChange?: (camera: { yaw: number; pitch: number; distance: number }) => void
  theme: 'dark' | 'light'
}

type RgbTuple = [number, number, number]

type ScenePalette = {
  clearColor: [number, number, number, number]
  fogColor: RgbTuple
  nodeColors: {
    center: RgbTuple
    theme: RgbTuple
    echo: RgbTuple
    ambient: RgbTuple
    book: RgbTuple
    chapter: RgbTuple
    strong: RgbTuple
    medium: RgbTuple
    soft: RgbTuple
  }
  edgeColors: {
    theme: RgbTuple
    bridge: RgbTuple
    spoke: RgbTuple
  }
}

export const SCENE_PALETTE: Record<'dark' | 'light', ScenePalette> = {
  dark: {
    clearColor: [0.089, 0.107, 0.13, 1],
    fogColor: [0.089, 0.107, 0.13],
    nodeColors: {
      center: [232, 198, 126],
      theme: [220, 193, 134],
      echo: [188, 172, 136],
      ambient: [170, 151, 110],
      book: [241, 212, 146],
      chapter: [199, 184, 126],
      strong: [220, 191, 127],
      medium: [195, 162, 101],
      soft: [167, 132, 74],
    },
    edgeColors: {
      theme: [210, 174, 108],
      bridge: [232, 204, 150],
      spoke: [158, 126, 74],
    },
  },
  light: {
    clearColor: [0.993, 0.973, 0.938, 1],
    fogColor: [0.993, 0.973, 0.938],
    nodeColors: {
      center: [72, 43, 8],
      theme: [78, 54, 18],
      echo: [58, 47, 28],
      ambient: [84, 63, 31],
      book: [94, 56, 10],
      chapter: [62, 46, 22],
      strong: [92, 65, 27],
      medium: [77, 56, 24],
      soft: [58, 41, 18],
    },
    edgeColors: {
      theme: [112, 78, 30],
      bridge: [144, 104, 46],
      spoke: [84, 62, 28],
    },
  },
}

type Vec3 = {
  x: number
  y: number
  z: number
}

type ProjectedNode = {
  node: NetworkNode
  world: Vec3
  screenX: number
  screenY: number
  depth: number
  size: number
  opacity: number
  softness: number
  visible: boolean
}

type CameraState = {
  yaw: number
  pitch: number
  distance: number
  target: Vec3
  goalYaw: number
  goalPitch: number
  goalDistance: number
  goalTarget: Vec3
}

type LabelState = {
  id: string
  left: number
  top: number
  opacity: number
  scale: number
  active: boolean
  label: string
  detail: string
  kind: NetworkKind
}

const CAMERA_DEFAULT = {
  yaw: 0.95,
  pitch: 0,
  distance: 3000,
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t
}

function hashString(input: string) {
  let hash = 0
  for (let i = 0; i < input.length; i += 1) {
    hash = (hash * 31 + input.charCodeAt(i)) % 3600
  }
  return hash
}

function add(a: Vec3, b: Vec3): Vec3 {
  return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z }
}

function subtract(a: Vec3, b: Vec3): Vec3 {
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z }
}

function scaleVec(a: Vec3, scalar: number): Vec3 {
  return { x: a.x * scalar, y: a.y * scalar, z: a.z * scalar }
}

function dot(a: Vec3, b: Vec3) {
  return a.x * b.x + a.y * b.y + a.z * b.z
}

function cross(a: Vec3, b: Vec3): Vec3 {
  return {
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x,
  }
}

function length(a: Vec3) {
  return Math.hypot(a.x, a.y, a.z)
}

function normalize(a: Vec3): Vec3 {
  const len = length(a) || 1
  return { x: a.x / len, y: a.y / len, z: a.z / len }
}

function mat4Identity() {
  return new Float32Array([
    1, 0, 0, 0,
    0, 1, 0, 0,
    0, 0, 1, 0,
    0, 0, 0, 1,
  ])
}

function mat4Multiply(a: Float32Array, b: Float32Array) {
  const out = new Float32Array(16)
  for (let row = 0; row < 4; row += 1) {
    for (let col = 0; col < 4; col += 1) {
      out[col * 4 + row] =
        a[0 * 4 + row] * b[col * 4 + 0] +
        a[1 * 4 + row] * b[col * 4 + 1] +
        a[2 * 4 + row] * b[col * 4 + 2] +
        a[3 * 4 + row] * b[col * 4 + 3]
    }
  }
  return out
}

function mat4Perspective(fovRadians: number, aspect: number, near: number, far: number) {
  const f = 1 / Math.tan(fovRadians / 2)
  const nf = 1 / (near - far)
  const out = mat4Identity()
  out[0] = f / aspect
  out[5] = f
  out[10] = (far + near) * nf
  out[11] = -1
  out[14] = 2 * far * near * nf
  out[15] = 0
  return out
}

function mat4LookAt(eye: Vec3, target: Vec3, up: Vec3) {
  const z = normalize(subtract(eye, target))
  const x = normalize(cross(up, z))
  const y = cross(z, x)
  const out = mat4Identity()
  out[0] = x.x
  out[4] = x.y
  out[8] = x.z
  out[1] = y.x
  out[5] = y.y
  out[9] = y.z
  out[2] = z.x
  out[6] = z.y
  out[10] = z.z
  out[12] = -dot(x, eye)
  out[13] = -dot(y, eye)
  out[14] = -dot(z, eye)
  return out
}

function transformPoint(matrix: Float32Array, point: Vec3) {
  const x = point.x
  const y = point.y
  const z = point.z
  const w = 1
  const nx = matrix[0] * x + matrix[4] * y + matrix[8] * z + matrix[12] * w
  const ny = matrix[1] * x + matrix[5] * y + matrix[9] * z + matrix[13] * w
  const nz = matrix[2] * x + matrix[6] * y + matrix[10] * z + matrix[14] * w
  const nw = matrix[3] * x + matrix[7] * y + matrix[11] * z + matrix[15] * w
  return { x: nx, y: ny, z: nz, w: nw }
}

function compileShader(gl: WebGLRenderingContext, type: number, source: string) {
  const shader = gl.createShader(type)
  if (!shader) throw new Error('Unable to create shader')
  gl.shaderSource(shader, source)
  gl.compileShader(shader)
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const message = gl.getShaderInfoLog(shader) ?? 'Unknown shader compile error'
    gl.deleteShader(shader)
    throw new Error(message)
  }
  return shader
}

function createProgram(gl: WebGLRenderingContext, vertexSource: string, fragmentSource: string) {
  const program = gl.createProgram()
  if (!program) throw new Error('Unable to create program')
  const vertexShader = compileShader(gl, gl.VERTEX_SHADER, vertexSource)
  const fragmentShader = compileShader(gl, gl.FRAGMENT_SHADER, fragmentSource)
  gl.attachShader(program, vertexShader)
  gl.attachShader(program, fragmentShader)
  gl.linkProgram(program)
  gl.deleteShader(vertexShader)
  gl.deleteShader(fragmentShader)
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const message = gl.getProgramInfoLog(program) ?? 'Unknown program link error'
    gl.deleteProgram(program)
    throw new Error(message)
  }
  return program
}

function nodeColor(node: NetworkNode, palette: ScenePalette): RgbTuple {
  const colors = palette.nodeColors
  if (node.kind === 'center') return colors.center
  if (node.kind === 'theme') return colors.theme
  if (node.kind === 'echo') return colors.echo
  if (node.kind === 'ambient') return colors.ambient
  if (node.kind === 'book') return colors.book
  if (node.kind === 'chapter') return colors.chapter
  return node.tier === 'strong' ? colors.strong : node.tier === 'medium' ? colors.medium : colors.soft
}

function nodeOpacity(node: NetworkNode) {
  if (node.kind === 'center') return 1
  if (node.kind === 'theme') return 0.94
  if (node.kind === 'echo') return 0.62
  if (node.kind === 'ambient') return 0.55
  if (node.kind === 'book') return 0.98
  if (node.kind === 'chapter') return 0.85
  return node.tier === 'strong' ? 0.98 : node.tier === 'medium' ? 0.9 : 0.82
}

function nodeBaseSize(node: NetworkNode) {
  if (node.kind === 'center') return 62
  if (node.kind === 'theme') return 36
  if (node.kind === 'echo') return 19
  if (node.kind === 'ambient') return 12
  if (node.kind === 'book') return 52
  if (node.kind === 'chapter') return 25
  return node.tier === 'strong' ? 38 : node.tier === 'medium' ? 32 : 27
}

function nodeTargetDistance(node?: NetworkNode) {
  if (!node) return 760
  if (node.kind === 'center') return 500
  if (node.kind === 'theme') return 420
  if (node.kind === 'echo') return 360
  if (node.kind === 'ambient') return 420
  if (node.kind === 'book') return 500
  if (node.kind === 'chapter') return 340
  return node.tier === 'strong' ? 430 : node.tier === 'medium' ? 480 : 540
}

function smoothstep(edge0: number, edge1: number, x: number) {
  const t = clamp((x - edge0) / (edge1 - edge0), 0, 1)
  return t * t * (3 - 2 * t)
}

const LOD_THRESHOLDS = {
  bookFadeStart: 620,
  bookFadeEnd: 820,
  chapterFadeInStart: 260,
  chapterFadeInEnd: 400,
  chapterFadeOutStart: 660,
  chapterFadeOutEnd: 820,
  verseFadeStart: 300,
  verseFadeEnd: 440,
}

function tierVisibility(kind: NetworkKind, cameraDistance: number) {
  if (kind === 'book') {
    return smoothstep(LOD_THRESHOLDS.bookFadeStart, LOD_THRESHOLDS.bookFadeEnd, cameraDistance)
  }
  if (kind === 'chapter') {
    const fadeIn = smoothstep(LOD_THRESHOLDS.chapterFadeInStart, LOD_THRESHOLDS.chapterFadeInEnd, cameraDistance)
    const fadeOut = 1 - smoothstep(LOD_THRESHOLDS.chapterFadeOutStart, LOD_THRESHOLDS.chapterFadeOutEnd, cameraDistance)
    return Math.min(fadeIn, fadeOut)
  }
  if (kind === 'ambient') {
    return 1 - smoothstep(LOD_THRESHOLDS.verseFadeStart, LOD_THRESHOLDS.verseFadeEnd, cameraDistance)
  }
  return 1
}

function makeWorldPosition(node: NetworkNode, focus: FocusPoint): Vec3 {
  if (node.kind === 'ambient' || node.kind === 'book' || node.kind === 'chapter') {
    return { x: node.x, y: node.y, z: node.z }
  }

  const dx = node.x - focus.x
  const dy = focus.y - node.y
  const dz = node.z - focus.z
  const seed = (hashString(node.id) / 3600) * Math.PI * 2
  const shell = node.kind === 'center' ? 0 : node.kind === 'related' ? 72 : node.kind === 'theme' ? 116 : 154
  const lift = node.kind === 'center' ? 0 : node.kind === 'related' ? 36 : node.kind === 'theme' ? 72 : 112
  const tierPush = node.tier === 'strong' ? -8 : node.tier === 'soft' ? 12 : 0
  return {
    x: dx * 7.2 + Math.cos(seed) * shell * 0.42,
    y: dy * 5.8 + Math.sin(seed * 1.25) * shell * 0.24,
    z: dz * 8.5 + lift + tierPush,
  }
}

function pointInViewport(x: number, y: number, width: number, height: number) {
  return x >= 0 && x <= width && y >= 0 && y <= height
}

export default function NetworkScene({
  nodes,
  edges,
  focus,
  selectedId,
  onSelect,
  onHoverNode,
  onCameraChange,
  theme,
}: NetworkSceneProps) {
  const palette = SCENE_PALETTE[theme]
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const wrapperRef = useRef<HTMLDivElement | null>(null)
  const glRef = useRef<WebGLRenderingContext | null>(null)
  const cameraRef = useRef<CameraState>({
    yaw: CAMERA_DEFAULT.yaw,
    pitch: CAMERA_DEFAULT.pitch,
    distance: CAMERA_DEFAULT.distance,
    target: { x: 0, y: 0, z: 0 },
    goalYaw: CAMERA_DEFAULT.yaw,
    goalPitch: CAMERA_DEFAULT.pitch,
    goalDistance: selectedId ? 600 : CAMERA_DEFAULT.distance,
    goalTarget: { x: 0, y: 0, z: 0 },
  })
  const worldNodes = useMemo(
    () => nodes.map((node) => ({ node, world: makeWorldPosition(node, focus) })),
    [focus, nodes],
  )
  const selectedNode = useMemo(
    () => (selectedId ? worldNodes.find((entry) => entry.node.id === selectedId)?.node : undefined),
    [selectedId, worldNodes],
  )
  const worldNodeMap = useMemo(() => new Map(worldNodes.map((entry) => [entry.node.id, entry.world])), [worldNodes])
  const focusWorld = useMemo(() => {
    if (selectedId) {
      const selectedWorld = worldNodes.find((entry) => entry.node.id === selectedId)?.world
      if (selectedWorld) return selectedWorld
    }

    if (!worldNodes.length) {
      return { x: 0, y: 0, z: 0 }
    }

    const totals = worldNodes.reduce(
      (acc, entry) => ({
        x: acc.x + entry.world.x,
        y: acc.y + entry.world.y,
        z: acc.z + entry.world.z,
      }),
      { x: 0, y: 0, z: 0 },
    )

    return {
      x: totals.x / worldNodes.length,
      y: totals.y / worldNodes.length,
      z: totals.z / worldNodes.length,
    }
  }, [selectedId, worldNodes])
  const worldEdges = useMemo(
    () => edges
      .map((edge) => {
        const source = worldNodeMap.get(edge.source)
        const target = worldNodeMap.get(edge.target)
        if (!source || !target) return null
        return { edge, source, target }
      })
      .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry)),
    [edges, worldNodeMap],
  )
  const [labels, setLabels] = useState<LabelState[]>([])
  const projectedRef = useRef<ProjectedNode[]>([])
  const hoverIdRef = useRef<string | null>(null)
  const dragRef = useRef<{
    active: boolean
    mode: 'orbit' | 'pan' | 'pinch'
    pointerId: number | null
    startX: number
    startY: number
    startDistance: number
    startAngle: number
    startCamera: CameraState
    lastTapNodeId: string | null
    moved: boolean
    pinchPointers: Map<number, { x: number; y: number }>
  }>({
    active: false,
    mode: 'orbit',
    pointerId: null,
    startX: 0,
    startY: 0,
    startDistance: 0,
    startAngle: 0,
    startCamera: cameraRef.current,
    lastTapNodeId: null,
    moved: false,
    pinchPointers: new Map(),
  })

  useEffect(() => {
    const camera = cameraRef.current
    camera.goalTarget = focusWorld
    camera.goalDistance = nodeTargetDistance(selectedNode)
    if (!selectedId) {
      camera.goalYaw = CAMERA_DEFAULT.yaw
      camera.goalPitch = CAMERA_DEFAULT.pitch
    }
  }, [focusWorld, selectedId, selectedNode])

  useEffect(() => {
    const canvas = canvasRef.current
    const wrapper = wrapperRef.current
    if (!canvas || !wrapper) return

    const gl = canvas.getContext('webgl', { antialias: true, alpha: true })
    if (!gl) return
    glRef.current = gl

    const nodeProgram = createProgram(
      gl,
      `
        attribute vec3 a_position;
        attribute vec3 a_color;
        attribute float a_size;
        attribute float a_opacity;
        attribute float a_softness;
        attribute float a_isCenter;
        uniform mat4 u_viewProj;
        uniform vec3 u_cameraPos;
        uniform float u_pointMultiplier;
        uniform float u_fogNear;
        uniform float u_fogFar;
        uniform float u_time;
        varying vec3 v_color;
        varying float v_opacity;
        varying float v_fog;
        varying float v_softness;
        varying float v_isCenter;
        varying float v_pulse;
        void main() {
          vec4 worldPos = vec4(a_position, 1.0);
          vec4 clip = u_viewProj * worldPos;
          gl_Position = clip;
          float dist = distance(u_cameraPos, a_position);
          float pulse = 0.5 + 0.5 * sin(u_time * 2.4);
          float pulseSize = a_size + a_isCenter * pulse * 16.0;
          gl_PointSize = clamp(pulseSize * u_pointMultiplier / max(dist, 1.0), 8.0, 130.0);
          v_color = a_color / 255.0;
          v_opacity = a_opacity;
          v_fog = clamp((dist - u_fogNear) / max(u_fogFar - u_fogNear, 1.0), 0.0, 1.0);
          v_softness = a_softness;
          v_isCenter = a_isCenter;
          v_pulse = pulse;
        }
      `,
      `
        precision mediump float;
        varying vec3 v_color;
        varying float v_opacity;
        varying float v_fog;
        varying float v_softness;
        varying float v_isCenter;
        varying float v_pulse;
        uniform vec3 u_fogColor;
        void main() {
          vec2 uv = gl_PointCoord * 2.0 - 1.0;
          float r = dot(uv, uv);
          float falloff = mix(24.0, 6.0, clamp(v_softness, 0.0, 1.0));
          float glowFalloff = mix(8.0, 2.8, clamp(v_softness, 0.0, 1.0));
          float core = exp(-r * falloff);
          float glow = exp(-r * glowFalloff);
          float haloFalloff = mix(4.0, 1.1, clamp(v_softness, 0.0, 1.0));
          float halo = exp(-r * haloFalloff) * v_isCenter * (0.35 + 0.45 * v_pulse);
          float alpha = clamp(core * 0.7 + glow * 0.3 + halo, 0.0, 1.0);
          vec3 color = mix(v_color, u_fogColor, v_fog * 0.72);
          color = mix(color, vec3(1.0, 0.96, 0.82), v_isCenter * v_pulse * 0.3);
          gl_FragColor = vec4(color, alpha * v_opacity * (1.0 - v_fog * 0.38));
        }
      `,
    )

    const lineProgram = createProgram(
      gl,
      `
        attribute vec3 a_position;
        attribute vec3 a_color;
        attribute float a_opacity;
        uniform mat4 u_viewProj;
        uniform vec3 u_cameraPos;
        uniform float u_fogNear;
        uniform float u_fogFar;
        varying vec3 v_color;
        varying float v_opacity;
        varying float v_fog;
        void main() {
          gl_Position = u_viewProj * vec4(a_position, 1.0);
          float dist = distance(u_cameraPos, a_position);
          v_color = a_color / 255.0;
          v_opacity = a_opacity;
          v_fog = clamp((dist - u_fogNear) / max(u_fogFar - u_fogNear, 1.0), 0.0, 1.0);
        }
      `,
      `
        precision mediump float;
        varying vec3 v_color;
        varying float v_opacity;
        varying float v_fog;
        uniform vec3 u_fogColor;
        void main() {
          vec3 color = mix(v_color, u_fogColor, v_fog * 0.8);
          gl_FragColor = vec4(color, v_opacity * (1.0 - v_fog * 0.55));
        }
      `,
    )

    const nodeBufferPosition = gl.createBuffer()
    const nodeBufferColor = gl.createBuffer()
    const nodeBufferSize = gl.createBuffer()
    const nodeBufferOpacity = gl.createBuffer()
    const nodeBufferSoftness = gl.createBuffer()
    const nodeBufferIsCenter = gl.createBuffer()
    const lineBufferPosition = gl.createBuffer()
    const lineBufferColor = gl.createBuffer()
    const lineBufferOpacity = gl.createBuffer()

    if (!nodeBufferPosition || !nodeBufferColor || !nodeBufferSize || !nodeBufferOpacity || !nodeBufferSoftness || !nodeBufferIsCenter || !lineBufferPosition || !lineBufferColor || !lineBufferOpacity) {
      return
    }

    const nodeAttribs = {
      position: gl.getAttribLocation(nodeProgram, 'a_position'),
      color: gl.getAttribLocation(nodeProgram, 'a_color'),
      size: gl.getAttribLocation(nodeProgram, 'a_size'),
      opacity: gl.getAttribLocation(nodeProgram, 'a_opacity'),
      softness: gl.getAttribLocation(nodeProgram, 'a_softness'),
      isCenter: gl.getAttribLocation(nodeProgram, 'a_isCenter'),
    }
    const nodeUniforms = {
      viewProj: gl.getUniformLocation(nodeProgram, 'u_viewProj'),
      cameraPos: gl.getUniformLocation(nodeProgram, 'u_cameraPos'),
      multiplier: gl.getUniformLocation(nodeProgram, 'u_pointMultiplier'),
      fogNear: gl.getUniformLocation(nodeProgram, 'u_fogNear'),
      fogFar: gl.getUniformLocation(nodeProgram, 'u_fogFar'),
      fogColor: gl.getUniformLocation(nodeProgram, 'u_fogColor'),
      time: gl.getUniformLocation(nodeProgram, 'u_time'),
    }

    const lineAttribs = {
      position: gl.getAttribLocation(lineProgram, 'a_position'),
      color: gl.getAttribLocation(lineProgram, 'a_color'),
      opacity: gl.getAttribLocation(lineProgram, 'a_opacity'),
    }
    const lineUniforms = {
      viewProj: gl.getUniformLocation(lineProgram, 'u_viewProj'),
      cameraPos: gl.getUniformLocation(lineProgram, 'u_cameraPos'),
      fogNear: gl.getUniformLocation(lineProgram, 'u_fogNear'),
      fogFar: gl.getUniformLocation(lineProgram, 'u_fogFar'),
      fogColor: gl.getUniformLocation(lineProgram, 'u_fogColor'),
    }

    gl.enable(gl.BLEND)
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA)
    gl.enable(gl.DEPTH_TEST)
    gl.depthFunc(gl.LEQUAL)

    const resize = () => {
      const rect = wrapper.getBoundingClientRect()
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      canvas.width = Math.max(1, Math.floor(rect.width * dpr))
      canvas.height = Math.max(1, Math.floor(rect.height * dpr))
      gl.viewport(0, 0, canvas.width, canvas.height)
    }

    const resizeObserver = new ResizeObserver(resize)
    resizeObserver.observe(wrapper)
    resize()

    const nodePositions = new Float32Array(worldNodes.length * 3)
    const nodeColors = new Float32Array(worldNodes.length * 3)
    const nodeSizes = new Float32Array(worldNodes.length)
    const nodeOpacities = new Float32Array(worldNodes.length)
    const nodeSoftness = new Float32Array(worldNodes.length)
    const nodeIsCenter = new Float32Array(worldNodes.length)
    const linePositions = new Float32Array(worldEdges.length * 2 * 3)
    const lineColors = new Float32Array(worldEdges.length * 2 * 3)
    const lineOpacities = new Float32Array(worldEdges.length * 2)

    let animationFrame = 0
    const render = (timestampMs: number = 0) => {
      resize()
      const width = canvas.width
      const height = canvas.height
      const aspect = width / Math.max(height, 1)
      const camera = cameraRef.current
      camera.yaw += (camera.goalYaw - camera.yaw) * 0.08
      camera.pitch += (camera.goalPitch - camera.pitch) * 0.08
      camera.distance += (camera.goalDistance - camera.distance) * 0.09
      camera.target.x += (camera.goalTarget.x - camera.target.x) * 0.08
      camera.target.y += (camera.goalTarget.y - camera.target.y) * 0.08
      camera.target.z += (camera.goalTarget.z - camera.target.z) * 0.08
      camera.pitch = clamp(camera.pitch, -1.2, 1.1)
      camera.distance = clamp(camera.distance, 240, 5000)

      onCameraChange?.({ yaw: camera.yaw, pitch: camera.pitch, distance: camera.distance })

      const eye = {
        x: camera.target.x + Math.cos(camera.pitch) * Math.sin(camera.yaw) * camera.distance,
        y: camera.target.y + Math.sin(camera.pitch) * camera.distance,
        z: camera.target.z + Math.cos(camera.pitch) * Math.cos(camera.yaw) * camera.distance,
      }

      const view = mat4LookAt(eye, camera.target, { x: 0, y: 1, z: 0 })
      const projection = mat4Perspective(Math.PI / 3.2, aspect, 10, 12000)
      const viewProj = mat4Multiply(projection, view)

      gl.clearColor(palette.clearColor[0], palette.clearColor[1], palette.clearColor[2], palette.clearColor[3])
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT)

      const projectedNodes: ProjectedNode[] = []
      for (let i = 0; i < worldNodes.length; i += 1) {
        const entry = worldNodes[i]
        const node = entry.node
        const world = entry.world
        const clip = transformPoint(viewProj, world)
        const ndcW = clip.w || 1
        const ndcX = clip.x / ndcW
        const ndcY = clip.y / ndcW
        const ndcZ = clip.z / ndcW
        const screenX = ((ndcX + 1) / 2) * width
        const screenY = ((1 - ndcY) / 2) * height
        const visible = clip.w > 0 && pointInViewport(screenX, screenY, width, height)
        const depth = clamp((ndcZ + 1) / 2, 0, 1)
        const focusDistance = length(subtract(world, camera.target))
        const tierVis = tierVisibility(node.kind, camera.distance)
        const size = nodeBaseSize(node) * clamp(1.15 - focusDistance / 1800, 0.58, 1.18) * (0.08 + 0.92 * tierVis)
        const opacity = nodeOpacity(node) * clamp(1.05 - focusDistance / 2200, 0.4, 1) * tierVis
        const softness = clamp(focusDistance / 650, 0, 1)
        projectedNodes.push({ node, world, screenX, screenY, depth, size, opacity, softness, visible })

        nodePositions[i * 3 + 0] = world.x
        nodePositions[i * 3 + 1] = world.y
        nodePositions[i * 3 + 2] = world.z
        const color = nodeColor(node, palette)
        nodeColors[i * 3 + 0] = color[0]
        nodeColors[i * 3 + 1] = color[1]
        nodeColors[i * 3 + 2] = color[2]
        nodeSizes[i] = size
        nodeOpacities[i] = opacity * (1 - depth * 0.2)
        nodeSoftness[i] = softness
        nodeIsCenter[i] = node.kind === 'center' ? 1 : 0
      }

      for (let i = 0; i < worldEdges.length; i += 1) {
        const entry = worldEdges[i]
        const weight = clamp(entry.edge.weight / 40, 0.5, 1)
        const src = entry.source
        const dst = entry.target
        const edgeColor: RgbTuple = entry.edge.kind === 'theme'
          ? palette.edgeColors.theme
          : entry.edge.kind === 'bridge'
            ? palette.edgeColors.bridge
            : palette.edgeColors.spoke
        linePositions[i * 6 + 0] = src.x
        linePositions[i * 6 + 1] = src.y
        linePositions[i * 6 + 2] = src.z
        linePositions[i * 6 + 3] = dst.x
        linePositions[i * 6 + 4] = dst.y
        linePositions[i * 6 + 5] = dst.z
        lineColors[i * 6 + 0] = edgeColor[0]
        lineColors[i * 6 + 1] = edgeColor[1]
        lineColors[i * 6 + 2] = edgeColor[2]
        lineColors[i * 6 + 3] = edgeColor[0]
        lineColors[i * 6 + 4] = edgeColor[1]
        lineColors[i * 6 + 5] = edgeColor[2]
        lineOpacities[i * 2 + 0] = weight
        lineOpacities[i * 2 + 1] = weight
      }

      projectedRef.current = projectedNodes
      const nextLabels: LabelState[] = projectedNodes
        .filter((item) => {
          const isPriority = item.node.id === selectedId || item.node.id === hoverIdRef.current || item.node.kind === 'center'
          if (isPriority) return true
          if (item.opacity < 0.12) return false
          if (item.node.kind === 'ambient') return false
          return item.visible
        })
        .map((item) => ({
          id: item.node.id,
          left: item.screenX,
          top: item.screenY,
          opacity: clamp(item.opacity, 0.22, 1),
          scale: clamp(1.18 - item.depth * 0.45, 0.62, 1.12),
          active: item.node.id === selectedId || item.node.id === hoverIdRef.current || item.node.kind === 'center',
          label: item.node.label,
          detail: item.node.detail,
          kind: item.node.kind,
        }))
      setLabels(nextLabels)

      gl.useProgram(lineProgram)
      gl.bindBuffer(gl.ARRAY_BUFFER, lineBufferPosition)
      gl.bufferData(gl.ARRAY_BUFFER, linePositions, gl.DYNAMIC_DRAW)
      gl.enableVertexAttribArray(lineAttribs.position)
      gl.vertexAttribPointer(lineAttribs.position, 3, gl.FLOAT, false, 0, 0)
      gl.bindBuffer(gl.ARRAY_BUFFER, lineBufferColor)
      gl.bufferData(gl.ARRAY_BUFFER, lineColors, gl.DYNAMIC_DRAW)
      gl.enableVertexAttribArray(lineAttribs.color)
      gl.vertexAttribPointer(lineAttribs.color, 3, gl.FLOAT, false, 0, 0)
      gl.bindBuffer(gl.ARRAY_BUFFER, lineBufferOpacity)
      gl.bufferData(gl.ARRAY_BUFFER, lineOpacities, gl.DYNAMIC_DRAW)
      gl.enableVertexAttribArray(lineAttribs.opacity)
      gl.vertexAttribPointer(lineAttribs.opacity, 1, gl.FLOAT, false, 0, 0)
      if (lineUniforms.viewProj) gl.uniformMatrix4fv(lineUniforms.viewProj, false, viewProj)
      if (lineUniforms.cameraPos) gl.uniform3f(lineUniforms.cameraPos, eye.x, eye.y, eye.z)
      if (lineUniforms.fogNear) gl.uniform1f(lineUniforms.fogNear, 260)
      if (lineUniforms.fogFar) gl.uniform1f(lineUniforms.fogFar, 9000)
      if (lineUniforms.fogColor) gl.uniform3f(lineUniforms.fogColor, palette.fogColor[0], palette.fogColor[1], palette.fogColor[2])
      gl.drawArrays(gl.LINES, 0, worldEdges.length * 2)

      gl.useProgram(nodeProgram)
      gl.bindBuffer(gl.ARRAY_BUFFER, nodeBufferPosition)
      gl.bufferData(gl.ARRAY_BUFFER, nodePositions, gl.DYNAMIC_DRAW)
      gl.enableVertexAttribArray(nodeAttribs.position)
      gl.vertexAttribPointer(nodeAttribs.position, 3, gl.FLOAT, false, 0, 0)
      gl.bindBuffer(gl.ARRAY_BUFFER, nodeBufferColor)
      gl.bufferData(gl.ARRAY_BUFFER, nodeColors, gl.DYNAMIC_DRAW)
      gl.enableVertexAttribArray(nodeAttribs.color)
      gl.vertexAttribPointer(nodeAttribs.color, 3, gl.FLOAT, false, 0, 0)
      gl.bindBuffer(gl.ARRAY_BUFFER, nodeBufferSize)
      gl.bufferData(gl.ARRAY_BUFFER, nodeSizes, gl.DYNAMIC_DRAW)
      gl.enableVertexAttribArray(nodeAttribs.size)
      gl.vertexAttribPointer(nodeAttribs.size, 1, gl.FLOAT, false, 0, 0)
      gl.bindBuffer(gl.ARRAY_BUFFER, nodeBufferOpacity)
      gl.bufferData(gl.ARRAY_BUFFER, nodeOpacities, gl.DYNAMIC_DRAW)
      gl.enableVertexAttribArray(nodeAttribs.opacity)
      gl.vertexAttribPointer(nodeAttribs.opacity, 1, gl.FLOAT, false, 0, 0)
      gl.bindBuffer(gl.ARRAY_BUFFER, nodeBufferSoftness)
      gl.bufferData(gl.ARRAY_BUFFER, nodeSoftness, gl.DYNAMIC_DRAW)
      gl.enableVertexAttribArray(nodeAttribs.softness)
      gl.vertexAttribPointer(nodeAttribs.softness, 1, gl.FLOAT, false, 0, 0)
      gl.bindBuffer(gl.ARRAY_BUFFER, nodeBufferIsCenter)
      gl.bufferData(gl.ARRAY_BUFFER, nodeIsCenter, gl.DYNAMIC_DRAW)
      gl.enableVertexAttribArray(nodeAttribs.isCenter)
      gl.vertexAttribPointer(nodeAttribs.isCenter, 1, gl.FLOAT, false, 0, 0)
      if (nodeUniforms.viewProj) gl.uniformMatrix4fv(nodeUniforms.viewProj, false, viewProj)
      if (nodeUniforms.cameraPos) gl.uniform3f(nodeUniforms.cameraPos, eye.x, eye.y, eye.z)
      if (nodeUniforms.multiplier) gl.uniform1f(nodeUniforms.multiplier, 2.05)
      if (nodeUniforms.fogNear) gl.uniform1f(nodeUniforms.fogNear, 260)
      if (nodeUniforms.fogFar) gl.uniform1f(nodeUniforms.fogFar, 9000)
      if (nodeUniforms.fogColor) gl.uniform3f(nodeUniforms.fogColor, palette.fogColor[0], palette.fogColor[1], palette.fogColor[2])
      if (nodeUniforms.time) gl.uniform1f(nodeUniforms.time, timestampMs / 1000)
      gl.drawArrays(gl.POINTS, 0, worldNodes.length)

      animationFrame = window.requestAnimationFrame(render)
    }

    animationFrame = window.requestAnimationFrame(render)

    return () => {
      window.cancelAnimationFrame(animationFrame)
      resizeObserver.disconnect()
      gl.deleteProgram(nodeProgram)
      gl.deleteProgram(lineProgram)
      gl.deleteBuffer(nodeBufferPosition)
      gl.deleteBuffer(nodeBufferColor)
      gl.deleteBuffer(nodeBufferSize)
      gl.deleteBuffer(nodeBufferOpacity)
      gl.deleteBuffer(nodeBufferSoftness)
      gl.deleteBuffer(nodeBufferIsCenter)
      gl.deleteBuffer(lineBufferPosition)
      gl.deleteBuffer(lineBufferColor)
      gl.deleteBuffer(lineBufferOpacity)
    }
  }, [focus, selectedId, selectedNode, focusWorld, worldEdges, worldNodes, palette])

  useEffect(() => {
    onHoverNode?.(hoverIdRef.current)
  }, [onHoverNode])

  useEffect(() => {
    if (selectedId && hoverIdRef.current !== selectedId) {
      onHoverNode?.(selectedId)
    }
  }, [onHoverNode, selectedId])

  const getHitNode = (clientX: number, clientY: number) => {
    const canvas = canvasRef.current
    if (!canvas) return null
    const rect = canvas.getBoundingClientRect()
    const x = clientX - rect.left
    const y = clientY - rect.top
    let best: ProjectedNode | null = null
    let bestDistance = Number.POSITIVE_INFINITY
    for (const item of projectedRef.current) {
      if (!item.visible || item.opacity < 0.12) continue
      const dx = item.screenX - x
      const dy = item.screenY - y
      const distance = Math.hypot(dx, dy)
      const radius = Math.max(18, item.size * 0.45)
      if (distance <= radius && distance < bestDistance) {
        best = item
        bestDistance = distance
      }
    }
    return best?.node ?? null
  }

  const updateHover = (clientX: number, clientY: number) => {
    const hit = getHitNode(clientX, clientY)
    const next = hit?.id ?? null
    if (next !== hoverIdRef.current) {
      hoverIdRef.current = next
      onHoverNode?.(next)
    }
  }

  const handlePointerDown = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current
    if (!canvas) return
    canvas.setPointerCapture(event.pointerId)
    dragRef.current.active = true
    dragRef.current.pointerId = event.pointerId
    dragRef.current.startX = event.clientX
    dragRef.current.startY = event.clientY
    dragRef.current.startCamera = {
      ...cameraRef.current,
      target: { ...cameraRef.current.target },
      goalTarget: { ...cameraRef.current.goalTarget },
    }
    dragRef.current.moved = false
    dragRef.current.startDistance = 0
    dragRef.current.startAngle = 0
    dragRef.current.lastTapNodeId = getHitNode(event.clientX, event.clientY)?.id ?? null
    dragRef.current.mode = event.button === 1 || event.altKey || event.shiftKey || event.ctrlKey || event.metaKey ? 'pan' : 'orbit'
  }

  const handlePointerMove = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (dragRef.current.active) {
      const dx = event.clientX - dragRef.current.startX
      const dy = event.clientY - dragRef.current.startY
      if (Math.hypot(dx, dy) > 3) {
        dragRef.current.moved = true
      }
      const camera = cameraRef.current
      if (dragRef.current.mode === 'orbit') {
        camera.goalYaw = dragRef.current.startCamera.goalYaw + dx * 0.0065
        camera.goalPitch = clamp(dragRef.current.startCamera.goalPitch - dy * 0.006, -1.1, 1.1)
      } else {
        const rect = canvasRef.current?.getBoundingClientRect()
        const aspect = rect ? rect.width / Math.max(rect.height, 1) : 1
        const eye = {
          x: camera.target.x + Math.cos(camera.pitch) * Math.sin(camera.yaw) * camera.distance,
          y: camera.target.y + Math.sin(camera.pitch) * camera.distance,
          z: camera.target.z + Math.cos(camera.pitch) * Math.cos(camera.yaw) * camera.distance,
        }
        const forward = normalize(subtract(camera.target, eye))
        const right = normalize(cross(forward, { x: 0, y: 1, z: 0 }))
        const up = normalize(cross(right, forward))
        const panScale = camera.distance / (720 * aspect)
        const delta = add(scaleVec(right, -dx * panScale), scaleVec(up, dy * panScale))
        camera.goalTarget = add(dragRef.current.startCamera.goalTarget, delta)
      }
    } else {
      updateHover(event.clientX, event.clientY)
    }
  }

  const handlePointerUp = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current
    if (canvas && canvas.hasPointerCapture(event.pointerId)) {
      canvas.releasePointerCapture(event.pointerId)
    }
    const hit = getHitNode(event.clientX, event.clientY)
    const wasTap = dragRef.current.active && !dragRef.current.moved
    dragRef.current.active = false
    dragRef.current.pointerId = null
    if (wasTap && hit) {
      onSelect(hit.id)
      hoverIdRef.current = hit.id
      onHoverNode?.(hit.id)
      const hitWorld = projectedRef.current.find((item) => item.node.id === hit.id)
      if (hitWorld) {
        const camera = cameraRef.current
        camera.goalTarget = hitWorld.world
        camera.goalDistance = nodeTargetDistance(hit)
        camera.goalYaw += (hashString(hit.id) - 1800) * 0.00003
        camera.goalPitch = clamp(camera.goalPitch + ((hitWorld.world.y - camera.target.y) / 900), -1.1, 1.1)
      }
    }
  }

  const handleWheel = (event: React.WheelEvent<HTMLCanvasElement>) => {
    event.preventDefault()
    const camera = cameraRef.current
    const factor = Math.exp(event.deltaY * 0.0012)
    camera.goalDistance = clamp(camera.goalDistance * factor, 240, 5000)
  }

  const handleKeyDown = (event: React.KeyboardEvent<HTMLCanvasElement>) => {
    const camera = cameraRef.current

    // Ctrl (or Cmd on Mac) + arrow keys pan the camera target instead of
    // orbiting, mirroring the Shift/Ctrl+drag pan gesture.
    if (event.ctrlKey || event.metaKey) {
      const eye = {
        x: camera.target.x + Math.cos(camera.pitch) * Math.sin(camera.yaw) * camera.distance,
        y: camera.target.y + Math.sin(camera.pitch) * camera.distance,
        z: camera.target.z + Math.cos(camera.pitch) * Math.cos(camera.yaw) * camera.distance,
      }
      const forward = normalize(subtract(camera.target, eye))
      const right = normalize(cross(forward, { x: 0, y: 1, z: 0 }))
      const up = normalize(cross(right, forward))
      const panStep = camera.distance * 0.08
      switch (event.key) {
        case 'ArrowLeft':
          camera.goalTarget = add(camera.goalTarget, scaleVec(right, -panStep))
          event.preventDefault()
          return
        case 'ArrowRight':
          camera.goalTarget = add(camera.goalTarget, scaleVec(right, panStep))
          event.preventDefault()
          return
        case 'ArrowUp':
          camera.goalTarget = add(camera.goalTarget, scaleVec(up, panStep))
          event.preventDefault()
          return
        case 'ArrowDown':
          camera.goalTarget = add(camera.goalTarget, scaleVec(up, -panStep))
          event.preventDefault()
          return
        default:
          break
      }
    }

    switch (event.key) {
      case 'ArrowLeft':
        camera.goalYaw -= 0.12
        event.preventDefault()
        break
      case 'ArrowRight':
        camera.goalYaw += 0.12
        event.preventDefault()
        break
      case 'ArrowUp':
        camera.goalPitch = clamp(camera.goalPitch + 0.1, -1.1, 1.1)
        event.preventDefault()
        break
      case 'ArrowDown':
        camera.goalPitch = clamp(camera.goalPitch - 0.1, -1.1, 1.1)
        event.preventDefault()
        break
      case '+':
      case '=':
        camera.goalDistance = clamp(camera.goalDistance * 0.9, 240, 5000)
        event.preventDefault()
        break
      case '-':
      case '_':
        camera.goalDistance = clamp(camera.goalDistance * 1.1, 240, 5000)
        event.preventDefault()
        break
      case 'Home':
        camera.goalYaw = CAMERA_DEFAULT.yaw
        camera.goalPitch = CAMERA_DEFAULT.pitch
        camera.goalDistance = selectedId ? 600 : CAMERA_DEFAULT.distance
        camera.goalTarget = { x: 0, y: 0, z: 0 }
        event.preventDefault()
        break
      case 'Enter': {
        const next = hoverIdRef.current
        if (next) {
          onSelect(next)
          const hitWorld = projectedRef.current.find((item) => item.node.id === next)
          if (hitWorld) {
            const camera = cameraRef.current
            camera.goalTarget = hitWorld.world
            camera.goalDistance = nodeTargetDistance(hitWorld.node)
          }
          event.preventDefault()
        }
        break
      }
      default:
        break
    }
  }

  return (
    <div className={`network-scene-shell ${theme}`} ref={wrapperRef}>
      <canvas
        ref={canvasRef}
        className="network-scene-canvas"
        role="img"
        aria-label="Interactive three-dimensional network map"
        tabIndex={0}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onPointerLeave={() => {
          if (!dragRef.current.active) {
            hoverIdRef.current = null
            onHoverNode?.(null)
          }
        }}
        onWheel={handleWheel}
        onKeyDown={handleKeyDown}
      />
      <div className="network-scene-overlay" aria-hidden="true">
        {labels.map((label) => (
          <div
            key={label.id}
            className={`network-scene-label ${label.active ? 'active' : ''} ${label.kind}`}
            style={{
              left: `${label.left}px`,
              top: `${label.top}px`,
              opacity: label.opacity,
              transform: `translate(-50%, -50%) scale(${label.scale})`,
            }}
          >
            <strong>{label.label}</strong>
            <small>{label.detail}</small>
          </div>
        ))}
      </div>
      <div className="network-scene-hint">Drag to orbit, hold Shift or Ctrl+drag to pan, scroll to zoom, click a node to explore deeper.</div>
    </div>
  )
}
