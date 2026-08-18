import { useEffect, useMemo, useState } from 'react'
import { SdkworkSubscriptionCatalogPage } from '@sdkwork/membership-pc-subscription/catalog'
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-layout/client'
import type { EnvService } from '@deepseek-ai/dsh-client-ui-env/client'
import type { IamServiceLike } from './token-plan-service.ts'
import { TokenPlanService } from './token-plan-service.ts'
import { createTokenPlanCommerceComponents } from './commerce-components.tsx'
import css from './TokenPlanPage.module.css'

export interface TokenPlanPageInjected { mode: 'token-plan'; env: EnvService; iam: IamServiceLike }
export type TokenPlanPageProps = PropsRuntime<'mode.page'> & TokenPlanPageInjected & PropsLocale<'tokenPlan'>

/** Render the SDKWork membership catalog and its order-backed commerce dialogs. */
export function TokenPlanPage({ mode, env, iam, t }: TokenPlanPageProps) {
  const service = useMemo(() => new TokenPlanService(env, iam), [env, iam])
  const [, forceUpdate] = useState(0)
  const [notice, setNotice] = useState<{ message: string; tone: 'error' | 'info' | 'success' } | null>(null)
  const [reload, setReload] = useState(0)
  useEffect(() => service.subscribe(() => { forceUpdate(value => value + 1) }), [service])
  const components = useMemo(() => {
    if (!service.isConfigured()) return undefined
    return createTokenPlanCommerceComponents({
      commerce: service.readCommerce(),
      onCompleted: () => setReload(value => value + 1),
    })
  }, [service, reload])
  if (!service.isConfigured()) return <div className={css.page} data-mode={mode} data-mode-page={mode}><div className={css.content}><h1>Token Plan</h1><p>{t('page.unconfigured')}</p></div></div>
  const catalogProps = {
    ...(components === undefined ? {} : { components }),
    onLoginRequired: () => { service.openSignIn() },
    onNotify: (message: string, tone: 'error' | 'info' | 'success') => { setNotice({ message, tone }) },
  }
  return <div className={css.page} data-mode={mode} data-mode-page={mode}>
    {notice ? <div role="status" data-tone={notice.tone}>{notice.message}</div> : null}
    <div className={css.content}>
      <SdkworkSubscriptionCatalogPage {...catalogProps} />
    </div>
  </div>
}
