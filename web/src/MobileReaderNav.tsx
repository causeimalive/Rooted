import { memo, useState } from 'react'
import { Loader2, Pause, Volume2 } from 'lucide-react'
import MobileWheelPicker, { type WheelOption } from './MobileWheelPicker'

type MobileReaderNavProps = {
  bookOptions: WheelOption<string>[]
  chapterOptions: WheelOption<number>[]
  verseOptions: WheelOption<number>[]
  versionOptions: WheelOption<number>[]
  compareVersionOptions?: WheelOption<number>[]
  activeBookId: string
  activeChapter: number
  activeVerse?: number
  activeVersionId: number | null
  activeCompareVersionId?: number | null
  audioAvailable?: boolean
  audioLoading?: boolean
  audioPlaying?: boolean
  compareOpen?: boolean
  onSelectBook: (bookId: string) => void
  onSelectChapter: (chapter: number) => void
  onSelectVerse: (verse: number) => void
  onSelectVersion: (id: number) => void
  onSelectCompareVersion?: (id: number) => void
  onToggleAudio?: () => void
}

function MobileReaderNav({
  bookOptions,
  chapterOptions,
  verseOptions,
  versionOptions,
  compareVersionOptions,
  activeBookId,
  activeChapter,
  activeVerse = 1,
  activeVersionId,
  activeCompareVersionId,
  audioAvailable,
  audioLoading,
  audioPlaying,
  compareOpen,
  onSelectBook,
  onSelectChapter,
  onSelectVerse,
  onSelectVersion,
  onSelectCompareVersion,
  onToggleAudio,
}: MobileReaderNavProps) {
  const [open, setOpen] = useState<'book' | 'chapterVerse' | 'version' | 'compare' | null>(null)
  const close = () => setOpen(null)

  const activeBook = bookOptions.find((book) => book.value === activeBookId)
  const activeVersion = versionOptions.find((version) => version.value === activeVersionId)
  const activeCompareVersion = compareVersionOptions?.find((version) => version.value === activeCompareVersionId)
  const audioDisabled = !onToggleAudio || audioLoading || !audioAvailable
  const audioLabel = audioLoading ? 'Loading audio' : audioPlaying ? 'Pause audio' : 'Play audio'
  const audioIcon = audioLoading ? <Loader2 size={15} className="spin" /> : audioPlaying ? <Pause size={15} /> : <Volume2 size={15} />
  const showCompare = Boolean(compareOpen && compareVersionOptions && onSelectCompareVersion)

  return (
    <div className={`mobile-reader-nav ${showCompare ? 'mobile-reader-nav--compare-open' : ''}`}>
      <button type="button" className="mobile-reader-nav-pill" onClick={() => setOpen('version')}>
        <span className="mobile-reader-nav-label">Version</span>
        <span className="mobile-reader-nav-value">{activeVersion?.label || 'Version'}</span>
      </button>
      <button type="button" className="mobile-reader-nav-pill" onClick={() => setOpen('book')}>
        <span className="mobile-reader-nav-label">Book</span>
        <span className="mobile-reader-nav-value">{activeBook?.label || 'Book'}</span>
      </button>
      <button type="button" className="mobile-reader-nav-pill mobile-reader-nav-pill--split" onClick={() => setOpen('chapterVerse')}>
        <span className="mobile-reader-nav-label">Chapter / Verse</span>
        <span className="mobile-reader-nav-value">{activeChapter}:{activeVerse}</span>
      </button>
      
      <button type="button" className="mobile-reader-nav-pill mobile-reader-nav-pill--audio" onClick={() => void onToggleAudio?.()} aria-label={audioLabel} title={audioLabel} disabled={audioDisabled}>
        <span className="mobile-reader-nav-label">Audio</span>
        <span className="mobile-reader-nav-value mobile-reader-nav-value--icon">{audioIcon}</span>
      </button>
      {showCompare ? (
        <button type="button" className="mobile-reader-nav-pill" onClick={() => setOpen('compare')}>
          <span className="mobile-reader-nav-label">Compare</span>
          <span className="mobile-reader-nav-value">{activeCompareVersion?.label || 'Compare'}</span>
        </button>
      ) : null}

      <MobileWheelPicker
        open={open === 'book'}
        onClose={close}
        title="Select book"
        subtitle={activeBook?.subtitle}
        options={bookOptions}
        activeValue={activeBookId}
        onSelect={onSelectBook}
        closeOnSelect={false}
      />
      <MobileWheelPicker
        open={open === 'version'}
        onClose={close}
        title="Select version"
        options={versionOptions}
        activeValue={activeVersionId ?? -1}
        onSelect={onSelectVersion}
        closeOnSelect={false}
      />
      <MobileWheelPicker
        open={open === 'chapterVerse'}
        onClose={close}
        title="Chapter"
        subtitle={activeBook?.label}
        options={chapterOptions}
        activeValue={activeChapter}
        onSelect={onSelectChapter}
        closeOnSelect={false}
        secondaryTitle="Verse"
        secondarySubtitle={`${activeBook?.label || ''} ${activeChapter}`}
        secondaryOptions={verseOptions}
        secondaryActiveValue={activeVerse}
        onSelectSecondary={onSelectVerse}
        secondaryCloseOnSelect={false}
      />
      {showCompare && compareVersionOptions && onSelectCompareVersion ? (
        <MobileWheelPicker
          open={open === 'compare'}
          onClose={close}
          title="Select compare version"
          options={compareVersionOptions}
          activeValue={activeCompareVersionId ?? -1}
          onSelect={onSelectCompareVersion}
          closeOnSelect={false}
        />
      ) : null}
    </div>
  )
}

export default memo(MobileReaderNav)
