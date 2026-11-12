/**
 * Shared app-template flow: mount the template center for one project
 * directory. The row menus' `发布为模板` action opens this flow with the
 * project's own cwd; the center then scans `<project>/apps`, publishes the
 * selected app roots, and installs downloaded templates back into `apps/`.
 *
 * The flow owns only the host-facing concerns — client construction, the
 * account snapshot, and client/identity refresh on host notifications — so the
 * dialog stays a presentation surface over injectable data.
 */
import { useCallback, useEffect, useState, useSyncExternalStore } from 'react'

import type { DeployHost, DeployHostClients } from './deployHost.ts'
import type { DeployKey } from './locales.ts'
import { TemplateCenterDialog, type TemplateCenterUser } from './TemplateCenterDialog.tsx'
import type { TemplateDownloadOutcome } from './templateDownload.ts'
import dialogs from './DeployDialogs.module.css'

/** Full props for the shared app-template flow. */
export interface PublishTemplateFlowProps {
  /** Host adapter producing the deploy clients and the manifest bridge. */
  readonly host: DeployHost
  /** Reactive theme port for the dialog surface. */
  readonly theme: {
    getColorScheme(): 'light' | 'dark'
    subscribe(listener: () => void): () => void
  }
  /** Plugin locale seat (`deploy` namespace). */
  readonly t: (key: DeployKey, params?: Record<string, string>) => string
  /**
   * The project directory whose `apps/` tree is read and written; omitted
   * reads the session's current working directory.
   */
  readonly directory?: string | undefined
  /** Tab to select when the center opens; defaults to publish. */
  readonly initialTab?: 'publish' | 'download' | undefined
  /** Raise the shared sign-in surface while signed out. */
  readonly startSignIn?: (() => void) | undefined
  /** Close the flow without a session side effect. */
  readonly onClose: () => void
  /** A publish batch created or updated `count` templates. */
  readonly onPublished?: ((count: number) => void) | undefined
  /** One template install completed. */
  readonly onInstalled?: ((outcome: TemplateDownloadOutcome) => void) | undefined
}

/**
 * Render the app-template flow.
 * @param props - the host adapter, theme/locale seats, target directory, and
 *   the close/outcome callbacks.
 * @returns the template center, or an unavailable dialog when the host has no
 *   SDKWork origin.
 */
export function PublishTemplateFlow({
  host, theme, t, directory, initialTab, startSignIn, onClose, onPublished, onInstalled,
}: PublishTemplateFlowProps) {
  const [clients, setClients] = useState<DeployHostClients | undefined>(() => {
    try {
      return host.readClients()
    } catch {
      return undefined
    }
  })
  const [currentUser, setCurrentUser] = useState<TemplateCenterUser | undefined>(() => host.readCurrentUser())
  // uSES invokes both members unbound: bind through stable closures so the
  // port's methods keep their receiver.
  const subscribeTheme = useCallback((listener: () => void) => theme.subscribe(listener), [theme])
  const readTheme = useCallback(() => theme.getColorScheme(), [theme])
  const colorScheme = useSyncExternalStore(subscribeTheme, readTheme, readTheme)

  // Host notifications cover IAM hydration/token rotation (re-sync the private
  // token manager and rebuild clients) and sign-in changes (move the identity
  // chip). Rebuilding the clients also refreshes their captured token state.
  useEffect(() => {
    return host.subscribe(() => {
      try {
        setClients(host.readClients())
      } catch {
        setClients(undefined)
      }
      setCurrentUser(host.readCurrentUser())
    })
  }, [host])

  const refreshHost = useCallback(() => { host.notifyChange() }, [host])

  if (clients === undefined) {
    return (
      <div
        className={dialogs.overlay}
        role="dialog"
        aria-modal="true"
        aria-label={t('templateCenter.title')}
        data-theme={colorScheme}
      >
        <div className={dialogs.modal}>
          <div className={dialogs.modalHeader}>
            <div>
              <h3 className={dialogs.modalTitle}>{t('templateCenter.title')}</h3>
              <p className={dialogs.modalSubtitle}>{t('templateCenter.unconfigured')}</p>
            </div>
            <button type="button" className={dialogs.closeButton} onClick={onClose} aria-label={t('templateCenter.close')}>
              ✕
            </button>
          </div>
          <div className={dialogs.modalActions}>
            <button type="button" className={dialogs.secondaryButton} onClick={onClose}>
              {t('templateCenter.close')}
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <TemplateCenterDialog
      host={host}
      clients={clients}
      theme={colorScheme}
      t={t}
      directory={directory ?? host.readDefaultDirectory()}
      initialTab={initialTab}
      currentUser={currentUser}
      startSignIn={startSignIn}
      onClose={onClose}
      onPublished={(count) => {
        refreshHost()
        onPublished?.(count)
      }}
      onInstalled={(outcome) => {
        refreshHost()
        onInstalled?.(outcome)
      }}
    />
  )
}
