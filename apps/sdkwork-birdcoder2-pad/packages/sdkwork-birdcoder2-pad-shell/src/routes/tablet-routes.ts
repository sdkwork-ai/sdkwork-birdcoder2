export type TabletRouteSurface = 'app' | 'console' | 'admin'

export type TabletPresentation = 'page' | 'split' | 'inspector' | 'sheet' | 'popover' | 'dialog'

/**
 * Route identity shared with PC, H5, and native roots:
 * `<surface>.<domain>.<capability>.<screen>`.
 */
export interface SdkworkTabletRouteContribution {
  readonly id: string
  readonly path: string
  readonly surface: TabletRouteSurface
  readonly titleKey: string
  readonly permissionHint?: string
  readonly presentation: {
    readonly pad: TabletPresentation
  }
}

const ROUTE_ID = /^(?:app|console|admin)\.[a-z0-9]+(?:-[a-z0-9]+)*\.[a-z0-9]+(?:-[a-z0-9]+)*\.[a-z0-9]+(?:-[a-z0-9]+)*$/u

export function isTabletRouteId(value: string): boolean {
  return ROUTE_ID.test(value)
}

export function assertTabletRouteId(value: string): void {
  if (!isTabletRouteId(value)) {
    throw new Error(
      `route id must follow <surface>.<domain>.<capability>.<screen> with app/console/admin surface: ${value}`,
    )
  }
}
