/**
 * Self-contained 24px Knowledge Base glyphs in two weights: the outline set
 * for idle rail entries and the page, the filled set for the rail's active
 * entry. Follows the shared icon contract ({size, className}, color rides
 * currentColor).
 */
import type { ModeIconProps } from '@deepseek-ai/dsh-client-ui-app-modes/client'

/** Knowledge Base mode, outline: open book. */
export const KnowledgeIcon = ({ size = 24, className }: ModeIconProps) => (
  <svg width={size} height={size} className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M12 7.5 6 6v12l6 1.5 6-1.5V6l-6 1.5Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
    <path d="M12 7.5v12" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
  </svg>
)

/** Knowledge Base mode, filled: solid open book with the spine knocked out. */
export const KnowledgeIconFilled = ({ size = 24, className }: ModeIconProps) => (
  <svg width={size} height={size} className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path
      fillRule="evenodd"
      d="M12 7.5 6 6v12l6 1.5 6-1.5V6l-6 1.5ZM11.4 7.9h1.2v11.4h-1.2V7.9Z"
      fill="currentColor"
    />
  </svg>
)
