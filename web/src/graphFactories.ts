import { SCENE_PALETTE } from './relationshipGraph/palette'

type Theme = 'dark' | 'light'
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

type NetworkEdgeKind = 'spoke' | 'bridge' | 'theme'

export function getNodeColor(
  kind: NetworkKind,
  theme: Theme,
  tier?: 'strong' | 'medium' | 'soft',
): [number, number, number] {
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
    case 'related':
      if (tier === 'strong') return palette.strong
      if (tier === 'medium') return palette.medium
      return palette.soft
    default:
      return palette.soft
  }
}

export function getEdgeColor(kind: NetworkEdgeKind, theme: Theme): [number, number, number] {
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

export function getNodeTargetDistance(kind: NetworkKind, size: number): number {
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

export function getNodeGeometryDetail(quality: 'high' | 'medium' | 'low'): number {
  return quality === 'low' ? 0 : 1
}

export function getMaxLabelsForQuality(quality: 'high' | 'medium' | 'low'): number {
  return quality === 'low' ? 6 : quality === 'medium' ? 12 : 18
}
