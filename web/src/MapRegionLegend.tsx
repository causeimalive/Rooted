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

function displayName(name: string) {
  return name.replace(/\s+\d+$/, '')
}

export default function MapRegionLegend({ visible }: { visible: boolean }) {
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

  return (
    <div
      style={{
        marginTop: '0.75rem',
        padding: '0.625rem',
        background: 'rgba(20, 20, 20, 0.78)',
        border: '1px solid rgba(255, 255, 255, 0.12)',
        borderRadius: '0.5rem',
        color: '#fff',
        fontSize: '0.8rem',
        maxHeight: '11rem',
        minWidth: '10rem',
        overflowY: 'auto',
        WebkitOverflowScrolling: 'touch',
        boxShadow: '0 0.35rem 1rem rgba(0, 0, 0, 0.45)',
        backdropFilter: 'blur(6px)',
        WebkitBackdropFilter: 'blur(6px)',
      }}
    >
      <div
        style={{
          fontWeight: 700,
          fontSize: '0.72rem',
          textTransform: 'uppercase',
          letterSpacing: '0.08em',
          opacity: 0.75,
          marginBottom: '0.375rem',
          borderBottom: '1px solid rgba(255, 255, 255, 0.12)',
          paddingBottom: '0.375rem',
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
            gap: '0.5rem',
            padding: '0.275rem 0.35rem',
            borderRadius: '0.25rem',
            transition: 'background 0.15s ease',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = 'rgba(255, 255, 255, 0.08)'
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'transparent'
          }}
        >
          <span
            style={{
              width: '0.75rem',
              height: '0.75rem',
              borderRadius: '50%',
              background: feature.properties.color || '#888',
              boxShadow: `0 0 0.4rem ${(feature.properties.color || '#888') + 'aa'}`,
              flexShrink: 0,
            }}
          />
          <span
            style={{
              whiteSpace: 'nowrap',
              fontWeight: 500,
              textShadow: '0 1px 2px rgba(0,0,0,0.4)',
            }}
          >
            {displayName(feature.properties.name)}
          </span>
        </div>
      ))}
      <div
        style={{
          marginTop: '0.375rem',
          fontSize: '0.68rem',
          opacity: 0.55,
          textAlign: 'center',
          fontStyle: 'italic',
        }}
      >
        Click a colored region to learn more
      </div>
    </div>
  )
}
