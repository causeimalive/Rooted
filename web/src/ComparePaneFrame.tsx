import { memo, type ReactNode } from 'react'

type ComparePaneFrameProps = {
  paneRef: { current: HTMLDivElement | null }
  onScroll: () => void
  header?: ReactNode
  children: ReactNode
}

function ComparePaneFrame({
  paneRef,
  onScroll,
  header,
  children,
}: ComparePaneFrameProps) {
  return (
    <section className="yv-reader-compare-pane">
      {header ? <div className="yv-reader-compare-pane-header">{header}</div> : null}
      <div ref={paneRef} className="yv-reader-compare-pane-body" onScroll={onScroll}>
        {children}
      </div>
    </section>
  )
}

export default memo(ComparePaneFrame)
