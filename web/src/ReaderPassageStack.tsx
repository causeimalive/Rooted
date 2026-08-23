import { Fragment, useEffect, useLayoutEffect, useRef, useState, type MouseEvent as ReactMouseEvent, type RefObject, type TouchEvent as ReactTouchEvent } from 'react'
import { applyHighlightsToHtml } from './htmlHighlights'
import { MarkMenu } from './MarkMenu'
import { Bookmark, Highlighter } from 'lucide-react'
import { useI18n } from './i18n'

type ReaderSection = {
  key: string
  bookId: string
  chapter: number
  reference: string
  passageId: string
  content: string
  plainText: string
  verses: VerseBlock[]
}

type VerseBlock = {
  verse: string
  html: string
  text: string
  strippedHtml: string
}

type ReaderView = 'html' | 'chapter' | 'verse'

type ReaderPassageStackProps = {
  passageShellRef: RefObject<HTMLDivElement | null>
  sectionRefs: RefObject<Map<string, HTMLElement | null>>
  sections: ReaderSection[]
  readerView: ReaderView
  focusedSectionKey: string
  isLoadingSections: boolean
  selectedId?: string | null
  onSelectVerse?: (verseId: string) => void
  onToggleBookmark?: (verseId: string, yvPassageId?: string) => void
  onToggleHighlight?: (verseId: string, yvPassageId?: string, color?: string) => void
  bookmarkedVerseIds?: Set<string>
  highlightedVerseIds?: Set<string>
  highlightColors?: Record<string, string>
  bookCodeById?: Record<string, string>
}

const SWATCHES = ['#F5E98A', '#C7F5C8', '#C7D7F5', '#F5C7F5', '#F5E0C7']

type HtmlSectionProps = {
  section: ReaderSection
  bookCodeById?: Record<string, string>
  highlightedVerseIds?: Set<string>
  bookmarkedVerseIds?: Set<string>
  highlightColors?: Record<string, string>
  onSelectVerse?: (verseId: string) => void
}

function HtmlSection({
  section,
  bookCodeById,
  highlightedVerseIds,
  bookmarkedVerseIds,
  highlightColors,
  onSelectVerse,
}: HtmlSectionProps) {
  const html = applyHighlightsToHtml(
    section.content,
    section.bookId,
    section.chapter,
    bookCodeById,
    highlightedVerseIds,
    bookmarkedVerseIds,
    highlightColors,
  )

  const handleClick = (e: ReactMouseEvent<HTMLElement>) => {
    const targetEl = (e.target as HTMLElement).closest('.yv-v[v]') as HTMLElement | null
    if (!targetEl) return
    const verseAttr = targetEl.getAttribute('v')
    if (!verseAttr) return
    onSelectVerse?.(`${section.bookId}.${section.chapter}.${verseAttr}`)
  }

  return (
    <article
      className='yv-reader-passage yv-reader-passage-html'
      data-book-id={section.bookId}
      data-chapter={section.chapter}
      onClick={handleClick}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  )
}

