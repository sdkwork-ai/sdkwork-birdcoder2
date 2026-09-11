/**
 * Four-column shell frame, registered into the built-in 'root' slot (the web
 * shell renders only 'root'). Owns the grid tracks (mode rail | sidebar |
 * center | rightbar), the drag handles (pointer capture + rAF throttle), the
 * column solve (columns.ts), and the child-slot render decisions: the mode
 * rail and sidebar slots receive live parameters from that solve, and the
 * center column renders the active app mode's surface — the main-panel slot
 * (Conversation or a global panel) in code mode, the keyed mode page
 * otherwise. Each column occupant owns its Session binding and reports the
 * geometry it needs.
 *
 * The right column is a track, not a box: its occupant draws its panel anchored
 * to the frame's right edge at the resolved normal width, and the
 * track only decides whether the centre makes room for it. The occupant reports
 * shown/track/fullscreen through `ctx.layout`; fullscreen keeps the reported
 * track but hides the outer resize handle. Everything arrives through the framework
 * shares — zero cordis or framework imports, zero self-made hooks.
 */
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import type {
  PropsLocale, PropsRenderSlots, PropsRuntime, PropsStore,
} from '@deepseek-ai/dsh-client-ui-slots'
import {
  computeColumns, MODE_RAIL_WIDTH, RIGHTBAR_DEFAULT_RATIO, SIDEBAR_AUTO_COLLAPSE, SIDEBAR_DEFAULT,
} from './columns.ts'
import type { AppModeId } from './modes.ts'
import { DocumentTitle } from './DocumentTitle.tsx'
import type { createLayoutStore } from './stores.ts'
import css from './AppFrame.module.css'

/** Full composed props: runtime share + child-slot render share + store share. */
export type AppFrameProps =
  & PropsRuntime<'root'>
  & PropsRenderSlots<'mode.rail' | 'sidebar' | 'main' | 'mode.page' | 'rightbar' | 'shell.overlay' | 'shell.window-title'>
  & PropsStore<ReturnType<typeof createLayoutStore>>
  & PropsLocale<'common'>

/** Center column grid item (session-body building block). */
function CenterColumn(props: { children?: ReactNode }) {
  return <div className={css.centerCol}>{props.children}</div>
}

/** Subscribe to the main key without subscribing the column frame to each panel id. */
function MainPanel({ usePanelInfo, renderSlot }: Pick<PropsRuntime<'root'>, 'usePanelInfo'> & PropsRenderSlots<'main'>) {
  const panelId = usePanelInfo(info => info.activePanelId)
  return renderSlot('main', {}, { entryKey: panelId ?? 'conversation' })
}

/**
 * Right column grid item. Zero-width unless the occupant asked for a track; the
 * occupant's panel is positioned against the column's right edge, which never
 * moves, so it can hang over the centre when there is no track.
 */
function RightbarColumn(props: { children?: ReactNode }) {
  return <div className={css.rightbarCol} data-rightbar-col>{props.children}</div>
}

/**
 * One drag handle: pointer capture, rAF-throttled dx reports against the drag-start origin.
 * `side` keys the hover-reveal CSS to the owning column.
 */
function DragHandle(props: { side: 'sidebar' | 'rightbar'; left: number; onStart: () => void; onDrag: (dx: number) => void; onEnd: () => void }) {
  const [dragging, setDragging] = useState(false)
  const origin = useRef(0)
  const latest = useRef(0)
  const frame = useRef<number | null>(null)
  const capture = useRef<{ element: HTMLDivElement; id: number } | null>(null)
  const callbacks = useRef({ onStart: props.onStart, onDrag: props.onDrag, onEnd: props.onEnd })
  callbacks.current = { onStart: props.onStart, onDrag: props.onDrag, onEnd: props.onEnd }

  const endDrag = useCallback(() => {
    const active = capture.current
    if (active === null) return
    capture.current = null
    if (frame.current !== null) { cancelAnimationFrame(frame.current); frame.current = null }
    if (active.element.hasPointerCapture(active.id)) active.element.releasePointerCapture(active.id)
    setDragging(false)
    callbacks.current.onEnd()
  }, [])
  useEffect(() => endDrag, [endDrag])

  const onPointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0 || capture.current !== null) return
    e.preventDefault()
    e.currentTarget.setPointerCapture(e.pointerId)
    capture.current = { element: e.currentTarget, id: e.pointerId }
    origin.current = e.clientX
    latest.current = e.clientX
    callbacks.current.onStart()
    setDragging(true)
  }, [])
  const onPointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (capture.current?.id !== e.pointerId) return
    latest.current = e.clientX
    frame.current ??= requestAnimationFrame(() => {
      frame.current = null
      callbacks.current.onDrag(latest.current - origin.current)
    })
  }, [])
  const onPointerUp = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (capture.current?.id !== e.pointerId) return
    callbacks.current.onDrag(e.clientX - origin.current)
    endDrag()
  }, [endDrag])
  const onPointerCancel = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (capture.current?.id === e.pointerId) endDrag()
  }, [endDrag])

  return (
    <div
      className={css.handle}
      style={{ left: props.left }}
      data-side={props.side}
      data-dragging={dragging || undefined}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
      onLostPointerCapture={onPointerCancel}
    />
  )
}

