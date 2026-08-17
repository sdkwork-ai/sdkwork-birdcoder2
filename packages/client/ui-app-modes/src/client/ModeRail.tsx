/**
 * The mode rail: the fixed leftmost track's occupant (declared by ui-layout's
 * root entry). The shell owns the entry ORDER (the launcher's fixed
 * top-down sequence) and the live selection state, and renders each mode's
 * entry through the keyed `mode.rail.entry` slot — every mode module
 * contributes its own entry (glyph, copy, chrome), so adding a mode never
 * touches this shell. The rail also holds the bottom-pinned
 * `mode.rail.settings` seat (the settings trigger, registered by
 * ui-settings-general), rendered outside the entries group so the settings
 * button is not announced as an app mode.
 */
import type { PropsLocale, PropsRenderSlots, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
// Type-only: pulls ui-layout's SlotMap merge ('mode.rail' owner share) and
// the AppModeId vocabulary.
import type {} from '@deepseek-ai/dsh-client-ui-layout/client'
import type { AppModeId } from '@deepseek-ai/dsh-client-ui-layout/client'
// Type-only: the rail's own entry-slot contract (declared by this package).
import type {} from './contract/slots.ts'
import css from './ModeRail.module.css'

/** Rail entry order (top-down, WeChat-desktop style). */
export const MODE_ORDER: readonly AppModeId[] = [
  'code', 'work', 'video', 'image', 'appstore', 'knowledge', 'assets', 'token-plan',
]

/** Full component props: layout owner share + the render share + the locale seat. */
export type ModeRailProps =
  PropsRuntime<'mode.rail'>
  & PropsRenderSlots<'mode.rail.entry' | 'mode.rail.settings'>
  & PropsLocale<'appMode'>

/**
 * Render the app-mode rail: one keyed entry per mode id in launcher order,
 * and the bottom-pinned settings seat outside the entries group.
 * @param props - composed slot props (owner share + render slots + locale seat).
 * @returns the rail element tree.
 */
export function ModeRail({ mode, setMode, t, renderSlot }: ModeRailProps) {
  return (
    <div className={css.rail}>
      <div className={css.entries} role="group" aria-label={t('rail.label')}>
        {MODE_ORDER.map(id => (
          <div key={id} className={css.seat}>
            {renderSlot('mode.rail.entry', { active: mode === id, setMode }, { entryKey: id })}
          </div>
        ))}
      </div>
      <div className={css.spacer} />
      <div className={css.settingsSeat}>
        {renderSlot('mode.rail.settings', {})}
      </div>
    </div>
  )
}
