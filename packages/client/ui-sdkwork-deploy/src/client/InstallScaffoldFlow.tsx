/**
 * Install-from-scaffold flow: mount the install dialog for one project
 * directory. The row menu's `从脚手架安装` action opens this flow with the
 * project's cwd.
 *
 * Publish has its own flow and dialog. This file owns only client/account
 * binding and the install outcome callback.
 */
import type { DeployHost } from './deployHost.ts'
import type { DeployKey } from './locales.ts'
import type { ScaffoldDownloadOutcome } from './scaffoldDownload.ts'
import { ScaffoldInstallDialog } from './ScaffoldInstallDialog.tsx'
import { useScaffoldHostSession, type ScaffoldFlowTheme } from './useScaffoldHostSession.ts'
import dialogs from './DeployDialogs.module.css'

/** Props for the install flow. */
export interface InstallScaffoldFlowProps {
  readonly host: DeployHost
  readonly theme: ScaffoldFlowTheme
  readonly t: (key: DeployKey, params?: Record<string, string>) => string
  /** Project whose `apps/` directory receives the default install. */
  readonly directory?: string | undefined
  readonly startSignIn?: (() => void) | undefined
  readonly onClose: () => void
  readonly onInstalled?: ((outcome: ScaffoldDownloadOutcome) => void) | undefined
}

/**
 * Render the install flow.
 * @param props - host/theme/locale seats, target project, and callbacks.
 * @returns the install dialog, or an unavailable dialog without an origin.
 */
export function InstallScaffoldFlow({
  host, theme, t, directory, startSignIn, onClose, onInstalled,
}: InstallScaffoldFlowProps) {
  const { clients, currentUser, colorScheme, refreshHost } = useScaffoldHostSession(host, theme)
  if (clients === undefined) {
    return (
      <div
        className={dialogs.overlay}
        role="dialog"
        aria-modal="true"
        aria-label={t('scaffoldCenter.installTitle')}
        data-theme={colorScheme}
      >
        <div className={dialogs.modal}>
          <div className={dialogs.modalHeader}>
            <div>
              <h3 className={dialogs.modalTitle}>{t('scaffoldCenter.installTitle')}</h3>
              <p className={dialogs.modalSubtitle}>{t('scaffoldCenter.unconfigured')}</p>
            </div>
            <button type="button" className={dialogs.closeButton} onClick={onClose} aria-label={t('scaffoldCenter.close')}>
              ✕
            </button>
          </div>
          <div className={dialogs.modalActions}>
            <button type="button" className={dialogs.secondaryButton} onClick={onClose}>
              {t('scaffoldCenter.close')}
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <ScaffoldInstallDialog
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
