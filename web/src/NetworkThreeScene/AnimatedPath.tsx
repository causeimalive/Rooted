import { useMemo } from 'react'
import { Line } from '@react-three/drei'
import { Color, Vector3 } from 'three'

type AnimatedPathProps = {
  points: { x: number; y: number; z: number }[]
  color: [number, number, number]
  progress?: number
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

export default function AnimatedPath({ points, color, progress = 0 }: AnimatedPathProps) {
  if (points.length < 2) return null

  const vecPoints = useMemo(() => points.map((p) => new Vector3(p.x, p.y, p.z)), [points])
  const materialColor = useMemo(() => new Color(color[0] / 255, color[1] / 255, color[2] / 255), [color])

  const t = clamp(progress, 0, 1) * Math.max(points.length - 1, 1)
  const index = Math.floor(t)
  const alpha = t - index
  const a = vecPoints[index]
  const b = vecPoints[index + 1] ?? a
  const position = useMemo(() => new Vector3().lerpVectors(a, b, alpha), [a, b, alpha])

  return (
    <>
      <Line points={vecPoints} color={materialColor} lineWidth={2} />
      <mesh position={position}>
        <icosahedronGeometry args={[0.9, 0]} />
        <meshBasicMaterial color={materialColor} transparent opacity={0.9} />
      </mesh>
    </>
  )
}
