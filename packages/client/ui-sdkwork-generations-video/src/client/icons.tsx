/**
 * Self-contained 24px glyphs for the video generation mode, in two weights:
 * the outline set (stroke) for the idle rail entry and the filled set (solid)
 * for the rail's active entry. They follow the shared icon contract
 * ({size, className}, color rides currentColor).
 */
import type { ModeIconProps } from '@deepseek-ai/dsh-client-ui-sdkwork-app-modes/client'

/** Video generation mode, outline: play glyph in a rounded frame. */
export const VideoGenIcon = ({ size = 24, className }: ModeIconProps) => (
  <svg width={size} height={size} className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect x="3.5" y="6" width="17" height="12" rx="3" stroke="currentColor" strokeWidth="1.8" />
    <path d="M10.25 9.5v5l4.5-2.5-4.5-2.5Z" fill="currentColor" />
  </svg>
)

/** Video generation mode, filled: solid frame with the play glyph knocked out. */
export const VideoGenIconFilled = ({ size = 24, className }: ModeIconProps) => (
  <svg width={size} height={size} className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path
      fillRule="evenodd"
      d="M6.5 6h11A2.5 2.5 0 0 1 20 8.5v7a2.5 2.5 0 0 1-2.5 2.5h-11A2.5 2.5 0 0 1 4 15.5v-7A2.5 2.5 0 0 1 6.5 6Zm3.75 3.5v5l4.5-2.5-4.5-2.5Z"
      fill="currentColor"
    />
  </svg>
)
