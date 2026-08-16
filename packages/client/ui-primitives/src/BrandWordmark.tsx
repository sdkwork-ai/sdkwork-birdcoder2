// Birdcoder brand mark: the product icon raster served at the web root
// (apps/web/public/favicon.png — the same source the desktop shell derives
// its platform icons from). The icon is the logo itself; the sidebar brand
// row renders the "Birdcoder" label beside it.

import type { IconProps } from './icons/props.ts'

/**
 * Render the product brand mark.
 * @param props.size - height in px (default 24; width keeps the icon's ratio).
 * @param props.className - extra class for layout placement.
 * @returns the brand mark img (aria-hidden decorative brand art).
 */
export function BrandWordmark({ size = 24, className }: IconProps) {
  return (
    // Inline style, not the height attribute: the web app's Tailwind preflight
    // (`img { height: auto }`) overrides the attribute and would render the
    // mark at its natural size.
    <img
      src="/favicon.png"
      className={className}
      style={{ height: size }}
      alt=""
      aria-hidden="true"
    />
  )
}
