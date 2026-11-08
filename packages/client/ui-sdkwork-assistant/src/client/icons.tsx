/**
 * Self-contained 24px assistant glyphs in two weights: the outline set for the
 * idle rail entry and the filled set for the active one. They follow the
 * shared icon contract ({size, className}, color rides currentColor) and the
 * rail's own robot-head vocabulary: an antenna above a rounded head, two eyes
 * and a mouth line — the visual counterpart of the Home house beside it.
 */
import type { ModeIconProps } from '@deepseek-ai/dsh-client-ui-sdkwork-app-modes/client'

/** Assistant mode, outline: robot head with an antenna, two eyes and a mouth. */
export const AssistantIcon = ({ size = 24, className }: ModeIconProps) => (
  <svg width={size} height={size} className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect x="4.2" y="6.4" width="15.6" height="12.4" rx="3.4" stroke="currentColor" strokeWidth="1.8" />
    <path d="M12 6.4V4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    <circle cx="12" cy="3" r="1" fill="currentColor" />
    <circle cx="9.3" cy="12" r="1.15" fill="currentColor" />
    <circle cx="14.7" cy="12" r="1.15" fill="currentColor" />
    <path d="M9.6 15.9h4.8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
  </svg>
)

/** Assistant mode, filled: solid head with the eyes and mouth knocked out. */
export const AssistantIconFilled = ({ size = 24, className }: ModeIconProps) => (
  <svg width={size} height={size} className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path
      fillRule="evenodd"
      d="M7.6 6.4h8.8a3.4 3.4 0 0 1 3.4 3.4v5.6a3.4 3.4 0 0 1-3.4 3.4H7.6a3.4 3.4 0 0 1-3.4-3.4V9.8a3.4 3.4 0 0 1 3.4-3.4Zm1.7 6.8a1.15 1.15 0 1 0 0-2.3 1.15 1.15 0 0 0 0 2.3Zm5.4 0a1.15 1.15 0 1 0 0-2.3 1.15 1.15 0 0 0 0 2.3Zm-4.5 1.5h4.8v1.6H9.6v-1.6Z"
      fill="currentColor"
    />
    <rect x="11.1" y="3.6" width="1.8" height="3.2" rx="0.9" fill="currentColor" />
    <circle cx="12" cy="3" r="1" fill="currentColor" />
  </svg>
)
