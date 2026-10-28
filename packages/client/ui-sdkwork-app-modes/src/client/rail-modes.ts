/**
 * The mode rail's id vocabulary and display order. Extracted from ModeRail.tsx
 * so the rail-layout preference store can own the vocabulary without a
 * component import; ModeRail re-exports the constants it renders.
 */

import type { AppModeId } from '@deepseek-ai/dsh-client-ui-layout/client'

/** The rail's mode ids, in display order (top-down, WeChat-desktop style; 'work' temporarily hidden). */
const RAIL_MODE_ORDER = [
  'code', 'chat', 'contacts', 'video', 'image', 'appstore', 'knowledge', 'course', 'drive', 'assets',
  'token-plan',
] as const satisfies readonly AppModeId[]

/** Rail entry order (top-down). */
export const MODE_ORDER: readonly AppModeId[] = RAIL_MODE_ORDER

/** Mode pinned beside Settings at the bottom of the rail. */
export const PINNED_MODE: AppModeId = 'token-plan'

/**
 * The modes the user may show, hide, and reorder through the rail's customize
 * dialog. The pinned mode stays fixed: it is the bottom cluster's member, not
 * one of the top icons the dialog manages.
 */
export const CUSTOMIZABLE_MODES: readonly RailModeId[]
  = RAIL_MODE_ORDER.filter(id => id !== PINNED_MODE)

/** A mode id the customize dialog manages (the non-pinned rail vocabulary). */
export type RailModeId = Exclude<(typeof RAIL_MODE_ORDER)[number], 'token-plan'>

/**
 * Modes the rail always shows: the product's core surfaces. The customize
 * dialog cannot uncheck them, the store refuses to hide them, and a
 * rehydrated blob that hides one is clamped back to visible.
 */
export const FIXED_MODES: readonly RailModeId[] = ['code', 'image', 'video', 'knowledge', 'assets']

/** Whether the mode is fixed (always rendered, not hideable). */
export function isFixedMode(mode: RailModeId): boolean {
  return FIXED_MODES.includes(mode)
}

/**
 * The shipped layout's visible set: the five fixed modes, in rail order. The
 * remaining hideable modes start hidden.
 */
export const DEFAULT_VISIBLE_MODES: readonly RailModeId[]
  = CUSTOMIZABLE_MODES.filter(id => isFixedMode(id))

/** The shipped layout's hidden set: the hideable modes outside {@link DEFAULT_VISIBLE_MODES}. */
export const DEFAULT_HIDDEN: readonly RailModeId[]
  = CUSTOMIZABLE_MODES.filter(id => !DEFAULT_VISIBLE_MODES.includes(id))

/** How many top-group entries the rail shows before the user customizes it. */
export const DEFAULT_VISIBLE_COUNT = DEFAULT_VISIBLE_MODES.length

/** The customizable mode ids as a set, for slot-key narrowing. */
const CUSTOMIZABLE_IDS: ReadonlySet<string> = new Set<string>(CUSTOMIZABLE_MODES)

/**
 * Narrow a keyed slot entry key to the customizable vocabulary.
 * @param value - a `mode.rail.entry` registration key.
 * @returns whether the key names a mode the customize dialog manages.
 */
export function isRailModeId(value: string): value is RailModeId {
  return CUSTOMIZABLE_IDS.has(value)
}

/**
 * The mode the frame returns to when the user hides the active entry — the
 * Code workbench (the placeholder pages point users back at the rail, so the
 * stranding guard lands there). Mirror of ui-layout's `MODE_DEFAULT`, local
 * because client bundle purity forbids cross-plugin value imports.
 */
export const FALLBACK_MODE: AppModeId = 'code'
