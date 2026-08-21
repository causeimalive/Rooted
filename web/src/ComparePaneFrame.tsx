import { memo, type ReactNode, type MouseEvent } from 'react'

type ComparePaneFrameProps = {
  paneRef: { current: HTMLElement | null }
  onScroll: () => void
  onMouseOver?: (event: MouseEvent<HTMLElement>) => void
  onMouseLeave?: (event: MouseEvent<HTMLElement>) => void
  children: ReactNode
}

function ComparePaneFrame({
  paneRef,
  onScroll,
  onMouseOver,
  onMouseLeave,
  children,
}: ComparePaneFrameProps) {
  return (
    <section ref={paneRef} className="yv-reader-compare-pane" onScroll={onScroll} onMouseOver={onMouseOver} onMouseLeave={onMouseLeave}>
      <div className="yv-reader-compare-pane-body">
        {children}
      </div>
    </section>
  )
}

export default memo(ComparePaneFrame)
