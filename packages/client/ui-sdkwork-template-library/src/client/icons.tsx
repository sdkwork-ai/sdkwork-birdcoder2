/**
 * Self-contained 24px Template Library glyphs. Follows the shared icon
 * contract ({size, className}, color rides currentColor).
 */
import type { ModeIconProps } from '@deepseek-ai/dsh-client-ui-sdkwork-app-modes/client'

/** Template Library: one wide header block over two cells (the layout-template glyph). */
export const TemplateLibraryIcon = ({ size = 24, className }: ModeIconProps) => (
  <svg width={size} height={size} className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect x="4.2" y="4.2" width="15.6" height="5.4" rx="1.4" stroke="currentColor" strokeWidth="1.7" />
    <rect x="4.2" y="12.4" width="6.6" height="7.4" rx="1.4" stroke="currentColor" strokeWidth="1.7" />
    <rect x="13.2" y="12.4" width="6.6" height="7.4" rx="1.4" stroke="currentColor" strokeWidth="1.7" />
  </svg>
)
