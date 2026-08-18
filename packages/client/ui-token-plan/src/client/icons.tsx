import type { ModeIconProps } from '@deepseek-ai/dsh-client-ui-app-modes/client'

/** Token Plan outline glyph for idle navigation. */
export const TokenPlanIcon = ({ size = 24, className }: ModeIconProps) => (
  <svg width={size} height={size} className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M12 3.8 14.4 9l5.6.6-4.2 3.8 1.2 5.5L12 16.1l-5 2.8 1.2-5.5L4 9.6 9.6 9 12 3.8Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
    <path d="M19 4.5v3M20.5 6h-3M5 16.5v3M6.5 18h-3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
  </svg>
)

/** Token Plan filled glyph for active navigation. */
export const TokenPlanIconFilled = ({ size = 24, className }: ModeIconProps) => (
  <svg width={size} height={size} className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M12 3.5 14.6 9l5.9.6-4.4 4 1.3 5.8-5.4-3-5.4 3 1.3-5.8-4.4-4L9.4 9 12 3.5Z" fill="currentColor" />
    <path d="M19 4.5v3M20.5 6h-3M5 16.5v3M6.5 18h-3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
  </svg>
)
