import { X } from 'lucide-react'
import { type NetworkNode } from './useRootedNetwork'

type NetworkVersePopupProps = {
  verse: NetworkNode | null
  onClose: () => void
  theme: 'dark' | 'light'
}

export default function NetworkVersePopup({ verse, onClose, theme }: NetworkVersePopupProps) {
  if (!verse) return null

  const reference = verse.bookId
    ? `${verse.bookId} ${verse.chapter ?? ''}:${verse.verse ?? ''}`
    : verse.id

  return (
    <div className={`yv-network-verse-popup yv-network-verse-popup-${theme}`}>
      <button type="button" className="yv-network-verse-popup-close" onClick={onClose} aria-label="Close">
        <X size={18} />
      </button>
      <div className="yv-network-verse-popup-reference">{reference}</div>
      <div className="yv-network-verse-popup-text">{verse.detail || verse.label}</div>
    </div>
  )
}
