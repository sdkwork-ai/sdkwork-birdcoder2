import { BirdLogo, BirdWordmark } from '@deepseek-ai/dsh-client-ui-primitives'
import type { SidebarBrandMarkOwnerProps } from '@deepseek-ai/dsh-client-ui-sidebar/client'

/**
 * Render the official mark with the presentation requested by its host surface.
 * @param props - Host-supplied mark presentation.
 * @returns the BirdCoder product mark (fork-owned; never the upstream fish).
 */
export function OfficialBrandMark({ size }: SidebarBrandMarkOwnerProps) {
  return <BirdLogo size={size} />
}

/**
 * Render the official name artwork without its independently slotted mark.
 *
 * FORK DIVERGENCE (AGENTS.md, "BirdCoder brand assets"): upstream's
 * `BrandWordmark` spells the upstream name inside its own glyph paths, so the
 * sidebar showed the fork's bird beside the upstream name. The fork-owned
 * `BirdWordmark` replaces it on this surface; `BrandWordmark` stays untouched for
 * the upstream consumers that still declare it.
 * @returns the official name wordmark.
 */
export function OfficialBrandName() {
  return <BirdWordmark />
}
