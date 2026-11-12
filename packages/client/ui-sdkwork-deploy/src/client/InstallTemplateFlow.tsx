/**
 * Install-from-template flow: mount the install dialog for one project
 * directory. The row menu's `从模板安装` action opens this flow with the
 * project's cwd.
 *
 * Publish has its own flow and dialog. This file owns only client/account
 * binding and the install outcome callback.
 */
import type { DeployHost } from './deployHost.ts'
import type { DeployKey } from './locales.ts'
import type { TemplateDownloadOutcome } from './templateDownload.ts'
import { TemplateInstallDialog } from './TemplateInstallDialog.tsx'
import { useTemplateHostSession, type TemplateFlowTheme } from './useTemplateHostSession.ts'
import dialogs from './DeployDialogs.module.css'

/** Props for the install flow. */
export interface InstallTemplateFlowProps {
  readonly host: DeployHost
  readonly theme: TemplateFlowTheme
  readonly t: (key: DeployKey, params?: Record<string, string>) => string
  /** Project whose `apps/` directory receives the default install. */
  readonly directory?: string | undefined
  readonly startSignIn?: (() => void) | undefined
  readonly onClose: () => void
  readonly onInstalled?: ((outcome: TemplateDownloadOutcome) => void) | undefined
}

/**
 * Render the install flow.
 * @param props - host/theme/locale seats, target project, and callbacks.
 * @returns the install dialog, or an unavailable dialog without an origin.
 */
export function InstallTemplateFlow({
  host, theme, t, directory, startSignIn, onClose, onInstalled,
}: InstallTemplateFlowProps) {
  const { clients, currentUser, colorScheme, refreshHost } = useTemplateHostSession(host, theme)
  if (clients === undefined) {
    return (
      <div
        className={dialogs.overlay}
        role="dialog"
        aria-modal="true"
        aria-label={t('templateCenter.installTitle')}
        data-theme={colorScheme}
      >
        <div className={dialogs.modal}>
          <div className={dialogs.modalHeader}>
            <div>
              <h3 className={dialogs.modalTitle}>{t('templateCenter.installTitle')}</h3>
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
    <TemplateInstallDialog
      host={host}
      clients={clients}
      theme={colorScheme}
      t={t}
      directory={directory ?? host.readDefaultDirectory()}
      currentUser={currentUser}
      startSignIn={startSignIn}
      onClose={onClose}
      onInstalled={(outcome) => {
        refreshHost()
        onInstalled?.(outcome)
      }}
    />
  )
}
