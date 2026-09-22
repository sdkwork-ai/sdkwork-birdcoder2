import type { IconProps } from './icons/props.ts'

/**
 * Render the fork's product wordmark ("BirdCoder").
 *
 * The upstream wordmark (`BrandWordmark`) is artwork upstream owns: its glyph
 * paths spell the upstream name and carry the upstream badge, so no call site can
 * rebrand it and upstream merges are free to revert it. This component is
 * fork-owned (AGENTS.md → "BirdCoder brand assets"), which is what makes the
 * product name a merge-stable surface: the sidebar renders this, so a merge can
 * never put the upstream name back in the product.
 *
 * The name is live SVG text rather than glyph outlines, so it inherits the
 * application's font stack and stays legible at any size. The box deliberately
 * matches the upstream wordmark's footprint (`156x24` at the default size) so
 * hosting slots do not reflow.
 *
 * @param props.size - height in px (default 24; width follows the same ratio as the upstream wordmark).
 * @param props.className - extra class for layout placement.
 * @returns the wordmark svg (aria-hidden decorative brand art).
 */
export function BirdWordmark({ size = 24, className }: IconProps) {
  const width = 156
  const height = 24
  return (
    <svg
      width={(size * width) / height}
      height={size}
      className={className}
      viewBox={`0 0 ${width} ${height}`}
      fill="none"
      aria-hidden="true"
    >
      <text
        x={width / 2}
        y={18.6}
        textAnchor="middle"
        fontSize={21}
        fontWeight={600}
        letterSpacing={0.2}
        fill="currentColor"
      >
        BirdCoder
      </text>
    </svg>
  )
}
