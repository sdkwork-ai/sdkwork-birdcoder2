/**
 * Mobile device simulator: renders web content inside an authentic device frame
 * with notch/cutout emulation, safe-area handling, screen rotation, and
 * user-agent override. Supports two display modes — inline (embedded in the
 * host layout) and modal (centered overlay with backdrop). Both modes share the
 * same frame and toolbar components, differing only in their mounting chrome.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode, CSSProperties } from 'react'
import clsx from 'clsx'
import {
  ALL_DEVICES, deviceUserAgent, findDevice, frameColorValue,
  type DeviceSpec, type FrameColor, type NotchStyle,
} from './devices.ts'
import css from './MobileSimulator.module.css'

/** Display mode: inline embeds in layout; modal floats over a backdrop. */
export type SimulatorMode = 'inline' | 'modal'

/** Runtime orientation of the simulated screen. */
export type Orientation = 'portrait' | 'landscape'

/** Props shared by both display modes. */
interface SimulatorCoreProps {
  /** The URL to load inside the simulator frame. */
  url: string
  /** Initial device to simulate; defaults to the first catalog entry. */
  initialDeviceId?: string
  /** Display mode — inline embeds in layout, modal floats over a backdrop. */
  mode: SimulatorMode
  /** Initial orientation. */
  initialOrientation?: Orientation
  /** Whether the device selector toolbar renders. */
  showToolbar?: boolean
  /** Invoked when the modal requests to close (backdrop click, Esc, close button). */
  onClose?: () => void
  /** Invoked when the active device changes. */
  onDeviceChange?: (device: DeviceSpec) => void
  /** Invoked when orientation changes. */
  onOrientationChange?: (orientation: Orientation) => void
  /** Invoked when the loaded URL changes (user navigated inside the frame). */
  onUrlChange?: (url: string) => void
  /** Extra class on the outermost simulator node. */
  className?: string
}

/** Computed screen metrics for the active device and orientation. */
interface ScreenMetrics {
  /** CSS width of the screen area (the iframe viewport). */
  screenWidth: number
  /** CSS height of the screen area. */
  screenHeight: number
  /** Frame width including bezels. */
  frameWidth: number
  /** Frame height including bezels. */
  frameHeight: number
  /** The insets applied to the screen inside the frame. */
  safeArea: readonly [number, number, number, number]
}

/**
 * Resolve the simulated screen and frame metrics for the active device and
 * orientation. Orientation swaps width/height and the safe-area inset order.
 * @param device - the active device spec.
 * @param orientation - the current orientation.
 * @returns computed screen and frame metrics.
 */
function computeMetrics(device: DeviceSpec, orientation: Orientation): ScreenMetrics {
  const isLandscape = orientation === 'landscape'
  const logicalWidth = isLandscape ? device.height : device.width
  const logicalHeight = isLandscape ? device.width : device.height
  const bezel = 16 // total horizontal bezel (8px each side)
  const bezelV = 20 // total vertical bezel
  const safeBase = device.safeArea
  const safeArea: readonly [number, number, number, number] = isLandscape
    ? [safeBase[3], safeBase[0], safeBase[1], safeBase[2]]
    : [...safeBase]
  return {
    screenWidth: logicalWidth,
    screenHeight: logicalHeight,
    frameWidth: logicalWidth + bezel,
    frameHeight: logicalHeight + bezelV,
    safeArea,
  }
}

/**
 * The notch/cutout graphic rendered at the top of the device frame. Each style
 * renders a different SVG/CSS shape matching the physical device design.
 * @param notch - the notch style to render.
 * @param frameColor - current frame color for contrast.
 */
