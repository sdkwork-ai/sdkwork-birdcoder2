import { useCallback, useEffect, useMemo, useState } from 'react'
import clsx from 'clsx'
import { AlertCircle, CheckCircle2, X } from 'lucide-react'
import { SdkworkThemeProvider } from '@sdkwork/ui-pc-react'
import {
  SdkworkSubscriptionCatalogPage,
} from '@sdkwork/membership-pc-subscription/catalog'
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-layout/client'
import type { EnvServiceLike, IamServiceLike } from './token-plan-service.ts'
import { TokenPlanService } from './token-plan-service.ts'
import { createTokenPlanCommerceComponents } from './commerce-components.tsx'
import css from './TokenPlanPage.module.css'
import './tokenPlan.css'

/** Host color-scheme bridge consumed by the Token Plan page. */
export interface TokenPlanTheme {
  /** @returns the resolved BirdCoder color scheme. */
  getColorScheme(): 'light' | 'dark'
  /** Observe resolved color-scheme changes. */
  subscribe(listener: () => void): () => void
}

export interface TokenPlanPageInjected {
  mode: 'token-plan'
  env: EnvServiceLike
  iam: IamServiceLike
  theme: TokenPlanTheme
}

export type TokenPlanPageProps =
  PropsRuntime<'mode.page'>
  & TokenPlanPageInjected
  & PropsLocale<'tokenPlan'>

type NoticeTone = 'error' | 'info' | 'success'

const NOTICE_STYLE: Record<NoticeTone, string> = {
  success: 'bg-emerald-50 dark:bg-emerald-500/10 border-emerald-200 dark:border-emerald-500/20 text-emerald-800 dark:text-emerald-200',
  error: 'bg-rose-50 dark:bg-rose-500/10 border-rose-200 dark:border-rose-500/20 text-rose-800 dark:text-rose-200',
  info: 'bg-blue-50 dark:bg-blue-500/10 border-blue-200 dark:border-blue-500/20 text-blue-800 dark:text-blue-200',
}

const NOTICE_ICON = {
  error: AlertCircle,
  info: AlertCircle,
  success: CheckCircle2,
} satisfies Record<NoticeTone, typeof AlertCircle>

/**
 * Render the SDKWork membership catalog inside the Agents Token Plan chrome,
 * following the host light/dark scheme through SdkworkThemeProvider.
 * @param props - mode id, environment, IAM, theme, and locale seat.
 * @returns the Token Plan page.
 */
export function TokenPlanPage({ mode, env, iam, theme, t }: TokenPlanPageProps) {
  const service = useMemo(() => new TokenPlanService(env, iam), [env, iam])
  const [, forceUpdate] = useState(0)
  const [reload, setReload] = useState(0)
  const [colorScheme, setColorScheme] = useState<'light' | 'dark'>(() => theme.getColorScheme())
  const { NotifyOutlet, onNotify } = useTokenPlanNotify(t)
  useEffect(() => service.subscribe(() => { forceUpdate(value => value + 1) }), [service])
  useEffect(() => theme.subscribe(() => { setColorScheme(theme.getColorScheme()) }), [theme])
  const components = useMemo(() => {
    if (!service.isConfigured()) return undefined
    return createTokenPlanCommerceComponents({
      commerce: service.readCommerce(),
      onCompleted: () => setReload(value => value + 1),
      t,
    })
  }, [service, reload, t])

  return (
    <div className={css.page} data-mode={mode} data-mode-page={mode}>
      <SdkworkThemeProvider
        className="h-full min-h-0 w-full min-w-0"
        themeColor="tech-blue"
        themeSelection={colorScheme}
      >
        <div
          className={clsx('h-full min-h-0 w-full min-w-0 overflow-y-auto', colorScheme === 'dark' && 'dark')}
          data-sdk-color-mode={colorScheme}
          data-token-plan-surface="sdkwork"
          style={{
            background: 'var(--sdk-color-surface-canvas)',
            color: 'var(--sdk-color-text-primary)',
          }}
        >
          <div className={clsx(css.catalog, 'mx-auto w-full max-w-7xl')} data-token-plan-catalog>
            {service.isConfigured() ? (
              <SdkworkSubscriptionCatalogPage
                {...(components === undefined ? {} : { components })}
                checkoutPort={service.readCommerce().checkout}
                notifyOutlet={NotifyOutlet}
                onLoginRequired={() => { service.openSignIn() }}
                onNotify={onNotify}
              />
            ) : (
              <div className="flex h-full items-center justify-center px-6 py-12 text-sm text-zinc-500 dark:text-zinc-400">
                <p>{t('page.unconfigured')}</p>
              </div>
            )}
          </div>
        </div>
      </SdkworkThemeProvider>
    </div>
  )
}

function useTokenPlanNotify(t: TokenPlanPageProps['t']) {
  const [notice, setNotice] = useState<{ id: number; message: string; tone: NoticeTone } | null>(null)
  useEffect(() => {
    if (notice === null) return
    const timer = window.setTimeout(() => { setNotice(null) }, 3200)
    return () => window.clearTimeout(timer)
  }, [notice])
  const onNotify = useCallback((message: string, tone: NoticeTone) => {
    setNotice({ id: Date.now(), message, tone })
  }, [])
  const NotifyOutlet = useCallback(() => (
    notice === null ? null : <TokenPlanNotice notice={notice} onDismiss={() => { setNotice(null) }} t={t} />
  ), [notice, t])
  return { NotifyOutlet, onNotify }
}

function TokenPlanNotice({
  notice,
  onDismiss,
  t,
}: {
  notice: { message: string; tone: NoticeTone }
  onDismiss: () => void
  t: TokenPlanPageProps['t']
}) {
  const Icon = NOTICE_ICON[notice.tone]
  return (
    <div className="pointer-events-none fixed inset-x-0 top-4 z-[70] flex flex-col items-center gap-2 px-4">
      <div
        className={clsx(
          'token-plan-toast pointer-events-auto flex max-w-lg items-center gap-3 rounded-2xl border px-5 py-3.5 shadow-xl backdrop-blur-md',
          NOTICE_STYLE[notice.tone],
        )}
        role="status"
      >
        <Icon aria-hidden="true" className="h-5 w-5 shrink-0" />
        <span className="min-w-0 flex-1 text-sm font-semibold tracking-wide">{notice.message}</span>
        <button
          aria-label={t('notify.close')}
          className="rounded-full p-1 transition-colors hover:bg-black/5 dark:hover:bg-white/10"
          onClick={onDismiss}
          type="button"
        >
          <X aria-hidden="true" className="h-4 w-4 opacity-70" />
        </button>
      </div>
    </div>
  )
}
