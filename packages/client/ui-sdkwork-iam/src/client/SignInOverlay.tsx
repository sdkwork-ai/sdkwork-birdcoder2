/**
 * The sign-in modal host: one `shell.overlay` entry rendering the sdkwork
 * modal login/register surface while the shared UI store says it is open.
 * Unconfigured (no IAM base URL) it renders the configuration notice inside
 * the same dialog shell, so the settings-menu gesture always opens a dialog.
 * Configured, it opens on the product's login entry — the same welcome surface
 * the desktop window shows (brand, welcome line, slogan, Sign in and
 * Add API Key) — and that entry's own Sign in gesture runs the configured flow:
 * the browser hand-off card by default, or the account method form (password,
 * phone code, email code, QR) when the login gesture is configured as the
 * in-app form. While that card owns the gesture, the entry keeps the in-app
 * form one quiet link away so a tenant without the OAuth relying-party
 * registration can still sign in without changing settings.
 * The frame's overlay layer is click-through; the dialog's own full-viewport
 * mask owns pointer events while mounted, and the entry renders nothing
 * otherwise.
 */
import { useEffect, useId, useRef } from 'react'
import { createPortal } from 'react-dom'
import { MemoryRouter } from 'react-router-dom'
import {
  Button, IconCloseOutlineRegular, LoginPanel, readOemBrandName, type LoginAction,
} from '@deepseek-ai/dsh-client-ui-primitives'
import {
  SdkworkSessionAuthLoginModal,
  SDKWORK_AUTH_I18N_CATALOG,
  type SdkworkAuthController,
  type SdkworkAuthRuntimeConfig,
} from '@sdkwork/auth-pc-react'
import { SdkworkI18nProvider } from '@sdkwork/i18n-pc-react'
import type { HostObservable, InjectFace, PropsLocale, PropsRuntime, PropsStore } from '@deepseek-ai/dsh-client-ui-slots'
import type { ThemeSnapshot } from '@deepseek-ai/dsh-client-ui-theme/client'
// Type-only: pulls ui-layout's SlotMap merge ('shell.overlay' seat).
import type {} from '@deepseek-ai/dsh-client-ui-layout/client'
import type { createIamUiStore } from './iam-ui-store.ts'
import type { IamBrowserLoginFailure } from './iam-service.ts'
import type { UiIamKey } from './locales.ts'
import { sdkworkAuthAppearanceFor } from './auth-appearance.ts'
import { ConfigureNotice } from './ConfigureNotice.tsx'
import { SdkworkAuthThemeFrame } from './SdkworkAuthThemeFrame.tsx'
import css from './SignInOverlay.module.css'

/** Failure codes the card explains in the product's own words. */
const BROWSER_FAILURE_KEYS = {
  'browser-open-failed': 'browser.reason.browser-open-failed',
  'exchange-failed': 'browser.reason.exchange-failed',
  'flow-expired': 'browser.reason.flow-expired',
  'host-unavailable': 'browser.reason.host-unavailable',
  'invalid-callback': 'browser.reason.invalid-callback',
  'invalid-session': 'browser.reason.invalid-session',
  'provider-denied': 'browser.reason.provider-denied',
  'session-rejected': 'browser.reason.session-rejected',
  'state-mismatch': 'browser.reason.state-mismatch',
} as const satisfies Record<string, UiIamKey>

/**
 * Locale key for one failed browser-login step.
 * @param code - the desktop auth runtime's error code.
 * @returns the copy key; an unknown code keeps the generic recovery line.
 */
function browserFailureKey(code: string): UiIamKey {
  return BROWSER_FAILURE_KEYS[code as keyof typeof BROWSER_FAILURE_KEYS] ?? 'browser.reason.unknown'
}

