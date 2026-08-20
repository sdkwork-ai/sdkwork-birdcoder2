/**
 * Self-contained 24px Course glyphs in two weights for the mode rail.
 */
import type { ModeIconProps } from '@deepseek-ai/dsh-client-ui-app-modes/client'

/** Course mode, outline: open book with a play badge. */
export const CourseIcon = ({ size = 24, className }: ModeIconProps) => (
  <svg width={size} height={size} className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path
      d="M5 6.5A2.5 2.5 0 0 1 7.5 4H18v15.5H7.5A2.5 2.5 0 0 0 5 22V6.5Z"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinejoin="round"
    />
    <path d="M5 6.5A2.5 2.5 0 0 0 7.5 9H18" stroke="currentColor" strokeWidth="1.8" />
    <path d="M10.5 12.5 12.5 14.5 15.5 11" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
)

/** Course mode, filled: solid book with a play triangle. */
export const CourseIconFilled = ({ size = 24, className }: ModeIconProps) => (
  <svg width={size} height={size} className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path
      fillRule="evenodd"
      d="M7.5 4A2.5 2.5 0 0 0 5 6.5V22a2.5 2.5 0 0 1 2.5-2.5H18V4H7.5Zm3.5 8.5 4-2.3a.6.6 0 0 1 .9.5v4.6a.6.6 0 0 1-.9.5l-4-2.3a.6.6 0 0 1 0-1Z"
      fill="currentColor"
    />
  </svg>
)
