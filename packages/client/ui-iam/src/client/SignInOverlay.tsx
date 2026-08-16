/**
 * The sign-in modal host: one `shell.overlay` entry rendering the sdkwork
 * modal login/register surface while the shared UI store says it is open.
 * Unconfigured (no IAM base URL) it renders the configuration notice inside
 * the same dialog shell, so the settings-menu gesture always opens a dialog.
 * The frame's overlay layer is click-through; the dialog's own full-viewport
 * mask owns pointer events while mounted, and the entry renders nothing
 * otherwise.
 */
import { useId } from 'react'
import { MemoryRouter } from 'react-router-dom'
import { IconCloseOutline16 } from '@deepseek-ai/dsh-client-ui-primitives'
import {
  SdkworkSessionAuthLoginModal,
  SDKWORK_AUTH_I18N_CATALOG,
  type SdkworkAuthController,
} from '@sdkwork/auth-pc-react'
import { SdkworkI18nProvider } from '@sdkwork/i18n-pc-react'
import type { HostObservable, InjectFace, PropsLocale, PropsRuntime, PropsStore } from '@deepseek-ai/dsh-client-ui-slots'
import type { ThemeSnapshot } from '@deepseek-ai/dsh-client-ui-theme/client'
// Type-only: pulls ui-layout's SlotMap merge ('shell.overlay' seat).
import type {} from '@deepseek-ai/dsh-client-ui-layout/client'
import type { createIamUiStore } from './iam-ui-store.ts'
import { sdkworkAuthAppearanceFor } from './auth-appearance.ts'
import { ConfigureNotice } from './ConfigureNotice.tsx'
import css from './SignInOverlay.module.css'

/** Injected business face: the auth controller, the dismiss gesture, locale, config. */
export interface SignInOverlayInjected {
  /** The auth controller driving the modal. */
  controller: SdkworkAuthController
  /** Close the modal (auth complete or dismiss). */
  onClose: () => void
  /** The harness locale id mapped to the sdkwork tag. */
  locale: string
  hooks: {
    /** Whether the IAM base URL is configured (false renders the notice). */
    configured: HostObservable<boolean>
    /** The resolved harness theme snapshot feeding the sdkwork appearance. */
    theme: HostObservable<ThemeSnapshot>
  }
}

/** Full component props: overlay owner share + store + injected face + locale seat. */
export type SignInOverlayProps =
  PropsRuntime<'shell.overlay'>
  & PropsStore<ReturnType<typeof createIamUiStore>>
  & InjectFace<SignInOverlayInjected>
  & PropsLocale<'uiIam'>

/**
 * Render the modal sign-in surface while the store says it is open.
 * @param props - composed slot props (store share + injected face + locale seat).
 * @returns the modal element tree, or null while closed.
 */
export function SignInOverlay(props: SignInOverlayProps) {
  const { useStore, useConfigured, useTheme, onClose, locale, t } = props
  const modalOpen = useStore(state => state.modalOpen)
  const configured = useConfigured(config => config)
  const theme = useTheme(snapshot => snapshot)
  const titleId = useId()
  if (!modalOpen) return null
  if (!configured) {
    return (
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
            <IconCloseOutline16 size={14} />
          </button>
          <ConfigureNotice t={t} titleId={titleId} />
        </div>
      </div>
    )
  }
  return (
    <MemoryRouter initialEntries={['/auth/login']}>
      <SdkworkI18nProvider catalogs={[SDKWORK_AUTH_I18N_CATALOG]} locale={locale}>
        <SdkworkSessionAuthLoginModal
          controller={props.controller}
          locale={locale}
          onAuthComplete={onClose}
          onDismiss={onClose}
          returnPath="/"
          appearance={sdkworkAuthAppearanceFor(theme.active.colorScheme)}
        />
      </SdkworkI18nProvider>
    </MemoryRouter>
  )
}
