/** Transient cloud-library add feedback that survives the Skills panel. */
import type { ReactNode } from 'react'
import { createSnapshotStore } from '@deepseek-ai/dsh-client-store'
import { IconWarningOutlineRegular, Toast } from '@deepseek-ai/dsh-client-ui-primitives'
import type { HostObservable, InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'

const NS = 'markets'

/** One completed cloud-library add operation. */
export type SkillsToastOutcome =
  | { readonly kind: 'added'; readonly name: string }
  | { readonly kind: 'failed' }

/** One announced outcome; `seq` restarts repeated notifications. */
export type SkillsToastState = SkillsToastOutcome & { readonly seq: number }

/** Store that the catalog reports into and the shell overlay reads. */
export interface SkillsToastSource {
  readonly hooks: { readonly toast: HostObservable<SkillsToastState | null> }
  readonly report: (outcome: SkillsToastOutcome) => void
  readonly dismiss: () => void
}

/**
 * Create the transient Skills notification source.
 * @returns the observable outcome with report and dismiss actions.
 */
export function createSkillsToastSource(): SkillsToastSource {
  const store = createSnapshotStore<SkillsToastState | null>(null)
  let seq = 0
  return {
    hooks: { toast: store },
    report: (outcome) => {
      seq += 1
      store.set({ ...outcome, seq })
    },
    dismiss: () => { store.set(null) },
  }
}

/** Props of the frame-wide Skills notification entry. */
export type SkillsToastProps = PropsRuntime<'shell.overlay'>
  & PropsLocale<typeof NS>
  & InjectFace<Omit<SkillsToastSource, 'report'>>

/**
 * Render one cloud-library add outcome.
 * @param props - the notification hook, dismiss action, and locale seat.
 * @returns the transient banner, or null.
 */
export function SkillsToast({ useToast, dismiss, t }: SkillsToastProps): ReactNode {
  const toast = useToast(current => current)
  if (toast === null) return null
  const key = `skills-toast-${String(toast.seq)}`
  if (toast.kind === 'failed') {
    return <Toast key={key} text={t('skills.catalog.addFailed')} icon={<IconWarningOutlineRegular />} onDone={dismiss} />
  }
  return (
    <Toast
      key={key}
      text={t('skills.catalog.addedNotice', { name: toast.name })}
      tone="success"
      onDone={dismiss}
    />
  )
}
