/**
 * The mode rail: the fixed leftmost track's occupant (declared by ui-layout's
 * root entry). The shell owns the entry order and live selection state, and
 * renders each mode's entry through the keyed `mode.rail.entry` slot. Every
 * mode module contributes its own entry (glyph, copy, chrome). Token Plan is
 * pinned at the bottom of the mode group beside the independent
 * `mode.rail.settings` seat, which remains outside the group so Settings is
 * not announced as an app mode.
 *
 * Work is temporarily hidden: its entry stays registered (BASE_MODES still
 * owns it), but the shell no longer dispatches it. Restore the mode by
 * adding 'work' back to MODE_ORDER.
 */
import type { PropsLocale, PropsRenderSlots, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
// Type-only: pulls ui-layout's SlotMap merge ('mode.rail' owner share) and
// the AppModeId vocabulary.
import type {} from '@deepseek-ai/dsh-client-ui-layout/client'
import type { AppModeId } from '@deepseek-ai/dsh-client-ui-layout/client'
// Type-only: the rail's own entry-slot contract (declared by this package).
import type {} from './contract/slots.ts'
import css from './ModeRail.module.css'

/** Rail entry order (top-down, WeChat-desktop style; 'work' temporarily hidden). */
export const MODE_ORDER: readonly AppModeId[] = [
  'code', 'video', 'image', 'appstore', 'knowledge', 'drive', 'assets', 'token-plan',
]

/** Mode pinned beside Settings at the bottom of the rail. */
const PINNED_MODE: AppModeId = 'token-plan'

/** Full component props: layout owner share + the render share + the locale seat. */
export type ModeRailProps =
  PropsRuntime<'mode.rail'>
  & PropsRenderSlots<'mode.rail.entry' | 'mode.rail.settings'>
  & PropsLocale<'appMode'>

/**
 * Render the app-mode rail with Token Plan and Settings adjacent at the bottom.
 * @param props - composed slot props (owner share + render slots + locale seat).
 * @returns the rail element tree.
 */
export function ModeRail({ mode, setMode, t, renderSlot }: ModeRailProps) {
  return (
    <div className={css.rail}>
      <div className={css.entries} role="group" aria-label={t('rail.label')}>
        {MODE_ORDER.map(id => (
          <div key={id} className={id === PINNED_MODE ? `${css.seat} ${css.pinnedSeat}` : css.seat}>
            {renderSlot('mode.rail.entry', { active: mode === id, setMode }, { entryKey: id })}
          </div>
        ))}
      </div>
      <div className={css.settingsSeat}>
        {renderSlot('mode.rail.settings', {})}
      </div>
    </div>
  )
}
