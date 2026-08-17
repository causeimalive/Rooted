import { useEffect, useState } from 'react'
import type { RouteProperties } from './MapRoutes'

type RouteFeature = {
  properties: RouteProperties
}

type RouteCollection = {
  features: RouteFeature[]
}

type MapRouteLegendProps = {
  visible: boolean
  theme: 'dark' | 'light'
  selectedIds: Set<string> | null
  onSelectedIdsChange: (ids: Set<string>) => void
}

const ROAD_COLOR = { dark: '#c4a87a', light: '#8c6d3f' }
const SEA_COLOR = { dark: '#6e8c9c', light: '#4a6c7c' }
const RIVER_COLOR = { dark: '#5a9c8c', light: '#3f7c6d' }

function isWaterRoute(kind: string) {
  return kind === 'sea' || kind === 'river'
}

function colorFor(kind: string, theme: 'dark' | 'light') {
  if (kind === 'sea') return SEA_COLOR[theme]
  if (kind === 'river') return RIVER_COLOR[theme]
  return ROAD_COLOR[theme]
}

export default function MapRouteLegend({
  visible,
  theme,
  selectedIds,
  onSelectedIdsChange,
}: MapRouteLegendProps) {
  const [routes, setRoutes] = useState<RouteFeature[]>([])

  useEffect(() => {
    if (!visible) return
    fetch('/data/road-network.geojson')
      .then((res) => res.json() as Promise<RouteCollection>)
      .then((data) => {
        const sorted = [...data.features].sort((a, b) =>
          a.properties.name.localeCompare(b.properties.name),
        )
        setRoutes(sorted)
      })
      .catch(() => setRoutes([]))
  }, [visible])

  useEffect(() => {
    if (!routes.length || selectedIds !== null) return
    onSelectedIdsChange(new Set(routes.map((r) => r.properties.id)))
  }, [routes, selectedIds, onSelectedIdsChange])

  if (!visible || !routes.length) return null

  const allIds = new Set(routes.map((r) => r.properties.id))
  const noneSelected = selectedIds?.size === 0
  const allSelected = selectedIds != null && [...allIds].every((id) => selectedIds.has(id))

  const isDark = theme === 'dark'
  const bg = isDark ? 'rgba(24, 24, 24, 0.92)' : 'rgba(255, 255, 255, 0.96)'
  const fg = isDark ? '#f5f5f5' : '#1a1a1a'
  const muted = isDark ? 'rgba(255, 255, 255, 0.6)' : 'rgba(0, 0, 0, 0.55)'
  const border = isDark ? 'rgba(255, 255, 255, 0.14)' : 'rgba(0, 0, 0, 0.1)'
  function toggle(id: string) {
    const next = new Set(selectedIds ?? allIds)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    onSelectedIdsChange(next)
  }

  return (
    <div
      style={{
        padding: '0.65rem',
        background: bg,
        border: `1px solid ${border}`,
        borderRadius: '0.625rem',
        color: fg,
        fontSize: '0.82rem',
        width: '18rem',
        maxHeight: 'min(60vh, 24rem)',
        overflowY: 'auto',
        overflowX: 'hidden',
        boxShadow: isDark
          ? '0 0.35rem 1.25rem rgba(0, 0, 0, 0.55)'
          : '0 0.35rem 1.25rem rgba(0, 0, 0, 0.18)',
        backdropFilter: 'blur(6px)',
        WebkitBackdropFilter: 'blur(6px)',
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          fontWeight: 700,
          fontSize: '0.72rem',
          textTransform: 'uppercase',
          letterSpacing: '0.08em',
          color: muted,
          marginBottom: '0.45rem',
          borderBottom: `1px solid ${border}`,
          paddingBottom: '0.4rem',
        }}
      >
        <span>Travel Routes</span>
        <div style={{ display: 'flex', gap: '0.35rem' }}>
          <button
            type="button"
            onClick={() => onSelectedIdsChange(new Set(allIds))}
            disabled={allSelected}
            style={{
              fontSize: '0.65rem',
              padding: '0.15rem 0.35rem',
              borderRadius: '0.25rem',
              border: `1px solid ${border}`,
              background: 'transparent',
              color: muted,
              cursor: allSelected ? 'default' : 'pointer',
              opacity: allSelected ? 0.5 : 1,
            }}
          >
            All
          </button>
          <button
            type="button"
            onClick={() => onSelectedIdsChange(new Set())}
            disabled={noneSelected}
            style={{
              fontSize: '0.65rem',
              padding: '0.15rem 0.35rem',
              borderRadius: '0.25rem',
              border: `1px solid ${border}`,
              background: 'transparent',
              color: muted,
              cursor: noneSelected ? 'default' : 'pointer',
              opacity: noneSelected ? 0.5 : 1,
            }}
          >
            None
          </button>
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.15rem' }}>
        {routes.map((feature) => {
          const id = feature.properties.id
          const isSea = isWaterRoute(feature.properties.kind)
          const isSelected = selectedIds ? selectedIds.has(id) : true
          const color = colorFor(feature.properties.kind, theme)
          return (
            <button
              key={id}
              type="button"
              onClick={() => toggle(id)}
              aria-pressed={isSelected}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                padding: '0.3rem 0.4rem',
                borderRadius: '0.35rem',
                border: 'none',
                background: isSelected
                  ? isDark
                    ? 'rgba(255, 255, 255, 0.07)'
                    : 'rgba(0, 0, 0, 0.05)'
                  : 'transparent',
                color: isSelected ? fg : muted,
                opacity: isSelected ? 1 : 0.55,
                cursor: 'pointer',
                textAlign: 'left',
                transition: 'all 0.15s ease',
              }}
            >
              {isSea ? (
                <span
                  style={{
                    width: '1.1rem',
                    height: '0.16rem',
                    flexShrink: 0,
                    backgroundImage: `repeating-linear-gradient(90deg, ${color} 0 3px, transparent 3px 6px)`,
                  }}
                />
              ) : (
                <span
                  style={{
                    width: '1.1rem',
                    height: '0.16rem',
                    borderRadius: '999px',
                    background: color,
                    flexShrink: 0,
                  }}
                />
              )}
              <span
                style={{
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  fontWeight: 500,
                  fontSize: '0.78rem',
                }}
              >
                {feature.properties.name}
              </span>
            </button>
          )
        })}
      </div>

      <div
        style={{
          marginTop: '0.5rem',
          fontSize: '0.68rem',
          color: muted,
          fontStyle: 'italic',
          borderTop: `1px solid ${border}`,
          paddingTop: '0.4rem',
        }}
      >
        Arrows show a common direction of travel. Routes are schematic &mdash; click one on the map for details.
      </div>
    </div>
  )
}
