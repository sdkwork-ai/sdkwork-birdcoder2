/**
 * The configuration notice: the icon + copy the account surfaces show while
 * the IAM base URL is missing. The account mode page renders it inline in
 * its column surface; the modal sign-in host renders it inside the dialog
 * shell — one home for the copy and the presentation.
 */
import { IconUserOutline16 } from '@deepseek-ai/dsh-client-ui-primitives'
import css from './ConfigureNotice.module.css'

/** The dictionary keys the notice reads. */
export type ConfigureNoticeCopyKey = 'page.unconfigured.title' | 'page.unconfigured.detail'

/** Props of the shared notice. */
export interface ConfigureNoticeProps {
  /** The uiIam dictionary seat (keys `page.unconfigured.title/detail`). */
  t: (key: ConfigureNoticeCopyKey) => string
  /** The dialog shell's label target when rendered inside a dialog. */
  titleId?: string
}

/**
 * Render the unconfigured notice.
 * @param props - the dictionary seat and optional dialog label target.
 * @returns the notice element tree.
 */
export function ConfigureNotice({ t, titleId }: ConfigureNoticeProps) {
  return (
    <>
      <IconUserOutline16 size={56} className={css.heroIcon} />
      <div className={css.title} id={titleId}>{t('page.unconfigured.title')}</div>
      <div className={css.detail}>{t('page.unconfigured.detail')}</div>
    </>
  )
}
