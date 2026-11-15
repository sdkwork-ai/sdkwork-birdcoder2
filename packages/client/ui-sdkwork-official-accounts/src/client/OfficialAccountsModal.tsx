/**
 * Official-account (公众号) management modal: the wide management surface the
 * settings-menu popover's "公众号账号" row opens.
 *
 * The modal is a host frame, not a reimplementation. It decides three things —
 * whether the deployment can reach IAM, whether a session exists, and which
 * host locale/color scheme the embedded surface follows — and then renders
 * `SdkworkOfficialAccountsPanel` from `@sdkwork/iam-pc-official-accounts` (the
 * shared official-account component over the IAM app API) unchanged. Every
 * account, credential, message-push, and custom-menu-draft operation is the
 * module's own controller call; no backend-admin surface is involved.
 *
 * `SdkworkThemeProvider` supplies the SDKWork design tokens (and the `.dark`
 * class the panel's `dark:` variants bind to), because this modal lives in the
 * harness — a CSS-module application with its own theme contract — rather than
 * in an SDKWork application shell.
 *
 * The shared `WideModal` owns the overlay layer, the header, and every
 * dismissal path (close control, mask click, Escape). The panel is a workspace
 * with no heading of its own, so this modal contributes the only title and
 * description on screen; the panel's header is the single toolbar row that
 * holds search on the left and refresh/add on the right. The logo field uploads
 * through Drive: the host adapter builds the upload service from this
 * application's declared intent and this modal hands it to the panel. The
 * drawer's 服务器信息 tab lists the deployment's published egress IPs, which the
 * host adapter reads from the active environment profile. The page's own
 * create/edit drawer and confirm dialog portal to `document.body`;
 * `officialAccountsView.css` lifts them above this harness layer so they stay
 * operable.
 */
