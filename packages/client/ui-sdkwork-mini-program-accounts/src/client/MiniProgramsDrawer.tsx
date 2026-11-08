/**
 * Mini-program account drawer: the left drawer the settings-menu popover's
 * "小程序账号" row opens, directly below 公众号账号.
 *
 * The drawer is a host frame plus one workspace. It decides three things —
 * whether the deployment has a gateway origin, whether an IAM session exists,
 * and which generated backend client the workspace calls — and then hands the
 * client to `MiniProgramsWorkspace`. The capability itself is the IAM backend
 * OAuth resource-account surface that sdkwork-iam's PC admin mini-program page
 * manages; no second account model is introduced here.
 *
 * The shared `Drawer` owns the overlay layer, the header, and every dismissal
 * path (close control, mask click, Escape); this file supplies the readiness
 * decision and the content that fills the panel.
 */
import { useMemo, type ReactNode } from 'react'
import { Drawer } from '@deepseek-ai/dsh-client-ui-primitives'
import type { HostObservable, InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
// Type-only: pulls the settings slot declarations (settings.miniPrograms) into this program.
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import type { MiniProgramHostSource } from './miniProgramHost.ts'
import { MiniProgramsWorkspace } from './MiniProgramsWorkspace.tsx'
import css from './MiniProgramsDrawer.module.css'

/** Injected business face: the host adapter, the sign-in gesture, and live host facts. */
export interface MiniProgramsDrawerInjected {
  /** Gateway/session adapter the workspace manages accounts through. */
  host: MiniProgramHostSource
  /** Raise the shared sign-in surface (in-app form or browser hand-off). */
  startSignIn: () => void
  hooks: {
    /** Whether the gateway origin is configured (false renders the notice). */
    available: HostObservable<boolean>
    /** Whether an IAM session exists (false renders the sign-in prompt). */
    signedIn: HostObservable<boolean>
    /** Adapter revision; a new value re-reads the client after an environment switch. */
    revision: HostObservable<number>
  }
}

/** Full component props: slot owner share + injected face + locale seat. */
export type MiniProgramsDrawerProps =
  PropsRuntime<'settings.miniPrograms'>
  & InjectFace<MiniProgramsDrawerInjected>
  & PropsLocale<'miniProgram'>

/**
 * Render the mini-program account drawer.
 * @param props - composed slot props (owner share + injected face + locale seat).
 * @returns the drawer element tree.
 */
export function MiniProgramsDrawer(props: MiniProgramsDrawerProps): ReactNode {
  const {
    open, onClose, host, startSignIn, useAvailable, useSignedIn, useRevision, t,
  } = props
  const available = useAvailable((value: boolean) => value)
  const signedIn = useSignedIn((value: boolean) => value)
  const revision = useRevision((value: number) => value)
  const client = useMemo(
    () => (available ? host.readClient() : undefined),
    [available, host, revision],
  )

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title={t('section.title')}
      description={t('section.description')}
      closeLabel={t('close')}
    >
      {!available
        ? <div className={css.notice}>{t('section.notConfigured')}</div>
        : !signedIn
          ? (
            <div className={css.notice}>
              <p>{t('section.signInRequired')}</p>
              <button type="button" className={css.noticeAction} onClick={startSignIn}>
                {t('section.signIn')}
              </button>
            </div>
          )
          : client === undefined
            ? <div className={css.notice}>{t('section.notConfigured')}</div>
            : <MiniProgramsWorkspace client={client} t={t} />}
    </Drawer>
  )
}
