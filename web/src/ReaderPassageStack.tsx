import { Fragment, memo, type RefObject } from 'react'

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
}

function ReaderPassageStack({
  passageShellRef,
  sectionRefs,
  sections,
  readerView,
  focusedSectionKey,
  isLoadingSections,
}: ReaderPassageStackProps) {
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
                    {section.verses.map((verse) => (
                      <article
                        key={`${section.key}-${verse.verse}`}
                        className="yv-reader-verse-card"
                        data-verse={verse.verse}
                      >
                        <div className="yv-reader-verse-number">{verse.verse}</div>
                        <div
                          className="yv-reader-verse-content"
                          dangerouslySetInnerHTML={{ __html: verse.strippedHtml }}
                        />
                      </article>
                    ))}
                  </div>
                ) : (
                  <div className="empty">No verse markers found.</div>
                )
              ) : readerView === 'verse' ? (
                section.verses.length ? (
                  <div className="yv-reader-verse-flow">
                    {section.verses.map((verse) => (
                      <article
                        key={`${section.key}-${verse.verse}`}
                        className="yv-reader-verse-flow-item"
                        data-verse={verse.verse}
                      >
                        <div className="yv-reader-verse-flow-content" dangerouslySetInnerHTML={{ __html: verse.html }} />
                      </article>
                    ))}
                  </div>
                ) : (
                  <div className="empty">No verse markers found.</div>
                )
              ) : (
                <article
                  className="yv-reader-passage yv-reader-passage-html"
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