function ReaderPassageStack({
  passageShellRef,
  sectionRefs,
  sections,
  readerView,
  focusedSectionKey,
  isLoadingSections,
  selectedId,
  onSelectVerse,
  onToggleBookmark,
  onToggleHighlight,
  bookmarkedVerseIds,
  highlightedVerseIds,
  highlightColors,
  bookCodeById,
}: ReaderPassageStackProps) {
  const { t } = useI18n()
  const [openMenuVerseId, setOpenMenuVerseId] = useState<string | null>(null)

  useEffect(() => {
    setOpenMenuVerseId(null)
  }, [selectedId])

  useEffect(() => {
    if (!openMenuVerseId) return
    const handler = (e: MouseEvent) => {
      const menu = document.querySelector('.yv-reader-verse-mark-menu')
      if (menu && !menu.contains(e.target as Node)) {
        setOpenMenuVerseId(null)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [openMenuVerseId])

  const [htmlMarkInfo, setHtmlMarkInfo] = useState<{ verseId: string; yvPassageId: string } | null>(null)
  const [htmlMarkTop, setHtmlMarkTop] = useState<number | null>(null)
  const [htmlMarkLeft, setHtmlMarkLeft] = useState<number | null>(null)

  const [contextMenu, setContextMenu] = useState<{ verseId: string; yvPassageId: string; x: number; y: number } | null>(null)
  const touchTimerRef = useRef<number | null>(null)
  const touchStartRef = useRef<{ x: number; y: number } | null>(null)
  const touchTargetRef = useRef<{ bookId: string; chapter: number; verse: string } | null>(null)

  const resolveVerseFromNode = (node: EventTarget | HTMLElement | null) => {
    const el = (node as HTMLElement | null)?.closest?.('.yv-v[v]') as HTMLElement | null
    if (!el) return null
    const verse = el.getAttribute('v')
    const article = el.closest('article[data-book-id]') as HTMLElement | null
    const bookId = article?.getAttribute('data-book-id')
    const chapter = Number(article?.getAttribute('data-chapter'))
    if (!verse || !bookId || Number.isNaN(chapter)) return null
    return { bookId, chapter, verse, yvPassageId: `${bookId}.${chapter}.${verse}` }
  }

  const handleContextMenu = (e: ReactMouseEvent<HTMLDivElement>) => {
    const info = resolveVerseFromNode(e.target)
    if (!info) return
    e.preventDefault()
    setContextMenu({ verseId: info.yvPassageId, yvPassageId: info.yvPassageId, x: e.clientX, y: e.clientY })
  }

  const LONG_PRESS_MS = 600
  const LONG_PRESS_MOVE_PX = 10

  const handleTouchStart = (e: ReactTouchEvent<HTMLDivElement>) => {
    const info = resolveVerseFromNode(e.target)
    if (!info) return
    const touch = e.touches[0]
    touchTargetRef.current = info
    touchStartRef.current = { x: touch.clientX, y: touch.clientY }
    if (touchTimerRef.current) window.clearTimeout(touchTimerRef.current)
    touchTimerRef.current = window.setTimeout(() => {
      touchTimerRef.current = null
      touchStartRef.current = null
      setContextMenu({ verseId: info.yvPassageId, yvPassageId: info.yvPassageId, x: touch.clientX, y: touch.clientY })
    }, LONG_PRESS_MS)
  }

  const handleTouchMove = (e: ReactTouchEvent<HTMLDivElement>) => {
    if (!touchStartRef.current || !touchTimerRef.current) return
    const touch = e.touches[0]
    const dx = touch.clientX - touchStartRef.current.x
    const dy = touch.clientY - touchStartRef.current.y
    if (Math.sqrt(dx * dx + dy * dy) > LONG_PRESS_MOVE_PX) {
      window.clearTimeout(touchTimerRef.current)
      touchTimerRef.current = null
      touchStartRef.current = null
      touchTargetRef.current = null
    }
  }

  const handleTouchEnd = () => {
    if (touchTimerRef.current) window.clearTimeout(touchTimerRef.current)
    touchTimerRef.current = null
    touchStartRef.current = null
    touchTargetRef.current = null
  }

  useLayoutEffect(() => {
    const shell = passageShellRef.current
    if (!shell) return
    shell.querySelectorAll('.yv-reader-passage-html .yv-v.selected').forEach((el) => el.classList.remove('selected'))
    setHtmlMarkInfo(null)
    setHtmlMarkTop(null)
    setHtmlMarkLeft(null)
    if (!selectedId) return
    const parts = selectedId.split('.')
    const verse = parts.pop()
    const chapter = Number(parts.pop())
    const bookCode = parts.join('.')
    if (!verse || Number.isNaN(chapter)) return
    const section = sections.find(
      (s) => (s.bookId === bookCode || (bookCodeById?.[s.bookId] ?? s.bookId) === bookCode) && s.chapter === chapter,
    )
    if (!section) return
    const target = shell.querySelector(
      `.yv-reader-passage-html[data-book-id="${CSS.escape(section.bookId)}"][data-chapter="${section.chapter}"] .yv-v[v="${CSS.escape(verse)}"]`,
    ) as HTMLElement | null
    if (!target) return
    if (readerView === 'html') {
      const stack = shell.querySelector('.yv-reader-passage-stack') as HTMLElement | null
      if (stack) {
        const range = document.createRange()
        range.selectNodeContents(target)
        const targetRects = range.getClientRects()
        const lastRect = targetRects[targetRects.length - 1] ?? target.getBoundingClientRect()
        const stackRect = stack.getBoundingClientRect()
        setHtmlMarkTop(lastRect.top - stackRect.top)
        setHtmlMarkLeft(lastRect.right - stackRect.left)
      }
    }
    target.classList.add('selected')
    if (readerView === 'html') {
      setHtmlMarkInfo({ verseId: selectedId, yvPassageId: `${section.bookId}.${section.chapter}.${verse}` })
    }
  }, [selectedId, sections, bookCodeById, passageShellRef, readerView, highlightedVerseIds, bookmarkedVerseIds, highlightColors])

  function VerseMarkButton({
    verseId,
    yvPassageId,
    isBookmarked,
    isHighlighted,
    highlightColor,
  }: {
    verseId: string
    yvPassageId: string
    isBookmarked: boolean
    isHighlighted: boolean
    highlightColor?: string
  }) {
    const isOpen = openMenuVerseId === verseId
    const markIcon =
      isBookmarked && isHighlighted ? (
        <Bookmark size={14} fill={highlightColor} />
      ) : isBookmarked ? (
        <Bookmark size={14} fill='currentColor' />
      ) : isHighlighted ? (
        <Highlighter size={14} fill={highlightColor} />
      ) : (
        <Highlighter size={14} fill='none' />
      )

    return (
      <div className='yv-reader-verse-mark'>
        <button
          type='button'
          className='yv-reader-verse-mark-button'
          title={t('mark')}
          aria-label={t('mark')}
          onClick={(e) => {
            e.stopPropagation()
            setOpenMenuVerseId(isOpen ? null : verseId)
          }}
        >
          {markIcon}
        </button>
        {isOpen && (
          <div
            className='yv-reader-verse-mark-menu'
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type='button'
              onClick={(e) => {
                e.stopPropagation()
                onToggleBookmark?.(verseId, yvPassageId)
                setOpenMenuVerseId(null)
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
                    onToggleHighlight?.(verseId, yvPassageId, color)
                    setOpenMenuVerseId(null)
                  }}
                />
              ))}
            </div>
            {isHighlighted && (
              <button
                type='button'
                onClick={(e) => {
                  e.stopPropagation()
                  onToggleHighlight?.(verseId, yvPassageId)
                  setOpenMenuVerseId(null)
                }}
              >
                {t('removeHighlight')}
              </button>
            )}
          </div>
        )}
      </div>
    )
  }

  if (!sections.length) {
    return (
      <div className='yv-reader-passage-shell' ref={passageShellRef}>
        <div className='empty'>Select a passage to begin reading.</div>
      </div>
    )
  }

  return (
    <div
      className='yv-reader-passage-shell'
      ref={passageShellRef}
      onContextMenu={handleContextMenu}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      <div className='yv-reader-passage-stack'>
        {sections.map((section) => (
          <Fragment key={section.key}>
            <article
              ref={(node) => {
                sectionRefs.current?.set(section.key, node)
              }}
              className={`yv-reader-section ${section.key === focusedSectionKey ? 'active' : ''}`}
              data-book-id={section.bookId}
              data-chapter={section.chapter}
            >
              <div className='yv-reader-section-header'>
                <div>
                  <strong>{section.reference}</strong>
                  <span>{section.passageId}</span>
                </div>
              </div>

              {readerView === 'chapter' ? (
                section.verses.length ? (
                  <div className='yv-reader-verse-stack'>
                    {section.verses.map((verse) => {
                      const yvVerseId = `${section.bookId}.${section.chapter}.${verse.verse}`
                      const localVerseId = `${bookCodeById?.[section.bookId] ?? section.bookId}.${section.chapter}.${verse.verse}`
                      const selected = selectedId === yvVerseId || selectedId === localVerseId
                      const isBookmarked = bookmarkedVerseIds?.has(yvVerseId) ?? false
                      const isHighlighted = highlightedVerseIds?.has(yvVerseId) ?? false
                      const highlightColor = isHighlighted ? (highlightColors?.[yvVerseId] ?? '#F5E98A') : undefined
                      return (
                        <article
                          key={`${section.key}-${verse.verse}`}
                          className={`yv-reader-verse-card ${selected ? 'selected' : ''} ${isBookmarked ? 'bookmarked' : ''} ${isHighlighted ? 'highlighted' : ''}`}
                          data-verse={verse.verse}
                          style={highlightColor ? { ['--yv-verse-highlight' as any]: highlightColor } : undefined}
                          onClick={() => onSelectVerse?.(yvVerseId)}
                        >
                          <div className='yv-reader-verse-number'>{verse.verse}</div>
                          <div
                            className='yv-reader-verse-content'
                            dangerouslySetInnerHTML={{ __html: verse.strippedHtml }}
                          />
                          {selected && (
                            <div className='yv-reader-verse-actions'>
                              <VerseMarkButton
                                verseId={yvVerseId}
                                yvPassageId={yvVerseId}
                                isBookmarked={isBookmarked}
                                isHighlighted={isHighlighted}
                                highlightColor={highlightColor}
                              />
                            </div>
                          )}
                        </article>
                      )
                    })}
                  </div>
                ) : (
                  <div className='empty'>No verse markers found.</div>
                )
              ) : readerView === 'verse' ? (
                section.verses.length ? (
                  <div className='yv-reader-verse-flow'>
                    {section.verses.map((verse) => {
                      const yvVerseId = `${section.bookId}.${section.chapter}.${verse.verse}`
                      const localVerseId = `${bookCodeById?.[section.bookId] ?? section.bookId}.${section.chapter}.${verse.verse}`
                      const selected = selectedId === yvVerseId || selectedId === localVerseId
                      const isBookmarked = bookmarkedVerseIds?.has(yvVerseId) ?? false
                      const isHighlighted = highlightedVerseIds?.has(yvVerseId) ?? false
                      const highlightColor = isHighlighted ? (highlightColors?.[yvVerseId] ?? '#F5E98A') : undefined
                      return (
                        <article
                          key={`${section.key}-${verse.verse}`}
                          className={`yv-reader-verse-flow-item ${selected ? 'selected' : ''} ${isBookmarked ? 'bookmarked' : ''} ${isHighlighted ? 'highlighted' : ''}`}
                          data-verse={verse.verse}
                          style={highlightColor ? { ['--yv-verse-highlight' as any]: highlightColor } : undefined}
                          onClick={() => onSelectVerse?.(yvVerseId)}
                        >
                          <div className='yv-reader-verse-flow-content' dangerouslySetInnerHTML={{ __html: verse.html }} />
                          {selected && (
                            <div className='yv-reader-verse-actions'>
                              <VerseMarkButton
                                verseId={yvVerseId}
                                yvPassageId={yvVerseId}
                                isBookmarked={isBookmarked}
                                isHighlighted={isHighlighted}
                                highlightColor={highlightColor}
                              />
                            </div>
                          )}
                        </article>
                      )
                    })}
                  </div>
                ) : (
                  <div className='empty'>No verse markers found.</div>
                )
              ) : (
                <HtmlSection
                  section={section}
                  bookCodeById={bookCodeById}
                  highlightedVerseIds={highlightedVerseIds}
                  bookmarkedVerseIds={bookmarkedVerseIds}
                  highlightColors={highlightColors}
                  onSelectVerse={onSelectVerse}
                />
              )}
            </article>
          </Fragment>
        ))}

        {isLoadingSections ? (
          <div className='empty yv-reader-loading-more' style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            Loading more chapters...
          </div>
        ) : null}

        {readerView === 'html' && htmlMarkInfo && htmlMarkTop !== null && htmlMarkLeft !== null ? (
          <div className='yv-reader-verse-mark-float' style={{ top: htmlMarkTop, left: htmlMarkLeft }}>
            <VerseMarkButton
              verseId={htmlMarkInfo.verseId}
              yvPassageId={htmlMarkInfo.yvPassageId}
              isBookmarked={bookmarkedVerseIds?.has(htmlMarkInfo.verseId) ?? false}
              isHighlighted={highlightedVerseIds?.has(htmlMarkInfo.verseId) ?? false}
              highlightColor={highlightColors?.[htmlMarkInfo.verseId]}
            />
          </div>
        ) : null}
      </div>

      {contextMenu && onToggleBookmark && onToggleHighlight && (
        <MarkMenu
          isBookmarked={bookmarkedVerseIds?.has(contextMenu.verseId) ?? false}
          isHighlighted={highlightedVerseIds?.has(contextMenu.verseId) ?? false}
          highlightColor={highlightColors?.[contextMenu.verseId]}
          onToggleBookmark={() => {
            onToggleBookmark(contextMenu.verseId, contextMenu.yvPassageId)
            setContextMenu(null)
          }}
          onToggleHighlight={(color) => {
            onToggleHighlight(contextMenu.verseId, contextMenu.yvPassageId, color)
            setContextMenu(null)
          }}
          onClose={() => setContextMenu(null)}
          style={{ position: 'fixed', top: contextMenu.y, left: contextMenu.x, right: 'auto', zIndex: 1000 }}
        />
      )}
    </div>
  )
}

export default ReaderPassageStack
