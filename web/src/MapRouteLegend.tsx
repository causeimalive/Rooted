type MapRouteLegendProps = {
  visible: boolean
  theme: 'dark' | 'light'
}

const ROAD_COLOR = { dark: '#c4a87a', light: '#8c6d3f' }
const SEA_COLOR = { dark: '#6e8c9c', light: '#4a6c7c' }

export default function MapRouteLegend({ visible, theme }: MapRouteLegendProps) {
  if (!visible) return null

  const isDark = theme === 'dark'
  const bg = isDark ? 'rgba(24, 24, 24, 0.92)' : 'rgba(255, 255, 255, 0.96)'
  const fg = isDark ? '#f5f5f5' : '#1a1a1a'
  const muted = isDark ? 'rgba(255, 255, 255, 0.6)' : 'rgba(0, 0, 0, 0.55)'
  const border = isDark ? 'rgba(255, 255, 255, 0.14)' : 'rgba(0, 0, 0, 0.1)'
  const roadColor = ROAD_COLOR[theme]
  const seaColor = SEA_COLOR[theme]

  return (
    <div
      style={{
        padding: '0.65rem',
        background: bg,
        border: `1px solid ${border}`,
        borderRadius: '0.625rem',
        color: fg,
        fontSize: '0.82rem',
        width: '14rem',
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
          fontSize: '0.72rem',
          textTransform: 'uppercase',
          letterSpacing: '0.08em',
          color: muted,
          marginBottom: '0.45rem',
          borderBottom: `1px solid ${border}`,
          paddingBottom: '0.4rem',
        }}
      >
        Travel Routes
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.35rem' }}>
        <span style={{ width: '1.4rem', height: '0.18rem', borderRadius: '999px', background: roadColor, flexShrink: 0 }} />
        <span>Overland roads</span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
        <span
          style={{
            width: '1.4rem',
            height: '0.18rem',
            flexShrink: 0,
            backgroundImage: `repeating-linear-gradient(90deg, ${seaColor} 0 4px, transparent 4px 8px)`,
          }}
        />
        <span>Sea routes</span>
      </div>
      <div
        style={{
          marginTop: '0.5rem',
          fontSize: '0.68rem',
          color: muted,
          fontStyle: 'italic',
        }}
      >
        Arrows show a common direction of travel. Routes are schematic, not precise archaeological traces &mdash; click a route for details.
      </div>
    </div>
  )
}