function NotchDisplay({ notch, frameColor }: { notch: NotchStyle; frameColor: FrameColor }): ReactNode {
  const isLight = frameColor === 'white' || frameColor === 'silver' || frameColor === 'gold'
  const stroke = isLight ? 'rgba(0,0,0,0.3)' : 'rgba(255,255,255,0.3)'
  switch (notch) {
    case 'none': return null
    case 'dynamic-island':
      return (
        <span
          className={css.dynamicIsland}
          data-testid="notch-dynamic-island"
          aria-hidden="true"
        />
      )
    case 'notch':
      return (
        <span className={css.notch} data-testid="notch-traditional" aria-hidden="true">
          <svg viewBox="0 0 150 30" preserveAspectRatio="none" className={css.notchSvg}>
            <path d="M0 0h42a8 8 0 0 1 8 8v14a8 8 0 0 1-8 8H0V0zM150 0h-42a8 8 0 0 0-8 8v14a8 8 0 0 0 8 8h42V0z"
              fill="none" stroke={stroke} strokeWidth="1" />
            <rect x="55" y="6" width="40" height="18" rx="9" fill="rgba(0,0,0,0.85)" />
            <circle cx="75" cy="15" r="4" fill="#1a1a2e" />
          </svg>
        </span>
      )
    case 'punch-hole':
      return (
        <span className={css.punchHole} data-testid="notch-punch-hole" aria-hidden="true" />
      )
    case 'waterdrop':
      return (
        <span className={css.waterdrop} data-testid="notch-waterdrop" aria-hidden="true" />
      )
  }
}

/**
 * The top status bar rendered inside the frame, showing carrier, time, signal,
 * and battery. Content is cosmetic — the simulator is a development tool and
 * does not mirror real telephony state.
 * @param device - active device spec (affects layout).
 * @param orientation - current orientation.
 */
function StatusBar({ device, orientation }: { device: DeviceSpec; orientation: Orientation }): ReactNode {
  const isLandscape = orientation === 'landscape'
  if (isLandscape) return null
  const isApple = device.brand === 'Apple'
  return (
    <div className={css.statusBar} role="presentation">
      <span className={css.statusLeft}>
        {isApple ? '9:41' : '12:00'}
      </span>
      <span className={css.statusRight}>
        <span className={css.statusIcon} aria-hidden="true">
          <svg viewBox="0 0 16 12" width="16" height="12">
            <rect x="0" y="8" width="3" height="4" rx="0.5" fill="currentColor" />
            <rect x="4" y="5" width="3" height="7" rx="0.5" fill="currentColor" />
            <rect x="8" y="2" width="3" height="10" rx="0.5" fill="currentColor" />
            <rect x="12" y="0" width="3" height="12" rx="0.5" fill="currentColor" opacity="0.4" />
          </svg>
        </span>
        <span className={css.statusIcon} aria-hidden="true">
          <svg viewBox="0 0 16 12" width="16" height="12">
            <path d="M8 2C5 2 2.5 3.5 1 5l1.5 1.5C3.5 5 5.5 4 8 4s4.5 1 5.5 2.5L15 5C13.5 3.5 11 2 8 2z" fill="currentColor" />
            <path d="M8 6c-1.5 0-3 .8-4 2l1.5 1.5C6 8.5 7 8 8 8s2 .5 2.5 1.5L12 8c-1-1.2-2.5-2-4-2z" fill="currentColor" />
            <circle cx="8" cy="11" r="1.5" fill="currentColor" />
          </svg>
        </span>
        <span className={css.statusBattery} aria-hidden="true">
          <svg viewBox="0 0 24 12" width="24" height="12">
            <rect x="0.5" y="0.5" width="20" height="11" rx="2" fill="none" stroke="currentColor" strokeWidth="1" />
            <rect x="2" y="2" width="14" height="8" rx="1" fill="currentColor" />
            <rect x="21" y="4" width="2.5" height="4" rx="0.5" fill="currentColor" opacity="0.5" />
          </svg>
        </span>
      </span>
    </div>
  )
}

/**
 * The simulator toolbar: device selector, orientation toggle, URL bar, and
 * (in modal mode) the close control. The toolbar sits outside the physical
 * frame so it does not consume screen pixels.
 * @param props - toolbar dependencies.
 */
