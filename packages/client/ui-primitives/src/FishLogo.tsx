// Birdcoder logo mark: the product icon raster served at the web root
// (apps/web/public/favicon.png — the same source the desktop shell derives
// its platform icons from). Rendered square from its native ratio.

import type { IconProps } from './icons/props.ts'

/**
 * Render the product logo mark.
 * @param props.size - width in px (default 24; height keeps the icon's ratio).
 * @param props.className - extra class for layout placement.
 * @returns the logo img (aria-hidden; pair with the wordmark for accessibility).
 */
export function FishLogo({ size = 24, className }: IconProps) {
  return (
    <img
      src="/favicon.png"
      className={className}
      width={size}
      alt=""
      aria-hidden="true"
    />
  )
}
