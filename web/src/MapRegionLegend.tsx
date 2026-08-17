import { useEffect, useState } from 'react'

type RegionFeature = {
  properties: {
    id: string
    name: string
    color: string
    max_confidence?: number
    min_confidence?: number
  }
}

type RegionCollection = {
  features: RegionFeature[]
}

type MapRegionLegendProps = {
  visible: boolean
  theme: 'dark' | 'light'
}

function displayName(name: string) {
  return name.replace(/\s+\d+$/, '')
}

export default function MapRegionLegend({ visible, theme }: MapRegionLegendProps) {
  const [regions, setRegions] = useState<RegionFeature[]>([])

  useEffect(() => {
    if (!visible) return
    fetch('/data/regions.geojson')
      .then((res) => res.json() as Promise<RegionCollection>)
      .then((data) => {
        const sorted = [...data.features].sort((a, b) =>
          a.properties.name.localeCompare(b.properties.name),
        )
        setRegions(sorted)
      })
      .catch(() => setRegions([]))
  }, [visible])

  if (!visible || !regions.length) return null

  const isDark = theme === 'dark'
  const bg = isDark ? 'rgba(24, 24, 24, 0.9)' : 'rgba(255, 255, 255, 0.94)'
  const fg = isDark ? '#f5f5f5' : '#1a1a1a'
  const muted = isDark ? 'rgba(255, 255, 255, 0.6)' : 'rgba(0, 0, 0, 0.55)'
  const border = isDark ? 'rgba(255, 255, 255, 0.14)' : 'rgba(0, 0, 0, 0.1)'

  return (
    <div
      style={{
        padding: '0.875rem',
        background: bg,
        border: `1px solid ${border}`,
        borderRadius: '0.625rem',
        color: fg,
        fontSize: '0.9rem',
        maxHeight: 'min(70vh, 26rem)',
        minWidth: '12rem',
        overflowY: 'auto',
        WebkitOverflowScrolling: 'touch',
        boxShadow: isDark
          ? '0 0.35rem 1.25rem rgba(0, 0, 0, 0.55)'
          : '0 0.35rem 1.25rem rgba(0, 0, 0, 0.18)',
        backdropFilter: 'blur(6px)',
        WebkitBackdropFilter: 'blur(6px)',
      }}
    >
      <div
        style={{
          fontWeight: 700,
          fontSize: '0.78rem',
          textTransform: 'uppercase',
          letterSpacing: '0.08em',
          color: muted,
          marginBottom: '0.5rem',
          borderBottom: `1px solid ${border}`,
          paddingBottom: '0.5rem',
        }}
      >
        Biblical Regions
      </div>
      {regions.map((feature) => (
        <div
          key={feature.properties.id}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.625rem',
            padding: '0.35rem 0.45rem',
            borderRadius: '0.35rem',
            transition: 'background 0.15s ease',
            cursor: 'default',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = isDark
              ? 'rgba(255, 255, 255, 0.07)'
              : 'rgba(0, 0, 0, 0.05)'
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'transparent'
          }}
        >
          <span
            style={{
              width: '0.85rem',
              height: '0.85rem',
              borderRadius: '50%',
              background: feature.properties.color || '#888',
              boxShadow: `0 0 0.45rem ${(feature.properties.color || '#888') + 'aa'}`,
              flexShrink: 0,
            }}
          />
          <span
            style={{
              whiteSpace: 'nowrap',
              fontWeight: 500,
            }}
          >
            {displayName(feature.properties.name)}
          </span>
        </div>
      ))}
      <div
        style={{
          marginTop: '0.5rem',
          fontSize: '0.72rem',
          color: muted,
          textAlign: 'center',
          fontStyle: 'italic',
        }}
      >
        Click a colored region to learn more
      </div>
    </div>
  )
}
