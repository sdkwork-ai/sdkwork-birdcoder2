/**
 * Self-contained 24px Automation glyphs in two weights: the outline set for
 * idle rail entries and the page, the filled set for the rail's active entry.
 * Follows the shared icon contract ({size, className}, color rides
 * currentColor).
 */
import type { ModeIconProps } from '@deepseek-ai/dsh-client-ui-sdkwork-app-modes/client'

/** Automation mode, outline: clock dial with square-cut hands. */
export const AutomationIcon = ({ size = 24, className }: ModeIconProps) => (
  <svg width={size} height={size} className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <circle cx="12" cy="12.75" r="7.75" stroke="currentColor" strokeWidth="1.8" />
    <path d="M12 8.75v4l3 2.2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M9.75 3.25h4.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
  </svg>
)

/** Automation mode, filled: solid dial with knocked-out hands and stem. */
export const AutomationIconFilled = ({ size = 24, className }: ModeIconProps) => (
  <svg width={size} height={size} className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path
      fillRule="evenodd"
      d="M9.75 2.35h4.5a.9.9 0 0 1 0 1.8h-.955a8.65 8.65 0 1 1-2.59 0H9.75a.9.9 0 0 1 0-1.8ZM12 7.85a.9.9 0 0 1 .9.9v3.62l2.68 1.96a.9.9 0 1 1-1.06 1.45l-3.02-2.2a.9.9 0 0 1-.4-.75V8.75a.9.9 0 0 1 .9-.9Z"
      fill="currentColor"
    />
  </svg>
)

/** Run history: dated rows (the runs tab and its empty state). */
export const RunsIcon = ({ size = 24, className }: ModeIconProps) => (
  <svg width={size} height={size} className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M9.25 6.25h10M9.25 12h10M9.25 17.75h10" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    <path d="M4.4 5.4l1.1 1.1 2-2.1" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    <circle cx="5.4" cy="12" r="1.15" fill="currentColor" />
    <circle cx="5.4" cy="17.75" r="1.15" fill="currentColor" />
  </svg>
)

/** Empty scheduled-tasks state: alarm clock with a knocked-out check. */
export const AlarmCheckIcon = ({ size = 24, className }: ModeIconProps) => (
  <svg width={size} height={size} className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <circle cx="12" cy="13.25" r="7.15" stroke="currentColor" strokeWidth="1.7" />
    <path d="M9.4 13.55l2 2 3.5-4" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M4.9 6.4 7.3 4.3M19.1 6.4l-2.4-2.1M6.4 19.6 5.1 20.9M17.6 19.6l1.3 1.3" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
  </svg>
)

/** The add-automation affordance glyph. */
export const PlusIcon = ({ size = 24, className }: ModeIconProps) => (
  <svg width={size} height={size} className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M12 5.25v13.5M5.25 12h13.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
  </svg>
)
