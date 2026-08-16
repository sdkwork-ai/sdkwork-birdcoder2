/**
 * Shell chrome content registered into the shell's trigger/header seats: the
 * trigger row icon plus the visually-hidden label (the rail's trigger is
 * icon-only, and the accessible name comes from the label content) and the
 * panel title text. The shell renders the surrounding chrome (button, nav
 * heading row) and reads each entry's `label` option for aria text.
 */
import { IconSettingsOutline14 } from '@deepseek-ai/dsh-client-ui-primitives'
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import css from './chrome.module.css'

/** Trigger content props: the standard locale seat only. */
export type TriggerContentProps = PropsRuntime<'settings.trigger'> & PropsLocale<'settings'>

/** Header content props: the standard locale seat only. */
export type HeaderContentProps = PropsRuntime<'settings.header'> & PropsLocale<'settings'>

/**
 * Render the trigger content: the rail-form gear icon with a visually-hidden
 * label supplying the button's accessible name.
 * @param props - composed slot props.
 * @returns the trigger content fragment.
 */
export function TriggerContent({ t }: TriggerContentProps) {
  return (
    <>
      <span className={css.triggerLabel}>{t('trigger')}</span>
      <IconSettingsOutline14 size={18} />
    </>
  )
}

/**
 * Render the panel title text.
 * @param props - composed slot props.
 * @returns the title text node.
 */
export function HeaderContent({ t }: HeaderContentProps) {
  return <>{t('title')}</>
}

/** Close-button label text props: the standard locale seat only. */
export type CloseLabelProps = PropsRuntime<'settings.close'> & PropsLocale<'settings'>

/**
 * Render the close button's visually-hidden label text.
 * @param props - composed slot props.
 * @returns the label text node.
 */
export function CloseLabel({ t }: CloseLabelProps) {
  return <>{t('close')}</>
}
