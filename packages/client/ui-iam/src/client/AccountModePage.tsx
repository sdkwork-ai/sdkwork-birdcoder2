/**
 * Account mode page: the center-column surface for the `account` mode. With
 * the IAM base URL configured it mounts the sdkwork full-page auth surface
 * while signed out (the "全新页面" presentation) and the account summary with
 * the sign-out gesture while signed in; unconfigured it fails loud with the
 * configuration notice.
 */
import { MemoryRouter } from 'react-router-dom'
import {
  SdkworkAuthPage,
  SDKWORK_AUTH_I18N_CATALOG,
  type SdkworkAuthController,
  type SdkworkAuthControllerState,
  type SdkworkAuthRuntimeConfig,
} from '@sdkwork/auth-pc-react'
import { SdkworkI18nProvider } from '@sdkwork/i18n-pc-react'
import { Button, IconLogoutOutline14, IconUserOutline16 } from '@deepseek-ai/dsh-client-ui-primitives'
import { type HostObservable, type InjectFace, type PropsLocale, type PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { ThemeSnapshot } from '@deepseek-ai/dsh-client-ui-theme/client'
// Type-only: pulls ui-layout's SlotMap merge ('mode.page' owner share).
import type {} from '@deepseek-ai/dsh-client-ui-layout/client'
import { sdkworkAuthAppearanceFor } from './auth-appearance.ts'
import { ConfigureNotice } from './ConfigureNotice.tsx'
import css from './AccountModePage.module.css'

/** The sdkwork i18n locale tag for the harness locale id. */
export function toSdkworkLocale(locale: string): string {
  return locale === 'zh' ? 'zh-CN' : 'en-US'
}

/** Injected business face: mode id, controller, config, hooks, gestures. */
export interface AccountModePageInjected {
  /** The page's own mode id (the keyed registration's key). */
  mode: 'account'
  /** The auth controller the auth surfaces drive. */
  controller: SdkworkAuthController
  /** The auth-surface runtime config derived from the live settings. */
  runtimeConfig: SdkworkAuthRuntimeConfig
  /** The end-session gesture. */
  onSignOut: () => void
  /** The harness locale id mapped to the sdkwork tag. */
  locale: string
  hooks: {
    /** Whether the IAM base URL is configured (false renders the notice). */
    available: HostObservable<boolean>
    /** The live controller state feeding the page's three branches. */
    authState: HostObservable<SdkworkAuthControllerState>
    /** The resolved harness theme snapshot feeding the sdkwork appearance. */
    theme: HostObservable<ThemeSnapshot>
  }
}

/** Full component props: runtime share + injected face + locale seat. */
export type AccountModePageProps =
  PropsRuntime<'mode.page'>
  & InjectFace<AccountModePageInjected>
  & PropsLocale<'uiIam'>

/**
 * Render the account mode page.
 * @param props - composed slot props (contract share + injected face + locale seat).
 * @returns the page element tree.
 */
export function AccountModePage({
  controller,
  runtimeConfig,
  useAvailable,
  useAuthState,
  useTheme,
  onSignOut,
  locale,
  t,
}: AccountModePageProps) {
  const available = useAvailable(available => available)
  const state = useAuthState(state => state)
  const theme = useTheme(snapshot => snapshot)

  if (!available) {
    return (
      <div className={css.page} data-mode="account" data-mode-page="account">
        <ConfigureNotice t={t} />
      </div>
    )
  }

  if (!state.isAuthenticated || state.user === null) {
    return (
      <div className={css.authHost} data-mode="account" data-mode-page="account">
        <MemoryRouter initialEntries={['/auth/login']}>
          <SdkworkI18nProvider catalogs={[SDKWORK_AUTH_I18N_CATALOG]} locale={locale}>
            <SdkworkAuthPage
              basePath="/auth"
              controller={controller}
              homePath="/"
              presentation="page"
              runtimeConfig={runtimeConfig}
              appearance={sdkworkAuthAppearanceFor(theme.active.colorScheme)}
            />
          </SdkworkI18nProvider>
        </MemoryRouter>
      </div>
    )
  }

  const user = state.user
  const username = user.displayName ?? user.username ?? user.email ?? user.id
  return (
    <div className={css.page} data-mode="account" data-mode-page="account">
      <IconUserOutline16 size={56} className={css.avatar} />
      <div className={css.title}>{username}</div>
      <div className={css.summary}>
        {user.username !== undefined && user.username !== username && (
          <div className={css.row}>
            <span className={css.rowLabel}>{t('account.username')}</span>
            <span className={css.rowValue}>{user.username}</span>
          </div>
        )}
        {user.id !== undefined && (
          <div className={css.row}>
            <span className={css.rowLabel}>{t('account.id')}</span>
            <span className={css.rowValue}>{user.id}</span>
          </div>
        )}
        {user.email !== undefined && (
          <div className={css.row}>
            <span className={css.rowLabel}>{t('account.email')}</span>
            <span className={css.rowValue}>{user.email}</span>
          </div>
        )}
      </div>
      <Button
        variant="outline"
        icon={<IconLogoutOutline14 size={14} />}
        className={css.signOut}
        onClick={onSignOut}
      >
        {t('account.signOut')}
      </Button>
    </div>
  )
}
