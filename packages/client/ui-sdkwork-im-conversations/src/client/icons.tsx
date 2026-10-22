/**
 * Self-contained 24px chat and contacts glyphs in two weights: the outline set
 * for idle rail entries and the filled set for the rail's active entry. They
 * follow the shared icon contract ({size, className}, color rides
 * currentColor).
 */
import type { ModeIconProps } from '@deepseek-ai/dsh-client-ui-sdkwork-app-modes/client'

/** Chat mode, outline: speech bubble with a tail. */
export const ChatIcon = ({ size = 24, className }: ModeIconProps) => (
  <svg width={size} height={size} className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path
      d="M4.5 6.5A2.5 2.5 0 0 1 7 4h10a2.5 2.5 0 0 1 2.5 2.5v6A2.5 2.5 0 0 1 17 15h-6.2l-3.6 3.1A1 1 0 0 1 5.6 17.4V15A2.5 2.5 0 0 1 4.5 12.5v-6Z"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinejoin="round"
    />
    <path d="M8.75 8.75h6.5M8.75 11.5h4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
  </svg>
)

/** Chat mode, filled: solid bubble with the tail and lines knocked out. */
export const ChatIconFilled = ({ size = 24, className }: ModeIconProps) => (
  <svg width={size} height={size} className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path
      fillRule="evenodd"
      d="M7 4h10a2.5 2.5 0 0 1 2.5 2.5v6A2.5 2.5 0 0 1 17 15h-6.2l-3.6 3.1a1 1 0 0 1-1.6-.7V15A2.5 2.5 0 0 1 4.5 12.5v-6A2.5 2.5 0 0 1 7 4Zm1.75 4.75h6.5v1.5h-6.5v-1.5Zm0 2.75h4v1.5h-4V11.5Z"
      fill="currentColor"
    />
  </svg>
)
