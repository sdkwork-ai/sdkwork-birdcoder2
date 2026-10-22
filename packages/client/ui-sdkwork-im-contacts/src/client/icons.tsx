/**
 * Self-contained 24px contacts glyphs in two weights: the outline set for the
 * idle rail entry and the filled set for the active one. They follow the
 * shared icon contract ({size, className}, color rides currentColor).
 */
import type { ModeIconProps } from '@deepseek-ai/dsh-client-ui-sdkwork-app-modes/client'

/** Contacts mode, outline: address book with a person. */
export const ContactsIcon = ({ size = 24, className }: ModeIconProps) => (
  <svg width={size} height={size} className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect x="5" y="3.5" width="13" height="17" rx="2.25" stroke="currentColor" strokeWidth="1.8" />
    <path d="M5 7.5h2.25M5 12h2.25M5 16.5h2.25" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    <circle cx="12.2" cy="10" r="2" stroke="currentColor" strokeWidth="1.8" />
    <path d="M8.9 16.4a3.4 3.4 0 0 1 6.6 0" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
  </svg>
)

/** Contacts mode, filled: solid book with the person knocked out. */
export const ContactsIconFilled = ({ size = 24, className }: ModeIconProps) => (
  <svg width={size} height={size} className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path
      fillRule="evenodd"
      d="M7.25 3.5h8.5A2.25 2.25 0 0 1 18 5.75v12.5a2.25 2.25 0 0 1-2.25 2.25h-8.5A2.25 2.25 0 0 1 5 18.25V5.75A2.25 2.25 0 0 1 7.25 3.5Zm4.95 8.25a2 2 0 1 0 0-4 2 2 0 0 0 0 4Zm-3.3 4.65a3.4 3.4 0 0 1 6.6 0 .75.75 0 0 1-.75.75H9.65a.75.75 0 0 1-.75-.75Z"
      fill="currentColor"
    />
    <path d="M3.5 7.5H4.4v1.8H3.5zM3.5 11.1H4.4v1.8H3.5zM3.5 14.7H4.4v1.8H3.5z" fill="currentColor" />
  </svg>
)
