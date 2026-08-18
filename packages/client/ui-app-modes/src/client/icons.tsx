/**
 * Self-contained 24px glyphs for the base app modes, in two weights: the
 * outline set (stroke) for idle rail entries and the placeholder pages, and
 * the filled set (solid) for the rail's active entry — the WeChat-style
 * selection swaps the glyph weight along with the background. The
 * design-system icon set (ui-primitives) has no Work vocabulary, so the rail
 * owns its glyphs; they follow the shared icon contract ({size, className},
 * color rides currentColor) so swapping in library icons later is local.
 */
import type { FC } from 'react'
import type { BaseAppModeId } from './base-modes.ts'

/** Shared props for every mode glyph. */
export interface ModeIconProps {
  /** Square edge in px. */
  size?: number | undefined
  /** Extra class for layout placement; color rides currentColor. */
  className?: string | undefined
}

/** Code mode, outline: chevron pair (`</>`). */
export const CodeIcon = ({ size = 24, className }: ModeIconProps) => (
  <svg width={size} height={size} className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M9 7.5 4.75 12 9 16.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M15 7.5 19.25 12 15 16.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
)

/** Code mode, filled: solid chevron brackets (the canonical code glyph). */
export const CodeIconFilled = ({ size = 24, className }: ModeIconProps) => (
  <svg width={size} height={size} className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M9.4 16.6 4.8 12l4.6-4.6L10.8 8.8 7.6 12l3.2 3.2-1.4 1.4Zm5.2 0-1.4-1.4 3.2-3.2-3.2-3.2 1.4-1.4L19.2 12l-4.6 4.6Z" fill="currentColor" />
  </svg>
)

/** Work mode, outline: briefcase. */
export const WorkIcon = ({ size = 24, className }: ModeIconProps) => (
  <svg width={size} height={size} className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect x="3.5" y="7.5" width="17" height="12.5" rx="2.5" stroke="currentColor" strokeWidth="1.8" />
    <path d="M9 7.5V6.25A2.25 2.25 0 0 1 11.25 4h1.5A2.25 2.25 0 0 1 15 6.25V7.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    <path d="M3.5 12.75h17" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
  </svg>
)

/** Work mode, filled: solid briefcase with the handle knocked out. */
export const WorkIconFilled = ({ size = 24, className }: ModeIconProps) => (
  <svg width={size} height={size} className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path
      fillRule="evenodd"
      d="M20 6h-4V4c0-1.11-.89-2-2-2h-4c-1.11 0-2 .89-2 2v2H4c-1.11 0-1.99.89-1.99 2L2 19c0 1.11.89 2 2 2h16c1.11 0 2-.89 2-2V8c0-1.11-.89-2-2-2Zm-6 0h-4V4h4v2Z"
      fill="currentColor"
    />
  </svg>
)

/** Mode id → outline glyph map (idle rail entries and placeholder pages). */
export const MODE_ICONS: Record<BaseAppModeId, FC<ModeIconProps>> = {
  code: CodeIcon,
  work: WorkIcon,
}

/** Mode id → filled glyph map (the rail's active entry). */
export const MODE_ICONS_FILLED: Record<BaseAppModeId, FC<ModeIconProps>> = {
  code: CodeIconFilled,
  work: WorkIconFilled,
}
