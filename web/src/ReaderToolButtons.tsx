import { memo } from 'react'
import { AlignJustify, ArrowLeftRight, BookOpen, Loader2, MousePointer2, Pause, Play, Quote, RefreshCw, Tag, Type } from 'lucide-react'
import type { ReaderView } from './types'

type ReaderToolButtonsProps = {
  readerView: ReaderView
  compareOpen: boolean
  autoScrollEnabled: boolean
  redLetterEnabled: boolean
  hoverHighlightEnabled: boolean
  entityHighlightsEnabled: boolean
  onSetReaderView: (view: ReaderView) => void
  onToggleCompare: () => void
  onToggleAutoScroll: () => void
  onToggleRedLetter: () => void
  onToggleHoverHighlight: () => void
  onToggleEntityHighlights: () => void
  onOpenBookInfo?: () => void
  bookInfoLabel?: string
  bookInfoOpen?: boolean
  chapterLabel?: string
  splitLayout?: boolean
  hideCompareButton?: boolean
  hideAutoScrollButton?: boolean
  audioUrl?: string
  audioPlaying?: boolean
  audioLoading?: boolean
  onToggleAudio?: () => void
}

type LegendItem = {
  tag: string
  label: string
  color: string
}

const LEGEND: LegendItem[] = [
  { tag: 'div', label: 'Divine', color: '#c4a35a' },
  { tag: 'dq', label: 'Direct quote', color: '#d15a5a' },
  { tag: 'ndq', label: 'Indirect quote', color: '#b8a8e0' },
  { tag: 'per', label: 'Person', color: '#5a9fd1' },
  { tag: 'geo', label: 'Place', color: '#5ad18b' },
  { tag: 'grp', label: 'Group', color: '#d19c5a' },
]

function ReaderToolButtons({
  readerView,
  compareOpen,
  autoScrollEnabled,
  redLetterEnabled,
  hoverHighlightEnabled,
  entityHighlightsEnabled,
  onSetReaderView,
  onToggleCompare,
  onToggleAutoScroll,
  onToggleRedLetter,
  onToggleHoverHighlight,
  onToggleEntityHighlights,
  onOpenBookInfo,
  bookInfoLabel,
  bookInfoOpen,
  chapterLabel,
  splitLayout,
  hideCompareButton,
  hideAutoScrollButton,
  audioUrl,
  audioPlaying,
  audioLoading,
  onToggleAudio,
}: ReaderToolButtonsProps) {
  const legendOpen = entityHighlightsEnabled

  const viewButtons = (
    <>
      {!hideCompareButton ? (
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
      ) : null}
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
    </>
  )

  const toolButtons = (
    <>
      <button
        type="button"
        className={`yv-reader-meta-icon-button ${hoverHighlightEnabled ? 'active' : ''}`}
        aria-pressed={hoverHighlightEnabled}
        aria-label={hoverHighlightEnabled ? 'Turn hover highlight off' : 'Turn hover highlight on'}
        title={hoverHighlightEnabled ? 'Hover highlight on' : 'Hover highlight off'}
        onClick={onToggleHoverHighlight}
      >
        <MousePointer2 size={15} />
      </button>
      {!hideAutoScrollButton ? (
        <button
          type="button"
          className={`yv-reader-meta-icon-button ${autoScrollEnabled ? 'active' : ''}`}
          aria-pressed={autoScrollEnabled}
          aria-label={autoScrollEnabled ? 'Turn auto sync off' : 'Turn auto sync on'}
          title={autoScrollEnabled ? 'Auto sync on' : 'Auto sync off'}
          onClick={onToggleAutoScroll}
        >
          <RefreshCw size={15} />
        </button>
      ) : null}
      <button
        type="button"
        className={`yv-reader-meta-icon-button ${redLetterEnabled ? 'active' : ''}`}
        aria-pressed={redLetterEnabled}
        aria-label={redLetterEnabled ? 'Turn red letter off' : 'Turn red letter on'}
        title={redLetterEnabled ? 'Red letter on' : 'Red letter off'}
        onClick={onToggleRedLetter}
      >
        <Quote size={15} />
      </button>
      <button
        type="button"
        className={`yv-reader-meta-icon-button ${entityHighlightsEnabled ? 'active' : ''}`}
        aria-pressed={entityHighlightsEnabled}
        aria-label={entityHighlightsEnabled ? 'Turn named-entity highlights off' : 'Turn named-entity highlights on'}
        title={entityHighlightsEnabled ? 'Named-entity highlights on' : 'Named-entity highlights off'}
        onClick={onToggleEntityHighlights}
      >
        <Tag size={15} />
      </button>
      {onToggleAudio && (
        <button
          type="button"
          className={`yv-reader-meta-icon-button ${audioPlaying ? 'active' : ''}`}
          aria-pressed={audioPlaying}
          aria-label={audioPlaying ? 'Pause audio' : audioLoading ? 'Loading audio' : audioUrl ? 'Play audio' : 'No audio'}
          title={audioPlaying ? 'Pause audio' : audioLoading ? 'Loading audio' : audioUrl ? 'Play audio' : 'No audio'}
          onClick={onToggleAudio}
          disabled={!audioUrl || audioLoading}
        >
          {audioLoading ? <Loader2 size={15} className="spin" /> : audioPlaying ? <Pause size={15} /> : <Play size={15} />}
        </button>
      )}
    </>
  )

  const centerSpot = chapterLabel ? (
    <div className="yv-reader-chapter-spot" title="Current chapter and verse" aria-label="Current chapter and verse">
      <span className="yv-reader-chapter-spot-ref">{chapterLabel}</span>
    </div>
  ) : null

  if (splitLayout && centerSpot) {
    return (
      <div className="yv-reader-nav-tools yv-reader-nav-tools-split" role="group" aria-label="Reading tools">
        <div className="yv-reader-tool-group">{viewButtons}</div>
        {centerSpot}
        <div className="yv-reader-tool-group">{toolButtons}</div>
      </div>
    )
  }

  return (
    <div className="yv-reader-nav-tools" role="group" aria-label="Reading tools">
      {viewButtons}
      {toolButtons}

      <div className={`yv-reader-entity-legend ${legendOpen ? 'open' : ''}`} aria-hidden={!legendOpen}>
        {LEGEND.map((item) => (
          <div key={item.tag} className="yv-reader-legend-item">
            <span className="yv-reader-legend-swatch" style={{ backgroundColor: item.color, borderColor: item.color }} />
            <span className="yv-reader-legend-label">{item.label}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

export default memo(ReaderToolButtons)
