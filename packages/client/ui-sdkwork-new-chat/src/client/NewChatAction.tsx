/**
 * The New Chat sidebar entry: the new-conversation row that leads the New
 * Session button area (the `sidebar.actions` list seat declared by the
 * sidebar shell). The button rides the shell's shared New Session action —
 * the same Workspace UI flow the built-in capsule drives — so the plugin
 * entry and the stock control stay one capability. Wide renders the icon +
 * label row; the collapsed rail renders the icon control.
 */
import clsx from 'clsx'
import { IconNewChatOutline16 } from '@deepseek-ai/dsh-client-ui-primitives'
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
// Type-only: pulls ui-sidebar's SlotMap merge (the 'sidebar.actions' seat).
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'
import css from './NewChatAction.module.css'

/** Full component props: runtime share (owner + standard) + the locale seat. */
export type NewChatActionProps =
  PropsRuntime<'sidebar.actions'>
  & PropsLocale<'newChat'>

/**
 * Render the New Chat entry row.
 * @param props - composed slot props (owner share + locale seat).
 * @returns the entry button element tree.
 */
export function NewChatAction({ startSession, wide, t }: NewChatActionProps) {
  return (
    <button
      type="button"
      className={clsx(css.action, wide ? css.wide : css.rail)}
      aria-label={t('action.newChat.label')}
      onClick={() => { startSession() }}
    >
      <IconNewChatOutline16 size={wide ? 14 : 18} />
      {wide && <span className={css.label}>{t('action.newChat')}</span>}
    </button>
  )
}
