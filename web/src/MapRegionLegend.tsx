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
  selectedIds: Set<string> | null
  onSelectedIdsChange: (ids: Set<string>) => void
}

function displayName(name: string) {
  return name.replace(/\s+\d+$/, '')
}

export default function MapRegionLegend({
  visible,
  theme,
  selectedIds,
  onSelectedIdsChange,
}: MapRegionLegendProps) {
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

  useEffect(() => {
    if (!regions.length || selectedIds !== null) return
    const allIds = new Set(regions.map((r) => r.properties.id))
    onSelectedIdsChange(allIds)
  }, [regions, selectedIds, onSelectedIdsChange])

  if (!visible || !regions.length) return null

  const allIds = new Set(regions.map((r) => r.properties.id))
  const noneSelected = selectedIds?.size === 0
  const allSelected =
    selectedIds != null && [...allIds].every((id) => selectedIds.has(id))

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

  function selectAll() {
    onSelectedIdsChange(new Set(allIds))
  }

  function clearAll() {
    onSelectedIdsChange(new Set())
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
        width: '20rem',
        maxHeight: 'min(78vh, 30rem)',
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
          marginBottom: '0.4rem',
          borderBottom: `1px solid ${border}`,
          paddingBottom: '0.4rem',
        }}
      >
        <span>Biblical Regions</span>
        <div style={{ display: 'flex', gap: '0.35rem' }}>
          <button
            type="button"
            onClick={selectAll}
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
            onClick={clearAll}
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
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: '0.2rem',
        }}
      >
        {regions.map((feature) => {
          const id = feature.properties.id
          const isSelected = selectedIds ? selectedIds.has(id) : true
          return (
            <button
              key={id}
              type="button"
              onClick={() => toggle(id)}
              aria-pressed={isSelected}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.4rem',
                padding: '0.2rem 0.35rem',
                borderRadius: '0.3rem',
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
                overflow: 'hidden',
              }}
            >
              <span
                style={{
                  width: '0.75rem',
                  height: '0.75rem',
                  borderRadius: '50%',
                  background: feature.properties.color || '#888',
                  boxShadow: isSelected
                    ? `0 0 0.4rem ${(feature.properties.color || '#888') + 'aa'}`
                    : 'none',
                  flexShrink: 0,
                  opacity: isSelected ? 1 : 0.6,
                }}
              />
              <span
                style={{
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  fontWeight: 500,
                }}
              >
                {displayName(feature.properties.name)}
              </span>
            </button>
          )
        })}
      </div>
      <div
        style={{
          marginTop: '0.4rem',
          fontSize: '0.68rem',
          color: muted,
          textAlign: 'center',
          fontStyle: 'italic',
        }}
      >
        Click a region to focus; use All/None to reset
      </div>
    </div>
  )
}
