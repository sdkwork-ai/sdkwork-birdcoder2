import { useEffect, useRef, useState } from 'react'
import { useDismissOnOutsidePointer } from '@deepseek-ai/dsh-client-ui-primitives'
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { ShareHost } from './shareHost.ts'
import { NS } from './locales.ts'
import css from './ShareAction.module.css'

/** Full props for the session-header share action. */
export type ShareActionProps =
  PropsRuntime<'conversation.session.header.actions'>
  & PropsLocale<typeof NS>
  & {
    /** Host adapter listing recently published applications. */
    host: ShareHost
  }

/** Standard share glyph (self-contained, currentColor). */
function ShareIcon({ size = 15, className }: { size?: number; className?: string | undefined }) {
  return (
    <svg width={size} height={size} className={className} viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <circle cx="12.5" cy="3.5" r="2.1" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="3.5" cy="8" r="2.1" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="12.5" cy="12.5" r="2.1" stroke="currentColor" strokeWidth="1.5" />
      <path d="M5.4 6.9L10.6 4.6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M5.4 9.1L10.6 11.4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  )
}

interface RecentApp {
  id: string
  name: string
  appKind: string
}

/**
 * Session-header share action (发布应用右侧). Renders the share trigger; the
 * popover copies the current session ID and lists recently published
 * deploy_app records (best-effort) with one-click copy of their application
 * IDs, so a just-published app can be shared immediately.
 * @param props - runtime slot currency plus the share host adapter.
 * @returns the trigger and its popover.
 */
export function ShareAction({ sessionId, host, t }: ShareActionProps) {
  const [open, setOpen] = useState(false)
  const [apps, setApps] = useState<readonly RecentApp[]>([])
  const [appsState, setAppsState] = useState<'idle' | 'loading' | 'ready' | 'unavailable'>('idle')
  const [copied, setCopied] = useState<string>()
  const rootRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)

  useDismissOnOutsidePointer(rootRef, open, setOpen)

  useEffect(() => {
    if (!open) return
    setAppsState('loading')
    let active = true
    void host.listRecentApps(5).then((items) => {
      if (!active) return
      setApps(items)
      setAppsState('ready')
    }).catch(() => {
      if (active) setAppsState('unavailable')
    })
    return () => { active = false }
  }, [host, open])

  const copy = async (id: string, value: string) => {
    try {
      await navigator.clipboard.writeText(value)
      setCopied(id)
    } catch {
      setCopied(undefined)
    }
  }

  const onKeyDown = (event: ReactKeyboardEvent): void => {
    if (event.key !== 'Escape' || !open) return
    event.preventDefault()
    setOpen(false)
    triggerRef.current?.focus()
  }

  return (
    <div ref={rootRef} className={css.root} onKeyDown={onKeyDown}>
      <button
        ref={triggerRef}
        type="button"
        className={css.trigger}
        aria-expanded={open}
        aria-label={t('share.aria')}
        title={t('share.title')}
        onClick={() => { setOpen(current => !current) }}
      >
        <ShareIcon className={css.triggerIcon} />
      </button>
      {open && (
        <div className={css.popover} role="dialog" aria-label={t('share.popover')}>
          <section className={css.section}>
            <span className={css.sectionTitle}>{t('share.session')}</span>
            <button
              type="button"
              className={css.row}
              onClick={() => { void copy('session', sessionId) }}
            >
              <code className={css.value}>{sessionId}</code>
              <span className={css.action}>{copied === 'session' ? t('share.copied') : t('share.copySessionId')}</span>
            </button>
          </section>
          <section className={css.section}>
            <span className={css.sectionTitle}>{t('share.recentApps')}</span>
            {appsState === 'loading' && <div className={css.state}>{t('share.loading')}</div>}
            {appsState === 'unavailable' && <div className={css.state}>{t('share.appsUnavailable')}</div>}
            {appsState === 'ready' && apps.length === 0 && <div className={css.state}>{t('share.appsEmpty')}</div>}
            {appsState === 'ready' && apps.map(app => (
              <button
                key={app.id}
                type="button"
                className={css.row}
                onClick={() => { void copy(`app:${app.id}`, app.id) }}
              >
                <span className={css.value}>
                  <strong>{app.name}</strong>
                  <small>{app.appKind}</small>
                </span>
                <span className={css.action}>{copied === `app:${app.id}` ? t('share.copied') : t('share.copyAppId')}</span>
              </button>
            ))}
          </section>
        </div>
      )}
    </div>
  )
}

type ReactKeyboardEvent = import('react').KeyboardEvent<HTMLDivElement>
