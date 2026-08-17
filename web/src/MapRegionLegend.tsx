type Region = {
  id: string
  name: string
  color: string
}

type MapRegionLegendProps = {
  visible: boolean
  theme: 'dark' | 'light'
  regions: Region[]
  selectedIds: Set<string>
  onToggle: (id: string) => void
  onToggleAll: () => void
}

function displayName(name: string) {
  return name.replace(/\s+\d+$/, '')
}

export default function MapRegionLegend({
  visible,
  theme,
  regions,
  selectedIds,
  onToggle,
  onToggleAll,
}: MapRegionLegendProps) {
  if (!visible || !regions.length) return null

  const allSelected = selectedIds.size === regions.length
  const isDark = theme === 'dark'
  const bg = isDark ? 'rgba(24, 24, 24, 0.92)' : 'rgba(255, 255, 255, 0.96)'
  const fg = isDark ? '#f5f5f5' : '#1a1a1a'
  const muted = isDark ? 'rgba(255, 255, 255, 0.6)' : 'rgba(0, 0, 0, 0.55)'
  const border = isDark ? 'rgba(255, 255, 255, 0.14)' : 'rgba(0, 0, 0, 0.1)'
  const hoverBg = isDark ? 'rgba(255, 255, 255, 0.07)' : 'rgba(0, 0, 0, 0.05)'

  return (
    <div
      style={{
        padding: '0.65rem',
        background: bg,
        border: `1px solid ${border}`,
        borderRadius: '0.625rem',
        color: fg,
        fontSize: '0.82rem',
        width: '19rem',
        maxHeight: 'none',
        overflow: 'visible',
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
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '0.5rem',
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
        <button
          type="button"
          onClick={onToggleAll}
          style={{
            padding: '0.15rem 0.5rem',
            borderRadius: '9999px',
            border: `1px solid ${border}`,
            background: 'transparent',
            color: muted,
            fontSize: '0.65rem',
            fontWeight: 600,
            cursor: 'pointer',
            textTransform: 'uppercase',
          }}
        >
          {allSelected ? 'None' : 'All'}
        </button>
      </div>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: '0.2rem',
        }}
      >
        {regions.map((region) => {
          const selected = selectedIds.has(region.id)
          return (
            <button
              key={region.id}
              type="button"
              onClick={() => onToggle(region.id)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.4rem',
                padding: '0.2rem 0.35rem',
                borderRadius: '0.3rem',
                border: 'none',
                background: 'transparent',
                color: fg,
                fontSize: '0.82rem',
                fontWeight: 500,
                cursor: 'pointer',
                textAlign: 'left',
                opacity: selected ? 1 : 0.45,
                transition: 'background 0.15s ease, opacity 0.15s ease',
                overflow: 'hidden',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = hoverBg
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
                  background: region.color || '#888',
                  boxShadow: `0 0 0.4rem ${(region.color || '#888') + 'aa'}`,
                  flexShrink: 0,
                }}
              />
              <span
                style={{
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
              >
                {displayName(region.name)}
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
