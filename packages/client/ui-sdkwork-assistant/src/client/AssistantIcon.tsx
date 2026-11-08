/**
 * The assistant surface glyph: a robot head on the 24px grid, drawn in two
 * weights like the rail's other mode cells. The outline set is the rail's idle
 * weight; the filled set is the selected weight — the rail swaps the glyph
 * along with the cell background, so an active assistant must not stay a
 * stroked outline (it would be the only cell that does).
 *
 * The head reads as the persona-bot layer's assistant rather than as one more
 * app surface, and its two eyes plus the antenna distinguish it from every
 * neighbouring cell. The filled head is a solid plate with the face knocked
 * out, so the cell background shows through the eyes and mouth.
 */

/** Square edge in px, matching the rail's 24px entry glyphs. */
interface AssistantIconProps {
  /** Requested square edge in pixels. */
  size?: number | undefined
  /** Solid selected weight instead of the idle outline. */
  filled?: boolean | undefined
}

/**
 * Render the assistant glyph.
 * @param props - square edge in px (default 24) and the filled selection weight.
 * @returns the icon element.
 */
export function AssistantIcon({ size = 24, filled = false }: AssistantIconProps) {
  if (filled) {
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
        focusable="false"
        data-variant="filled"
      >
        <circle cx="12" cy="3.7" r="1.6" fill="currentColor" />
        <rect x="11.1" y="5.1" width="1.8" height="3.4" rx="0.9" fill="currentColor" />
        <path
          fillRule="evenodd"
          clipRule="evenodd"
          fill="currentColor"
          d="M8.1 8.1H15.9A4.2 4.2 0 0 1 20.1 12.3V15.9A4.2 4.2 0 0 1 15.9 20.1H8.1A4.2 4.2 0 0 1 3.9 15.9V12.3A4.2 4.2 0 0 1 8.1 8.1ZM9.1 12.25a1.35 1.35 0 1 0 0 2.7 1.35 1.35 0 1 0 0-2.7ZM14.9 12.25a1.35 1.35 0 1 0 0 2.7 1.35 1.35 0 1 0 0-2.7ZM10.7 16.2h2.6a0.9 0.9 0 0 1 0 1.8h-2.6a0.9 0.9 0 0 1 0-1.8Z"
        />
      </svg>
    )
  }
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      focusable="false"
      data-variant="outline"
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
