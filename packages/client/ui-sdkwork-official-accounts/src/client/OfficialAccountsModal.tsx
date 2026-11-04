/**
 * Official-account (公众号) management modal: the dialog the settings-menu
 * popover's "公众号账号" row opens.
 *
 * The dialog is a host frame, not a reimplementation. It decides three things —
 * whether the deployment can reach IAM, whether a session exists, and which
 * host locale/color scheme the embedded surface follows — and then renders
 * `SdkworkIamOfficialAccountsPanel` from `@sdkwork/iam-pc-oauth` (the
 * user-facing app-tier module over the IAM app API) unchanged. Every account,
 * credential, message-push, and custom-menu-draft operation is the module's own
 * controller call; no backend-admin surface is involved.
 *
 * `SdkworkThemeProvider` supplies the SDKWork design tokens (and the `.dark`
 * class the panel's `dark:` variants bind to), because this dialog lives in the
 * harness — a CSS-module application with its own theme contract — rather than
 * in an SDKWork application shell.
 *
 * Renders nothing while closed. Close paths: the header button, a mask click,
 * and Escape.
 */
import { useEffect, useId, useRef, type ReactNode } from 'react'
import { IconCloseOutlineRegular } from '@deepseek-ai/dsh-client-ui-primitives'
import type { HostObservable, InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
// Type-only: pulls the settings slot declarations (settings.officialAccounts) into this program.
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import { SdkworkI18nProvider } from '@sdkwork/i18n-pc-react'
import {
  SDKWORK_IAM_OFFICIAL_ACCOUNTS_I18N_CATALOG,
  SdkworkIamOfficialAccountsPanel,
  type SdkworkIamOfficialAccountsController,
} from '@sdkwork/iam-pc-oauth'
import { SdkworkThemeProvider } from '@sdkwork/ui-pc-react'
import {
  OFFICIAL_ACCOUNTS_EMBED_ATTRIBUTE,
  OFFICIAL_ACCOUNTS_EMBED_PORTAL_ATTRIBUTE,
} from './embedScope.ts'
import css from './OfficialAccountsModal.module.css'

/** The adapter face the modal reads: the account controller. */
export interface OfficialAccountsPanelSource {
  /** @returns the controller for the embedded panel, or undefined while unconfigured. */
  readController(): SdkworkIamOfficialAccountsController | undefined
}

/** Injected business face: the host adapter, the sign-in gesture, and live host facts. */
export interface OfficialAccountsModalInjected {
  /** Gateway/session adapter the embedded panel manages accounts through. */
  host: OfficialAccountsPanelSource
  /** Raise the shared sign-in surface (in-app form or browser hand-off). */
  startSignIn: () => void
  hooks: {
    /** Whether the gateway origin is configured (false renders the notice). */
    available: HostObservable<boolean>
    /** Whether an IAM session exists (false renders the sign-in prompt). */
    signedIn: HostObservable<boolean>
    /** The active harness locale id, mapped to the panel's SDKWork locale tag. */
    language: HostObservable<string>
    /** The resolved harness color scheme the SDKWork surface follows. */
    colorScheme: HostObservable<'light' | 'dark'>
  }
}

/** Full component props: slot owner share + injected face + locale seat. */
export type OfficialAccountsModalProps =
  PropsRuntime<'settings.officialAccounts'>
  & InjectFace<OfficialAccountsModalInjected>
  & PropsLocale<'officialAccounts'>

/**
 * Map the harness locale id onto the catalog tag the embedded panel resolves.
 * @param language - the harness active locale ('zh' or 'en').
 * @returns the SDKWork locale tag.
 */
export function toOfficialAccountsLocale(language: string): string {
  return language === 'zh' ? 'zh-CN' : 'en-US'
}

/**
 * Render the official-account management dialog.
 * @param props - composed slot props (owner share + injected face + locale seat).
 * @returns the dialog element tree, or null while closed.
 */
export function OfficialAccountsModal(props: OfficialAccountsModalProps): ReactNode {
  const {
    open, onClose, host, startSignIn, useAvailable, useSignedIn, useLanguage, useColorScheme, t,
  } = props
  const titleId = useId()
  const available = useAvailable((value: boolean) => value)
  const signedIn = useSignedIn((value: boolean) => value)
  const language = useLanguage((value: string) => value)
  const colorScheme = useColorScheme((value: 'light' | 'dark') => value)

  // Escape closes while mounted-and-open; the mask click path is declarative.
  useEffect(() => {
    if (!open) return
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => { document.removeEventListener('keydown', onKeyDown) }
  }, [open, onClose])

  // The panel portals its account drawer and confirm dialog to
  // `document.body`, outside the dialog root this package's scoped stylesheet
  // targets. Marking the body for the dialog's open lifetime activates that
  // sheet's body-rooted scope — `body[data-official-accounts-embed-portal] to
  // (#root)` — which is what reaches those overlays and stops at the
  // application mount the dialog covers.
  useEffect(() => {
    if (!open) return
    document.body.setAttribute(OFFICIAL_ACCOUNTS_EMBED_PORTAL_ATTRIBUTE, '')
    return () => { document.body.removeAttribute(OFFICIAL_ACCOUNTS_EMBED_PORTAL_ATTRIBUTE) }
  }, [open])

  // Baseline focus management: entering the dialog lands on the close button.
  const closeButton = useRef<HTMLButtonElement | null>(null)
  useEffect(() => {
    if (open) closeButton.current?.focus()
  }, [open])

  if (!open) return null

  // Same adapter read that produced the readiness snapshot. A missing
  // controller here means the deployment changed between the snapshot and this
  // render, so the dialog falls back to the same configuration notice instead
  // of dereferencing nothing.
  const controller = available ? host.readController() : undefined

  return (
    <div className={css.overlay} role="presentation">
      <div className={css.mask} aria-hidden="true" onClick={onClose} />
      <div
        className={css.panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        {...{ [OFFICIAL_ACCOUNTS_EMBED_ATTRIBUTE]: controller === undefined ? 'unconfigured' : 'ready' }}
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
          {controller === undefined
            ? <div className={css.notice}>{t('section.notConfigured')}</div>
            : !signedIn
              ? (
                <div className={css.notice}>
                  <p className={css.noticeDetail}>{t('section.signInRequired')}</p>
                  <button type="button" className={css.noticeAction} onClick={startSignIn}>
                    {t('section.signIn')}
                  </button>
                </div>
              )
              : (
                <SdkworkThemeProvider
                  className={css.surface}
                  themeColor="tech-blue"
                  themeSelection={colorScheme}
                >
                  <SdkworkI18nProvider
                    catalogs={[SDKWORK_IAM_OFFICIAL_ACCOUNTS_I18N_CATALOG]}
                    locale={toOfficialAccountsLocale(language)}
                  >
                    <SdkworkIamOfficialAccountsPanel controller={controller} />
                  </SdkworkI18nProvider>
                </SdkworkThemeProvider>
              )}
        </div>
      </div>
    </div>
  )
}
