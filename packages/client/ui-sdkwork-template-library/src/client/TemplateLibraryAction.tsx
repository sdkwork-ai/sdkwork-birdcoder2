/**
 * The Template Library sidebar entry: the quick entry in the New Session
 * button area (the `sidebar.actions` list seat declared by the sidebar shell),
 * ordered below the market entry. Clicking opens the template library page as
 * an overlay inside the code surface through the layout service — the rail
 * selection stays `code`, so the code rail entry keeps its highlight. Wide
 * renders the icon + label row; the collapsed rail renders the icon control.
 */
import clsx from 'clsx'
import { TemplateLibraryIcon } from './icons.tsx'
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
// Type-only: pulls ui-sidebar's SlotMap merge (the 'sidebar.actions' seat).
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'
import css from './TemplateLibraryAction.module.css'

/** Injected business face: the code-surface overlay switch this entry drives. */
export interface TemplateLibraryActionInjected {
  /** Open this entry's page as a code-surface overlay. */
  setMode: () => void
}

/** Full component props: runtime share (owner + standard) + injected face + locale seat. */
export type TemplateLibraryActionProps =
  PropsRuntime<'sidebar.actions'>
  & TemplateLibraryActionInjected
  & PropsLocale<'template-library'>

/**
 * Render the Template Library entry row.
 * @param props - composed slot props (owner share + injected face + locale seat).
 * @returns the entry button element tree.
 */
export function TemplateLibraryAction({ setMode, wide, t }: TemplateLibraryActionProps) {
  return (
    <button
      type="button"
      className={clsx(css.action, wide ? css.wide : css.rail)}
      aria-label={t('mode.template-library.label')}
      onClick={() => { setMode() }}
    >
      <TemplateLibraryIcon size={wide ? 16 : 18} />
      {wide && <span className={css.label}>{t('mode.template-library')}</span>}
    </button>
  )
}
