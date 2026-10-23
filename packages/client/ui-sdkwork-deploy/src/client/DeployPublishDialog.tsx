/**
 * Standalone publish-project dialog: a reusable, trigger-free surface over the
 * shared CreateDeployAppDialog, driven by an injected DeployHost plus the
 * theme/locale ports. The session-header publish flow embeds the same logic;
 * this standalone export lets the workspace/session row menus open the
 * publish dialog directly (defaulting its source directory to the row's cwd)
 * without duplicating the host adapter or the @sdkwork component wiring.
 *
 * When the project's linked app is already resolved, pass it as `app`: the
 * shared dialog then skips its app-selection step and publishes that app.
 */
import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from 'react'
import { CreateDeployAppDialog } from '@sdkwork/deployments-pc-console-publishing'
import type { AppResponse } from '@sdkwork/deployments-app-sdk'
import type { DeployHost, DeployHostClients } from './deployHost.ts'
import { deploymentsLocale, type DeployLocaleFace, type DeployPublishThemePort } from './deployPorts.ts'

/** Full props for the standalone publish dialog. */
export interface DeployPublishDialogProps {
  /** Host adapter producing the deploy/drive clients and build/workspace ports. */
  host: DeployHost
  /** Reactive theme port for the shared dialog surface. */
  theme: DeployPublishThemePort
  /** Reactive locale face driving the dialog's locale mapping. */
  locale: DeployLocaleFace
  /** The resolved linked app; omitted lets the shared dialog list apps instead. */
  app?: AppResponse | undefined
  /** Initial source directory (the row/workspace cwd) for the publish flow. */
  defaultDirectory?: string | undefined
  /** The publish form was saved for the target app. */
  onPublished?: ((app: AppResponse) => void) | undefined
  /** Close the dialog without a session side effect. */
  onClose: () => void
}

/**
 * Render the publish-project dialog. Rebuilds clients when the environment
 * (and thus the API origin) changes, maps the app locale onto the deployments
 * union reactively, and hands the row cwd as the default source directory.
 * @param props - the host adapter plus theme/locale ports, the resolved target
 *   app, and the default directory.
 * @returns the shared create-deploy-app dialog, or null when the host is
 * unavailable (no SDKWork base URL configured).
 */
export function DeployPublishDialog({
  host, theme, locale: localeFace, app, defaultDirectory, onPublished, onClose,
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
  // uSES calls both members unbound: bind the ports through stable closures.
  const subscribeTheme = useCallback((listener: () => void) => theme.subscribe(listener), [theme])
  const readTheme = useCallback(() => theme.getColorScheme(), [theme])
  const colorScheme = useSyncExternalStore(subscribeTheme, readTheme, readTheme)

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
  const subscribeLocale = useCallback((listener: () => void) => localeFace.subscribe(listener), [localeFace])
  const readLocale = useCallback(() => localeFace.getSnapshot(), [localeFace])
  const localeSnapshot = useSyncExternalStore(subscribeLocale, readLocale, readLocale)
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
      {...(app === undefined ? {} : { publishApp: app, publishAppId: app.id })}
      {...(onPublished === undefined ? {} : { onPublished: (result) => { onPublished(result.app) } })}
      onClose={onClose}
    />
  )
}
