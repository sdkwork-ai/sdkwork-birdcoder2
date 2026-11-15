/**
 * Mini-program account modal: the wide management surface the settings-menu
 * popover's "小程序账号" row opens, directly below 公众号账号.
 *
 * The modal is a host frame, not a reimplementation. It decides three things —
 * whether the deployment has a gateway origin, whether an IAM session exists,
 * and which shared controller the workspace renders — and then mounts
 * `MiniProgramsWorkspace`, which renders the shared
 * `@sdkwork/iam-pc-mini-program` panel. Every account, credential, enable, and
 * login-check operation is that package's own controller call.
 *
 * The shared `WideModal` owns the overlay layer, the header, and every
 * dismissal path (close control, mask click, Escape); the panel's create/edit
 * drawer and delete confirmation portal to `document.body`, so
 * `miniProgramView.css` lifts them above this harness layer and the body portal
 * marker is set for the modal's open lifetime.
 */
import { useEffect, useMemo, type ReactNode } from 'react'
import { WideModal } from '@deepseek-ai/dsh-client-ui-primitives'
import type { HostObservable, InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
// Type-only: pulls the settings slot declarations (settings.miniPrograms) into this program.
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import {
  MINI_PROGRAM_EMBED_ATTRIBUTE,
  MINI_PROGRAM_EMBED_PORTAL_ATTRIBUTE,
} from './embedScope.ts'
import type { MiniProgramHostSource } from './miniProgramHost.ts'
import { MiniProgramsWorkspace } from './MiniProgramsWorkspace.tsx'
import css from './MiniProgramsModal.module.css'

/** Injected business face: the host adapter, the sign-in gesture, and live host facts. */
export interface MiniProgramsModalInjected {
  /** Gateway/session adapter the embedded panel manages accounts through. */
  host: MiniProgramHostSource
  /** Raise the shared sign-in surface (in-app form or browser hand-off). */
  startSignIn: () => void
  hooks: {
    /** Whether the gateway origin is configured (false renders the notice). */
    available: HostObservable<boolean>
    /** Whether an IAM session exists (false renders the sign-in prompt). */
    signedIn: HostObservable<boolean>
    /** The active harness locale id, mapped to the panel's SDKWork locale tag. */
    language: HostObservable<string>
    /** The resolved harness color scheme the SDKWork surface follows. */
    colorScheme: HostObservable<'light' | 'dark'>
    /** Adapter revision; a new value re-reads the controller after an environment switch. */
    revision: HostObservable<number>
  }
}

/** Full component props: slot owner share + injected face + locale seat. */
export type MiniProgramsModalProps =
  PropsRuntime<'settings.miniPrograms'>
  & InjectFace<MiniProgramsModalInjected>
  & PropsLocale<'miniProgram'>

/**
 * Render the mini-program account modal.
 * @param props - composed slot props (owner share + injected face + locale seat).
 * @returns the modal element tree.
 */
export function MiniProgramsModal(props: MiniProgramsModalProps): ReactNode {
  const {
    open, onClose, host, startSignIn, useAvailable, useSignedIn, useLanguage, useColorScheme, useRevision, t,
  } = props
  const available = useAvailable((value: boolean) => value)
  const signedIn = useSignedIn((value: boolean) => value)
  const language = useLanguage((value: string) => value)
  const colorScheme = useColorScheme((value: 'light' | 'dark') => value)
  const revision = useRevision((value: number) => value)
  // Same adapter read that produced the readiness snapshot; a revision change
  // rebuilds the controller after the environment origin moves.
  const controller = useMemo(
    () => (available ? host.readController() : undefined),
    [available, host, revision],
  )

  // The panel portals its drawer and confirm dialog to `document.body`,
  // outside the modal root this package's scoped stylesheet targets. Marking
  // the body for the modal's open lifetime activates that sheet's body-rooted
  // scope, which is what reaches those overlays.
  useEffect(() => {
    if (!open) return
    document.body.setAttribute(MINI_PROGRAM_EMBED_PORTAL_ATTRIBUTE, '')
    return () => { document.body.removeAttribute(MINI_PROGRAM_EMBED_PORTAL_ATTRIBUTE) }
  }, [open])

  return (
    <WideModal
      open={open}
      onClose={onClose}
      title={t('section.title')}
      description={t('section.description')}
      closeLabel={t('close')}
    >
      {/* The embed marker scopes the panel's compiled utilities to the dialog
          subtree (and carries the adapter readiness value). */}
      <div
        className={css.embed}
        {...{ [MINI_PROGRAM_EMBED_ATTRIBUTE]: controller === undefined ? 'unconfigured' : 'ready' }}
      >
        {controller === undefined
          ? <div className={css.notice}>{t('section.notConfigured')}</div>
          : !signedIn
            ? (
              <div className={css.notice}>
                <p className={css.noticeDetail}>{t('section.signInRequired')}</p>
                <button type="button" className={css.noticeAction} onClick={startSignIn}>
                  {t('section.signIn')}
                </button>
              </div>
            )
            : (
              <MiniProgramsWorkspace
                colorScheme={colorScheme}
                controller={controller}
                language={language}
              />
            )}
      </div>
    </WideModal>
  )
}
