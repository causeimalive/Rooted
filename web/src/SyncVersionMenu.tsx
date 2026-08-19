import { useEffect, useMemo, useRef, useState } from 'react'
import { useBibleClient, useVersions } from '@youversion/platform-react-hooks'
import { type BibleVersion } from '@youversion/platform-core'
import { useI18n } from './i18n'
import {
  getVersionBrowseLanguagePreference,
  resolveVersionBrowseLanguagePreference,
  VERSION_BROWSE_LANGUAGE_CHANGED_EVENT,
} from './userProfile'

type SyncVersionMenuProps = {
  open: boolean
  lastReadVersion: number
  lastReadBook: string
  userId?: string | null
  onClose: () => void
  onSync: (versionIds: number[], bookIds?: string[], onlySavedChapters?: boolean) => void
}

export default function SyncVersionMenu({ open, lastReadVersion, lastReadBook, userId, onClose, onSync }: SyncVersionMenuProps) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [syncCurrentBook, setSyncCurrentBook] = useState(false)
  const [syncSavedChapters, setSyncSavedChapters] = useState(false)
  const [syncAll, setSyncAll] = useState(false)
  const { language } = useI18n()
  const [versionBrowseLanguagePreference, setVersionBrowseLanguagePreference] = useState(() => getVersionBrowseLanguagePreference(userId))

  const bibleClient = useBibleClient()

  useEffect(() => {
    setVersionBrowseLanguagePreference(getVersionBrowseLanguagePreference(userId))
  }, [userId])

  useEffect(() => {
    const syncLanguagePreference = () => setVersionBrowseLanguagePreference(getVersionBrowseLanguagePreference(userId))
    syncLanguagePreference()
    window.addEventListener(VERSION_BROWSE_LANGUAGE_CHANGED_EVENT, syncLanguagePreference as EventListener)
    window.addEventListener('storage', syncLanguagePreference)
    return () => {
      window.removeEventListener(VERSION_BROWSE_LANGUAGE_CHANGED_EVENT, syncLanguagePreference as EventListener)
      window.removeEventListener('storage', syncLanguagePreference)
    }
  }, [userId])

  const languageRanges = useMemo(() => {
    const resolved = resolveVersionBrowseLanguagePreference(versionBrowseLanguagePreference, language)
    return resolved ?? '*'
  }, [language, versionBrowseLanguagePreference])

  const { versions: versionCollection, loading, error } = useVersions(languageRanges, undefined, {
    page_size: 99,
  })

  const [extraVersionPages, setExtraVersionPages] = useState<BibleVersion[]>([])
  useEffect(() => {
    setExtraVersionPages([])
    const token = versionCollection?.next_page_token
    if (!token) return
    let cancelled = false
    const fetchMore = async (nextToken: string) => {
      try {
        const page = await bibleClient.getVersions(languageRanges, undefined, { page_size: 99, page_token: nextToken })
        if (cancelled) return
        setExtraVersionPages((prev) => [...prev, ...page.data])
        if (page.next_page_token) await fetchMore(page.next_page_token)
      } catch {
        // stop fetching on error
      }
    }
    fetchMore(token)
    return () => { cancelled = true }
  }, [bibleClient, languageRanges, versionCollection])

  const versions = [...(versionCollection?.data ?? []), ...extraVersionPages] as BibleVersion[]

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
    setSyncCurrentBook(Boolean(lastReadBook))
    setSyncSavedChapters(false)
    setSyncAll(false)
  }, [open, lastReadVersion, lastReadBook])

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
    } else if (syncCurrentBook && lastReadBook) {
      onSync(Array.from(selected), [lastReadBook])
    } else if (syncAll) {
      onSync(Array.from(selected))
    }
    onClose()
  }

  const canSync = selected.size > 0 && (syncCurrentBook || syncSavedChapters || syncAll)

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
                maxHeight: '35vh',
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
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '0.35rem',
            }}
          >
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
                  checked={syncCurrentBook}
                  onChange={() => {
                    setSyncCurrentBook(true)
                    setSyncSavedChapters(false)
                    setSyncAll(false)
                  }}
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
                onChange={() => {
                  setSyncSavedChapters(true)
                  setSyncCurrentBook(false)
                  setSyncAll(false)
                }}
              />
              <span>Sync only chapters with saved highlights</span>
            </label>
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
                checked={syncAll}
                onChange={() => {
                  setSyncAll(true)
                  setSyncCurrentBook(false)
                  setSyncSavedChapters(false)
                }}
              />
              <span>Sync all chapters in selected version(s)</span>
            </label>
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', marginTop: '0.5rem' }}>
            <button type="button" className="secondary" onClick={onClose}>
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSync}
              disabled={!canSync || loading}
            >
              Sync selected
            </button>
          </div>
        </div>
      </div>
    </dialog>
  )
}
