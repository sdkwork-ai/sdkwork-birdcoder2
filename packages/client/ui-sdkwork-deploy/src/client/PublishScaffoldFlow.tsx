/**
 * Publish-as-scaffold flow: mount the publish dialog for one project
 * directory. The row menu's `发布为脚手架` action opens this flow with the
 * project's own cwd; the dialog scans `<project>/apps` or a custom directory
 * and publishes the selected app roots.
 *
 * Install has its own flow and dialog. This file owns only client/account
 * binding and the publish outcome callback.
 */
import type { DeployHost } from './deployHost.ts'
import type { DeployKey } from './locales.ts'
import { ScaffoldPublishDialog } from './ScaffoldPublishDialog.tsx'
import { useScaffoldHostSession, type ScaffoldFlowTheme } from './useScaffoldHostSession.ts'
import dialogs from './DeployDialogs.module.css'

/** Props for the publish flow. */
export interface PublishScaffoldFlowProps {
  readonly host: DeployHost
  readonly theme: ScaffoldFlowTheme
  readonly t: (key: DeployKey, params?: Record<string, string>) => string
  /** Project directory whose `apps/` tree is read; omit for the session cwd. */
  readonly directory?: string | undefined
  readonly startSignIn?: (() => void) | undefined
  readonly onClose: () => void
  /** A publish batch created or updated `count` scaffolds. */
  readonly onPublished?: ((count: number) => void) | undefined
}

/**
 * Render the publish flow.
 * @param props - host/theme/locale seats, target project, and callbacks.
 * @returns the publish dialog, or an unavailable dialog without an origin.
 */
export function PublishScaffoldFlow({
  host, theme, t, directory, startSignIn, onClose, onPublished,
}: PublishScaffoldFlowProps) {
  const { clients, currentUser, colorScheme, refreshHost } = useScaffoldHostSession(host, theme)
  if (clients === undefined) {
    return (
      <div
        className={dialogs.overlay}
        role="dialog"
        aria-modal="true"
        aria-label={t('scaffoldCenter.publishTitle')}
        data-theme={colorScheme}
      >
        <div className={dialogs.modal}>
          <div className={dialogs.modalHeader}>
            <div>
              <h3 className={dialogs.modalTitle}>{t('scaffoldCenter.publishTitle')}</h3>
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
    <ScaffoldPublishDialog
      host={host}
      clients={clients}
      theme={colorScheme}
      t={t}
      directory={directory ?? host.readDefaultDirectory()}
      currentUser={currentUser}
      startSignIn={startSignIn}
      onClose={onClose}
      onPublished={(count) => {
        refreshHost()
        onPublished?.(count)
      }}
    />
  )
}
