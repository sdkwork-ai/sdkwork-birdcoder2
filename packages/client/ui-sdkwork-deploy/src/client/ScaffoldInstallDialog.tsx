/**
 * Install-from-scaffold dialog: the product surface behind the project row's
 * `从脚手架安装` action.
 *
 * This dialog is deliberately independent of the publish dialog: it owns no
 * publish scan, wizard, or selection state, and the publish flow imports it
 * nowhere. Its body is the install panel, which reads its own scaffold
 * catalog and drives the host install bridge. The shared frame is only modal
 * chrome and the sign-in gate.
 */
import { useState } from 'react'
import type { DeployHost, DeployHostClients } from './deployHost.ts'
import type { ScaffoldDownloadOutcome } from './scaffoldDownload.ts'
import type { DeployKey } from './locales.ts'
import { ScaffoldDialogFrame, type ScaffoldDialogUser } from './ScaffoldDialogFrame.tsx'
import { ScaffoldInstallPanel } from './ScaffoldInstallPanel.tsx'

/** Props for the install dialog. */
export interface ScaffoldInstallDialogProps {
  readonly host: DeployHost
  readonly clients: DeployHostClients
  readonly theme: 'light' | 'dark'
  readonly t: (key: DeployKey, params?: Record<string, string>) => string
  /** Project whose `apps/` directory receives the install by default. */
  readonly directory?: string | undefined
  readonly currentUser?: ScaffoldDialogUser | undefined
  readonly startSignIn?: (() => void) | undefined
  readonly onClose: () => void
  /** One scaffold install completed. */
  readonly onInstalled?: ((outcome: ScaffoldDownloadOutcome) => void) | undefined
}

/**
 * Render the install dialog.
 * @param props - host bridge, clients, theme, locale seat, target project, and
 *   the signed-in account.
 * @returns the install-only dialog.
 */
export function ScaffoldInstallDialog({
  host, clients, theme, t, directory, currentUser, startSignIn, onClose, onInstalled,
}: ScaffoldInstallDialogProps) {
  const [busy, setBusy] = useState(false)
  return (
    <ScaffoldDialogFrame
      theme={theme}
      t={t}
      title={t('scaffoldCenter.installTitle')}
      subtitle={t('scaffoldCenter.installSubtitle')}
      currentUser={currentUser}
      startSignIn={startSignIn}
      busy={busy}
      onClose={onClose}
    >
      <ScaffoldInstallPanel
        host={host}
        clients={clients}
        directory={directory}
        t={t}
        onInstalled={onInstalled}
        onBusyChange={setBusy}
      />
    </ScaffoldDialogFrame>
  )
}
