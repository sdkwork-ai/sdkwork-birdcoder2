import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from 'react'
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import {
  AppPublishDialog,
  CreateAppDialog,
  UploadSourceDialog,
  createDeployAppPublishingService,
  type DeployAppPublishingService,
} from '@sdkwork/deployments-pc-console-publishing'
import type { AppResponse } from '@sdkwork/deployments-app-sdk'
import type { DeployAppConfigLink } from './deployAppConfig.ts'
import { resolveLinkedApp } from './deployAppFlow.ts'
import {
  deploymentsLocale,
  type DeployLocaleFace,
  type DeployPublishThemePort,
} from './deployPorts.ts'
import type { DeployHost, DeployHostClients } from './deployHost.ts'
import { NS } from './locales.ts'
import { DeployAppPickerDialog } from './DeployAppPickerDialog.tsx'
import { PublishTemplateFlow } from './PublishTemplateFlow.tsx'
import css from './DeployPublishAction.module.css'

export { deploymentsLocale } from './deployPorts.ts'
export type { DeployLocaleFace, DeployPublishThemePort } from './deployPorts.ts'

/** Full props for the session-header publish action. */
export type DeployPublishActionProps =
  PropsRuntime<'conversation.session.header.utilities'>
  & PropsLocale<typeof NS>
  & {
    /** Host adapter producing the deploy/drive clients. */
    host: DeployHost
    /** Reactive theme port for the shared dialog surface. */
    theme: DeployPublishThemePort
    /** Reactive locale face driving the dialog's locale mapping. */
    locale: DeployLocaleFace
  }

/** The flows the hover menu starts. */
type DeployFlow = 'create' | 'upload' | 'publish' | 'template'

/** The flows that need a target app before their dialog mounts. The template
 * flow resolves its own target inside the shared `PublishTemplateFlow`. */
type AppPickFlow = Extract<DeployFlow, 'upload' | 'publish'>

/** Rocket glyph for the publish trigger (self-contained, currentColor). */
function RocketIcon({ size = 15, className }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} className={className} viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <path
        d="M8.00001 0.666626C5.33334 0.666626 3.00001 1.66663 1.00001 4.33329L4.66668 5.66663L5.33334 7.33329L1.33334 9.66663L3.00001 12.6666C4.66668 11.3333 6.00001 10.6666 7.33334 10.6666L9.66668 11.3333L11.3333 7.33329L12.3333 3.66663C11.3333 1.99996 10.00001 0.666626 8.00001 0.666626ZM8.00001 5.33329C8.73639 5.33329 9.33334 5.93025 9.33334 6.66663C9.33334 7.403 8.73639 7.99996 8.00001 7.99996C7.26363 7.99996 6.66668 7.403 6.66668 6.66663C6.66668 5.93025 7.26363 5.33329 8.00001 5.33329Z"
        fill="currentColor"
      />
      <path d="M11.3333 12.3333L9.33334 15.3333L7.33334 11.6666L9.33334 9.66663L11.3333 12.3333Z" fill="currentColor" />
      <path d="M4.33334 0.999963L0.666672 3.33329L3.66667 4.66663L5.33334 3.66663L4.33334 0.999963Z" fill="currentColor" />
    </svg>
  )
}

/**
 * Session-header deploy action (需求: header 右侧工具簇、Session log 省略号
 * icon 左侧的发布 icon). The icon carries a hover dropdown with the four
 * deployment flows:
 *
 * 1. 新建应用 — registers the deploy_app only (`CreateAppDialog`), no code
 *    upload; the created identity is persisted into the project manifest.
 * 2. 上传代码 — resolves the linked app (manifest ID first, picker on
 *    miss) and opens the real upload chain (`UploadSourceDialog`:
 *    Drive session → artifact → optional release/deployment).
 * 3. 发布应用 — cuts a release/deployment from the linked app's artifacts
 *    (`AppPublishDialog`).
 * 4. 发布为模板 — mounts the shared `PublishTemplateFlow` (manifest
 *    resolution → picker fallback → publish-as-template dialog → manifest
 *    write-back), the same flow the row menus' publish service opens.
 *
 * Every success writes `deploy_app` / `deploy_app_template` ids and display
 * info back into `sdkwork.app.config.json` (`deploy` section + `backend.appId`)
 * through the host workspace bridge, so the next run relates by ID.
 * @param props - runtime slot currency plus the host adapter and theme scheme.
 * @returns the trigger with the hover menu and the mounted flow dialogs, or null when the host is unavailable.
 */