function SimulatorToolbar(props: {
  device: DeviceSpec
  orientation: Orientation
  url: string
  showToolbar: boolean
  isModal: boolean
  onDeviceSelect: (id: string) => void
  onToggleOrientation: () => void
  onUrlChange: (url: string) => void
  onClose?: () => void
}): ReactNode {
  if (!props.showToolbar) return null
  const { device, orientation, url } = props
  return (
    <div className={css.toolbar}>
      <div className={css.toolbarLeft}>
        <select
          className={css.deviceSelect}
          value={device.id}
          onChange={(e) => { props.onDeviceSelect(e.target.value) }}
          aria-label="选择设备"
          title="选择设备"
        >
          {ALL_DEVICES.map(d => (
            <option key={d.id} value={d.id}>{d.name}</option>
          ))}
        </select>
        <button
          type="button"
          className={css.toolbarBtn}
          onClick={props.onToggleOrientation}
          aria-label={orientation === 'portrait' ? '切换横屏' : '切换竖屏'}
          title={orientation === 'portrait' ? '切换横屏' : '切换竖屏'}
        >
          <svg viewBox="0 0 20 20" width="16" height="16" aria-hidden="true">
            {orientation === 'portrait'
              ? <path d="M6 2h8a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2zm0 2v12h8V4H6z" fill="currentColor" />
              : <path d="M2 6v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2zm2 0h12v8H4V6z" fill="currentColor" />}
          </svg>
        </button>
      </div>
      <div className={css.toolbarCenter}>
        <input
          className={css.urlInput}
          type="url"
          value={url}
          onChange={(e) => { props.onUrlChange(e.target.value) }}
          onKeyDown={(e) => { if (e.key === 'Enter') props.onUrlChange(e.currentTarget.value) }}
          aria-label="网址"
          placeholder="输入网址"
        />
      </div>
      <div className={css.toolbarRight}>
        {props.isModal && (
          <button
            type="button"
            className={css.closeBtn}
            onClick={props.onClose}
            aria-label="关闭模拟器"
            title="关闭 (Esc)"
          >
            <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
              <path d="M2 2l12 12M14 2L2 14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </button>
        )}
      </div>
    </div>
  )
}

/**
 * The device frame: bezels, notch/cutout, status bar, and the iframe viewport.
 * The iframe is scaled to fit the available container while preserving aspect
 * ratio. Physical metrics (radius, bezel width) scale with the device.
 * @param props - frame dependencies.
 */
function DeviceFrame(props: {
  device: DeviceSpec
  orientation: Orientation
  frameColor: FrameColor
  url: string
  metrics: ScreenMetrics
  scale: number
}): ReactNode {
  const { device, orientation, frameColor, url, metrics } = props
  const frameStyle: CSSProperties = {
    width: `${metrics.frameWidth}px`,
    height: `${metrics.frameHeight}px`,
    borderRadius: `${device.radius * scale}px`,
    backgroundColor: frameColorValue(frameColor),
    transform: `scale(${props.scale})`,
  }
  const screenStyle: CSSProperties = {
    width: `${metrics.screenWidth}px`,
    height: `${metrics.screenHeight}px`,
    paddingTop: `${metrics.safeArea[0]}px`,
    paddingRight: `${metrics.safeArea[1]}px`,
    paddingBottom: `${metrics.safeArea[2]}px`,
    paddingLeft: `${metrics.safeArea[3]}px`,
  }
  const ua = useMemo(() => deviceUserAgent(device), [device])
  return (
    <div className={clsx(css.frame, css[`frame-${orientation}`])} style={frameStyle} data-device={device.id} data-orientation={orientation}>
      <NotchDisplay notch={device.notch} frameColor={frameColor} />
      <div className={css.screen} style={screenStyle}>
        <StatusBar device={device} orientation={orientation} />
        <iframe
          className={css.viewport}
          src={url}
          title={`${device.name} 模拟器`}
          sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-presentation"
          referrerPolicy="no-referrer"
          data-user-agent={ua}
        />
      </div>
      {device.hasHomeButton && <span className={css.homeButton} aria-hidden="true" />}
    </div>
  )
}

