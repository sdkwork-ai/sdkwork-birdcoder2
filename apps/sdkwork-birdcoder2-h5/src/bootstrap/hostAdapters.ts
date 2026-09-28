import {
  bindHostAdapters,
  createBrowserHostAdapters,
  type HostAdapters as CoreHostAdapters,
} from '@sdkwork/birdcoder2-h5-core/host'

import type { AppRuntime } from './runtime'

/**
 * Host adapter registration.
 *
 * The implementations live in core, not here: capability packages consume the
 * typed ports and must never import a Capacitor plugin, a Tauri global, a
 * WeChat bridge, or a browser global
 * (`APP_CLIENT_ARCHITECTURE_ALIGNMENT_SPEC.md` section 9). This module only
 * decides which set the current runtime target gets, so a native shell swaps
 * one adapter for a durable-storage one without any screen changing.
 */
export type HostAdapters = CoreHostAdapters

/**
 * Binds the adapter set for this runtime target and returns it.
 *
 * A Capacitor target keeps the same contract as the browser fallback and is
 * expected to be supplied by the `@sdkwork/birdcoder2-h5-capacitor` package;
 * until that package provides one, the browser set is bound so a WebView build
 * behaves exactly like the web build rather than failing to boot.
 */
export function registerHostAdapters(_runtime: AppRuntime): HostAdapters {
  return bindHostAdapters(createBrowserHostAdapters())
}
