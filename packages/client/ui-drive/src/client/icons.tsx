/**
 * Self-contained 24px Drive glyphs in two weights: the outline set for idle
 * rail entries and the page, the filled set for the rail's active entry.
 * Follows the shared icon contract ({size, className}, color rides
 * currentColor).
 */
import type { ModeIconProps } from '@deepseek-ai/dsh-client-ui-app-modes/client'

/** Drive mode, outline: cloud drive with the lid line. */
export const DriveIcon = ({ size = 24, className }: ModeIconProps) => (
  <svg width={size} height={size} className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path
      d="M7.5 18.5a4.5 4.5 0 0 1-.4-8.99A5.5 5.5 0 0 1 17.6 11 4 4 0 0 1 17 18.5h-9.5Z"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinejoin="round"
    />
    <path d="M8.5 14.5 12 11l3.5 3.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M12 11v5.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
  </svg>
)

/** Drive mode, filled: solid cloud with the download arrow knocked out. */
export const DriveIconFilled = ({ size = 24, className }: ModeIconProps) => (
  <svg width={size} height={size} className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path
      fillRule="evenodd"
      d="M7.1 18.5a4.5 4.5 0 0 1-.4-8.99A5.5 5.5 0 0 1 17.6 11a4 4 0 0 1-.6 7.5h-9.9Zm1.4-4 3.5-3.5 3.5 3.5h-2.25v2.5h-2.5v-2.5H8.5Z"
      fill="currentColor"
    />
  </svg>
)
