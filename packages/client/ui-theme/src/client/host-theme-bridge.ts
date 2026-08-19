/**
 * Host color-scheme bridge: maps the harness ThemeRuntime to the minimal
 * subscribe/get surface embedded SDKWork host adapters consume.
 */
import type { Context } from '@deepseek-ai/cordis'
import type { ThemeRuntime } from './index.ts'

/** Resolved light/dark scheme for an embedded SDKWork surface. */
export type HostColorScheme = 'light' | 'dark'

/** Minimal host theme face passed into SDKWork host adapters. */
export interface HostThemeBridge {
  /** @returns the resolved host color scheme for the embedded surface. */
  getColorScheme(): HostColorScheme
  /** Observe resolved color-scheme changes. */
  subscribe(listener: () => void): () => void
}

/**
 * Build a host theme bridge from the harness theme runtime.
 * @param themeRuntime - the live theme service.
 * @param onThemeChange - cordis subscription registrar (`ctx.on('theme/change', …)`).
 * @returns bridge consumed by SDKWork host adapters.
 */
export function createHostThemeBridge(
  themeRuntime: ThemeRuntime,
  onThemeChange: Context['on'],
): HostThemeBridge {
  return {
    getColorScheme: () => themeRuntime.getTheme().active.colorScheme,
    subscribe: listener => onThemeChange('theme/change', listener),
  }
}
