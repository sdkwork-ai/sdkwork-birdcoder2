import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from 'react'
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import { CreateDeployAppDialog } from '@sdkwork/deployments-pc-console-publishing'
import type { DeploymentsLocale } from '@sdkwork/deployments-pc-commons'
import type { DeployHost, DeployHostClients } from './deployHost.ts'
import { NS } from './locales.ts'
import css from './DeployPublishAction.module.css'

/** Minimal theme port consumed by the action. */
export interface DeployPublishThemePort {
  getColorScheme(): 'light' | 'dark'
  subscribe(listener: () => void): () => void
}

/**
 * Minimal locale face consumed by the action (structural: the injected value
 * is the locale service itself — the injected `t` seat is a bare translate
 * function and carries no locale field).
 */
export interface DeployLocaleFace {
  /** Current immutable locale snapshot; stable reference between changes. */
  getSnapshot(): { active: string }
  /** Observe snapshot changes (locale switches, dictionary registrations). */
  subscribe(listener: () => void): () => void
}

/** Full props for the session-header publish action. */
export type DeployPublishActionProps =
  PropsRuntime<'conversation.session.header.actions'>
  & PropsLocale<typeof NS>
  & {
    /** Host adapter producing the deploy/drive clients. */
    host: DeployHost
    /** Reactive theme port for the shared dialog surface. */
    theme: DeployPublishThemePort
    /** Reactive locale face driving the dialog's locale mapping. */
    locale: DeployLocaleFace
  }

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

/** Map the BirdCoder locale id onto the deployments locale union. */
export function deploymentsLocale(active: string | undefined): DeploymentsLocale {
  return active === 'zh' || active === 'zh-CN' ? 'zh-CN' : 'en-US'
}

/** Session/project defaults captured when the dialog opens. */
interface DeployDialogSessionDefaults {
  defaultDirectory?: string | undefined
  currentUser?: { id: string; displayName: string } | undefined
}

/**
 * Session-header publish action (需求: header session 日志右侧发布 icon).
 * Renders the icon trigger; clicking opens the shared CreateDeployAppDialog
 * with host-constructed clients plus the current session/project defaults
 * (cwd → Source directory, IAM user → 发布身份). The dialog closes without a
 * session side effect, so the entry stays inert until clicked.
 * @param props - runtime slot currency plus the host adapter and theme scheme.
 * @returns the trigger and the dialog, or null when the host is unavailable.
 */
export function DeployPublishAction({ host, theme, locale: localeFace, t }: DeployPublishActionProps) {
  const [open, setOpen] = useState(false)
  const [clients, setClients] = useState<DeployHostClients | undefined>(() => {
    try {
      return host.readClients()
    } catch {
      return undefined
    }
  })
  const [sessionDefaults, setSessionDefaults] = useState<DeployDialogSessionDefaults>({})
  const [error, setError] = useState<string>()
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
    <div className={css.root}>
      <button
        type="button"
        className={css.trigger}
        aria-label={t('publish.aria')}
        title={t('publish.title')}
        onClick={() => {
          // Capture session/project defaults at open time: the cwd snapshot
          // and IAM user are the freshest values at the moment of the click,
          // and the dialog unmounts on close so it re-reads on every open.
          setSessionDefaults({
            defaultDirectory: host.readDefaultDirectory(),
            currentUser: host.readCurrentUser(),
          })
          setOpen(true)
        }}
      >
        <RocketIcon className={css.triggerIcon} />
      </button>
      {open && clients && (
        <CreateDeployAppDialog
          deployClient={clients.deployClient}
          driveClient={clients.driveClient}
          locale={locale}
          theme={colorScheme}
          defaultDirectory={sessionDefaults.defaultDirectory}
          currentUser={sessionDefaults.currentUser}
          inspectDirectory={inspectDirectory}
          pickDirectory={current => host.pickDirectory(current)}
          buildPort={host.readBuildPort()}
          onClose={() => { setOpen(false) }}
        />
      )}
      {error && <div className={css.error} role="alert">{error}</div>}
    </div>
  )
}
