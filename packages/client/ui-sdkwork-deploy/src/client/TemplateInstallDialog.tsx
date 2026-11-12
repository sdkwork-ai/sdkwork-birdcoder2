/**
 * Install-from-template dialog: the product surface behind the project row's
 * `从模板安装` action.
 *
 * This dialog is deliberately independent of the publish dialog: it owns no
 * publish scan, wizard, or selection state, and the publish flow imports it
 * nowhere. Its body is the install panel, which reads its own template
 * catalog and drives the host install bridge. The shared frame is only modal
 * chrome and the sign-in gate.
 */
import { useState } from 'react'
import type { DeployHost, DeployHostClients } from './deployHost.ts'
import type { TemplateDownloadOutcome } from './templateDownload.ts'
import type { DeployKey } from './locales.ts'
import { TemplateDialogFrame, type TemplateDialogUser } from './TemplateDialogFrame.tsx'
import { TemplateInstallPanel } from './TemplateInstallPanel.tsx'

/** Props for the install dialog. */
export interface TemplateInstallDialogProps {
  readonly host: DeployHost
  readonly clients: DeployHostClients
  readonly theme: 'light' | 'dark'
  readonly t: (key: DeployKey, params?: Record<string, string>) => string
  /** Project whose `apps/` directory receives the install by default. */
  readonly directory?: string | undefined
  readonly currentUser?: TemplateDialogUser | undefined
  readonly startSignIn?: (() => void) | undefined
  readonly onClose: () => void
  /** One template install completed. */
  readonly onInstalled?: ((outcome: TemplateDownloadOutcome) => void) | undefined
}

/**
 * Render the install dialog.
 * @param props - host bridge, clients, theme, locale seat, target project, and
 *   the signed-in account.
 * @returns the install-only dialog.
 */
export function TemplateInstallDialog({
  host, clients, theme, t, directory, currentUser, startSignIn, onClose, onInstalled,
}: TemplateInstallDialogProps) {
  const [busy, setBusy] = useState(false)
  return (
    <TemplateDialogFrame
      theme={theme}
      t={t}
      title={t('templateCenter.installTitle')}
      subtitle={t('templateCenter.installSubtitle')}
      currentUser={currentUser}
      startSignIn={startSignIn}
      busy={busy}
      onClose={onClose}
    >
      <TemplateInstallPanel
        host={host}
        clients={clients}
        directory={directory}
        t={t}
        onInstalled={onInstalled}
        onBusyChange={setBusy}
      />
    </TemplateDialogFrame>
  )
}
