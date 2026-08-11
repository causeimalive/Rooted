import { createPortal } from 'react-dom'
import { useEffect, useRef } from 'react'
import { X } from 'lucide-react'

export type WheelOption<T> = {
  value: T
  label: string
  subtitle?: string
}

type WheelColumnProps<T> = {
  options: WheelOption<T>[]
  activeValue: T
  onSelect: (value: T) => void
  onClose: () => void
  closeOnSelect?: boolean
}

type MobileWheelPickerProps<T> = {
  open: boolean
  onClose: () => void
  title: string
  subtitle?: string
  options: WheelOption<T>[]
  activeValue: T
  onSelect: (value: T) => void
  closeOnSelect?: boolean
  secondaryTitle?: string
  secondarySubtitle?: string
  secondaryOptions?: WheelOption<T>[]
  secondaryActiveValue?: T
  onSelectSecondary?: (value: T) => void
  secondaryCloseOnSelect?: boolean
}

function triggerHaptic() {
  if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
    navigator.vibrate?.(12)
  }
}

function WheelColumn<T extends string | number>({
  options,
  activeValue,
  onSelect,
  onClose,
  closeOnSelect = true,
}: WheelColumnProps<T>) {
  const shellRef = useRef<HTMLDivElement | null>(null)
  const listRef = useRef<HTMLDivElement | null>(null)
  const settleTimerRef = useRef<number | null>(null)
  const frameRef = useRef<number | null>(null)
  const lastCommittedIndexRef = useRef<number>(-1)
  const hasCenteredRef = useRef(false)

  useEffect(() => {
    const shell = shellRef.current
    const list = listRef.current
    if (!shell || !list) return

    const activeIndex = Math.max(0, options.findIndex((option) => option.value === activeValue))
    lastCommittedIndexRef.current = activeIndex
    if (!hasCenteredRef.current) {
      const active = list.querySelector<HTMLElement>(`[data-option-index="${activeIndex}"]`)
      active?.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'auto' })
      hasCenteredRef.current = true
    }

    const getNearestIndex = () => {
      const items = Array.from(list.querySelectorAll<HTMLButtonElement>('[data-option-index]'))
      if (!items.length) return activeIndex

      const shellRect = shell.getBoundingClientRect()
      const centerY = shellRect.top + shellRect.height / 2
      let nearestIndex = activeIndex
      let nearestDistance = Number.POSITIVE_INFINITY

      items.forEach((item) => {
        const index = Number(item.dataset.optionIndex)
        if (!Number.isFinite(index)) return
        const rect = item.getBoundingClientRect()
        const itemCenter = rect.top + rect.height / 2
        const distance = Math.abs(itemCenter - centerY)
        if (distance < nearestDistance) {
          nearestDistance = distance
          nearestIndex = index
        }
      })

      return nearestIndex
    }

    const commitNearest = (shouldSnap: boolean) => {
      const nearestIndex = getNearestIndex()
      const nextValue = options[nearestIndex]?.value
      if (nextValue === undefined) return

      if (shouldSnap) {
        const item = list.querySelector<HTMLElement>(`[data-option-index="${nearestIndex}"]`)
        item?.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'smooth' })
      }

      if (nearestIndex !== lastCommittedIndexRef.current) {
        lastCommittedIndexRef.current = nearestIndex
        onSelect(nextValue)
        triggerHaptic()
        if (shouldSnap && closeOnSelect) onClose()
      }
    }

    const onScroll = () => {
      if (frameRef.current !== null) {
        window.cancelAnimationFrame(frameRef.current)
      }
      frameRef.current = window.requestAnimationFrame(() => commitNearest(false))

      if (settleTimerRef.current !== null) {
        window.clearTimeout(settleTimerRef.current)
      }
      settleTimerRef.current = window.setTimeout(() => commitNearest(true), 110)
    }

    shell.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      shell.removeEventListener('scroll', onScroll)
      if (settleTimerRef.current !== null) {
        window.clearTimeout(settleTimerRef.current)
        settleTimerRef.current = null
      }
      if (frameRef.current !== null) {
        window.cancelAnimationFrame(frameRef.current)
        frameRef.current = null
      }
    }
  }, [activeValue, closeOnSelect, onClose, onSelect, options])

  return (
    <div className="mobile-wheel-viewport">
      <div className="mobile-wheel-selection-band" aria-hidden="true" />
      <div className="mobile-wheel-list-shell" ref={shellRef}>
        <div className="mobile-wheel-list" ref={listRef}>
          {options.map((option, index) => {
            const isActive = option.value === activeValue
            return (
              <button
                key={String(option.value)}
                type="button"
                data-option-index={index}
                data-active={isActive}
                className={`mobile-wheel-item ${isActive ? 'active' : ''}`}
                onClick={() => {
                  triggerHaptic()
                  onSelect(option.value)
                  if (closeOnSelect) onClose()
                }}
              >
                <span>{option.label}</span>
                {option.subtitle ? <small>{option.subtitle}</small> : null}
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}

function MobileWheelPicker<T extends string | number>({
  open,
  onClose,
  title,
  subtitle,
  options,
  activeValue,
  onSelect,
  closeOnSelect = true,
  secondaryTitle,
  secondarySubtitle,
  secondaryOptions,
  secondaryActiveValue,
  onSelectSecondary,
  secondaryCloseOnSelect = true,
}: MobileWheelPickerProps<T>) {
  useEffect(() => {
    if (typeof document === 'undefined') return
    if (!open) return

    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = previousOverflow
    }
  }, [open])

  if (!open || typeof document === 'undefined') return null

  const isSplit = Boolean(secondaryOptions && onSelectSecondary && secondaryActiveValue !== undefined)

  return createPortal(
    <div className="mobile-wheel-backdrop" onPointerDown={onClose}>
      <div
        className={`mobile-wheel-sheet ${isSplit ? 'split' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-label={isSplit ? `${title} / ${secondaryTitle}` : title}
        onPointerDown={(event) => event.stopPropagation()}
      >
        <div className="mobile-wheel-sheet-header">
          <div className={`mobile-wheel-sheet-title ${isSplit ? 'split' : ''}`}>
            {isSplit ? (
              <>
                <div className="mobile-wheel-sheet-title-col">
                  <strong>{title}</strong>
                  {subtitle ? <span>{subtitle}</span> : null}
                </div>
                <div className="mobile-wheel-sheet-title-col">
                  <strong>{secondaryTitle}</strong>
                  {secondarySubtitle ? <span>{secondarySubtitle}</span> : null}
                </div>
              </>
            ) : (
              <>
                <strong>{title}</strong>
                {subtitle ? <span>{subtitle}</span> : null}
              </>
            )}
          </div>
          <button
            type="button"
            className="mobile-wheel-sheet-close"
            onClick={onClose}
            aria-label="Close picker"
          >
            <X size={18} />
          </button>
        </div>
        <div className={`mobile-wheel-body ${isSplit ? 'split' : ''}`}>
          <WheelColumn
            options={options}
            activeValue={activeValue}
            onSelect={onSelect}
            onClose={onClose}
            closeOnSelect={closeOnSelect}
          />
          {isSplit ? (
            <WheelColumn
              options={secondaryOptions ?? []}
              activeValue={secondaryActiveValue as T}
              onSelect={onSelectSecondary ?? (() => {})}
              onClose={onClose}
              closeOnSelect={secondaryCloseOnSelect}
            />
          ) : null}
        </div>
      </div>
    </div>,
    document.body,
  )
}

export default MobileWheelPicker
