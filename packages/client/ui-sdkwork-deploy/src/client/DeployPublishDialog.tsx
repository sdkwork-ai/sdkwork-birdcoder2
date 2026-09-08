/**
 * Standalone publish-project dialog: a reusable, trigger-free surface over the
 * shared CreateDeployAppDialog, driven by an injected DeployHost plus the
 * theme/locale ports. The session-header DeployPublishAction embeds the same
 * logic; this standalone export lets the workspace/session row menus open the
 * publish dialog directly (defaulting its source directory to the row's cwd)
 * without duplicating the host adapter or the @sdkwork component wiring.
 */
import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from 'react'
import { CreateDeployAppDialog } from '@sdkwork/deployments-pc-console-publishing'
import type { DeployHost, DeployHostClients } from './deployHost.ts'
import { deploymentsLocale, type DeployLocaleFace, type DeployPublishThemePort } from './DeployPublishAction.tsx'

/** Full props for the standalone publish dialog. */
export interface DeployPublishDialogProps {
  /** Host adapter producing the deploy/drive clients and build/workspace ports. */
  host: DeployHost
  /** Reactive theme port for the shared dialog surface. */
  theme: DeployPublishThemePort
  /** Reactive locale face driving the dialog's locale mapping. */
  locale: DeployLocaleFace
  /** Initial source directory (the row/workspace cwd) for the publish flow. */
  defaultDirectory?: string | undefined
  /** Close the dialog without a session side effect. */
  onClose: () => void
}

/**
 * Render the publish-project dialog. Rebuilds clients when the environment
 * (and thus the API origin) changes, maps the app locale onto the deployments
 * union reactively, and hands the row cwd as the default source directory.
 * @param props - the host adapter plus theme/locale ports and default directory.
 * @returns the shared create-deploy-app dialog, or null when the host is
 * unavailable (no SDKWork base URL configured).
 */
export function DeployPublishDialog({
  host, theme, locale: localeFace, defaultDirectory, onClose,
}: DeployPublishDialogProps) {
  const [clients, setClients] = useState<DeployHostClients | undefined>(() => {
    try {
      return host.readClients()
    } catch {
      return undefined
    }
  })
  const [currentUser, setCurrentUser] = useState<{ id: string; displayName: string } | undefined>(
    () => host.readCurrentUser(),
  )
  const colorScheme = useSyncExternalStore(theme.subscribe, theme.getColorScheme, theme.getColorScheme)

  // Rebuild clients when the environment (and thus the API origin) changes,
  // and refresh the identity chip if the IAM session changes while open.
  useEffect(() => {
    const unsubscribe = host.subscribe(() => {
      try {
        setClients(host.readClients())
        setCurrentUser(host.readCurrentUser())
      } catch {
        setClients(undefined)
      }
    })
    return unsubscribe
  }, [host])

  // Directory inspection is stateless over the host bridge: one stable
  // callback keeps the dialog's debounced auto-detection effect at rest.
  const inspectDirectory = useCallback(
    (path: string) => host.inspectDirectory(path),
    [host],
  )

  // The dialog locale rides the locale service's snapshot (uSES), NOT the
  // injected `t` seat: that seat is a bare translate function with no locale
  // field, so reading one always yields undefined and pinned the dialog to
  // English regardless of the app language (the reported regression).
  const localeSnapshot = useSyncExternalStore(
    localeFace.subscribe,
    localeFace.getSnapshot,
    localeFace.getSnapshot,
  )
  const locale = useMemo(() => deploymentsLocale(localeSnapshot.active), [localeSnapshot.active])

  if (!clients) return null

  return (
    <CreateDeployAppDialog
      deployClient={clients.deployClient}
      driveClient={clients.driveClient}
      locale={locale}
      theme={colorScheme}
      defaultDirectory={defaultDirectory}
      currentUser={currentUser}
      inspectDirectory={inspectDirectory}
      pickDirectory={current => host.pickDirectory(current)}
      buildPort={host.readBuildPort()}
      onClose={onClose}
    />
  )
}
