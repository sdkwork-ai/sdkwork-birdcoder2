import { useCallback, useEffect, useState } from 'react'
import { Menu, Toast } from '@deepseek-ai/dsh-client-ui-primitives'
import type { MenuEntry } from '@deepseek-ai/dsh-client-ui-primitives'
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { DeployHost, DeployHostClients } from './deployHost.ts'
import type { ProjectAppState } from './projectApp.ts'
import type { DeployLocaleFace, DeployPublishThemePort } from './deployPorts.ts'
import { NS } from './locales.ts'
import {
  DeployProjectAppFlow,
  type ProjectAppFlowOutcome,
  type ProjectAppIntent,
} from './DeployProjectAppFlow.tsx'
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

/** The surface the header opened over itself. */
type ActiveFlow =
  | { readonly kind: 'project'; readonly intent: ProjectAppIntent }
  | { readonly kind: 'template' }

/** One transient outcome banner. */
interface Banner {
  readonly text: string
  readonly tone: 'success' | 'error'
  /** Remount key: a back-to-back outcome restarts the hold window. */
  readonly seq: number
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

/**
 * Session-header publish action.
 *
 * One trigger, one state-aware menu. Opening it reads the session project's
 * `sdkwork.app.config.json`:
 *
 * - a project that records no deploy_app offers **创建应用并发布**: the
 *   manifest supplies name, type, app key and description, and
 *   {@link DeployProjectAppFlow} creates, links and registers the app before
 *   opening the publish dialog;
 * - a project that already records one offers **发布应用**, **上传代码** and
 *   **发布为模板**, and no create action at all;
 * - a recorded app that no longer resolves offers replacement creation and
 *   rewrites the linkage.
 * @param props - runtime slot currency plus the host adapter and theme/locale ports.
 * @returns the trigger menu and the mounted flows, or null when the host is unavailable.
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
  const [project, setProject] = useState<ProjectAppState | undefined>(undefined)
  const [flow, setFlow] = useState<ActiveFlow | undefined>(undefined)
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

  /** Re-read the project manifest; the menu labels act on this state. */
  const refreshProject = useCallback(async (): Promise<void> => {
    setProject(await host.readProjectApp())
  }, [host])

  const openFlow = (intent: ProjectAppIntent): void => {
    setOpen(false)
    setFlow({ kind: 'project', intent })
  }

  const items: MenuEntry[] = []
  if (project === undefined) {
    items.push({ id: 'reading', type: 'label', text: t('menu.reading') })
  } else if (project.linkedAppId !== undefined) {
    items.push({
      id: 'linked',
      type: 'label',
      text: t('menu.linked', { name: project.link?.appName ?? project.linkedAppId }),
    })
    items.push({ id: 'publish', label: t('menu.publishApp') })
    items.push({ id: 'upload', label: t('menu.uploadCode') })
    items.push({ id: 'template', label: t('menu.publishTemplate') })
  } else {
    items.push({ id: 'create', label: t('menu.createAndPublish') })
  }

  if (!clients) return null

  const dispatch = (id: string): void => {
    if (id === 'create' || id === 'publish') openFlow('publish')
    if (id === 'upload') openFlow('upload')
    if (id === 'template') {
      setOpen(false)
      setFlow({ kind: 'template' })
    }
  }

  return (
    <div className={css.root}>
      <Menu
        open={open}
        align="end"
        portal
        closeOnPointerLeave
        onClose={() => { setOpen(false) }}
        onSelect={dispatch}
        items={items}
        anchor={(
          <button
            type="button"
            className={css.trigger}
            aria-label={t('publish.aria')}
            aria-haspopup="menu"
            aria-expanded={open}
            title={t('publish.title')}
            onClick={() => {
              if (open) {
                setOpen(false)
                return
              }
              setOpen(true)
              setProject(undefined)
              void refreshProject()
            }}
          >
            <RocketIcon className={css.triggerIcon} />
          </button>
        )}
      />

      {flow?.kind === 'project' && (
        <DeployProjectAppFlow
          host={host}
          theme={theme}
          locale={localeFace}
          t={t}
          intent={flow.intent}
          onDone={showBanner}
          onClose={() => { setFlow(undefined) }}
        />
      )}

      {flow?.kind === 'template' && (
        <PublishTemplateFlow
          host={host}
          theme={theme}
          locale={localeFace}
          t={t}
          onClose={() => { setFlow(undefined) }}
          onPublished={(template, persisted) => {
            showBanner(
              persisted
                ? { text: t('notice.templatePublished', { name: template.displayName }), tone: 'success' }
                : { text: t('config.writeFailed'), tone: 'error' },
            )
            setFlow(undefined)
          }}
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
