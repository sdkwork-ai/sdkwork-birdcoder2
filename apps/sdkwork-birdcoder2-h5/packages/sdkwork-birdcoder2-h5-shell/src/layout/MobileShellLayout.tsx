/**
 * The mobile shell chrome: a sticky title bar, the routed screen, and the
 * bottom tab bar.
 *
 * Copy is injected rather than imported, so the shell owns layout and no
 * capability package's message catalog leaks into it. Tab entries come from the
 * registry, which means a capability that adds a `tab` route appears in the
 * navigation without the shell being edited.
 */
import { NavLink, Outlet, useLocation } from 'react-router-dom'

import type { BirdCoder2H5RouteRegistry } from '@sdkwork/birdcoder2-h5-core'

import { resolveBirdCoder2H5RouteIcon } from '../routing/routeIcons.ts'

/** Copy the application root supplies to the shell. */
export interface BirdCoder2H5ShellLabels {
  /** Shown when a route declares no title. */
  readonly productName: string
  /** Route i18n key to display label. */
  readonly routeLabels: Readonly<Record<string, string>>
}

export interface MobileShellLayoutProps {
  readonly registry: BirdCoder2H5RouteRegistry
  readonly labels: BirdCoder2H5ShellLabels
}

function tabClassName(isActive: boolean): string {
  return [
    'flex flex-1 flex-col items-center justify-center gap-0.5 text-xs transition-colors',
    isActive ? 'font-medium text-primary' : 'text-muted-foreground',
  ].join(' ')
}

/**
 * Resolves the header title for a path, falling back to the product name.
 *
 * The lookup runs against every route, not just the tabbed ones. A `screen`
 * route (`/hosts/enroll`) declares a `titleKey` exactly like a tab does, and
 * searching only the tab bar silently discarded it — the enrollment screen used
 * to show the conversation title because `route.hostEnroll` was unreachable.
 */
export function resolveBirdCoder2H5RouteTitle(
  pathname: string,
  registry: BirdCoder2H5RouteRegistry,
  labels: BirdCoder2H5ShellLabels,
): string {
  const titleKey = registry.findByPath(pathname)?.titleKey
  if (titleKey === undefined) {
    return labels.routeLabels['route.chat'] ?? labels.productName
  }
  return labels.routeLabels[titleKey] ?? titleKey
}

export function MobileShellLayout({ registry, labels }: MobileShellLayoutProps) {
  const location = useLocation()
  const title = resolveBirdCoder2H5RouteTitle(location.pathname, registry, labels)

  return (
    <div className="flex min-h-screen flex-col bg-background" data-testid="mobile-shell">
      <header className="sticky top-0 z-10 border-b border-border bg-surface">
        <div className="flex h-12 items-center px-4">
          <h1 className="text-base font-semibold">{title}</h1>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto">
        <Outlet />
      </main>

      <nav
        className="sticky bottom-0 border-t border-border bg-surface"
        style={{ paddingBottom: 'var(--sdkwork-safe-area-bottom)' }}
      >
        <div className="flex h-14">
          {registry.tabs.map((tab) => {
            const Icon = resolveBirdCoder2H5RouteIcon(tab.iconKey ?? '')
            return (
              <NavLink
                key={tab.id}
                to={tab.path}
                end={tab.path === '/'}
                className={({ isActive }) => tabClassName(isActive)}
                data-route-id={tab.id}
              >
                {/*
                  The glyph is decorative: the label beside it carries the name,
                  so exposing the icon would announce every tab twice. `size` is
                  explicit because the library default (24) does not shrink with
                  the `text-xs` label and overflows a 56px tab bar.
                */}
                <Icon aria-hidden="true" size={20} strokeWidth={1.75} />
                <span>{labels.routeLabels[tab.tabLabelKey ?? ''] ?? tab.component}</span>
              </NavLink>
            )
          })}
        </div>
      </nav>
    </div>
  )
}
