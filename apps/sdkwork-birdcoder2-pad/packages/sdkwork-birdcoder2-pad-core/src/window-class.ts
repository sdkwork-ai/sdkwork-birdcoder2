/**
 * The four tablet window classes from APP_PAD_ARCHITECTURE_SPEC.md section 5.1.
 *
 * Detection uses actual viewport width. Device models, user-agent strings, and
 * fixed orientations are never layout inputs.
 */
export const TABLET_WINDOW_CLASSES = ['compact', 'medium', 'expanded', 'large'] as const

export type TabletWindowClass = (typeof TABLET_WINDOW_CLASSES)[number]

export type TabletNavigationMode = 'drawer' | 'rail' | 'sidebar'

export interface TabletWindowClassDefinition {
  readonly id: TabletWindowClass
  readonly minWidth: number
  /** Exclusive upper bound; `null` means unbounded. */
  readonly maxWidth: number | null
  readonly layout: 'single-column' | 'rail-and-content' | 'master-detail' | 'three-pane'
  readonly defaultNavigation: TabletNavigationMode
}

export const TABLET_WINDOW_CLASS_DEFINITIONS: readonly TabletWindowClassDefinition[] = [
  { id: 'compact', minWidth: 320, maxWidth: 600, layout: 'single-column', defaultNavigation: 'drawer' },
  { id: 'medium', minWidth: 600, maxWidth: 840, layout: 'rail-and-content', defaultNavigation: 'rail' },
  { id: 'expanded', minWidth: 840, maxWidth: 1200, layout: 'master-detail', defaultNavigation: 'sidebar' },
  { id: 'large', minWidth: 1200, maxWidth: null, layout: 'three-pane', defaultNavigation: 'sidebar' },
]

/**
 * Resolve the class for a logical viewport width.
 *
 * Below `compact` the compact class is still returned: Split View can reach a
 * narrow width, and it is a first-class state rather than an error.
 */
export function resolveWindowClass(width: number): TabletWindowClass {
  const normalized = Number.isFinite(width) ? Math.max(0, width) : 0
  for (let index = TABLET_WINDOW_CLASS_DEFINITIONS.length - 1; index >= 0; index -= 1) {
    const definition = TABLET_WINDOW_CLASS_DEFINITIONS[index]
    if (definition && normalized >= definition.minWidth) return definition.id
  }
  return 'compact'
}

export function isTabletWindowClass(value: unknown): value is TabletWindowClass {
  return typeof value === 'string' && (TABLET_WINDOW_CLASSES as readonly string[]).includes(value)
}

export function describeWindowClass(windowClass: TabletWindowClass): TabletWindowClassDefinition {
  const definition = TABLET_WINDOW_CLASS_DEFINITIONS.find(entry => entry.id === windowClass)
  if (!definition) {
    throw new Error(`unknown tablet window class: ${windowClass}`)
  }
  return definition
}
