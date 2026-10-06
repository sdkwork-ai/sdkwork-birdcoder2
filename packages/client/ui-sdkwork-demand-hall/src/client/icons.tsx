/**
 * Self-contained 24px Demand Hall glyphs. Follows the shared icon
 * contract ({size, className}, color rides currentColor).
 */
import type { ModeIconProps } from '@deepseek-ai/dsh-client-ui-sdkwork-app-modes/client'

/** Demand Hall: a hall gable over four columns on a base (the 需求大厅 glyph). */
export const DemandHallIcon = ({ size = 24, className }: ModeIconProps) => (
  <svg width={size} height={size} className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M4 9.6 12 5l8 4.6" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M5.6 12v5.4M9.9 12v5.4M14.1 12v5.4M18.4 12v5.4" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    <path d="M4 20h16" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
  </svg>
)
