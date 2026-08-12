import { Fragment, memo, useLayoutEffect, type RefObject } from 'react'
import { Highlighter } from 'lucide-react'
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
  bookmarkedVerseIds?: Set<string>
  bookCodeById?: Record<string, string>
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
  bookmarkedVerseIds,
  bookCodeById,
}: ReaderPassageStackProps) {
  const { t } = useI18n()
  useLayoutEffect(() => {
    const shell = passageShellRef.current
    if (!shell) return
    const previous = shell.querySelectorAll('.yv-reader-passage-html .yv-v.selected')
    previous.forEach((el) => el.classList.remove('selected'))
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
    if (target) target.classList.add('selected')
  }, [selectedId, sections, bookCodeById, passageShellRef])

  if (!sections.length) {
    return (
      <div className="yv-reader-passage-shell" ref={passageShellRef}>
        <div className="empty">Select a passage to begin reading.</div>
      </div>
    )
  }

  return (
    <div className="yv-reader-passage-shell" ref={passageShellRef}>
      <div className="yv-reader-passage-stack">
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
              <div className="yv-reader-section-header">
                <div>
                  <strong>{section.reference}</strong>
                  <span>{section.passageId}</span>
                </div>
              </div>

              {readerView === 'chapter' ? (
                section.verses.length ? (
                  <div className="yv-reader-verse-stack">
                    {section.verses.map((verse) => {
                      const bookCode = bookCodeById?.[section.bookId] ?? section.bookId
                      const verseId = `${bookCode}.${section.chapter}.${verse.verse}`
                      const yvPassageId = `${section.bookId}.${section.chapter}.${verse.verse}`
                      const selected = selectedId === verseId
                      const isBookmarked = bookmarkedVerseIds?.has(verseId) ?? false
                      const label = isBookmarked ? t('unbookmark') : t('bookmark')
                      return (
                        <article
                          key={`${section.key}-${verse.verse}`}
                          className={`yv-reader-verse-card ${selected ? 'selected' : ''} ${isBookmarked ? 'bookmarked' : ''}`}
                          data-verse={verse.verse}
                          onClick={() => onSelectVerse?.(verseId)}
                        >
                          <div className="yv-reader-verse-number">{verse.verse}</div>
                          <div
                            className="yv-reader-verse-content"
                            dangerouslySetInnerHTML={{ __html: verse.strippedHtml }}
                          />
                          {selected && (
                            <button
                              type="button"
                              className="yv-reader-verse-bookmark"
                              title={label}
                              aria-label={label}
                              onClick={(e) => {
                                e.stopPropagation()
                                onToggleBookmark?.(verseId, yvPassageId)
                              }}
                            >
                              <Highlighter size={14} fill={isBookmarked ? 'currentColor' : 'none'} />
                            </button>
                          )}
                        </article>
                      )
                    })}
                  </div>
                ) : (
                  <div className="empty">No verse markers found.</div>
                )
              ) : readerView === 'verse' ? (
                section.verses.length ? (
                  <div className="yv-reader-verse-flow">
                    {section.verses.map((verse) => {
                      const bookCode = bookCodeById?.[section.bookId] ?? section.bookId
                      const verseId = `${bookCode}.${section.chapter}.${verse.verse}`
                      const yvPassageId = `${section.bookId}.${section.chapter}.${verse.verse}`
                      const selected = selectedId === verseId
                      const isBookmarked = bookmarkedVerseIds?.has(verseId) ?? false
                      const label = isBookmarked ? t('unbookmark') : t('bookmark')
                      return (
                        <article
                          key={`${section.key}-${verse.verse}`}
                          className={`yv-reader-verse-flow-item ${selected ? 'selected' : ''} ${isBookmarked ? 'bookmarked' : ''}`}
                          data-verse={verse.verse}
                          onClick={() => onSelectVerse?.(verseId)}
                        >
                          <div className="yv-reader-verse-flow-content" dangerouslySetInnerHTML={{ __html: verse.html }} />
                          {selected && (
                            <button
                              type="button"
                              className="yv-reader-verse-bookmark"
                              title={label}
                              aria-label={label}
                              onClick={(e) => {
                                e.stopPropagation()
                                onToggleBookmark?.(verseId, yvPassageId)
                              }}
                            >
                              <Highlighter size={14} fill={isBookmarked ? 'currentColor' : 'none'} />
                            </button>
                          )}
                        </article>
                      )
                    })}
                  </div>
                ) : (
                  <div className="empty">No verse markers found.</div>
                )
              ) : (
                <article
                  className="yv-reader-passage yv-reader-passage-html"
                  data-book-id={section.bookId}
                  data-chapter={section.chapter}
                  dangerouslySetInnerHTML={{ __html: section.content }}
                />
              )}
            </article>
          </Fragment>
        ))}

        {isLoadingSections ? (
          <div className="empty yv-reader-loading-more" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            Loading more chapters...
          </div>
        ) : null}
      </div>
    </div>
  )
}

export default memo(ReaderPassageStack)