/** Injected business face: the auth controller, the gestures, locale, config. */
export interface SignInOverlayInjected {
  /** The auth controller driving the modal. */
  controller: SdkworkAuthController
  /** Close the modal (auth complete or dismiss). */
  onClose: () => void
  /** Run the configured Sign in gesture (browser hand-off or in-app form). */
  onStartLogin: () => void
  /** Raise the in-app account form directly, the alternate path behind a browser hand-off. */
  onStartInAppLogin: () => void
  /** Restart the browser hand-off after a failed attempt. */
  onRetryBrowser: () => void
  /** Open the shell's API-key page; absent outside the desktop shell. */
  startApiKey?: () => void
  /** The harness locale id mapped to the sdkwork tag. */
  locale: string
  /** The auth-surface runtime config: the account methods the modal offers. */
  runtimeConfig: SdkworkAuthRuntimeConfig
  hooks: {
    /** Whether the IAM base URL is configured (false renders the notice). */
    configured: HostObservable<boolean>
    /** The resolved harness theme snapshot feeding the sdkwork appearance. */
    theme: HostObservable<ThemeSnapshot>
    /** Whether the last browser hand-off failed, so the card offers recovery. */
    browserFailed: HostObservable<boolean>
    /** Why that hand-off failed, so the card can name the failing step. */
    browserFailure: HostObservable<IamBrowserLoginFailure | undefined>
    /** Whether Sign in hands off to the system browser, so the in-app form needs its own link. */
    browserHandoff: HostObservable<boolean>
  }
}

/** Full component props: overlay owner share + store + injected face + locale seat. */
export type SignInOverlayProps =
  PropsRuntime<'shell.overlay'>
  & PropsStore<ReturnType<typeof createIamUiStore>>
  & InjectFace<SignInOverlayInjected>
  & PropsLocale<'uiIam'>

/**
 * Render the sign-in surface while the store says it is open.
 *
 * The dialog is portaled to the document body: the frame's overlay layer is a
 * z-index 20 stacking context, so a dialog mounted inside it always paints
 * below a page modal (the app's dialogs use 1000, SDKWork commerce modals 50).
 * A catalog or payment surface that asks for sign-in from behind its own modal
 * would otherwise cover the login card it just raised.
 *
 * The portal host repeats the two host-side behaviours those siblings relied on
 * while the card lived inside the frame's overlay layer: Radix dialogs set
 * `pointer-events: none` on the body and `aria-hidden` on every body sibling
 * while they are open, so the host restores interactivity and removes that
 * accessibility mark from the surface the user is meant to operate.
 * @param props - composed slot props (store share + injected face + locale seat).
 * @returns the modal element tree, or null while closed.
 */
export function SignInOverlay(props: SignInOverlayProps) {
  const host = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const node = host.current
    if (node === null) return
    const clear = (): void => {
      node.removeAttribute('aria-hidden')
      node.removeAttribute('data-aria-hidden')
    }
    clear()
    const observer = new MutationObserver(clear)
    observer.observe(node, { attributes: true, attributeFilter: ['aria-hidden', 'data-aria-hidden'] })
    return () => { observer.disconnect() }
  }, [])
  return createPortal(
    <div ref={host} data-iam-sign-in-host="true" style={{ display: 'contents' }}>
      <SignInOverlayContent {...props} />
    </div>,
    document.body,
  )
}

