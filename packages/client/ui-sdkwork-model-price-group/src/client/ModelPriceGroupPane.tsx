/**
 * Detail pane listing the price groups that can serve the selected relay model.
 * @module @deepseek-ai/dsh-client-ui-sdkwork-model-price-group/ModelPriceGroupPane
 */
import { useEffect, useId, useState } from 'react'
import { IconCheckOutlineRegular } from '@deepseek-ai/dsh-client-ui-primitives'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-model-selection/client'
import type {} from '@deepseek-ai/dsh-client-ui-sdkwork-env/client'
import type {} from '@deepseek-ai/dsh-client-ui-sdkwork-iam/client'
import { relayModelOf } from './selection.ts'
import type { ModelPriceGroupInjected } from './face.ts'
import type { NS } from './locales.ts'
import css from './ModelPriceGroup.module.css'

/** Full props of the model-menu price-group picker. */
export type ModelPriceGroupPaneProps = PropsRuntime<'conversation.input.model.pane'>
  & InjectFace<ModelPriceGroupInjected> & PropsLocale<typeof NS>

/**
 * Present the model's groups and persist the newly chosen one.
 *
 * "Follow the default group" clears the user rule, which is the empty-list form
 * of the app-api write; choosing a group pins that group for the model only, so
 * a vendor- or modality-scoped rule stays untouched.
 * @param props - model selection projection, price-group state, and menu controls.
 * @returns the picker, or nothing outside the relay provider.
 */
export function ModelPriceGroupPane(props: ModelPriceGroupPaneProps) {
  const model = relayModelOf(props.useProjection('modelSelection'))
  const { load } = props
  useEffect(() => {
    if (model !== null) load(model)
  }, [load, model])
  const state = props.usePriceGroup(value => value)
  const [pending, setPending] = useState(false)
  const descriptionId = useId()
  if (model === null) return null
  const busy = pending || state.saving
  const choose = (groupCode: string | null): void => {
    if (busy || props.locked) return
    setPending(true)
    void props.select({ model, groupCode }).then((failure) => {
      if (failure === null) props.dismiss()
      else props.reportFailure(props.t('save.failed', { message: failure }))
    }).finally(() => {
      setPending(false)
    })
  }
  return (
    <div className={css.pane}>
      <p id={descriptionId} className={css.description}>{props.t('pane.description')}</p>
      {state.status === 'loading' && (
        <div className={css.status} role="status">{props.t('pane.loading')}</div>
      )}
      {state.status === 'failed' && (
        <div className={css.error} role="alert">
          <span>{props.t('pane.error', { message: state.error ?? '' })}</span>
          <button
            type="button"
            className={css.retry}
            disabled={props.locked || busy}
            onClick={() => { props.load(model) }}
          >
            {props.t('pane.retry')}
          </button>
        </div>
      )}
      {state.status === 'ready' && (
        <>
          {state.groups.length === 0 && (
            <div className={css.status} role="status">{props.t('pane.empty')}</div>
          )}
          <button
            type="button"
            role="menuitemradio"
            aria-checked={state.pinned === null}
            aria-describedby={descriptionId}
            className={css.option}
            disabled={props.locked || busy}
            autoFocus={state.pinned === null}
            onClick={() => { choose(null) }}
          >
            <span className={css.optionName}>{props.t('pane.inherit')}</span>
            <span className={css.check}>
              {state.pinned === null ? <IconCheckOutlineRegular aria-hidden="true" /> : null}
            </span>
          </button>
          {state.groups.map((group) => {
            const checked = state.pinned === group.code
            return (
              <button
                key={group.code}
                type="button"
                role="menuitemradio"
                aria-checked={checked}
                aria-describedby={descriptionId}
                className={css.option}
                title={group.code}
                disabled={props.locked || busy}
                autoFocus={checked}
                onClick={() => { choose(group.code) }}
              >
                <span className={css.optionName}>{group.name}</span>
                <span className={css.check}>
                  {checked ? <IconCheckOutlineRegular aria-hidden="true" /> : null}
                </span>
              </button>
            )
          })}
        </>
      )}
    </div>
  )
}
