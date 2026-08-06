import { memo, useCallback, useMemo } from 'react'
import type { YouVersionBook } from './youversion'
import { getTestamentForBook } from './bookTaxonomy'

function getBookTitle(book: YouVersionBook): string {
  return book.full_title || book.title || book.abbreviation || book.id
}

function getBookSubtitle(book: YouVersionBook): string {
  const primary = getBookTitle(book)
  const subtitle = book.title && book.title !== primary ? book.title : book.abbreviation
  return subtitle && subtitle !== primary ? subtitle : ''
}

function chapterNumbers(book: YouVersionBook | undefined): number[] {
  return (book?.chapters ?? [])
    .map((chapter) => Number(chapter.id || chapter.title))
    .filter((value) => Number.isFinite(value))
}

function formatBookRow(book: YouVersionBook): { title: string; subtitle: string } {
  return {
    title: getBookTitle(book),
    subtitle: getBookSubtitle(book) || (getTestamentForBook(book.id) === 'NT' ? 'New Testament' : 'Old Testament'),
  }
}

type ReaderBookListProps = {
  visibleBooks: YouVersionBook[]
  activeBookId: string
  onSelectBook: (bookId: string, chapter: number) => void
}

function ReaderBookList({ visibleBooks, activeBookId, onSelectBook }: ReaderBookListProps) {
  const rows = useMemo(() => visibleBooks.map((book) => ({ book, row: formatBookRow(book) })), [visibleBooks])

  const handleClick = useCallback(
    (event: React.MouseEvent<HTMLButtonElement>) => {
      const bookId = event.currentTarget.dataset.bookId
      if (!bookId) return
      const book = visibleBooks.find((b) => b.id === bookId)
      if (!book) return
      const firstChapter = chapterNumbers(book)[0] ?? 1
      onSelectBook(bookId, firstChapter)
    },
    [visibleBooks, onSelectBook],
  )

  return (
    <div className="yv-reader-book-container">
      <div className="yv-reader-nav-section">
        <div className="yv-reader-nav-section-label">Books</div>
        <div className="yv-reader-book-list yv-reader-book-list-scroll">
          {rows.map(({ book, row }) => (
            <button
              key={book.id}
              type="button"
              data-book-id={book.id}
              className={`yv-book-pill ${book.id === activeBookId ? 'active' : ''}`}
              onClick={handleClick}
            >
              <span>
                <strong>{row.title}</strong>
                <small>{row.subtitle}</small>
              </span>
              <small>{book.chapters?.length ?? 0}</small>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

export default memo(ReaderBookList)
