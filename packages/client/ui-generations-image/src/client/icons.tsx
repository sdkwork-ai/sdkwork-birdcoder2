/**
 * Self-contained 24px glyphs for the image generation mode, in two weights:
 * the outline set (stroke) for the idle rail entry and the filled set (solid)
 * for the rail's active entry. They follow the shared icon contract
 * ({size, className}, color rides currentColor).
 */
import type { ModeIconProps } from '@deepseek-ai/dsh-client-ui-app-modes/client'

/** Image generation mode, outline: picture frame with sun and mountains. */
export const ImageGenIcon = ({ size = 24, className }: ModeIconProps) => (
  <svg width={size} height={size} className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect x="3.5" y="5" width="17" height="14" rx="2.5" stroke="currentColor" strokeWidth="1.8" />
    <circle cx="9" cy="9.5" r="1.6" stroke="currentColor" strokeWidth="1.8" />
    <path d="M4.75 16.75 9.5 11.5l3.25 3.25 3-3 3.5 4.75" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
)

/** Image generation mode, filled: solid frame with sun and mountain silhouettes knocked out. */
export const ImageGenIconFilled = ({ size = 24, className }: ModeIconProps) => (
  <svg width={size} height={size} className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path
      fillRule="evenodd"
      d="M6 5h12a2.5 2.5 0 0 1 2.5 2.5v9A2.5 2.5 0 0 1 18 19H6a2.5 2.5 0 0 1-2.5-2.5v-9A2.5 2.5 0 0 1 6 5Zm3 4.5a1.6 1.6 0 1 0 0-3.2 1.6 1.6 0 0 0 0 3.2ZM4.75 16.75 9.5 11.5l3.25 3.25 3-3 3.5 4.75H4.75Z"
      fill="currentColor"
    />
  </svg>
)