function SignInOverlayContent(props: SignInOverlayProps) {
  const {
    useStore, useConfigured, useTheme, useBrowserFailed, useBrowserFailure, useBrowserHandoff, onClose,
    onStartLogin, onStartInAppLogin, onRetryBrowser, startApiKey, locale, runtimeConfig, t,
  } = props
  const modalOpen = useStore(state => state.modalOpen)
  const step = useStore(state => state.step)
  const configured = useConfigured(config => config)
  const theme = useTheme(snapshot => snapshot)
  const browserFailed = useBrowserFailed(failed => failed)
  const browserFailure = useBrowserFailure(failure => failure)
  const browserHandoff = useBrowserHandoff(handoff => handoff)
  const colorScheme = theme.active.colorScheme
  // The step's localized line explains which part of the login broke; the
  // host's own reason is the detail a support report needs, so both are shown.
  const browserDetail = browserFailure?.message ?? browserFailure?.detail
  const titleId = useId()
  const headingId = useId()
  const descriptionId = useId()
  if (!modalOpen) return null
  if (!configured) {
    return (
      <SdkworkAuthThemeFrame colorScheme={colorScheme} surface="iam-sign-in">
        <div className={css.mask} role="presentation">
          <div
            className={css.panel}
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
          >
            <button
              type="button"
              aria-label={t('modal.close')}
              className={css.close}
              onClick={onClose}
            >
              <IconCloseOutlineRegular size={14} />
            </button>
            <ConfigureNotice t={t} titleId={titleId} />
          </div>
        </div>
      </SdkworkAuthThemeFrame>
    )
  }
  if (step === 'browser') {
    return (
      <div className={css.mask} role="presentation">
        <div className={css.panel} role="dialog" aria-modal="true" aria-labelledby={headingId}>
          <button
            type="button"
            aria-label={t('modal.close')}
            className={css.close}
            onClick={onClose}
          >
            <IconCloseOutlineRegular size={14} />
          </button>
          <div className={css.browserTitle} id={headingId}>
            {browserFailed ? t('browser.failedTitle') : t('browser.title')}
          </div>
          <p className={css.browserDetail}>
            {browserFailed ? t('browser.failedDetail') : t('browser.detail')}
          </p>
          {browserFailed && browserFailure !== undefined
            ? <p className={css.browserReason}>{t(browserFailureKey(browserFailure.code))}</p>
            : null}
          {browserFailed && browserDetail !== undefined
            ? (
              <p className={css.browserDiagnostics} data-testid="iam-browser-failure-detail">
                {t('browser.failureDetail')}
                {browserDetail}
              </p>
            )
            : null}
          <div className={css.browserActions}>
            <Button variant="primary" onClick={onRetryBrowser}>{t('browser.retry')}</Button>
            {/* A tenant whose browser authorization keeps failing still needs a
                way in: the in-app account form is the same fallback the entry
                offers, so the failed card must not send the user back a step. */}
            {browserFailed
              ? <Button variant="ghost" onClick={onStartInAppLogin}>{t('entry.inAppLogin')}</Button>
              : null}
          </div>
        </div>
      </div>
    )
  }
  if (step === 'entry') {
    const brand = readOemBrandName()
    const actions: LoginAction[] = [
      { id: 'iam-sign-in', label: t('entry.signIn'), kind: 'primary', onClick: onStartLogin },
      ...startApiKey === undefined
        ? []
        : [{ id: 'iam-api-key', label: t('entry.addApiKey'), kind: 'secondary' as const, onClick: startApiKey }],
      // A browser hand-off leaves no in-app surface behind Sign in, so the
      // account form stays reachable as the quiet action under the column.
      // When Sign in already raises that form, the link would repeat it.
      ...browserHandoff
        ? [{ id: 'iam-in-app-login', label: t('entry.inAppLogin'), kind: 'text' as const, onClick: onStartInAppLogin }]
        : [],
    ]
    return (
      <div className={css.mask} role="presentation">
        <div className={css.card} role="dialog" aria-modal="true" aria-labelledby={headingId}>
          <LoginPanel
            variant="dialog"
            brand={brand}
            logoSrc="/favicon.png"
            markAlt=""
            welcome={{
              before: t('entry.welcomeBefore'),
              brand,
              after: t('entry.welcomeAfter'),
              description: t('entry.slogan'),
            }}
            headingId={headingId}
            descriptionId={descriptionId}
            close={{ label: t('modal.close'), onClick: onClose }}
            actions={actions}
          />
        </div>
      </div>
    )
  }
  return (
    <SdkworkAuthThemeFrame className={css.stage} colorScheme={colorScheme} surface="iam-sign-in">
      <MemoryRouter initialEntries={['/auth/login']}>
        <SdkworkI18nProvider catalogs={[SDKWORK_AUTH_I18N_CATALOG]} locale={locale}>
          <SdkworkSessionAuthLoginModal
            key={colorScheme}
            controller={props.controller}
            locale={locale}
            onAuthComplete={onClose}
            onDismiss={onClose}
            returnPath="/"
            runtimeConfig={runtimeConfig}
            appearance={sdkworkAuthAppearanceFor(colorScheme)}
          />
        </SdkworkI18nProvider>
      </MemoryRouter>
    </SdkworkAuthThemeFrame>
  )
}
