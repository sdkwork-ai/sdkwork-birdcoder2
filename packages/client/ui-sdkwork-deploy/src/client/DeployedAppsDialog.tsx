/**
 * Settings-menu drawer for the caller's deployed surfaces: the popover's
 * "我的应用" row opens it.
 *
 * Two tabs share one account-scoped frame — 我的应用 lists the caller's own
 * `deploy_app` rows, 我的应用模板 lists the caller's own template listings —
 * because both are what the account deployed and the operator switches between
 * them instead of opening two drawers.
 *
 * The modal decides three things — whether the deployment has a gateway
 * origin, whether an IAM session exists, and which generated client pair the
 * ledgers call — and then hands the clients to the selected panel. Every row
 * is the deployments app API's own record; no second backend contract is
 * introduced here.
 *
 * The shared `WideModal` owns the overlay layer, the header, and every
 * dismissal path (close control, mask click, Escape); this file supplies the
 * readiness decision, the tab frame, and the content that fills the panel.
 */
import { useEffect, useId, useMemo, useState, type ReactNode } from 'react'
import { SegmentedTabs, WideModal } from '@deepseek-ai/dsh-client-ui-primitives'
import type { HostObservable, InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
// Type-only: pulls the settings slot declarations (settings.myDeployments) into this program.
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import type { DeployHost, DeployHostClients } from './deployHost.ts'
import { DeployedAppsPanel } from './DeployedAppsPanel.tsx'
import { DeployedTemplatesPanel } from './DeployedTemplatesPanel.tsx'
import css from './DeployedAppsDialog.module.css'

/** The drawer's tabs: the caller's deployed applications and app templates. */
type DrawerTab = 'apps' | 'templates'

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
 * Render the settings-menu drawer with its two ledgers.
 * @param props - composed slot props (owner share + injected face + locale seat).
 * @returns the modal element tree.
 */
export function DeployedAppsDialog(props: DeployedAppsDialogProps): ReactNode {
  const {
    open, onClose, host, startSignIn, useAvailable, useSignedIn, useRevision, t,
  } = props
  const [tab, setTab] = useState<DrawerTab>('apps')
  // A ledger mounts on its first visit and stays mounted afterwards, so
  // switching back keeps its rows, filters and resolved versions instead of
  // re-reading the account. Closing the drawer resets the view: reopening lands
  // on 我的应用 and reads only that ledger.
  const [visited, setVisited] = useState<ReadonlySet<DrawerTab>>(() => new Set<DrawerTab>(['apps']))
  const available = useAvailable((value: boolean) => value)
  const signedIn = useSignedIn((value: boolean) => value)
  const revision = useRevision((value: number) => value)
  const idBase = useId()
  const appTabId = `${idBase}-apps-tab`
  const appPanelId = `${idBase}-apps-panel`
  const templateTabId = `${idBase}-templates-tab`
  const templatePanelId = `${idBase}-templates-panel`
  const selectTab = (next: DrawerTab): void => {
    setTab(next)
    setVisited(current => (current.has(next) ? current : new Set([...current, next])))
  }
  useEffect(() => {
    if (open) return
    setTab('apps')
    setVisited(new Set<DrawerTab>(['apps']))
  }, [open])
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
            : (
              <div className={css.tabsWorkspace}>
                <SegmentedTabs
                  className={css.tabs}
                  size="sm"
                  label={t('deployments.tabsLabel')}
                  value={tab}
                  onChange={selectTab}
                  items={[
                    { value: 'apps', label: t('deployments.tab.apps'), id: appTabId, panelId: appPanelId },
                    {
                      value: 'templates',
                      label: t('deployments.tab.templates'),
                      id: templateTabId,
                      panelId: templatePanelId,
                    },
                  ]}
                />
                {/* Both panel elements stay in the tree so each tab's
                    `aria-controls` resolves; only visited ledgers mount, so the
                    template read starts when the operator first opens it. */}
                <div
                  className={css.tabPanel}
                  role="tabpanel"
                  id={appPanelId}
                  aria-labelledby={appTabId}
                  hidden={tab !== 'apps'}
                >
                  {visited.has('apps') && <DeployedAppsPanel clients={clients} t={t} />}
                </div>
                <div
                  className={css.tabPanel}
                  role="tabpanel"
                  id={templatePanelId}
                  aria-labelledby={templateTabId}
                  hidden={tab !== 'templates'}
                >
                  {visited.has('templates') && <DeployedTemplatesPanel clients={clients} t={t} />}
                </div>
              </div>
            )}
    </WideModal>
  )
}
