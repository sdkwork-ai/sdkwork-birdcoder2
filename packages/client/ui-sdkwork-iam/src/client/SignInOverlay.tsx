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
 * in-app form.
 * The frame's overlay layer is click-through; the dialog's own full-viewport
 * mask owns pointer events while mounted, and the entry renders nothing
 * otherwise.
 */
import { useId } from 'react'
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
import { sdkworkAuthAppearanceFor } from './auth-appearance.ts'
import { ConfigureNotice } from './ConfigureNotice.tsx'
import { SdkworkAuthThemeFrame } from './SdkworkAuthThemeFrame.tsx'
import css from './SignInOverlay.module.css'

/** Injected business face: the auth controller, the gestures, locale, config. */
export interface SignInOverlayInjected {
  /** The auth controller driving the modal. */
  controller: SdkworkAuthController
  /** Close the modal (auth complete or dismiss). */
  onClose: () => void
  /** Run the configured Sign in gesture (browser hand-off or in-app form). */
  onStartLogin: () => void
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
 * @param props - composed slot props (store share + injected face + locale seat).
 * @returns the modal element tree, or null while closed.
 */
export function SignInOverlay(props: SignInOverlayProps) {
  const {
    useStore, useConfigured, useTheme, useBrowserFailed, onClose, onStartLogin, onRetryBrowser,
    startApiKey, locale, runtimeConfig, t,
  } = props
  const modalOpen = useStore(state => state.modalOpen)
  const step = useStore(state => state.step)
  const configured = useConfigured(config => config)
  const theme = useTheme(snapshot => snapshot)
  const browserFailed = useBrowserFailed(failed => failed)
  const colorScheme = theme.active.colorScheme
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
          <div className={css.browserActions}>
            <Button variant="primary" onClick={onRetryBrowser}>{t('browser.retry')}</Button>
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
    <SdkworkAuthThemeFrame colorScheme={colorScheme} surface="iam-sign-in">
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
