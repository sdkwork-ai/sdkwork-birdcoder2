import { createTabletHostAdapter } from '@sdkwork/birdcoder2-pad-tauri'
import type { TabletHostAdapter } from '@sdkwork/birdcoder2-pad-core'

import type { TabletRuntimeTarget } from './environment'

/**
 * Host adapter registration. Renderer code receives the typed adapter through
 * runtime injection and never touches platform globals
 * (APP_PAD_ARCHITECTURE_SPEC.md §5.10).
 */
export function createHostAdapter(runtimeTarget: TabletRuntimeTarget): TabletHostAdapter {
  return createTabletHostAdapter(runtimeTarget)
}
