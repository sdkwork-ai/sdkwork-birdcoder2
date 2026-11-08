/**
 * Deployed-applications modal: the settings-menu popover's "我的应用部署" row
 * opens it.
 *
 * The modal decides three things — whether the deployment has a gateway
 * origin, whether an IAM session exists, and which generated client pair the
 * ledger calls — and then hands the clients to {@link DeployedAppsPanel}. Every
 * app row, type, and status is the deployments app API's `deploy_app` record;
 * no second backend contract is introduced here.
 *
 * The shared `WideModal` owns the overlay layer, the header, and every dismissal
 * path (close control, mask click, Escape); this file supplies the readiness
 * decision and the content that fills the panel.
 */
import { useMemo, type ReactNode } from 'react'
import { WideModal } from '@deepseek-ai/dsh-client-ui-primitives'
import type { HostObservable, InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
// Type-only: pulls the settings slot declarations (settings.myDeployments) into this program.
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import type { DeployHost, DeployHostClients } from './deployHost.ts'
import { DeployedAppsPanel } from './DeployedAppsPanel.tsx'
import css from './DeployedAppsDialog.module.css'

/** Injected business face: the host adapter, the sign-in gesture, and live host facts. */
export interface DeployedAppsDialogInjected {
  /** Host adapter producing the deploy/drive clients. */
  host: DeployHost
  /** Raise the shared sign-in surface (in-app form or browser hand-off). */
  startSignIn: () => void
  hooks: {
    /** Whether the gateway origin is configured (false renders the notice). */
    available: HostObservable<boolean>
    /** Whether an IAM session exists (false renders the sign-in prompt). */
    signedIn: HostObservable<boolean>
    /** Adapter revision; a new value re-reads the clients after an environment switch. */
    revision: HostObservable<number>
  }
}

/** Full component props: slot owner share + injected face + locale seat. */
export type DeployedAppsDialogProps =
  PropsRuntime<'settings.myDeployments'>
  & InjectFace<DeployedAppsDialogInjected>
  & PropsLocale<'deploy'>

/**
 * Render the deployed-applications modal.
 * @param props - composed slot props (owner share + injected face + locale seat).
 * @returns the modal element tree.
 */
export function DeployedAppsDialog(props: DeployedAppsDialogProps): ReactNode {
  const {
    open, onClose, host, startSignIn, useAvailable, useSignedIn, useRevision, t,
  } = props
  const available = useAvailable((value: boolean) => value)
  const signedIn = useSignedIn((value: boolean) => value)
  const revision = useRevision((value: number) => value)
  // Re-read the adapter on every host transition: an environment switch keeps
  // `available` true while the generated clients underneath must be replaced.
  const clients = useMemo<DeployHostClients | undefined>(() => {
    if (!available) return undefined
    try {
      return host.readClients()
    } catch {
      return undefined
    }
  }, [available, host, revision])

  return (
    <WideModal
      open={open}
      onClose={onClose}
      title={t('deployments.title')}
      description={t('deployments.description')}
      closeLabel={t('library.close')}
    >
      {!available
        ? <div className={css.notice}>{t('deployments.notConfigured')}</div>
        : !signedIn
          ? (
            <div className={css.notice}>
              <p>{t('deployments.signInRequired')}</p>
              <button type="button" className={css.noticeAction} onClick={startSignIn}>
                {t('deployments.signIn')}
              </button>
            </div>
          )
          : clients === undefined
            ? <div className={css.notice}>{t('deployments.notConfigured')}</div>
            : <DeployedAppsPanel clients={clients} t={t} />}
    </WideModal>
  )
}
