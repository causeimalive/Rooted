import { memo } from 'react'
import { AlignJustify, ArrowLeftRight, Bookmark, BookOpen, Type } from 'lucide-react'
import type { ReaderView, Verse } from './types'

type ReaderToolButtonsProps = {
  readerView: ReaderView
  compareOpen: boolean
  selectedVerse?: Verse
  onSetReaderView: (view: ReaderView) => void
  onToggleCompare: () => void
  onSelectVerse: (verseId: string) => void
}

function ReaderToolButtons({
  readerView,
  compareOpen,
  selectedVerse,
  onSetReaderView,
  onToggleCompare,
  onSelectVerse,
}: ReaderToolButtonsProps) {
  const handleSelectVerse = () => {
    if (selectedVerse) onSelectVerse(selectedVerse.id)
  }

  return (
    <div className="yv-reader-nav-tools" role="group" aria-label="Reading tools">
      <button
        type="button"
        className={`yv-reader-meta-icon-button ${readerView === 'html' ? 'active' : ''}`}
        aria-pressed={readerView === 'html'}
        aria-label="Full reading flow"
        title="Full reading flow"
        onClick={() => onSetReaderView('html')}
      >
        <Type size={15} />
      </button>
      <button
        type="button"
        className={`yv-reader-meta-icon-button ${readerView === 'chapter' ? 'active' : ''}`}
        aria-pressed={readerView === 'chapter'}
        aria-label="Chapter reading flow"
        title="Chapter reading flow"
        onClick={() => onSetReaderView('chapter')}
      >
        <BookOpen size={15} />
      </button>
      <button
        type="button"
        className={`yv-reader-meta-icon-button ${readerView === 'verse' ? 'active' : ''}`}
        aria-pressed={readerView === 'verse'}
        aria-label="Verse reading flow"
        title="Verse reading flow"
        onClick={() => onSetReaderView('verse')}
      >
        <AlignJustify size={15} />
      </button>
      <button
        type="button"
        className={`yv-reader-meta-icon-button ${compareOpen ? 'active' : ''}`}
        aria-pressed={compareOpen}
        aria-label={compareOpen ? 'Turn compare mode off' : 'Turn compare mode on'}
        title={compareOpen ? 'Compare on' : 'Compare off'}
        onClick={onToggleCompare}
      >
        <ArrowLeftRight size={15} />
      </button>
      <button
        type="button"
        className="yv-reader-meta-icon-button"
        aria-label="Highlight selected verse"
        title="Highlight selected verse"
        onClick={handleSelectVerse}
        disabled={!selectedVerse}
      >
        <Bookmark size={15} />
      </button>
    </div>
  )
}

export default memo(ReaderToolButtons)
