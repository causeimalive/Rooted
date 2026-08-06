import { memo, type ReactNode } from 'react'

type ComparePaneFrameProps = {
  paneRef: { current: HTMLElement | null }
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
    <section ref={paneRef} className="yv-reader-compare-pane" onScroll={onScroll}>
      {header ? <div className="yv-reader-compare-pane-header">{header}</div> : null}
      <div className="yv-reader-compare-pane-body">
        {children}
      </div>
    </section>
  )
}

export default memo(ComparePaneFrame)
