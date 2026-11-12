/**
 * Publish-as-template flow: mount the publish dialog for one project
 * directory. The row menu's `发布为模板` action opens this flow with the
 * project's own cwd; the dialog scans `<project>/apps` or a custom directory
 * and publishes the selected app roots.
 *
 * Install has its own flow and dialog. This file owns only client/account
 * binding and the publish outcome callback.
 */
import type { DeployHost } from './deployHost.ts'
import type { DeployKey } from './locales.ts'
import { TemplatePublishDialog } from './TemplatePublishDialog.tsx'
import { useTemplateHostSession, type TemplateFlowTheme } from './useTemplateHostSession.ts'
import dialogs from './DeployDialogs.module.css'

/** Props for the publish flow. */
export interface PublishTemplateFlowProps {
  readonly host: DeployHost
  readonly theme: TemplateFlowTheme
  readonly t: (key: DeployKey, params?: Record<string, string>) => string
  /** Project directory whose `apps/` tree is read; omit for the session cwd. */
  readonly directory?: string | undefined
  readonly startSignIn?: (() => void) | undefined
  readonly onClose: () => void
  /** A publish batch created or updated `count` templates. */
  readonly onPublished?: ((count: number) => void) | undefined
}

/**
 * Render the publish flow.
 * @param props - host/theme/locale seats, target project, and callbacks.
 * @returns the publish dialog, or an unavailable dialog without an origin.
 */
export function PublishTemplateFlow({
  host, theme, t, directory, startSignIn, onClose, onPublished,
}: PublishTemplateFlowProps) {
  const { clients, currentUser, colorScheme, refreshHost } = useTemplateHostSession(host, theme)
  if (clients === undefined) {
    return (
      <div
        className={dialogs.overlay}
        role="dialog"
        aria-modal="true"
        aria-label={t('templateCenter.publishTitle')}
        data-theme={colorScheme}
      >
        <div className={dialogs.modal}>
          <div className={dialogs.modalHeader}>
            <div>
              <h3 className={dialogs.modalTitle}>{t('templateCenter.publishTitle')}</h3>
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
    <TemplatePublishDialog
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
