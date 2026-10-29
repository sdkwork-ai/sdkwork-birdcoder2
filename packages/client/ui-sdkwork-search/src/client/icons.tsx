/**
 * Self-contained 24px search glyphs in two weights: the outline set for idle
 * rail entries and the page, the filled set for the rail's active entry.
 * Follows the shared icon contract ({size, className}, color rides
 * currentColor).
 */
import type { ModeIconProps } from '@deepseek-ai/dsh-client-ui-sdkwork-app-modes/client'

/** Search mode, outline: magnifier ring with its handle. */
export const SearchIcon = ({ size = 24, className }: ModeIconProps) => (
  <svg width={size} height={size} className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <circle cx="10.8" cy="10.8" r="6.2" stroke="currentColor" strokeWidth="1.8" />
    <path d="m15.5 15.5 4 4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
  </svg>
)

/** Search mode, filled: solid ring with the handle knocked out. */
export const SearchIconFilled = ({ size = 24, className }: ModeIconProps) => (
  <svg width={size} height={size} className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path
      fillRule="evenodd"
      clipRule="evenodd"
      d="M10.8 4.6a6.2 6.2 0 1 0 0 12.4 6.2 6.2 0 0 0 0-12.4Zm0 2.3a3.9 3.9 0 1 1 0 7.8 3.9 3.9 0 0 1 0-7.8Z"
      fill="currentColor"
    />
    <path d="m15.5 15.5 4 4" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" />
  </svg>
)
