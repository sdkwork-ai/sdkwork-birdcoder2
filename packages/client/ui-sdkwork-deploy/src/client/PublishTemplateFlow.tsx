/**
 * Shared publish-as-template flow: resolve the target deploy_app from the
 * project manifest (`sdkwork.app.config.json`), fall back to the app picker
 * when the project is unlinked or the recorded ID no longer resolves, run the
 * publish-as-template dialog, and persist the template identity back into the
 * manifest. The session-header action and the row menus' publish service both
 * mount this one flow, so every entry point carries the same resolution,
 * picker fallback, and persistence behavior.
 */
import { useEffect, useMemo, useState, useSyncExternalStore } from 'react'
import type { AppResponse } from '@sdkwork/deployments-app-sdk'
import { resolveLinkedApp } from './deployAppFlow.ts'
import { deploymentsLocale, type DeployLocaleFace, type DeployPublishThemePort } from './deployPorts.ts'
import type { DeployHost, DeployHostClients } from './deployHost.ts'
import type { DeployKey } from './locales.ts'
import { DeployAppPickerDialog } from './DeployAppPickerDialog.tsx'
import { PublishTemplateDialog, type PublishedTemplate } from './PublishTemplateDialog.tsx'

/** Full props for the shared publish-as-template flow. */
export interface PublishTemplateFlowProps {
  /** Host adapter producing the deploy clients and the manifest bridge. */
  readonly host: DeployHost
  /** Reactive theme port for the picker surface. */
  readonly theme: DeployPublishThemePort
  /** Reactive locale face driving the picker's locale mapping. */
  readonly locale: DeployLocaleFace
  /** Plugin locale seat (`deploy` namespace). */
  readonly t: (key: DeployKey, params?: Record<string, string>) => string
  /**
   * The project directory whose manifest resolves the linked app and records
   * the published template; omitted targets the session's current working
   * directory (the header's behavior).
   */
  readonly directory?: string | undefined
  /** Close the flow without a session side effect. */
  readonly onClose: () => void
  /**
   * Acknowledge one published template. Persistence already happened:
   * `persisted` is false when the manifest write failed, so a surface with a
   * banner can say so.
   */
  readonly onPublished: (template: PublishedTemplate, persisted: boolean) => void
}

/**
 * Render the flow's current step: nothing while the manifest resolves, the
 * picker without a usable linked app, the template dialog once the target app
 * is known, and nothing at all when the host has no SDK origin (the same
 * degrade as the header action).
 * @param props - the host adapter, theme/locale ports, locale seat, and the
 *   target project directory.
 * @returns the active dialog, or null while resolving or without clients.
 */
export function PublishTemplateFlow({
  host, theme, locale: localeFace, t, directory, onClose, onPublished,
}: PublishTemplateFlowProps) {
  const [clients, setClients] = useState<DeployHostClients | undefined>(() => {
    try {
      return host.readClients()
    } catch {
      return undefined
    }
  })
  // Bumped on every host notification so the picker remounts and re-issues
  // its list request: a mount before the IAM session hydrated (or a token
  // rotation while open) leaves the first dispatch without an Access-Token,
  // and the re-read inside readClients() is what re-syncs the private manager.
  const [clientsRevision, setClientsRevision] = useState(0)
  const [app, setApp] = useState<AppResponse | undefined>(undefined)
  const [resolved, setResolved] = useState(false)
  const colorScheme = useSyncExternalStore(theme.subscribe, theme.getColorScheme, theme.getColorScheme)
  // The picker locale rides the locale service's snapshot (uSES), NOT the
  // injected `t` seat: that seat is a bare translate function with no locale
  // field (see DeployPublishDialog for the same mapping).
  const localeSnapshot = useSyncExternalStore(
    localeFace.subscribe,
    localeFace.getSnapshot,
    localeFace.getSnapshot,
  )
  const locale = useMemo(() => deploymentsLocale(localeSnapshot.active), [localeSnapshot.active])

  // Re-read clients on host notifications (the DeployPublishDialog pattern):
  // IAM session hydration and token rotation re-sync the private token
  // manager, environment switches rebuild the clients, and the revision
  // remounts the picker so a failed list re-loads instead of staying on the
  // stale error.
  useEffect(() => {
    return host.subscribe(() => {
      try {
        setClients(host.readClients())
        setClientsRevision(revision => revision + 1)
      } catch {
        setClients(undefined)
      }
    })
  }, [host])

  // One resolution per mount: the flow targets one project directory, and the
  // dialog chain needs no re-read after it. A read or retrieve failure lands
  // in `resolveLinkedApp`'s degrade paths (no link / stale link → picker).
  useEffect(() => {
    if (clients === undefined) return
    let cancelled = false
    void resolveLinkedApp(
      () => host.readDeployLink(directory),
      appId => clients.deployClient.app.retrieve(appId),
    ).then((resolution) => {
      if (cancelled) return
      setApp(resolution.app)
      setResolved(true)
    })
    return () => { cancelled = true }
  }, [clients, host, directory])

  if (clients === undefined || !resolved) return null

  if (app === undefined) {
    return (
      <DeployAppPickerDialog
        key={clientsRevision}
        deployClient={clients.deployClient}
        driveClient={clients.driveClient}
        t={t}
        locale={locale}
        theme={colorScheme}
        onClose={onClose}
        onPicked={setApp}
      />
    )
  }

  return (
    <PublishTemplateDialog
      deployClient={clients.deployClient}
      driveClient={clients.driveClient}
      app={app}
      theme={colorScheme}
      t={t}
      onClose={onClose}
      onPublished={(template) => {
        // writeDeployLink degrades to false (never rejects); the catch keeps
        // an unforeseen fault from surfacing as an unhandled rejection.
        void host
          .writeDeployLink({
            templateId: template.id,
            templateKey: template.templateKey,
            templateName: template.displayName,
            ...(template.gitSource === undefined
              ? {}
              : {
                templateGitUrl: template.gitSource.repoUrl,
                templateGitBranch: template.gitSource.defaultBranch,
                templateSubDirectory: template.gitSource.subDirectory,
              }),
          }, directory)
          .then((persisted) => { onPublished(template, persisted) })
          .catch(() => { onPublished(template, false) })
      }}
    />
  )
}
