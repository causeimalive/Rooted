import { memo, useCallback, useMemo } from 'react'
import type { YouVersionBook } from './youversion'

function chapterNumbers(book: YouVersionBook | undefined): number[] {
  return (book?.chapters ?? [])
    .map((chapter) => Number(chapter.id || chapter.title))
    .filter((value) => Number.isFinite(value))
}

type ReaderChapterListProps = {
  navBook: YouVersionBook | undefined
  activeChapter: number
  onSelectChapter: (bookId: string, chapter: number) => void
}

function ReaderChapterList({ navBook, activeChapter, onSelectChapter }: ReaderChapterListProps) {
  const chapterNumbersList = useMemo(() => chapterNumbers(navBook), [navBook])
  const bookId = navBook?.id ?? 'book'
  const scrollable = chapterNumbersList.length > 66

  const handleClick = useCallback(
    (event: React.MouseEvent<HTMLButtonElement>) => {
      const chapter = Number(event.currentTarget.dataset.chapter)
      if (!Number.isFinite(chapter) || !navBook) return
      onSelectChapter(navBook.id, chapter)
    },
    [navBook, onSelectChapter],
  )

  return (
    <div className="yv-reader-chapter-container">
      <div className="yv-reader-nav-section yv-reader-chapter-section">
        <div className="yv-reader-nav-section-label">Chapters</div>
        <div className={`yv-reader-chapter-list ${scrollable ? 'yv-reader-chapter-list-scrollable' : ''}`}>
          {chapterNumbersList.map((chapterNumber) => (
            <button
              key={`${bookId}-${chapterNumber}`}
              type="button"
              data-chapter={chapterNumber}
              className={`yv-chapter-pill ${chapterNumber === activeChapter ? 'active' : ''}`}
              onClick={handleClick}
            >
              {chapterNumber}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

export default memo(ReaderChapterList)
