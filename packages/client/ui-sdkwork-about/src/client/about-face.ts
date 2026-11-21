/**
 * The About surfaces' injected face: the two snapshots they render and the one
 * gesture that re-reads the platform identity.
 *
 * It is declared once and shared by the settings page and the dialog so both
 * surfaces consume the same data ownership (the runtime) and no component ever
 * touches the SDK client.
 */
import type { HostObservable } from '@deepseek-ai/dsh-client-ui-slots'
import type { AboutInstallationSnapshot, AboutLocalFacts } from './about-runtime.ts'

/** Injected business face of every About surface. */
export interface AboutInjected {
  /** Re-read the installation application from the platform. */
  refresh: () => void
  hooks: {
    /** This build's local facts; stable until the deployment environment moves. */
    local: HostObservable<AboutLocalFacts>
    /** The platform application read; stable until a new read settles. */
    installation: HostObservable<AboutInstallationSnapshot>
  }
}
