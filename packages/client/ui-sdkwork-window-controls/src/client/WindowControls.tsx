/**
 * Custom window controls for the frameless Electron shell. The shell overlay
 * owns the sole interactive cluster so details-column width cannot move it
 * away from the window edge; the Session-header registration reserves the
 * cluster's width beside "Session log". The cluster is pure presentation over
 * the preload's `windowControls` surface: one-shot actions, an initial maximize
 * query, and a maximize/restore subscription so the toggle glyph follows the
 * real state (keyboard snap, double-click drag region). Absent the bridge
 * surface (web composition, fixture mode) neither registration renders.
 */
import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import clsx from 'clsx'
import type { DesktopWindowControls } from '@deepseek-ai/dsh-client-connection/client'
import type { InjectFace, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import css from './WindowControls.module.css'

/** Which OS's window-control conventions the cluster draws. */
export type WindowControlsPlatform = 'win32' | 'darwin' | 'linux' | 'other'

/**
 * Map a Chromium platform identifier to the supported window-control metrics.
 * @param raw - the platform string, e.g. "Win32", "MacIntel", "Linux x86_64".
 * @returns the convention set; unknown strings fall back to the default.
 */
export function resolvePlatform(raw: string): WindowControlsPlatform {
  const platform = raw.toLowerCase()
  if (platform === 'darwin' || platform.includes('mac')) return 'darwin'
  if (platform === 'win32' || platform.startsWith('win')) return 'win32'
  if (platform.includes('linux')) return 'linux'
  return 'other'
}

/**
 * Resolve the host OS's window-control convention set from Chromium's
 * user-agent platform, falling back to `navigator.platform`.
 * @returns the convention set; unknown or absent platforms fall back to the default.
 */
export function platformOf(): WindowControlsPlatform {
  const navigatorLike = (globalThis as {
    navigator?: { platform?: string; userAgentData?: { platform?: string } }
  }).navigator
  const raw = navigatorLike?.userAgentData?.platform ?? navigatorLike?.platform
  return resolvePlatform(raw ?? '')
}

/** Business face the plugin injects: the preload's window surface, when present. */
export interface WindowControlsInjected {
  /** The Electron preload surface; undefined in the browser composition. */
  windowControls: DesktopWindowControls | undefined
  /** The host OS's window-control convention set (glyph size, placement). */
  platform: WindowControlsPlatform
}

/** Full props of the inline Session-header utility occupant. */
export type WindowControlsProps =
  PropsRuntime<'conversation.session.header.utilities'>
  & InjectFace<WindowControlsInjected>

/** Full props of the floating shell-overlay occupant. */
export type FloatingWindowControlsProps =
  PropsRuntime<'shell.overlay'>
  & InjectFace<WindowControlsInjected>

/** One glyph box; platform metrics scale the shared 10-unit paths. */
function Glyph(props: { children: ReactNode }): ReactNode {
  return (
    <svg className={css.glyph} viewBox="0 0 10 10" aria-hidden="true">
      {props.children}
    </svg>
  )
}

/** Minimize glyph: a centered horizontal rule. */
function MinimizeGlyph(): ReactNode {
  return <Glyph><path d="M1 5h8" stroke="currentColor" strokeWidth="1" /></Glyph>
}

/** Maximize glyph: one hollow square. */
function MaximizeGlyph(): ReactNode {
  return <Glyph><rect x="1" y="1" width="8" height="8" fill="none" stroke="currentColor" strokeWidth="1" /></Glyph>
}

/** Restore glyph: the front square over the back square's top/right edges. */
function RestoreGlyph(): ReactNode {
  return (
    <Glyph>
      <path d="M3.5 0.5h6v6" fill="none" stroke="currentColor" strokeWidth="1" />
      <rect x="0.5" y="3.5" width="6" height="6" fill="none" stroke="currentColor" strokeWidth="1" />
    </Glyph>
  )
}

/** Close glyph: an X. */
function CloseGlyph(): ReactNode {
  return <Glyph><path d="M1 1l8 8M9 1l-8 8" stroke="currentColor" strokeWidth="1" /></Glyph>
}

/**
 * The three-button control cluster (minimize / maximize-restore / close).
 * Component-private state only: the toggle glyph's live bit. Subscribing to
 * the bridge here is the one external read this component owns — window state
 * is window-global but only the controls consume it, so a store would be a
 * shared source with a single reader.
 * @param props - the bridge surface and host platform convention set.
 * @returns the interactive control cluster.
 */
function ControlsCluster(props: {
  controls: DesktopWindowControls
  platform: WindowControlsPlatform
}): ReactNode {
  const { controls, platform } = props
  const [maximized, setMaximized] = useState(false)
  useEffect(() => {
    let alive = true
    void controls.isMaximized().then((state) => { if (alive) setMaximized(state) })
    const detach = controls.onMaximizedChanged(setMaximized)
    return () => { alive = false; detach() }
  }, [controls])
  const maximizeLabel = maximized ? '还原' : '最大化'
  return (
    <div
      className={css.cluster}
      data-platform={platform}
      role="group"
      aria-label="窗口控制"
    >
      <button type="button" className={css.button} aria-label="最小化" title="最小化" onClick={() => { controls.minimize() }}>
        <MinimizeGlyph />
      </button>
      <button type="button" className={css.button} aria-label={maximizeLabel} title={maximizeLabel} onClick={() => { controls.toggleMaximize() }}>
        {maximized ? <RestoreGlyph /> : <MaximizeGlyph />}
      </button>
      <button type="button" className={clsx(css.button, css.close)} aria-label="关闭" title="关闭" onClick={() => { controls.close() }}>
        <CloseGlyph />
      </button>
    </div>
  )
}

/**
 * The inline occupant of `conversation.session.header.utilities`: reserves the
 * platform cluster width after the Session-log utility while the sole live
 * cluster stays anchored by `shell.overlay`.
 * @param props - session runtime share plus the injected window surface.
 * @returns the platform-sized spacer, or nothing without the preload surface.
 */
export function WindowControls({ windowControls, platform }: WindowControlsProps): ReactNode {
  if (windowControls === undefined) return null
  return <span className={css.inlineSpacer} data-platform={platform} aria-hidden="true" />
}

/**
 * The `shell.overlay` occupant: pins the sole control cluster to the window's
 * top-right across hero, Session-header, and details-panel states.
 * @param props - root runtime share (global session list) plus the injected window surface.
 * @returns the floating cluster, or nothing without the preload surface.
 */
export function FloatingWindowControls({ windowControls, platform }: FloatingWindowControlsProps): ReactNode {
  if (windowControls === undefined) return null
  return (
    <div className={css.floating} data-platform={platform} data-dsh-window-controls>
      <ControlsCluster controls={windowControls} platform={platform} />
    </div>
  )
}
