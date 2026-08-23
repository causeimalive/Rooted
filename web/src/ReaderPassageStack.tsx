import { Fragment, memo, useEffect, useLayoutEffect, useState, type MouseEvent as ReactMouseEvent, type RefObject } from 'react'
import { createPortal } from 'react-dom'
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

  const [htmlMarkHost, setHtmlMarkHost] = useState<HTMLElement | null>(null)
  const [htmlMarkInfo, setHtmlMarkInfo] = useState<{ verseId: string; yvPassageId: string } | null>(null)

  useLayoutEffect(() => {
    const shell = passageShellRef.current
    if (!shell) return
    shell.querySelectorAll('.yv-reader-verse-mark-host').forEach((el) => el.remove())
    shell.querySelectorAll('.yv-reader-passage-html .yv-v.selected').forEach((el) => el.classList.remove('selected'))
    setHtmlMarkHost(null)
    setHtmlMarkInfo(null)
    if (!selectedId) return
    const parts = selectedId.split('.')
    const verse = parts.pop()
    const chapter = Number(parts.pop())
    const bookCode = parts.join('.')
    if (!verse || Number.isNaN(chapter)) return
    const section = sections.find(
      (s) => (bookCodeById?.[s.bookId] ?? s.bookId) === bookCode && s.chapter === chapter,
    )
    if (!section) return
    const target = shell.querySelector(
      `.yv-reader-passage-html[data-book-id="${CSS.escape(section.bookId)}"][data-chapter="${section.chapter}"] .yv-v[v="${CSS.escape(verse)}"]`,
    ) as HTMLElement | null
    if (!target) return
    target.classList.add('selected')
    if (readerView === 'html') {
      const host = document.createElement('span')
      host.className = 'yv-reader-verse-mark-host'
      target.appendChild(host)
      setHtmlMarkHost(host)
      setHtmlMarkInfo({ verseId: selectedId, yvPassageId: `${section.bookId}.${section.chapter}.${verse}` })
    }
  }, [selectedId, sections, bookCodeById, passageShellRef, readerView])

  useLayoutEffect(() => {
    const shell = passageShellRef.current
    if (!shell || readerView !== 'html') return
    const previouslyHighlighted = shell.querySelectorAll('.yv-reader-passage-html .yv-v[data-highlighted]')
    previouslyHighlighted.forEach((el) => {
      el.removeAttribute('data-highlighted')
      ;(el as HTMLElement).style.backgroundColor = ''
    })
    if (!highlightedVerseIds?.size) return
    for (const section of sections) {
      const bookCode = bookCodeById?.[section.bookId] ?? section.bookId
      const container = shell.querySelector(
        `.yv-reader-passage-html[data-book-id="${CSS.escape(section.bookId)}"][data-chapter="${section.chapter}"]`,
      )
      if (!container) continue
      const verseEls = Array.from(container.querySelectorAll('.yv-v[v]')) as HTMLElement[]
      for (const el of verseEls) {
        const v = el.getAttribute('v')
        if (!v) continue
        const verseId = `${bookCode}.${section.chapter}.${v}`
        if (highlightedVerseIds.has(verseId)) {
          el.style.backgroundColor = highlightColors?.[verseId] ?? '#F5E98A'
          el.setAttribute('data-highlighted', 'true')
        }
      }
    }
  }, [sections, readerView, highlightedVerseIds, highlightColors, bookCodeById, passageShellRef])

  function handleHtmlVerseClick(e: ReactMouseEvent<HTMLElement>, section: ReaderSection) {
    const targetEl = (e.target as HTMLElement).closest('.yv-v[v]') as HTMLElement | null
    if (!targetEl) return
    const verseAttr = targetEl.getAttribute('v')
    if (!verseAttr) return
    const bookCode = bookCodeById?.[section.bookId] ?? section.bookId
    onSelectVerse?.(`${bookCode}.${section.chapter}.${verseAttr}`)
  }

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
    <div className='yv-reader-passage-shell' ref={passageShellRef}>
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
                      const bookCode = bookCodeById?.[section.bookId] ?? section.bookId
                      const verseId = `${bookCode}.${section.chapter}.${verse.verse}`
                      const yvPassageId = `${section.bookId}.${section.chapter}.${verse.verse}`
                      const selected = selectedId === verseId
                      const isBookmarked = bookmarkedVerseIds?.has(verseId) ?? false
                      const isHighlighted = highlightedVerseIds?.has(verseId) ?? false
                      const highlightColor = isHighlighted ? (highlightColors?.[verseId] ?? '#F5E98A') : undefined
                      return (
                        <article
                          key={`${section.key}-${verse.verse}`}
                          className={`yv-reader-verse-card ${selected ? 'selected' : ''} ${isBookmarked ? 'bookmarked' : ''} ${isHighlighted ? 'highlighted' : ''}`}
                          data-verse={verse.verse}
                          style={{ backgroundColor: highlightColor }}
                          onClick={() => onSelectVerse?.(verseId)}
                        >
                          <div className='yv-reader-verse-number'>{verse.verse}</div>
                          <div
                            className='yv-reader-verse-content'
                            dangerouslySetInnerHTML={{ __html: verse.strippedHtml }}
                          />
                          {selected && (
                            <div className='yv-reader-verse-actions'>
                              <VerseMarkButton
                                verseId={verseId}
                                yvPassageId={yvPassageId}
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
                      const bookCode = bookCodeById?.[section.bookId] ?? section.bookId
                      const verseId = `${bookCode}.${section.chapter}.${verse.verse}`
                      const yvPassageId = `${section.bookId}.${section.chapter}.${verse.verse}`
                      const selected = selectedId === verseId
                      const isBookmarked = bookmarkedVerseIds?.has(verseId) ?? false
                      const isHighlighted = highlightedVerseIds?.has(verseId) ?? false
                      const highlightColor = isHighlighted ? (highlightColors?.[verseId] ?? '#F5E98A') : undefined
                      return (
                        <article
                          key={`${section.key}-${verse.verse}`}
                          className={`yv-reader-verse-flow-item ${selected ? 'selected' : ''} ${isBookmarked ? 'bookmarked' : ''} ${isHighlighted ? 'highlighted' : ''}`}
                          data-verse={verse.verse}
                          style={{ backgroundColor: highlightColor }}
                          onClick={() => onSelectVerse?.(verseId)}
                        >
                          <div className='yv-reader-verse-flow-content' dangerouslySetInnerHTML={{ __html: verse.html }} />
                          {selected && (
                            <div className='yv-reader-verse-actions'>
                              <VerseMarkButton
                                verseId={verseId}
                                yvPassageId={yvPassageId}
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
                <article
                  className='yv-reader-passage yv-reader-passage-html'
                  data-book-id={section.bookId}
                  data-chapter={section.chapter}
                  onClick={(e) => handleHtmlVerseClick(e, section)}
                  dangerouslySetInnerHTML={{ __html: section.content }}
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
      </div>
      {readerView === 'html' && htmlMarkHost && htmlMarkInfo
        ? createPortal(
            <VerseMarkButton
              verseId={htmlMarkInfo.verseId}
              yvPassageId={htmlMarkInfo.yvPassageId}
              isBookmarked={bookmarkedVerseIds?.has(htmlMarkInfo.verseId) ?? false}
              isHighlighted={highlightedVerseIds?.has(htmlMarkInfo.verseId) ?? false}
              highlightColor={highlightColors?.[htmlMarkInfo.verseId]}
            />,
            htmlMarkHost,
          )
        : null}
    </div>
  )
}

export default memo(ReaderPassageStack)
