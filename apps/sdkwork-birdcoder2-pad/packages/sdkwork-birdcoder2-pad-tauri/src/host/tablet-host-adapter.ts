import type {
  SecureStoragePort,
  TabletHostAdapter,
  TabletHostCapability,
  TabletHostOutcome,
} from '@sdkwork/birdcoder2-pad-core'

import {
  TABLET_HOST_CAPABILITIES,
  type TabletHostRuntimeTarget,
} from './capabilities.js'

function outcomeUnsupported<T>(capability: TabletHostCapability): TabletHostOutcome<T> {
  return { status: 'unsupported', capability }
}

function outcomeUnavailable<T>(capability: TabletHostCapability, reason: string): TabletHostOutcome<T> {
  return { status: 'unavailable', capability, reason }
}

/**
 * Tablet host adapter for the Tauri shell.
 *
 * The native bridge is attached by the Tauri command surface. Until a command
 * is registered, a declared capability returns `unavailable` rather than
 * throwing a platform exception into business code
 * (APP_PAD_ARCHITECTURE_SPEC.md section 5.10).
 */
export function createTabletHostAdapter(
  runtimeTarget: TabletHostRuntimeTarget = 'tablet-ipados',
): TabletHostAdapter {
  const platform = runtimeTarget === 'tablet-android' ? 'android-tablet' : 'ipados'
  const capabilities = new Set<TabletHostCapability>(TABLET_HOST_CAPABILITIES)
  const secureStorage: SecureStoragePort = {
    getItem: async () => outcomeUnavailable('secureStorage', 'native secure-storage bridge is not attached'),
    setItem: async () => outcomeUnavailable('secureStorage', 'native secure-storage bridge is not attached'),
    removeItem: async () => outcomeUnavailable('secureStorage', 'native secure-storage bridge is not attached'),
  }

  return {
    platform,
    capabilities,
    supports: capability => capabilities.has(capability),
    invoke: async (capability, _action, _payload) => (
      capabilities.has(capability)
        ? outcomeUnavailable(capability, 'native bridge is not attached in this scaffold')
        : outcomeUnsupported(capability)
    ),
    secureStorage,
  }
}
