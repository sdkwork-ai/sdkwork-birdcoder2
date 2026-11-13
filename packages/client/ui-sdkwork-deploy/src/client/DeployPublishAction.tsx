import { useCallback, useEffect, useState } from 'react'
import { IconSendOutlineRegular, Toast } from '@deepseek-ai/dsh-client-ui-primitives'
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { DeployHost, DeployHostClients } from './deployHost.ts'
import type { DeployLocaleFace, DeployPublishThemePort } from './deployPorts.ts'
import { NS } from './locales.ts'
import { DeployAppLibraryDialog } from './DeployAppLibraryDialog.tsx'
import type { ProjectAppFlowOutcome } from './DeployProjectAppFlow.tsx'
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

/** One transient outcome banner. */
interface Banner {
  readonly text: string
  readonly tone: 'success' | 'error'
  /** Remount key: a back-to-back outcome restarts the hold window. */
  readonly seq: number
}

/**
 * Session-header publish entry.
 *
 * One trigger, one popup — the app library. Opening it scans the session
 * workspace for `agent.app.config.json` manifests and lists every app the
 * files record: each row publishes, uploads code to, or builds its project
 * through the shared flows, the footer creates a new app through the console's
 * full form, and an empty scan renders a clickable placeholder with the same
 * create action. Publish-as-template stays on the workspace/session row menus
 * (`deployPublish.openPublishTemplate` / `openInstallTemplate`); the header popup is the app inventory, not a
 * second menu.
 * @param props - runtime slot currency plus the host adapter and theme/locale ports.
 * @returns the trigger and the mounted library, or null when the host is unavailable.
 */
export function DeployPublishAction({ host, theme, locale: localeFace, t }: DeployPublishActionProps) {
  const [clients, setClients] = useState<DeployHostClients | undefined>(() => {
    try {
      return host.readClients()
    } catch {
      return undefined
    }
  })
  const [open, setOpen] = useState(false)
  const [banner, setBanner] = useState<Banner | undefined>(undefined)

  // Rebuild clients when the environment (and thus the API origin) changes.
  useEffect(() => {
    const unsubscribe = host.subscribe(() => {
      try {
        setClients(host.readClients())
      } catch {
        setClients(undefined)
      }
    })
    return unsubscribe
  }, [host])

  const showBanner = useCallback((outcome: ProjectAppFlowOutcome): void => {
    setBanner(current => ({ text: outcome.text, tone: outcome.tone, seq: (current?.seq ?? 0) + 1 }))
  }, [])

  if (!clients) return null

  return (
    <div className={css.root}>
      <button
        type="button"
        className={css.trigger}
        aria-label={t('publish.aria')}
        aria-haspopup="dialog"
        aria-expanded={open}
        title={t('publish.title')}
        onClick={() => { setOpen(true) }}
      >
        <IconSendOutlineRegular size={16} className={css.triggerIcon} />
      </button>

      {open && (
        <DeployAppLibraryDialog
          host={host}
          theme={theme}
          locale={localeFace}
          t={t}
          onDone={showBanner}
          onClose={() => { setOpen(false) }}
        />
      )}

      {banner !== undefined && (
        <Toast
          key={banner.seq}
          text={banner.text}
          {...(banner.tone === 'success' ? { tone: 'success' as const } : {})}
          onDone={() => { setBanner(current => (current?.seq === banner.seq ? undefined : current)) }}
        />
      )}
    </div>
  )
}
