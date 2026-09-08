/**
 * Self-contained 24px Pull Request glyphs in two weights: the outline set for
 * idle rail entries and the page, the filled set for the rail's active entry.
 * Follows the shared icon contract ({size, className}, color rides
 * currentColor).
 */
import type { ModeIconProps } from '@deepseek-ai/dsh-client-ui-sdkwork-app-modes/client'

/** Pull Request mode, outline: git branch with its two heads and the trunk commit. */
export const PullRequestIcon = ({ size = 24, className }: ModeIconProps) => (
  <svg width={size} height={size} className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <circle cx="6.5" cy="6" r="2.4" stroke="currentColor" strokeWidth="1.8" />
    <circle cx="6.5" cy="18" r="2.4" stroke="currentColor" strokeWidth="1.8" />
    <circle cx="17.5" cy="18" r="2.4" stroke="currentColor" strokeWidth="1.8" />
    <path d="M6.5 8.4v7.2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    <path d="M17.5 15.6V12a4 4 0 0 0-4-4h-2.6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    <path d="m13.2 5.6-2.5 2.4 2.5 2.4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
)

/** Pull Request mode, filled: solid commits with the merge path as a bar. */
export const PullRequestIconFilled = ({ size = 24, className }: ModeIconProps) => (
  <svg width={size} height={size} className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <circle cx="6.5" cy="6" r="3.2" fill="currentColor" />
    <circle cx="6.5" cy="18" r="3.2" fill="currentColor" />
    <circle cx="17.5" cy="18" r="3.2" fill="currentColor" />
    <path d="M5.6 8.4h1.8v7.2H5.6z" fill="currentColor" />
    <path d="M16.6 15.6h1.8V12a4.9 4.9 0 0 0-4.9-4.9h-1.7V5.3h1.7a6.7 6.7 0 0 1 6.7 6.7v3.6h-1.8z" fill="currentColor" />
  </svg>
)
