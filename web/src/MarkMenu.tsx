import { useEffect, useRef, type CSSProperties } from 'react'
import { useI18n } from './i18n'

export const SWATCHES = ['#F5E98A', '#C7F5C8', '#C7D7F5', '#F5C7F5', '#F5E0C7']

type MarkMenuProps = {
  isBookmarked: boolean
  isHighlighted: boolean
  highlightColor?: string
  onToggleBookmark: () => void
  onToggleHighlight: (color?: string) => void
  onClose: () => void
  className?: string
  style?: CSSProperties
}

export function MarkMenu({
  isBookmarked,
  isHighlighted,
  onToggleBookmark,
  onToggleHighlight,
  onClose,
  className = 'yv-reader-verse-mark-menu',
  style,
}: MarkMenuProps) {
  const { t } = useI18n()
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose()
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [onClose])

  return (
    <div
      ref={menuRef}
      className={className}
      style={style}
      onClick={(e) => e.stopPropagation()}
    >
      <button
        type='button'
        onClick={(e) => {
          e.stopPropagation()
          onToggleBookmark()
          onClose()
        }}
      >
        {isBookmarked ? t('removeBookmark') : t('bookmark')}
      </button>
      <div className='yv-reader-verse-mark-swatches'>
        {SWATCHES.map((color) => (
          <button
            key={color}
            type='button'
            className='yv-reader-verse-color-swatch'
            style={{ backgroundColor: color }}
            aria-label={color}
            onClick={(e) => {
              e.stopPropagation()
              onToggleHighlight(color)
              onClose()
            }}
          />
        ))}
      </div>
      {isHighlighted && (
        <button
          type='button'
          onClick={(e) => {
            e.stopPropagation()
            onToggleHighlight()
            onClose()
          }}
        >
          {t('removeHighlight')}
        </button>
      )}
    </div>
  )
}
