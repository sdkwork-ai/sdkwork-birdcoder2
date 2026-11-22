/**
 * Injected face shared by the model-menu summary and its detail pane.
 * @module @deepseek-ai/dsh-client-ui-sdkwork-model-price-group/face
 */
import type { HostObservable } from '@deepseek-ai/dsh-client-ui-slots'
import type { PriceGroupState } from './model-price-groups.ts'

/** Data and callbacks the model-menu contributions receive from the plugin. */
export interface ModelPriceGroupInjected {
  hooks: {
    /** Current model's groups, user rule, and write state. */
    priceGroup: HostObservable<PriceGroupState>
  }
  /**
   * Load one relay model's groups unless they are already current.
   * @param model - relay catalog key.
   */
  load: (model: string) => void
  /**
   * Replace the user's rule for one relay model.
   * @param input - model and target group; null clears the rule.
   * @returns null on success, otherwise the failure message.
   */
  select: (input: { model: string; groupCode: string | null }) => Promise<string | null>
}
