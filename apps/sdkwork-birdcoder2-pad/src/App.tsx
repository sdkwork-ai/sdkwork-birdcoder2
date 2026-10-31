import { useEffect, useState, type CSSProperties } from 'react'

import { resolveWindowClass, type TabletWindowClass } from '@sdkwork/birdcoder2-pad-core'
import { touchTargetSize } from '@sdkwork/birdcoder2-pad-commons'
import { resolveTabletNavigation, resolveTabletPaneCount } from '@sdkwork/birdcoder2-pad-shell'

import { AuthGate } from './AuthGate'
import type { AppRuntime } from './bootstrap/runtime'
import { AppRoutes } from './bootstrap/routes'

export interface AppProps {
  readonly runtime: AppRuntime
}

/**
 * Window-class detection from the actual viewport, never from a device model or
 * user agent (APP_PAD_ARCHITECTURE_SPEC.md §5.1). The observer changes only the
 * composition class; capability route state and scroll position survive a
 * resize because the route tree is not remounted.
 */
function useWindowClass(initialWidth: number): TabletWindowClass {
  const [width, setWidth] = useState(initialWidth)
  useEffect(() => {
    if (typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0]
      if (entry) setWidth(entry.contentRect.width)
    })
    observer.observe(document.documentElement)
    return () => observer.disconnect()
  }, [])
  return resolveWindowClass(width)
}

/**
 * Tablet shell. The rail/sidebar, master-detail split, and optional inspector
 * are selected by the current window class. Business screens arrive as route
 * contributions from capability packages; this component owns no business flow.
 */
export function App({ runtime }: AppProps) {
  const initialWidth = typeof window === 'undefined' ? 1024 : window.innerWidth
  const windowClass = useWindowClass(initialWidth)
  const navigation = resolveTabletNavigation(windowClass)
  const paneCount = resolveTabletPaneCount(windowClass)
  const touchTarget = touchTargetSize(runtime.host.platform)
  const shellStyle = { '--pad-touch-target': `${touchTarget}px` } as CSSProperties

  return (
    <AuthGate runtime={runtime}>
      <div
        data-testid="pad-shell"
        data-window-class={windowClass}
        data-navigation={navigation}
        data-pane-count={paneCount}
        style={shellStyle}
      >
        <nav data-testid="pad-navigation" aria-label="Primary navigation">
          <span data-testid="pad-navigation-mode">{navigation}</span>
        </nav>
        <main data-testid="pad-content">
          <AppRoutes runtime={runtime} />
          {paneCount >= 2 ? <section data-testid="pad-detail-pane" aria-label="Detail" /> : null}
        </main>
        {paneCount >= 3 ? <aside data-testid="pad-inspector" aria-label="Inspector" /> : null}
      </div>
    </AuthGate>
  )
}
