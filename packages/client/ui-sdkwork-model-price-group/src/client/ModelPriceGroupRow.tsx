/**
 * Root-menu summary row for the selected relay model's price group.
 * @module @deepseek-ai/dsh-client-ui-sdkwork-model-price-group/ModelPriceGroupRow
 */
import { useEffect } from 'react'
import { IconChevronRightOutlineRegular } from '@deepseek-ai/dsh-client-ui-primitives'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-model-selection/client'
import type {} from '@deepseek-ai/dsh-client-ui-sdkwork-env/client'
import type {} from '@deepseek-ai/dsh-client-ui-sdkwork-iam/client'
import { PANE_KEY, type PriceGroupState } from './model-price-groups.ts'
import { relayModelOf } from './selection.ts'
import type { ModelPriceGroupInjected } from './face.ts'
import type { NS } from './locales.ts'
import css from './ModelPriceGroup.module.css'

/** Full props of the model-menu price-group summary. */
export type ModelPriceGroupRowProps = PropsRuntime<'conversation.input.model.afterModel'>
  & InjectFace<ModelPriceGroupInjected> & PropsLocale<typeof NS>

/**
 * Show the model's current price group and open its picker.
 *
 * The row is invisible for every provider except the BirdCoder relay route, so
 * the menu only grows this entry where the app-api can answer for the model.
 * @param props - model selection projection, price-group state, and menu controls.
 * @returns the summary row, or nothing outside the relay provider.
 */
export function ModelPriceGroupRow(props: ModelPriceGroupRowProps) {
  const model = relayModelOf(props.useProjection('modelSelection'))
  const { load } = props
  useEffect(() => {
    if (model !== null) load(model)
  }, [load, model])
  const state = props.usePriceGroup(value => value)
  if (model === null) return null
  return (
    <button
      type="button"
      role="menuitem"
      className={css.summary}
      data-model-menu-pane={PANE_KEY}
      disabled={props.locked || state.saving}
      onClick={() => {
        props.openPane({ key: PANE_KEY, title: props.t('row.label') })
      }}
    >
      <span className={css.summaryLabel}>{props.t('row.label')}</span>
      <span className={css.summaryValue}>{currentGroupLabel(state, model, props.t)}</span>
      <IconChevronRightOutlineRegular className={css.chevron} aria-hidden="true" />
    </button>
  )
}

/**
 * The value cell: the pinned group, the effective default it inherits, or the
 * neutral caption before anything has loaded.
 * @param state - loaded price-group state.
 * @param model - model the row describes.
 * @param t - localized text lookup.
 * @returns the visible current value.
 */
function currentGroupLabel(
  state: PriceGroupState,
  model: string,
  t: ModelPriceGroupRowProps['t'],
): string {
  if (state.model !== model) return t('row.value.inherited')
  if (state.pinned !== null) {
    const pinned = state.groups.find(group => group.code === state.pinned)
    return pinned?.name ?? state.pinned
  }
  const effective = state.groups.find(group => group.selected)
    ?? state.groups.find(group => group.isDefault)
  return effective?.name ?? t('row.value.inherited')
}