/** The three-column frame (see module doc). */
export function AppFrame({
  useStore,
  useSessions,
  usePanelInfo,
  actions,
  renderSlot,
  t,
}: AppFrameProps) {
  const layoutInfo = useStore(state => state.layoutInfo)
  const frameRef = useRef<HTMLDivElement | null>(null)
  // Raw measured frame width (rail included) — reported to the right column's
  // occupant, whose fullscreen layer covers the whole frame.
  const rawWidth = useRef(layoutInfo.viewportWidth)
  const viewport = layoutInfo.viewportWidth
  // The fixed mode rail never participates in the solve: the store already
  // tracks the post-rail width, and the center absorbs any deficit exactly
  // as before.
  const solvable = viewport

  // Track the frame's own box (not the window): rAF-throttled ResizeObserver.
  useLayoutEffect(() => {
    const el = frameRef.current
    /* v8 ignore next -- the ref is always attached by effect time: the frame div renders unconditionally. */
    if (el === null) return
    let raf: number | null = null
    let disposed = false
    const measure = () => {
      const width = el.getBoundingClientRect().width
      if (width <= 0) return
      rawWidth.current = width
      // The store tracks the post-rail frame: every breakpoint decision and
      // preference derivation uses the same width the solve runs on.
      actions.setViewportWidth(width - MODE_RAIL_WIDTH)
    }
    measure()
    const observer = new ResizeObserver(() => {
      if (disposed) return
      raf ??= requestAnimationFrame(() => {
        raf = null
        measure()
      })
    })
    observer.observe(el)
    return () => {
      disposed = true
      observer.disconnect()
      if (raf !== null) cancelAnimationFrame(raf)
    }
  }, [actions])

  const narrow = solvable < SIDEBAR_AUTO_COLLAPSE
  const sidebarCollapsed = narrow ? !layoutInfo.narrowExpanded : layoutInfo.sidebar === 0
  const sidebarPreference = sidebarCollapsed
    ? 0
    : layoutInfo.sidebar === 0 ? SIDEBAR_DEFAULT : layoutInfo.sidebar
  // `mode` is the rail selection (which rail entry is lit); `panelMode` is a
  // code-surface overlay opened by the sidebar-launched modules (Pull Request,
  // automation, markets). The center column renders the overlay page while
  // `mode` stays `code`, so the code rail entry keeps its selection; the
  // sidebar stays mounted beside the overlay exactly like a rail mode page.
  const panelMode = layoutInfo.panelMode
  const effectiveMode: AppModeId = panelMode ?? layoutInfo.mode
  const codeMode = effectiveMode === 'code'
  // Immersive rail modes own the frame outright: the sidebar renders beside
  // the code surface and its overlay modules only.
  const sidebarVisible = codeMode
    || effectiveMode === 'pull-request'
    || effectiveMode === 'automation'
    || effectiveMode === 'markets'
  // The right column is session-bound code-surface chrome: rail mode pages
  // render without it (the stored preference is untouched and restored).
  const rightbarPreference = codeMode
    ? (layoutInfo.rightbar ?? solvable * RIGHTBAR_DEFAULT_RATIO)
    : 0
  // Opening on a narrow frame collapses the left sidebar. Eligibility must
  // include that space before the occupant's first shown report arrives.
  const normal = computeColumns(solvable, !layoutInfo.rightbarShown && narrow ? 0 : sidebarPreference, rightbarPreference)
  const cols = computeColumns(solvable, sidebarPreference, codeMode && layoutInfo.rightbarTrack ? rightbarPreference : 0)
  const colsRef = useRef(cols)
  colsRef.current = cols
  const rightbarWidth = useRef(normal.rightbar)
  rightbarWidth.current = normal.rightbar

  // The drag base is the rendered width captured at drag start (grabbing a
  // concession-clamped panel must not jump back to the stored preference);
  // it stays frozen for the whole gesture so dx deltas do not compound.
  const sidebarBase = useRef(0)
  const rightbarBase = useRef(0)
  // Track-level transitions pause for the whole gesture: eased tracks would
  // detach the column edge from the pointer (AppFrame.module.css).
  const [dragging, setDragging] = useState(false)
  const onDragEnd = useCallback(() => { setDragging(false) }, [])
  const onSidebarStart = useCallback(() => { sidebarBase.current = colsRef.current.sidebar; setDragging(true) }, [])
  const onSidebarDrag = useCallback((dx: number) => {
    actions.setSidebar(sidebarBase.current + dx)
  }, [actions])
  const onRightbarStart = useCallback(() => { rightbarBase.current = rightbarWidth.current; setDragging(true) }, [])
  const onRightbarDrag = useCallback((dx: number) => {
    actions.setRightbar(rightbarBase.current - dx)
  }, [actions])
  const productTitle = process.env.DSH_CLIENT_TITLE ?? t('brand.localBuild')
  const sidebar = useMemo(() => renderSlot('sidebar', {
    collapsed: sidebarCollapsed,
    width: cols.sidebar,
  }), [renderSlot, sidebarCollapsed, cols.sidebar])
  const main = useMemo(() => (
    <MainPanel usePanelInfo={usePanelInfo} renderSlot={renderSlot} />
  ), [usePanelInfo, renderSlot])
  const overlays = useMemo(() => renderSlot('shell.overlay', {}), [renderSlot])

  return (
    <div
      ref={frameRef}
      className={css.frame}
      style={{
        gridTemplateColumns:
          `${MODE_RAIL_WIDTH}px ${sidebarVisible ? cols.sidebar : 0}px minmax(0, 1fr) ${cols.rightbar}px`,
      }}
      data-mode={layoutInfo.mode}
      data-sidebar-hidden={!sidebarVisible || undefined}
      data-sidebar-collapsed={sidebarCollapsed || undefined}
      data-rightbar-collapsed={cols.rightbar === 0 || undefined}
      data-rightbar-fullscreen={layoutInfo.rightbarFullscreen || undefined}
      data-rightbar-instant={layoutInfo.rightbarInstant || undefined}
      data-dragging={dragging || undefined}
    >
      <div className={css.railCol}>
        {/* Render-site slot call with the live mode state: the occupant (the
            app-mode rail) receives the active mode and the switch action from
            the frame's store, so it never needs the layout service. */}
        {renderSlot('mode.rail', { mode: layoutInfo.mode, setMode: actions.setMode })}
      </div>
      {/* The browser title follows the Session only while the code surface owns
          the center column; a non-code mode page is titled by the window-title
          seat instead, and unmounting this projection releases the title back
          to the product name before that seat names its module. */}
      {codeMode && (
        <DocumentTitle
          productTitle={productTitle}
          useSessions={useSessions}
          usePanelInfo={usePanelInfo}
        />
      )}
      <div className={css.sidebarCol}>
        {sidebarVisible && sidebar}
      </div>
      <>
        {codeMode
          ? <CenterColumn>{main}</CenterColumn>
          : <CenterColumn>
            {renderSlot('shell.window-title', { mode: effectiveMode, productTitle })}
            <div className={css.pageBody}>
              {renderSlot('mode.page', {}, { entryKey: effectiveMode })}
            </div>
          </CenterColumn>}
        <RightbarColumn>
          {renderSlot('rightbar', { width: normal.rightbar, viewportWidth: rawWidth.current, canShow: normal.rightbar > 0 })}
        </RightbarColumn>
      </>
      <div className={css.overlayLayer} data-shell-overlay>
        {overlays}
      </div>
      {/* The collapsed rail is fixed-width: no resize handle while closed. */}
      {sidebarVisible && !sidebarCollapsed && <DragHandle side="sidebar" left={MODE_RAIL_WIDTH + cols.sidebar} onStart={onSidebarStart} onDrag={onSidebarDrag} onEnd={onDragEnd} />}
      {layoutInfo.rightbarShown && !layoutInfo.rightbarFullscreen && normal.rightbar > 0 && (
        <DragHandle side="rightbar" left={rawWidth.current - normal.rightbar} onStart={onRightbarStart} onDrag={onRightbarDrag} onEnd={onDragEnd} />
      )}
    </div>
  )
}
