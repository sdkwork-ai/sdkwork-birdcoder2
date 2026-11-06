import type { ModeIconProps } from '@deepseek-ai/dsh-client-ui-sdkwork-app-modes/client'

/** Purchase glyph (gift box), outline, for the mode entry at rest. */
export const TokenPlanIcon = ({ size = 24, className }: ModeIconProps) => (
  <svg width={size} height={size} className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect x="3.9" y="7.3" width="16.2" height="4" rx="1.3" stroke="currentColor" strokeWidth="1.8" />
    <rect x="5.6" y="11.3" width="12.8" height="8.9" rx="1.5" stroke="currentColor" strokeWidth="1.8" />
    <path d="M12 7.3v12.9" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    <path d="M12 7.2C10.8 4.3 7.2 3.8 6.6 5.7c-.5 1.8 2.7 2.4 5.4 1.5Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
    <path d="M12 7.2c1.2-2.9 4.8-3.4 5.4-1.5.5 1.8-2.7 2.4-5.4 1.5Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
  </svg>
)

/**
 * Purchase glyph (gift box), solid, for the selected mode entry: the lid and
 * body are separated by a transparent seam and the ribbon is knocked out.
 */
export const TokenPlanIconFilled = ({ size = 24, className }: ModeIconProps) => (
  <svg width={size} height={size} className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path
      fillRule="evenodd"
      d="M5.2 7.3h13.6a1.3 1.3 0 0 1 1.3 1.3v1.4a1.3 1.3 0 0 1-1.3 1.3H5.2a1.3 1.3 0 0 1-1.3-1.3V8.6a1.3 1.3 0 0 1 1.3-1.3ZM7.1 12.2h9.8a1.5 1.5 0 0 1 1.5 1.5v5a1.5 1.5 0 0 1-1.5 1.5H7.1a1.5 1.5 0 0 1-1.5-1.5v-5a1.5 1.5 0 0 1 1.5-1.5ZM11 7.3h2v12.9h-2Z"
      fill="currentColor"
    />
    <path d="M12 7.2C10.8 4.3 7.2 3.8 6.6 5.7c-.5 1.8 2.7 2.4 5.4 1.5Z" fill="currentColor" />
    <path d="M12 7.2c1.2-2.9 4.8-3.4 5.4-1.5.5 1.8-2.7 2.4-5.4 1.5Z" fill="currentColor" />
  </svg>
)