export function DeployPublishAction({ host, theme, locale: localeFace, t }: DeployPublishActionProps) {
  const [clients, setClients] = useState<DeployHostClients | undefined>(() => {
    try {
      return host.readClients()
    } catch {
      return undefined
    }
  })
  const [error, setError] = useState<string | undefined>(undefined)
  const [notice, setNotice] = useState<string | undefined>(undefined)
  const [flow, setFlow] = useState<DeployFlow | undefined>(undefined)
  const [pickerFlow, setPickerFlow] = useState<AppPickFlow | undefined>(undefined)
  const [targetApp, setTargetApp] = useState<AppResponse | undefined>(undefined)
  const [deployLink, setDeployLink] = useState<DeployAppConfigLink | undefined>(undefined)
  const colorScheme = useSyncExternalStore(theme.subscribe, theme.getColorScheme, theme.getColorScheme)

  // Rebuild clients when the environment (and thus the API origin) changes.
  useEffect(() => {
    const unsubscribe = host.subscribe(() => {
      try {
        setClients(host.readClients())
        setError(undefined)
      } catch {
        setClients(undefined)
      }
    })
    return unsubscribe
  }, [host])

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

  // Re-read the persisted linkage on every hover: the session project (cwd)
  // can switch between hovers, and each project carries its own manifest.
  const ensureLink = useCallback((): void => {
    host
      .readDeployLink()
      .then((link) => { setDeployLink(link) })
      .catch(() => { setDeployLink(undefined) })
  }, [host])

  /**
   * Resolve the flow's target app: the persisted manifest ID first (related
   * by ID on repeat runs), otherwise the picker opens. A stale persisted ID
   * (deleted app) also falls through to the picker. The manifest is read at
   * click time — hovering may not have finished the read yet, and a
   * just-switched project must not answer with a stale ID.
   */
  const startAppFlow = useCallback(async (flow: AppPickFlow): Promise<void> => {
    if (clients === undefined) return
    setNotice(undefined)
    setError(undefined)
    const resolution = await resolveLinkedApp(
      () => host.readDeployLink(),
      appId => clients.deployClient.app.retrieve(appId),
    )
    setDeployLink(resolution.staleLink ? undefined : resolution.link)
    if (resolution.app !== undefined) {
      setTargetApp(resolution.app)
      setFlow(flow)
      return
    }
    setPickerFlow(flow)
  }, [clients, host])

  /** Record a created/picked app in the project manifest and the menu state. */
  const rememberApp = useCallback((app: AppResponse): void => {
    const patch = {
      appId: app.id,
      appName: app.name,
      appSlug: app.slug,
      sourceDirectory: host.readDefaultDirectory(),
    }
    setDeployLink(current => ({ ...current, ...patch }))
    host
      .writeDeployLink(patch)
      .then((written) => {
        if (!written) setError(t('config.writeFailed'))
      })
      .catch(() => setError(t('config.writeFailed')))
  }, [host, t])

  // Hooks-safe: the memo runs on every render and only materializes the
  // service once the clients exist (clients flip undefined -> ready exactly
  // once per environment, so the identity stays stable between mounts).
  const publishingService: DeployAppPublishingService | undefined = useMemo(
    () =>
      clients === undefined
        ? undefined
        : createDeployAppPublishingService({
          deployClient: clients.deployClient,
          driveClient: clients.driveClient,
        }),
    [clients],
  )

  if (!clients || publishingService === undefined) return null

  const linkedName = deployLink?.appName ?? deployLink?.appId

  return (
    <div
      className={css.root}
      onMouseEnter={ensureLink}
      onKeyDown={(event) => {
        // Escape closes the hover menu: blurring removes focus-within.
        if (event.key === 'Escape' && document.activeElement instanceof HTMLElement) {
          document.activeElement.blur()
        }
      }}
    >
      <button
        type="button"
        className={css.trigger}
        aria-label={t('publish.aria')}
        aria-haspopup="menu"
        title={t('publish.title')}
        onClick={() => { ensureLink() }}
      >
        <RocketIcon className={css.triggerIcon} />
      </button>
      <div className={css.menu} role="menu" aria-label={t('menu.aria')}>
        <button
          type="button"
          role="menuitem"
          className={css.menuItem}
          onClick={() => {
            setNotice(undefined)
            setError(undefined)
            setFlow('create')
          }}
        >
          <span className={css.menuItemLabel}>{t('menu.createApp')}</span>
          <span className={css.menuItemHint}>{t('menu.createAppHint')}</span>
        </button>
        <button
          type="button"
          role="menuitem"
          className={css.menuItem}
          onClick={() => { void startAppFlow('upload') }}
        >
          <span className={css.menuItemLabel}>{t('menu.uploadCode')}</span>
          <span className={css.menuItemHint}>{t('menu.uploadCodeHint')}</span>
        </button>
        <button
          type="button"
          role="menuitem"
          className={css.menuItem}
          onClick={() => { void startAppFlow('publish') }}
        >
          <span className={css.menuItemLabel}>{t('menu.publishApp')}</span>
          <span className={css.menuItemHint}>{t('menu.publishAppHint')}</span>
        </button>
        <button
          type="button"
          role="menuitem"
          className={css.menuItem}
          onClick={() => {
            setNotice(undefined)
            setError(undefined)
            setFlow('template')
          }}
        >
          <span className={css.menuItemLabel}>{t('menu.publishTemplate')}</span>
          <span className={css.menuItemHint}>{t('menu.publishTemplateHint')}</span>
        </button>
        <div className={css.menuFooter}>
          {linkedName !== undefined
            ? t('menu.linked', { name: linkedName })
            : t('menu.unlinked')}
        </div>
      </div>
      {notice !== undefined && <div className={css.notice} role="status">{notice}</div>}
      {error !== undefined && <div className={css.error} role="alert">{error}</div>}

      {flow === 'create' && (
        <CreateAppDialog
          deployClient={clients.deployClient}
          driveClient={clients.driveClient}
          locale={locale}
          theme={colorScheme}
          onCreated={(app) => {
            rememberApp(app)
            setNotice(t('notice.created', { name: app.name }))
            setFlow(undefined)
          }}
          onClose={() => { setFlow(undefined) }}
        />
      )}

      {flow === 'upload' && targetApp !== undefined && (
        <UploadSourceDialog
          deployClient={clients.deployClient}
          driveClient={clients.driveClient}
          locale={locale}
          app={targetApp}
          theme={colorScheme}
          onUploaded={(summary) => {
            setNotice(t('notice.uploaded', { summary }))
            setFlow(undefined)
            setTargetApp(undefined)
          }}
          onClose={() => {
            setFlow(undefined)
            setTargetApp(undefined)
          }}
        />
      )}

      {pickerFlow !== undefined && (
        <DeployAppPickerDialog
          deployClient={clients.deployClient}
          driveClient={clients.driveClient}
          t={t}
          locale={locale}
          theme={colorScheme}
          onClose={() => { setPickerFlow(undefined) }}
          onPicked={(app) => {
            const activeFlow = pickerFlow
            setPickerFlow(undefined)
            setTargetApp(app)
            rememberApp(app)
            if (activeFlow !== undefined) {
              setFlow(activeFlow)
            }
          }}
        />
      )}

      {flow === 'publish' && targetApp !== undefined && (
        <AppPublishDialog
          app={targetApp}
          locale={locale}
          service={publishingService}
          onSaved={() => {
            setNotice(t('notice.releaseSaved'))
            setFlow(undefined)
            setTargetApp(undefined)
          }}
          onClose={() => {
            setFlow(undefined)
            setTargetApp(undefined)
          }}
        />
      )}

      {flow === 'template' && (
        <PublishTemplateFlow
          host={host}
          theme={theme}
          locale={localeFace}
          t={t}
          onClose={() => { setFlow(undefined) }}
          onPublished={(template, persisted) => {
            setDeployLink(current => ({
              ...current,
              templateId: template.id,
              templateKey: template.templateKey,
              templateName: template.displayName,
            }))
            setNotice(t('notice.templatePublished', { name: template.displayName }))
            if (!persisted) setError(t('config.writeFailed'))
            setFlow(undefined)
          }}
        />
      )}
    </div>
  )
}
