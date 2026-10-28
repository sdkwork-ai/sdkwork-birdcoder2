/**
 * The mode rail: the fixed leftmost track's occupant (declared by ui-layout's
 * root entry). The shell owns the live selection state and renders each
 * visible mode's entry through the keyed `mode.rail.entry` slot; every mode
 * module contributes its own entry (glyph, copy, chrome). Which entries the
 * top group shows, and in what order, is the user's rail-layout preference
 * (injected store, persisted by the plugin): the customize dialog behind the
 * rail's plus button is its only writer. Modes with no registered entry stay
 * out of both the rail and the dialog, so a deployment that drops a mode
 * plugin never offers a dead icon. Token Plan stays pinned at the bottom of
 * the mode group beside the independent `mode.rail.panel` and
 * `mode.rail.settings` seats, which remain outside the group so neither a
 * global panel shortcut nor Settings is announced as an app mode. Panel
 * shortcuts stack directly above Settings.
 *
 * A switch is a plain mode write: a mode whose page needs a signed-in session
 * states that requirement on its own page. The rail opens no sign-in surface,
 * so no rail click can interrupt the user with a dialog.
 *
 * Work is temporarily hidden: its entry stays registered (BASE_MODES still
 * owns it), but the shell no longer dispatches it. Restore the mode by
 * adding 'work' back to MODE_ORDER.
 */
import { useState, useSyncExternalStore } from 'react'
import type { ReactNode } from 'react'
import { IconPlusOutlineRegular } from '@deepseek-ai/dsh-client-ui-primitives'
import type { ObservableSnapshot } from '@deepseek-ai/dsh-client-store'
import type { PropsLocale, PropsRenderSlots, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
// Type-only: pulls ui-layout's SlotMap merge ('mode.rail' owner share) and
// the AppModeId vocabulary.
import type {} from '@deepseek-ai/dsh-client-ui-layout/client'
import type { AppModeId } from '@deepseek-ai/dsh-client-ui-layout/client'
// Type-only: the rail's own entry-slot contract (declared by this package).
import type {} from './contract/slots.ts'
import { RailTooltip } from './RailTooltip.tsx'
import { RailCustomizeDialog } from './RailCustomizeDialog.tsx'
import type { RailLayoutStore } from './rail-layout-store.ts'
import { FALLBACK_MODE, PINNED_MODE, isRailModeId } from './rail-modes.ts'
import type { RailModeId } from './rail-modes.ts'
import css from './ModeRail.module.css'

/** Rail entry order (top-down, WeChat-desktop style) and the pinned mode id. */
export { MODE_ORDER, PINNED_MODE } from './rail-modes.ts'

/**
 * Injected business face: the plugin-owned rail-layout preference and the
 * live mirror of the entry keys registered on the keyed seat. Neither carries
 * a sign-in gate — a mode switch stays a plain mode write.
 */
export interface ModeRailInjected {
  /** The rail layout preference store (visible set + order); the dialog writes it. */
  layout: RailLayoutStore
  /** The `mode.rail.entry` keys currently registered, mirrored by the plugin. */
  registered: ObservableSnapshot<readonly string[]>
}

/** Full component props: layout owner share + the render share + injected face + the locale seat. */
export type ModeRailProps =
  PropsRuntime<'mode.rail'>
  & PropsRenderSlots<'mode.rail.entry' | 'mode.rail.panel' | 'mode.rail.settings'>
  & PropsLocale<'appMode'>
  & ModeRailInjected

/**
 * Render the app-mode rail: the user's visible entries in their order, the
 * customize plus button, the pinned mode, and the panel shortcuts and
 * Settings adjacent at the bottom.
 * @param props - composed slot props (owner share + render slots + injected face + locale seat).
 * @returns the rail element tree.
 */
export function ModeRail({ mode, setMode, t, renderSlot, layout, registered }: ModeRailProps): ReactNode {
  const { order, hidden } = useSyncExternalStore(layout.subscribe, layout.get)
  const entryKeys = useSyncExternalStore(registered.subscribe, registered.getSnapshot)
  const [customizeOpen, setCustomizeOpen] = useState(false)

  const hiddenModes = new Set<string>(hidden)
  const available = new Set<RailModeId>()
  for (const key of entryKeys) {
    if (isRailModeId(key)) available.add(key)
  }
  const visibleModes = order.filter(id => !hiddenModes.has(id) && available.has(id))
  const customizableModes = order.filter(id => available.has(id))

  const renderEntry = (id: AppModeId) =>
    renderSlot('mode.rail.entry', { active: mode === id, setMode }, { entryKey: id })

  /**
   * Visibility write with the stranding guard: hiding the active mode's
   * button returns the frame to the default mode, so the placeholder pages'
   * "click Code in the rail" hint never points at a button that is gone.
   */
  const onVisibleChange = (id: RailModeId, visible: boolean) => {
    layout.setVisible(id, visible)
    if (!visible && id === mode) setMode(FALLBACK_MODE)
  }

  return (
    <div className={css.rail}>
      <div className={css.entries} role="group" aria-label={t('rail.label')}>
        {visibleModes.map(id => (
          <div key={id} className={css.seat}>{renderEntry(id)}</div>
        ))}
        <div className={css.customizeSeat}>
          <RailTooltip label={t('rail.customize')} delayMs={500}>
            <button
              type="button"
              className={css.customize}
              aria-label={t('rail.customize')}
              aria-haspopup="dialog"
              onClick={() => { setCustomizeOpen(true) }}
            >
              <IconPlusOutlineRegular size={20} />
            </button>
          </RailTooltip>
        </div>
        <div className={`${css.seat} ${css.pinnedSeat}`}>{renderEntry(PINNED_MODE)}</div>
      </div>
      <div className={css.panelSeats}>{renderSlot('mode.rail.panel', { activeMode: mode })}</div>
      <div className={css.settingsSeat}>
        {renderSlot('mode.rail.settings', {})}
      </div>
      {customizeOpen && (
        <RailCustomizeDialog
          open={customizeOpen}
          onClose={() => { setCustomizeOpen(false) }}
          layout={layout}
          entries={customizableModes}
          onVisibleChange={onVisibleChange}
          renderEntry={renderEntry}
          t={t}
        />
      )}
    </div>
  )
}
