import { useEffect, useState } from 'react'
import { fetchYouVersionVersions, type YouVersionVersion } from './youversion'
import { useI18n } from './i18n'

type SyncVersionMenuProps = {
  open: boolean
  lastReadVersion: number
  onClose: () => void
  onSync: (versionIds: number[]) => void
}

export default function SyncVersionMenu({ open, lastReadVersion, onClose, onSync }: SyncVersionMenuProps) {
  const { t } = useI18n()
  const [versions, setVersions] = useState<YouVersionVersion[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [selected, setSelected] = useState<Set<number>>(new Set())

  useEffect(() => {
    if (!open) return
    setLoading(true)
    setError('')
    fetchYouVersionVersions()
      .then((v) => {
        setVersions(v)
        const initial = new Set<number>()
        if (lastReadVersion > 0) initial.add(lastReadVersion)
        setSelected(initial)
      })
      .catch((err) => setError(err instanceof Error ? err.message : String(err)))
      .finally(() => setLoading(false))
  }, [open, lastReadVersion])

  const toggle = (id: number) => {
    const next = new Set(selected)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    setSelected(next)
  }

  const handleSync = () => {
    if (selected.size === 0) return
    onSync(Array.from(selected))
    onClose()
  }

  if (!open) return null

  return (
    <div
      className="sync-version-overlay"
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.45)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 100,
      }}
      onClick={onClose}
    >
      <div
        className="sync-version-menu"
        style={{
          background: 'var(--surface)',
          borderRadius: '1rem',
          padding: '1.25rem',
          width: 'min(480px, 90vw)',
          maxHeight: '80vh',
          display: 'flex',
          flexDirection: 'column',
          gap: '0.75rem',
          boxShadow: '0 20px 40px rgba(0,0,0,0.25)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <h4 style={{ margin: 0 }}>{t('syncVersions') || 'Select versions to sync'}</h4>
        {loading && <p style={{ color: 'var(--text-muted)', margin: 0 }}>Loading versions...</p>}
        {error && <p style={{ color: 'var(--danger)', margin: 0 }}>{error}</p>}
        {!loading && !error && (
          <ul
            className="sync-version-list"
            style={{
              listStyle: 'none',
              margin: 0,
              padding: '0.25rem 0',
              overflowY: 'auto',
              maxHeight: '55vh',
              display: 'flex',
              flexDirection: 'column',
              gap: '0.35rem',
            }}
          >
            {versions.map((v) => (
              <li key={v.id}>
                <label
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                    cursor: 'pointer',
                    padding: '0.35rem 0.5rem',
                    borderRadius: '0.5rem',
                  }}
                >
                  <input
                    type="checkbox"
                    checked={selected.has(v.id)}
                    onChange={() => toggle(v.id)}
                  />
                  <span style={{ flex: 1 }}>{v.localized_title || v.title}</span>
                  <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                    {v.abbreviation || v.id}
                  </span>
                </label>
              </li>
            ))}
          </ul>
        )}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', marginTop: '0.5rem' }}>
          <button type="button" className="secondary" onClick={onClose}>
            {t('cancel') || 'Cancel'}
          </button>
          <button
            type="button"
            onClick={handleSync}
            disabled={selected.size === 0 || loading}
          >
            {t('syncSelected') || 'Sync selected'}
          </button>
        </div>
      </div>
    </div>
  )
}
