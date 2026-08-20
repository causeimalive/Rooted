import { useEffect, useMemo, useRef, useState } from 'react'
import { ChevronDown } from 'lucide-react'
import type { LanguageOption } from './languageCatalog'

type LanguageSearchDropdownProps = {
  title: string
  subtitle?: string
  selectedTag: string
  selectedLabel: string
  selectedSubtitle?: string
  options: LanguageOption[]
  autoLabel: string
  allLabel: string
  onSelect: (tag: string) => void
  className?: string
  buttonClassName?: string
}

export default function LanguageSearchDropdown({
  title,
  subtitle,
  selectedTag,
  selectedLabel,
  selectedSubtitle,
  options,
  autoLabel,
  allLabel,
  onSelect,
  className,
  buttonClassName,
}: LanguageSearchDropdownProps) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const rootRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!open) return
    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Node | null
      if (!target || !rootRef.current || rootRef.current.contains(target)) return
      setOpen(false)
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    window.addEventListener('mousedown', onPointerDown)
    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('mousedown', onPointerDown)
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  const normalizedQuery = query.trim().toLowerCase()
  const filteredOptions = useMemo(() => {
    if (!normalizedQuery) return options
    return options.filter((option) => option.searchText.includes(normalizedQuery))
  }, [normalizedQuery, options])

  const activeLanguageOption = options.find((option) => option.tag === selectedTag)
  const activeValueLabel = selectedTag === 'auto' ? autoLabel : selectedTag === 'all' ? allLabel : activeLanguageOption?.label ?? selectedLabel
  const activeValueSubtitle = selectedSubtitle ?? activeLanguageOption?.subtitle

  return (
    <div ref={rootRef} className={className ?? 'language-search-dropdown-shell'}>
      <button
        type="button"
        className={buttonClassName ?? 'language-search-dropdown-button'}
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <span>
          <strong>{activeValueLabel}</strong>
          {activeValueSubtitle ? <small>{activeValueSubtitle}</small> : <small>{title}</small>}
        </span>
        <ChevronDown size={16} />
      </button>
      {open ? (
        <div className="language-search-dropdown-menu" role="menu" aria-label={title}>
          {subtitle ? <div className="language-search-dropdown-subtitle">{subtitle}</div> : null}
          <input
            type="search"
            className="language-search-dropdown-search"
            placeholder={`Search ${title.toLowerCase()}…`}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            autoComplete="off"
          />
          <div className="language-search-dropdown-options" role="listbox" aria-label={title}>
            <button
              type="button"
              className={`language-search-dropdown-option ${selectedTag === 'auto' ? 'active' : ''}`}
              onClick={() => {
                onSelect('auto')
                setOpen(false)
              }}
            >
              <span>
                <strong>{autoLabel}</strong>
                <small>Follow the app language</small>
              </span>
            </button>
            <button
              type="button"
              className={`language-search-dropdown-option ${selectedTag === 'all' ? 'active' : ''}`}
              onClick={() => {
                onSelect('all')
                setOpen(false)
              }}
            >
              <span>
                <strong>{allLabel}</strong>
                <small>Show every language</small>
              </span>
            </button>
            {filteredOptions.map((option) => (
              <button
                key={option.tag}
                type="button"
                className={`language-search-dropdown-option ${selectedTag === option.tag ? 'active' : ''}`}
                onClick={() => {
                  onSelect(option.tag)
                  setOpen(false)
                }}
              >
                <span>
                  <strong>{option.label}</strong>
                  <small>{option.subtitle}</small>
                </span>
              </button>
            ))}
            {!filteredOptions.length ? <div className="language-search-dropdown-empty">No languages match your search.</div> : null}
          </div>
        </div>
      ) : null}
    </div>
  )
}
