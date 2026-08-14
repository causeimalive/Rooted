import { useEffect, useRef, useState } from 'react'
import { useVersions } from '@youversion/platform-react-hooks'
import { type BibleVersion } from '@youversion/platform-core'

type SyncVersionMenuProps = {
  open: boolean
  lastReadVersion: number
  onClose: () => void
  onSync: (versionIds: number[], bookIds?: string[], onlySavedChapters?: boolean) => void
}

export default function SyncVersionMenu({ open, lastReadVersion, onClose, onSync }: SyncVersionMenuProps) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [lastReadBook, setLastReadBook] = useState<string>('')
  const [syncCurrentBook, setSyncCurrentBook] = useState(false)
  const [syncSavedChapters, setSyncSavedChapters] = useState(false)

  const { versions: versionCollection, loading, error } = useVersions('en', undefined, {
    all_available: true,
    page_size: 99,
  })

  const versions = (versionCollection?.data ?? []) as BibleVersion[]

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    if (open && !dialog.open) {
      dialog.showModal()
    } else if (!open && dialog.open) {
      dialog.close()
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    const initial = new Set<number>()
    if (lastReadVersion > 0) initial.add(lastReadVersion)
    setSelected(initial)

    const book = typeof window !== 'undefined' ? localStorage.getItem('bible-study-yv-book') ?? '' : ''
    setLastReadBook(book)
    setSyncCurrentBook(Boolean(book))
  }, [open, lastReadVersion])

  const toggle = (id: number) => {
    const next = new Set(selected)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    setSelected(next)
  }

  const handleSync = () => {
    if (selected.size === 0) return
    if (syncSavedChapters) {
      onSync(Array.from(selected), undefined, true)
    } else {
      const bookIds = syncCurrentBook && lastReadBook ? [lastReadBook] : undefined
      onSync(Array.from(selected), bookIds)
    }
    onClose()
  }

  return (
    <dialog
      ref={dialogRef}
      className="sync-version-dialog"
      style={{
        position: 'fixed',
        inset: 0,
        width: '100%',
        maxWidth: '100%',
        height: '100%',
        maxHeight: '100%',
        margin: 0,
        padding: 0,
        border: 'none',
        background: 'transparent',
      }}
      onClose={onClose}
      onClick={(e) => {
        if (e.currentTarget === e.target) onClose()
      }}
    >
      <div
        className="sync-version-backdrop"
        style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0,0,0,0.45)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
        onClick={(e) => {
          if (e.currentTarget === e.target) onClose()
        }}
      >
        <div
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
          <h4 style={{ margin: 0 }}>Select versions to sync</h4>
          {loading && <p style={{ color: 'var(--text-muted)', margin: 0 }}>Loading versions...</p>}
          {error && <p style={{ color: 'var(--danger)', margin: 0 }}>{error.message}</p>}
          {!loading && !error && (
            <ul
              style={{
                listStyle: 'none',
                margin: 0,
                padding: '0.25rem 0',
                overflowY: 'auto',
                maxHeight: '45vh',
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
                    <span style={{ flex: 1 }}>{v.title}</span>
                    <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                      {v.abbreviation}
                    </span>
                  </label>
                </li>
              ))}
            </ul>
          )}
          {lastReadBook && (
            <label
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                cursor: 'pointer',
                padding: '0.35rem 0.5rem',
                borderRadius: '0.5rem',
                border: '1px solid color-mix(in srgb, var(--accent) 18%, var(--muted))',
              }}
            >
              <input
                type="checkbox"
                checked={syncCurrentBook && !syncSavedChapters}
                disabled={syncSavedChapters}
                onChange={() => setSyncCurrentBook((v) => !v)}
              />
              <span>Sync only the current book ({lastReadBook})</span>
            </label>
          )}
          <label
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              cursor: 'pointer',
              padding: '0.35rem 0.5rem',
              borderRadius: '0.5rem',
              border: '1px solid color-mix(in srgb, var(--accent) 18%, var(--muted))',
            }}
          >
            <input
              type="checkbox"
              checked={syncSavedChapters}
              onChange={() => setSyncSavedChapters((v) => !v)}
            />
            <span>Sync only chapters with saved highlights</span>
          </label>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', marginTop: '0.5rem' }}>
            <button type="button" className="secondary" onClick={onClose}>
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSync}
              disabled={selected.size === 0 || loading}
            >
              Sync selected
            </button>
          </div>
        </div>
      </div>
    </dialog>
  )
}
