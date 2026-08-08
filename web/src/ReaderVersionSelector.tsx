import { ChevronDown } from 'lucide-react'
import { memo, type ReactNode } from 'react'

type ReaderVersionSelectorProps = {
  wrapperClassName?: string
  selectorClassName?: string
  buttonClassName?: string
  menuOpen: boolean
  onToggleMenu: () => void
  title: string
  subtitle: string
  chevronSize: number
  menuRef?: { current: HTMLDivElement | null }
  menu: ReactNode
}

function ReaderVersionSelector({
  wrapperClassName,
  selectorClassName,
  buttonClassName,
  menuOpen,
  onToggleMenu,
  title,
  subtitle,
  chevronSize,
  menuRef,
  menu,
}: ReaderVersionSelectorProps) {
  return (
    <div className={wrapperClassName ?? 'yv-reader-selector-shell'}>
      <div className={selectorClassName ?? 'yv-reader-selector'} ref={menuRef}>
        <button
          type="button"
          className={buttonClassName ?? 'yv-reader-version-button'}
          aria-expanded={menuOpen}
          onPointerDown={(event) => {
            if (event.button !== 0) return
            event.preventDefault()
            onToggleMenu()
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault()
              onToggleMenu()
            }
          }}
        >
          <span>
            <strong>{title}</strong>
            <small>{subtitle}</small>
          </span>
          <ChevronDown size={chevronSize} />
        </button>
        {menuOpen ? menu : null}
      </div>
    </div>
  )
}

export default ReaderVersionSelector
