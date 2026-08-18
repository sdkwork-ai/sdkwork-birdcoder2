import type { ModeIconProps } from '@deepseek-ai/dsh-client-ui-app-modes/client'

/** App Store mode, outline: four-square application grid. */
export const AppStoreIcon = ({ size = 24, className }: ModeIconProps) => (
  <svg width={size} height={size} className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect x="4.5" y="4.5" width="6" height="6" rx="1.8" stroke="currentColor" strokeWidth="1.8" />
    <rect x="13.5" y="4.5" width="6" height="6" rx="1.8" stroke="currentColor" strokeWidth="1.8" />
    <rect x="4.5" y="13.5" width="6" height="6" rx="1.8" stroke="currentColor" strokeWidth="1.8" />
    <rect x="13.5" y="13.5" width="6" height="6" rx="1.8" stroke="currentColor" strokeWidth="1.8" />
  </svg>
)

/** App Store mode, filled: solid four-square grid. */
export const AppStoreIconFilled = ({ size = 24, className }: ModeIconProps) => (
  <svg width={size} height={size} className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect x="4.5" y="4.5" width="6" height="6" rx="1.8" fill="currentColor" />
    <rect x="13.5" y="4.5" width="6" height="6" rx="1.8" fill="currentColor" />
    <rect x="4.5" y="13.5" width="6" height="6" rx="1.8" fill="currentColor" />
    <rect x="13.5" y="13.5" width="6" height="6" rx="1.8" fill="currentColor" />
  </svg>
)
