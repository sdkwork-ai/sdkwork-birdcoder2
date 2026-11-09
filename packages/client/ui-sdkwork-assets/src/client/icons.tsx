/**
 * Self-contained 24px Assets glyphs in two weights: the outline set for idle
 * rail entries and the page, the filled set for the rail's active entry.
 * Follows the shared icon contract ({size, className}, color rides
 * currentColor).
 */
import type { ModeIconProps } from '@deepseek-ai/dsh-client-ui-sdkwork-app-modes/client'

/** Assets mode, outline: media card over a second sheet (the asset library). */
export const AssetIcon = ({ size = 24, className }: ModeIconProps) => (
  <svg width={size} height={size} className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M15.1 20.8H5.8A2.6 2.6 0 0 1 3.2 18.2V9.2" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
    <rect x="6.8" y="3.2" width="14" height="14" rx="2.8" stroke="currentColor" strokeWidth="1.8" />
    <path
      d="M9.9 14.2 12.2 10.6l1.7 2.1 1.2-1.3 2.1 2.8"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
)

/** Assets mode, filled: the solid media card plus the sheet it sits on. */
export const AssetIconFilled = ({ size = 24, className }: ModeIconProps) => (
  <svg width={size} height={size} className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path
      fillRule="evenodd"
      d="M9.6 2.3h8.4a3.7 3.7 0 0 1 3.7 3.7v8.4a3.7 3.7 0 0 1-3.7 3.7H9.6a3.7 3.7 0 0 1-3.7-3.7V6a3.7 3.7 0 0 1 3.7-3.7Zm.3 12 2.3-3.6 1.7 2.1 1.2-1.3 2.1 2.8H9.9Z"
      fill="currentColor"
    />
    <path d="M15.1 19.9H5.8A1.7 1.7 0 0 1 4.1 18.2V9.2H2.3V18.2A3.5 3.5 0 0 0 5.8 21.7H15.1Z" fill="currentColor" />
  </svg>
)
