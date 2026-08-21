import clsx from 'clsx'
import { Tooltip } from '@deepseek-ai/dsh-client-ui-primitives'
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-sdkwork-app-modes/client'
import { TokenPlanIcon, TokenPlanIconFilled } from './icons.tsx'
import css from './RailEntry.module.css'

export interface TokenPlanRailEntryInjected { mode: 'token-plan' }
export type TokenPlanRailEntryProps = PropsRuntime<'mode.rail.entry'> & TokenPlanRailEntryInjected & PropsLocale<'tokenPlan'>

/** Render the Token Plan entry immediately above the settings seat. */
export function TokenPlanRailEntry({ mode, active, setMode, t }: TokenPlanRailEntryProps) {
  const Icon = active ? TokenPlanIconFilled : TokenPlanIcon
  return <Tooltip label={t('mode.tokenPlan')} delayMs={500}>
    <button type="button" className={clsx(css.entry, active && css.active)} aria-label={t('mode.tokenPlan.label')} aria-pressed={active} onClick={() => { setMode(mode) }}>
      <Icon size={24} />
    </button>
  </Tooltip>
}
