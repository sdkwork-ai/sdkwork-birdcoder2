/**
 * The App Store sidebar entry: the quick entry in the New Session button area
 * (the `sidebar.actions` list seat declared by the sidebar shell). Clicking
 * switches the frame to the `appstore` mode through the layout service — the
 * same destination the mode rail's App Store entry selects — so the full-bleed
 * SDKWork App Store surface opens from the sidebar's quick-entry stack. Wide
 * renders the icon + label row; the collapsed rail renders the icon control.
 */
import clsx from 'clsx'
import { AppStoreIcon } from './icons.tsx'
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
// Type-only: pulls ui-sidebar's SlotMap merge (the 'sidebar.actions' seat).
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'
import css from './SidebarAction.module.css'

/** Injected business face: the frame mode switch this entry drives. */
export interface SidebarActionInjected {
  /** Switch the frame's active mode to this entry's mode. */
  setMode: () => void
}

/** Full component props: runtime share (owner + standard) + injected face + locale seat. */
export type SidebarActionProps =
  PropsRuntime<'sidebar.actions'>
  & SidebarActionInjected
  & PropsLocale<'appstore'>

/**
 * Render the App Store quick-entry row.
 * @param props - composed slot props (owner share + injected face + locale seat).
 * @returns the entry button element tree.
 */
export function SidebarAction({ setMode, wide, t }: SidebarActionProps) {
  return (
    <button
      type="button"
      className={clsx(css.action, wide ? css.wide : css.rail)}
      aria-label={t('mode.appstore.label')}
      onClick={() => { setMode() }}
    >
      <AppStoreIcon size={wide ? 16 : 18} />
      {wide && <span className={css.label}>{t('mode.appstore')}</span>}
    </button>
  )
}