/**
 * The full simulator component — toolbar plus scalable device frame. Handles
 * device switching, orientation, URL navigation, and (in modal mode) the
 * close lifecycle.
 * @param props - see {@link SimulatorCoreProps}.
 * @returns the interactive simulator surface.
 */
export function MobileSimulator(props: SimulatorCoreProps): ReactNode {
  const {
    url: urlProp, initialDeviceId, mode, initialOrientation = 'portrait',
    showToolbar = true, onClose, onDeviceChange, onOrientationChange, onUrlChange, className,
  } = props
  const [deviceId, setDeviceId] = useState(initialDeviceId ?? ALL_DEVICES[0].id)
  const [orientation, setOrientation] = useState<Orientation>(initialOrientation)
  const [frameColor, setFrameColor] = useState<FrameColor>(() => {
    const initial = findDevice(initialDeviceId ?? ALL_DEVICES[0].id)
    return initial?.defaultColor ?? 'black'
  })
  const [url, setUrl] = useState(urlProp)
  const device = findDevice(deviceId) ?? ALL_DEVICES[0]
  const containerRef = useRef<HTMLDivElement>(null)
  const [scale, setScale] = useState(1)
  const metrics = useMemo(() => computeMetrics(device, orientation), [device, orientation])

  // Re-fit the frame to its container whenever layout metrics change.
  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    const fit = (): void => {
      const parent = container.parentElement
      if (!parent) return
      const availW = parent.clientWidth - 48 // padding + gap
      const availH = parent.parentElement ? parent.parentElement.clientHeight - 120 : 600
      const scaleX = availW / metrics.frameWidth
      const scaleY = availH / metrics.frameHeight
      setScale(Math.min(scaleX, scaleY, 1))
    }
    fit()
    const observer = new ResizeObserver(fit)
    observer.observe(container.parentElement ?? container)
    return () => { observer.disconnect() }
  }, [metrics.frameWidth, metrics.frameHeight])

  const handleDeviceSelect = useCallback((id: string): void => {
    const next = findDevice(id)
    if (!next) return
    setDeviceId(id)
    setFrameColor(next.defaultColor)
    onDeviceChange?.(next)
  }, [onDeviceChange])

  const handleToggleOrientation = useCallback((): void => {
    setOrientation(prev => {
      const next = prev === 'portrait' ? 'landscape' : 'portrait'
      onOrientationChange?.(next)
      return next
    })
  }, [onOrientationChange])

  const handleUrlChange = useCallback((nextUrl: string): void => {
    setUrl(nextUrl)
    onUrlChange?.(nextUrl)
  }, [onUrlChange])

  // Esc closes the modal.
  useEffect(() => {
    if (mode !== 'modal' || !onClose) return
    const onKey = (e: KeyboardEvent): void => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => { window.removeEventListener('keydown', onKey) }
  }, [mode, onClose])

  const core = (
    <div className={clsx(css.simulatorRoot, css[`mode-${mode}`], className)} data-mode={mode}>
      <SimulatorToolbar
        device={device}
        orientation={orientation}
        url={url}
        showToolbar={showToolbar}
        isModal={mode === 'modal'}
        onDeviceSelect={handleDeviceSelect}
        onToggleOrientation={handleToggleOrientation}
        onUrlChange={handleUrlChange}
        onClose={mode === 'modal' ? onClose : undefined}
      />
      <div className={css.frameContainer} ref={containerRef}>
        <DeviceFrame
          device={device}
          orientation={orientation}
          frameColor={frameColor}
          url={url}
          metrics={metrics}
          scale={scale}
        />
      </div>
    </div>
  )

  if (mode === 'modal') {
    return (
      <div className={css.modalBackdrop} onClick={onClose} role="dialog" aria-modal="true" aria-label="移动端模拟器">
        <div className={css.modalContent} onClick={(e) => { e.stopPropagation() }}>
          {core}
        </div>
      </div>
    )
  }
  return core
}

/** Re-exported types for callers that build on the simulator surface. */
export type { DeviceSpec, SimulatorCoreProps as MobileSimulatorProps }
export { findDevice, deviceUserAgent, ALL_DEVICES }
