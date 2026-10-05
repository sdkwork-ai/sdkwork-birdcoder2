/**
 * Reactive theme/locale ports shared by every publish surface (the
 * session-header action, the standalone publish dialog, and the shared
 * publish-as-template flow), plus the BirdCoder-locale → deployments-locale
 * mapping the @sdkwork dialogs consume. Own module so the surfaces can compose
 * without importing each other.
 */
import type { DeploymentsLocale } from '@sdkwork/deployments-pc-commons'

/** Minimal theme port consumed by the publish surfaces. */
export interface DeployPublishThemePort {
  getColorScheme(): 'light' | 'dark'
  subscribe(listener: () => void): () => void
}

/**
 * Minimal locale face consumed by the publish surfaces (structural: the
 * injected value is the locale service itself — the injected `t` seat is a bare
 * translate function and carries no locale field).
 */
export interface DeployLocaleFace {
  /** Current immutable locale snapshot; stable reference between changes. */
  getSnapshot(): { active: string }
  /** Observe snapshot changes (locale switches, dictionary registrations). */
  subscribe(listener: () => void): () => void
}

/** Map the BirdCoder locale id onto the deployments locale union. */
export function deploymentsLocale(active: string | undefined): DeploymentsLocale {
  return active === 'zh' || active === 'zh-CN' ? 'zh-CN' : 'en-US'
}
