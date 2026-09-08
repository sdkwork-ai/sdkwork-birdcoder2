/**
 * Self-contained 24px Markets glyphs in two weights: the outline set for idle
 * rail entries and the page, the filled set for the rail's active entry.
 * Follows the shared icon contract ({size, className}, color rides
 * currentColor).
 */
import type { ModeIconProps } from '@deepseek-ai/dsh-client-ui-sdkwork-app-modes/client'

/** Markets mode, outline: storefront with awning and door. */
export const MarketsIcon = ({ size = 24, className }: ModeIconProps) => (
  <svg width={size} height={size} className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M5 4.5h14l1.6 4.6a2.6 2.6 0 0 1-2.6 2.4 2.6 2.6 0 0 1-2.4-1.6 2.6 2.6 0 0 1-4.8 0A2.6 2.6 0 0 1 8.4 11.5 2.6 2.6 0 0 1 5.8 9.1L5 4.5Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
    <path d="M5.6 11.8v7.3a.9.9 0 0 0 .9.9h11a.9.9 0 0 0 .9-.9v-7.3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    <path d="M9.75 19.9v-5.15a.9.9 0 0 1 .9-.9h2.7a.9.9 0 0 1 .9.9v5.15" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
)

/** Markets mode, filled: solid storefront with the door knocked out. */
export const MarketsIconFilled = ({ size = 24, className }: ModeIconProps) => (
  <svg width={size} height={size} className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path
      fillRule="evenodd"
      d="M5 4.5h14l1.6 4.6c.2.6.3 1.1.3 1.5 0 1.6-1.3 2.9-2.9 2.9-1.05 0-1.97-.56-2.48-1.4A2.9 2.9 0 0 1 13 13.5a2.9 2.9 0 0 1-2-.8 2.9 2.9 0 0 1-2 .8c-.55 0-1.07-.16-1.52-.43A2.9 2.9 0 0 1 5 13.5c-.53 0-1.03-.14-1.45-.39L5 4.5Zm.6 8.1v6.5a.9.9 0 0 0 .9.9h11a.9.9 0 0 0 .9-.9v-6.5a2.9 2.9 0 0 1-2.9-.62 2.9 2.9 0 0 1-2 .77c-.42 0-.83-.09-1.2-.26v5.61a.9.9 0 0 1-.9.9h-2.7a.9.9 0 0 1-.9-.9v-5.61c-.37.17-.78.26-1.2.26-.72 0-1.4-.26-1.9-.75Z"
      fill="currentColor"
    />
  </svg>
)

/** Plugins tab: puzzle piece. */
export const PluginsIcon = ({ size = 24, className }: ModeIconProps) => (
  <svg width={size} height={size} className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M13.6 5.2a2.2 2.2 0 1 1 4.4 0V6h1.6a1.2 1.2 0 0 1 1.2 1.2v3.2h-1.2a2.2 2.2 0 1 0 0 4.4h1.2V18a1.2 1.2 0 0 1-1.2 1.2h-3.2V18a2.2 2.2 0 1 0-4.4 0v1.2H9a1.2 1.2 0 0 1-1.2-1.2v-1.6H7a2.2 2.2 0 1 1 0-4.4h.8V7.2A1.2 1.2 0 0 1 9 6h4.6v-.8Z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
  </svg>
)

/** Experts tab: medal badge with ribbons. */
export const ExpertsIcon = ({ size = 24, className }: ModeIconProps) => (
  <svg width={size} height={size} className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <circle cx="12" cy="9" r="4.6" stroke="currentColor" strokeWidth="1.7" />
    <path d="m9.9 7.9 1.5 1.5 2.7-2.9" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M9.3 12.9 7.8 20l4.2-2.4 4.2 2.4-1.5-7.1" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
)

/** Skills tab: lab flask. */
export const SkillsIcon = ({ size = 24, className }: ModeIconProps) => (
  <svg width={size} height={size} className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M9.7 3.6h4.6M10.4 3.6v5.2l-4.8 8.6A1.9 1.9 0 0 0 7.3 20.2h9.4a1.9 1.9 0 0 0 1.7-2.8l-4.8-8.6V3.6" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M7.9 14.2h8.2" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
  </svg>
)

/** Connectors tab: plug with cord. */
export const ConnectorsIcon = ({ size = 24, className }: ModeIconProps) => (
  <svg width={size} height={size} className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M9.25 3.6v4M14.75 3.6v4" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    <path d="M6.9 7.6h10.2v3.1a5.1 5.1 0 0 1-10.2 0V7.6Z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
    <path d="M12 15.8v1.6a2.9 2.9 0 0 0 5.8 0v-.9" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
  </svg>
)

/** Catalog search affordance glyph. */
export const SearchIcon = ({ size = 24, className }: ModeIconProps) => (
  <svg width={size} height={size} className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <circle cx="11" cy="11" r="6.4" stroke="currentColor" strokeWidth="1.7" />
    <path d="m15.8 15.8 4.2 4.2" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
  </svg>
)

/** The my-catalog affordance glyph. */
export const MineIcon = ({ size = 24, className }: ModeIconProps) => (
  <svg width={size} height={size} className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <circle cx="12" cy="8.4" r="3.7" stroke="currentColor" strokeWidth="1.7" />
    <path d="M5.4 19.6a6.6 6.6 0 0 1 13.2 0" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
  </svg>
)

/** The add trigger's plus glyph. */
export const PlusIcon = ({ size = 24, className }: ModeIconProps) => (
  <svg width={size} height={size} className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M12 5.4v13.2M5.4 12h13.2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
  </svg>
)

/** The add trigger's trailing caret. */
export const CaretDownIcon = ({ size = 24, className }: ModeIconProps) => (
  <svg width={size} height={size} className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="m6.5 9.5 5.5 5.5 5.5-5.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
)

/** The create-plugin menu item's spark glyph. */
export const SparkIcon = ({ size = 24, className }: ModeIconProps) => (
  <svg width={size} height={size} className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M12 4.2 13.9 10l5.9 2-5.9 2-1.9 5.8L10.1 14l-5.9-2 5.9-2L12 4.2Z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
  </svg>
)

/** The upload-skill flows' tray-with-arrow glyph. */
export const UploadIcon = ({ size = 24, className }: ModeIconProps) => (
  <svg width={size} height={size} className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M7.5 8.4V6.6a1.2 1.2 0 0 1 1.2-1.2h6.6a1.2 1.2 0 0 1 1.2 1.2v1.8" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    <rect x="4.2" y="8.4" width="15.6" height="10.8" rx="1.4" stroke="currentColor" strokeWidth="1.7" />
    <path d="M12 15.6V11m0 0-2.1 2.1M12 11l2.1 2.1" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
)
