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
        padding: '0.5rem',
        background: 'rgba(0,0,0,0.6)',
        borderRadius: '0.375rem',
        color: '#fff',
        fontSize: '0.75rem',
        maxHeight: '9rem',
        overflowY: 'auto',
        minWidth: '8.5rem',
      }}
    >
      <div style={{ fontWeight: 600, marginBottom: '0.25rem', fontSize: '0.7rem' }}>
        Regions
      </div>
      {regions.map((feature) => (
        <div
          key={feature.properties.id}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.375rem',
            padding: '0.125rem 0',
          }}
        >
          <span
            style={{
              width: '0.625rem',
              height: '0.625rem',
              borderRadius: '50%',
              background: feature.properties.color || '#888',
              flexShrink: 0,
            }}
          />
          <span style={{ whiteSpace: 'nowrap' }}>{feature.properties.name}</span>
        </div>
      ))}
    </div>
  )
}
