/**
 * Self-contained 24px Assets glyphs in two weights: the outline set for idle
 * rail entries and the page, the filled set for the rail's active entry.
 * Follows the shared icon contract ({size, className}, color rides
 * currentColor).
 */
import type { ModeIconProps } from '@deepseek-ai/dsh-client-ui-sdkwork-app-modes/client'

/** Assets mode, outline: cube with its top edges. */
export const AssetIcon = ({ size = 24, className }: ModeIconProps) => (
  <svg width={size} height={size} className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M12 4.5 19 8.25v7.5L12 19.5l-7-3.75v-7.5L12 4.5Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
    <path d="M5 8.25 12 12l7-3.75" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M12 12v7.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
  </svg>
)

/** Assets mode, filled: solid cube with the top face knocked out. */
export const AssetIconFilled = ({ size = 24, className }: ModeIconProps) => (
  <svg width={size} height={size} className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path
      fillRule="evenodd"
      d="M12 4.5 19 8.25v7.5L12 19.5l-7-3.75v-7.5L12 4.5ZM5 8.25 12 4.5l7 3.75L12 12 5 8.25Z"
      fill="currentColor"
    />
  </svg>
)
