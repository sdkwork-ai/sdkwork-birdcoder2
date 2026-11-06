/**
 * Domain (DNS) management dialog: the surface the settings-menu popover's
 * "域名管理" row opens, directly below 公众号账号.
 *
 * The dialog is a host frame plus one workspace. It decides three things —
 * whether the deployment has a gateway origin, whether an IAM session exists,
 * and which generated client the workspace calls — and then hands the client to
 * `DnsWorkspace`. Root zones, subdomain ownership verification, and DNS
 * resolution records are all operations of the SDKWork deployments app API
 * (the same authority the sdkwork-webserver console reads), so no second
 * backend contract is introduced here.
 *
 * Renders nothing while closed. Close paths: the header button, a mask click,
 * and Escape.
 */
import { useEffect, useId, useMemo, useRef, type ReactNode } from 'react'
import { IconCloseOutlineRegular } from '@deepseek-ai/dsh-client-ui-primitives'
import type { HostObservable, InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
// Type-only: pulls the settings slot declarations (settings.dns) into this program.
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import type { DnsHostSource } from './dnsHost.ts'
import { DnsWorkspace } from './DnsWorkspace.tsx'
import css from './DnsModal.module.css'

/** Injected business face: the host adapter, the sign-in gesture, and live host facts. */
export interface DnsModalInjected {
  /** Gateway/session adapter the workspace manages domains through. */
  host: DnsHostSource
  /** Raise the shared sign-in surface (in-app form or browser hand-off). */
  startSignIn: () => void
  hooks: {
    /** Whether the gateway origin is configured (false renders the notice). */
    available: HostObservable<boolean>
    /** Whether an IAM session exists (false renders the sign-in prompt). */
    signedIn: HostObservable<boolean>
    /** Adapter revision; a new value re-reads the client after an environment switch. */
    revision: HostObservable<number>
  }
}

/** Full component props: slot owner share + injected face + locale seat. */
export type DnsModalProps =
  PropsRuntime<'settings.dns'>
  & InjectFace<DnsModalInjected>
  & PropsLocale<'dns'>

/**
 * Render the domain management dialog.
 * @param props - composed slot props (owner share + injected face + locale seat).
 * @returns the dialog element tree, or null while closed.
 */
export function DnsModal(props: DnsModalProps): ReactNode {
  const {
    open, onClose, host, startSignIn, useAvailable, useSignedIn, useRevision, t,
  } = props
  const titleId = useId()
  const available = useAvailable((value: boolean) => value)
  const signedIn = useSignedIn((value: boolean) => value)
  const revision = useRevision((value: number) => value)
  // Re-read the adapter on every host transition: an environment switch keeps
  // `available` true while the generated client underneath must be replaced.
  const client = useMemo(
    () => (available ? host.readClient() : undefined),
    [available, host, revision],
  )

  // Escape closes while mounted-and-open; the mask click path is declarative.
  useEffect(() => {
    if (!open) return
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => { document.removeEventListener('keydown', onKeyDown) }
  }, [open, onClose])

  // Baseline focus management: entering the dialog lands on the close button.
  const closeButton = useRef<HTMLButtonElement | null>(null)
  useEffect(() => {
    if (open) closeButton.current?.focus()
  }, [open])

  if (!open) return null

  return (
    <div className={css.overlay} role="presentation">
      <div className={css.mask} aria-hidden="true" onClick={onClose} />
      <div
        className={css.panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        data-dns-modal="true"
      >
        <div className={css.header}>
          <div className={css.heading}>
            <div id={titleId} className={css.title}>{t('section.title')}</div>
            <div className={css.description}>{t('section.description')}</div>
          </div>
          <button ref={closeButton} type="button" className={css.close} onClick={onClose} aria-label={t('close')}>
            <IconCloseOutlineRegular size={14} />
          </button>
        </div>
        <div className={css.body}>
          {!available
            ? <div className={css.notice}>{t('section.notConfigured')}</div>
            : !signedIn
              ? (
                <div className={css.notice}>
                  <p>{t('section.signInRequired')}</p>
                  <button type="button" className={css.noticeAction} onClick={startSignIn}>
                    {t('section.signIn')}
                  </button>
                </div>
              )
              : client === undefined
                ? <div className={css.notice}>{t('section.notConfigured')}</div>
                : <DnsWorkspace client={client} t={t} />}
        </div>
      </div>
    </div>
  )
}
