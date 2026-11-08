/**
 * The assistant sidebar entry: the quick-entry row in the New Session button
 * area (the `sidebar.actions` list seat declared by the sidebar shell). It is
 * the row the product's sidebar shows for the persona-bot surface — the same
 * seat, geometry, and hover treatment as the scheduled-tasks entry beside it —
 * and it replaces the plugin's own `sidebar.panellist` row, which the plugin
 * draws with its avatar artwork and an onboarding badge.
 *
 * Clicking opens the surface as a code-surface overlay through the layout
 * service: the panel takes the center column while the rail selection stays
 * `code`, exactly as the assistant rail cell and the plugin's own row do.
 */
import clsx from 'clsx'
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
// Type-only: pulls ui-sidebar's SlotMap merge (the 'sidebar.actions' seat).
import type {} from '@deepseek-ai/dsh-client-ui-sdkwork-sidebar/client'
import { AssistantIcon } from './AssistantIcon.tsx'
import css from './AssistantAction.module.css'

/** Injected business face: the surface this entry opens. */
export interface AssistantActionInjected {
  /** Open the assistant main panel. */
  open: () => void
}

/** Full component props: runtime share (owner + standard) + injected face + locale seat. */
export type AssistantActionProps =
  PropsRuntime<'sidebar.actions'>
  & AssistantActionInjected
  & PropsLocale<'assistant'>

/**
 * Render the assistant sidebar entry.
 * @param props - composed slot props (owner share + injected face + locale seat).
 * @returns the entry button element tree.
 */
export function AssistantAction({ open, wide, t }: AssistantActionProps) {
  return (
    <button
      type="button"
      className={clsx(css.action, wide ? css.wide : css.rail)}
      aria-label={t('entry.aria')}
      onClick={() => { open() }}
    >
      <AssistantIcon size={wide ? 16 : 18} />
      {wide && <span className={css.label}>{t('entry.label')}</span>}
    </button>
  )
}
