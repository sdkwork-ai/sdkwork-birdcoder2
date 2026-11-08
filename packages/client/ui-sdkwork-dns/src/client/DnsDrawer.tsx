/**
 * Domain (DNS) management drawer: the left drawer the settings-menu popover's
 * "域名管理" row opens, directly below 公众号账号.
 *
 * The drawer is a host frame plus one workspace. It decides three things —
 * whether the deployment has a gateway origin, whether an IAM session exists,
 * and which generated client the workspace calls — and then hands the client to
 * `DnsWorkspace`. Root zones, subdomain ownership verification, and DNS
 * resolution records are all operations of the SDKWork deployments app API
 * (the same authority the sdkwork-webserver console reads), so no second
 * backend contract is introduced here.
 *
 * The shared `Drawer` owns the overlay layer, the header, and every dismissal
 * path (close control, mask click, Escape); this file supplies the readiness
 * decision and the content that fills the panel.
 */
import { useMemo, type ReactNode } from 'react'
import { Drawer } from '@deepseek-ai/dsh-client-ui-primitives'
import type { HostObservable, InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
// Type-only: pulls the settings slot declarations (settings.dns) into this program.
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import type { DnsHostSource } from './dnsHost.ts'
import { DnsWorkspace } from './DnsWorkspace.tsx'
import css from './DnsDrawer.module.css'

/** Injected business face: the host adapter, the sign-in gesture, and live host facts. */
export interface DnsDrawerInjected {
  /** Gateway/session adapter the workspace manages domains through. */
  host: DnsHostSource
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
export type DnsDrawerProps =
  PropsRuntime<'settings.dns'>
  & InjectFace<DnsDrawerInjected>
  & PropsLocale<'dns'>

/**
 * Render the domain management drawer.
 * @param props - composed slot props (owner share + injected face + locale seat).
 * @returns the drawer element tree.
 */
export function DnsDrawer(props: DnsDrawerProps): ReactNode {
  const {
    open, onClose, host, startSignIn, useAvailable, useSignedIn, useRevision, t,
  } = props
  const available = useAvailable((value: boolean) => value)
  const signedIn = useSignedIn((value: boolean) => value)
  const revision = useRevision((value: number) => value)
  // Re-read the adapter on every host transition: an environment switch keeps
  // `available` true while the generated client underneath must be replaced.
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
            : <DnsWorkspace client={client} t={t} />}
    </Drawer>
  )
}