import { useEffect, useState, type ReactNode } from 'react'
import { WideModal } from '@deepseek-ai/dsh-client-ui-primitives'
import type { HostObservable, InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
// Type-only: pulls the settings slot declarations (settings.officialAccounts) into this program.
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import { SdkworkI18nProvider } from '@sdkwork/i18n-pc-react'
import {
  DEFAULT_SELF_SERVICE_CAPABILITIES,
  SDKWORK_OFFICIAL_ACCOUNTS_I18N_CATALOG,
  SdkworkOfficialAccountsPanel,
  type OfficialAccountsController,
  type OfficialAccountsDomainVerification,
} from '@sdkwork/iam-pc-official-accounts'
import type { DriveUploadImageService } from '@sdkwork/drive-upload-image-core'
import { SdkworkThemeProvider } from '@sdkwork/ui-pc-react'
import {
  OFFICIAL_ACCOUNTS_EMBED_ATTRIBUTE,
  OFFICIAL_ACCOUNTS_EMBED_PORTAL_ATTRIBUTE,
} from './embedScope.ts'
import css from './OfficialAccountsModal.module.css'

/** The adapter face the modal reads: the account controller and the Drive logo upload service. */
export interface OfficialAccountsPanelSource {
  /** @returns the controller for the embedded panel, or undefined while unconfigured. */
  readController(): OfficialAccountsController | undefined
  /**
   * @returns the Drive image-upload service the panel's logo field consumes, or
   * undefined while the gateway origin is unconfigured.
   */
  readLogoUploadService(): DriveUploadImageService | undefined
  /**
   * @returns the deployment's published server egress IPs for the WeChat IP
   * allowlist; empty when the active environment publishes none.
   */
  readServerIps(): readonly string[]
  /**
   * Loads the tenant-maintained server egress IP allowlist through the app API
   * (falling back to the environment profile when unavailable).
   * @returns the current allowlist entries.
   */
  loadServerIps?(): Promise<readonly string[]>
  /**
   * @returns the gateway origin the standard WeChat callback URL is built from
   * (empty when the deployment has no gateway origin).
   */
  readNotifyBaseUrl(): string
  /**
   * @returns the WeChat verification-file capability for configured domains,
   * or undefined while the gateway origin is unconfigured.
   */
  readDomainVerification(): OfficialAccountsDomainVerification | undefined
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
 * Render the official-account management modal.
 * @param props - composed slot props (owner share + injected face + locale seat).
 * @returns the modal element tree.
 */
export function OfficialAccountsModal(props: OfficialAccountsModalProps): ReactNode {
  const {
    open, onClose, host, startSignIn, useAvailable, useSignedIn, useLanguage, useColorScheme, t,
  } = props
  const available = useAvailable((value: boolean) => value)
  const signedIn = useSignedIn((value: boolean) => value)
  const language = useLanguage((value: string) => value)
  const colorScheme = useColorScheme((value: 'light' | 'dark') => value)

  // The page portals its create/edit drawer and confirm dialog to
  // `document.body`, outside the modal root this package's scoped stylesheet
  // targets. Marking the body for the modal's open lifetime activates that
  // sheet's body-rooted scope — `body[data-official-accounts-embed-portal] to
  // (#root)` — which is what reaches those overlays and stops at the
  // application mount the modal covers.
  useEffect(() => {
    if (!open) return
    document.body.setAttribute(OFFICIAL_ACCOUNTS_EMBED_PORTAL_ATTRIBUTE, '')
    return () => { document.body.removeAttribute(OFFICIAL_ACCOUNTS_EMBED_PORTAL_ATTRIBUTE) }
  }, [open])

  // Same adapter read that produced the readiness snapshot. A missing
  // controller here means the deployment changed between the snapshot and this
  // render, so the modal falls back to the same configuration notice instead
  // of dereferencing nothing.
  const controller = available ? host.readController() : undefined
  // The standard WeChat callback URL is built from the same origin the app API
  // lives on; the panel only composes it once the account has an id.
  const notifyBaseUrl = controller === undefined ? undefined : host.readNotifyBaseUrl()
  // The Drive capability is only needed once the panel can render, and it must
  // never be built for a signed-out surface whose account rows do not exist.
  const logoUploadService = controller === undefined || !signedIn
    ? undefined
    : host.readLogoUploadService()
  // The 服务器信息 tab lists the deployment's published egress IPs; the list is
  // deployment metadata, so it is read even while the surface is signed out.
  // The admin-maintained allowlist arrives asynchronously from the app API.
  const [serverIps, setServerIps] = useState<readonly string[]>(() => host.readServerIps())
  useEffect(() => {
    if (!open) return
    if (host.loadServerIps === undefined) {
      setServerIps(host.readServerIps())
      return
    }
    let cancelled = false
    host.loadServerIps()
      .then((ips) => { if (!cancelled) setServerIps(ips) })
      .catch(() => { if (!cancelled) setServerIps(host.readServerIps()) })
    return () => { cancelled = true }
  }, [host, open])
  // Domain verification files belong to the signed-in operator's managed zones,
  // so the capability is only built once the panel can render.
  const domainVerification = controller === undefined || !signedIn
    ? undefined
    : host.readDomainVerification()

  return (
    <WideModal
      open={open}
      onClose={onClose}
      title={t('section.title')}
      description={t('section.description')}
      closeLabel={t('close')}
    >
      {/* The embed marker scopes the IAM page's compiled utilities to the
          panel subtree (and carries the adapter readiness value). */}
      <div
        className={css.embed}
        {...{ [OFFICIAL_ACCOUNTS_EMBED_ATTRIBUTE]: controller === undefined ? 'unconfigured' : 'ready' }}
      >
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
                  catalogs={[SDKWORK_OFFICIAL_ACCOUNTS_I18N_CATALOG]}
                  locale={toOfficialAccountsLocale(language)}
                >
                  <SdkworkOfficialAccountsPanel
                    capabilities={DEFAULT_SELF_SERVICE_CAPABILITIES}
                    controller={controller}
                    domainVerification={domainVerification}
                    driveUploadImageService={logoUploadService}
                    notifyBaseUrl={notifyBaseUrl}
                    serverIps={serverIps}
                  />
                </SdkworkI18nProvider>
              </SdkworkThemeProvider>
            )}
      </div>
    </WideModal>
  )
}
