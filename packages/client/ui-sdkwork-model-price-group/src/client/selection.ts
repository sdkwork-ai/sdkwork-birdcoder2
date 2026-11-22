/**
 * Relay model selection shared by the model-menu summary and its detail pane.
 * @module @deepseek-ai/dsh-client-ui-sdkwork-model-price-group/selection
 */
import type { ModelSelectionProjection } from '@deepseek-ai/dsh-agent/types'
import { BIRDCODER_PROVIDER } from './model-price-groups.ts'

/**
 * The relay model the picker belongs to, when the Session's current selection
 * is served by the BirdCoder relay route.
 * @param projection - the Session's shared model-selection projection.
 * @returns the relay catalog key, or null for every other provider or while
 *   the projection has not resolved a selection yet.
 */
export function relayModelOf(projection: ModelSelectionProjection | undefined): string | null {
  const selection = projection?.next ?? projection?.lastUsed ?? null
  return selection !== null && selection.provider === BIRDCODER_PROVIDER ? selection.model : null
}
