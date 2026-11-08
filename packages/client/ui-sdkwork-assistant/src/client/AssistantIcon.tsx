/**
 * The assistant surface glyph: a robot head on the 24px grid, drawn in the
 * rail's 1.8px outline weight. The rail owns its glyphs because the shared
 * design-system icon set has no assistant vocabulary; the shared icon contract
 * ({size}, color rides currentColor) keeps a later swap local. The head reads
 * as the persona-bot layer's assistant rather than as one more app surface, and
 * its two eyes plus the antenna distinguish it from every neighbouring cell.
 */

/** Square edge in px, matching the rail's 24px entry glyphs. */
interface AssistantIconProps {
  /** Requested square edge in pixels. */
  size?: number | undefined
}

/**
 * Render the assistant glyph.
 * @param props - square edge in px (default 24).
 * @returns the icon element.
 */
export function AssistantIcon({ size = 24 }: AssistantIconProps) {
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
      <rect x="3.9" y="8.1" width="16.2" height="12" rx="4.2" stroke="currentColor" strokeWidth="1.8" />
      <path d="M12 8.1V5.4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <circle cx="12" cy="3.7" r="1.4" fill="currentColor" />
      <circle cx="9.1" cy="13.6" r="1.35" fill="currentColor" />
      <circle cx="14.9" cy="13.6" r="1.35" fill="currentColor" />
      <path d="M9.8 17.1h4.4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  )
}
