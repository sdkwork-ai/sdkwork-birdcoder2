/**
 * The IM connector's rail glyph: a linked pair of speech bubbles on the 24px
 * grid, drawn in the rail's 1.8px outline weight. The pair reads as messaging
 * (two conversations, one connected surface) while staying recognizable as the
 * IM plugin's own bubble vocabulary. The rail owns its glyphs because the
 * design-system icon set has no IM vocabulary; the shared icon contract
 * ({size}, color rides currentColor) keeps a later swap local.
 */

/** Square edge in px, matching the rail's 24px entry glyphs. */
interface ImConnectorIconProps {
  /** Requested square edge in pixels. */
  size?: number | undefined
}

/**
 * Render the IM connector glyph.
 * @param props - square edge in px (default 24).
 * @returns the icon element.
 */
export function ImConnectorIcon({ size = 24 }: ImConnectorIconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      focusable="false"
    >
      <rect x="1.8" y="3.2" width="9.8" height="7" rx="2.4" stroke="currentColor" strokeWidth="1.8" />
      <path d="M4.6 10.2 3.8 13.1 7 10.2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      <rect x="11.9" y="10.2" width="10.3" height="7.2" rx="2.4" stroke="currentColor" strokeWidth="1.8" />
      <path d="m18.6 17.4.8 2.9-3.2-2.9" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}
