/**
 * Self-contained 24px Course glyphs in two weights: the outline set for the
 * idle rail entry and the filled set for the rail's active entry — the
 * WeChat-style selection swaps the glyph weight along with the background.
 *
 * The glyph is a mortarboard (graduation cap), the learning-course
 * vocabulary. The shapes beside it in the rail already own the open book
 * (Knowledge Base), the play frame (Video) and the sheet (Document), so the
 * rail has to read the mode from the silhouette alone; a bookmark, a play
 * badge or a second book would not.
 *
 * Both weights share one optical box: 24 grid, 1.8 stroke, round caps and
 * joins, the board, the head band and the tassel at identical coordinates, and
 * at least 2px padding inside the 24 box (3.9 / 2.7 top and sides, 4.1
 * bottom). Only the fill treatment differs, so the swap never moves, scales,
 * or thickens the glyph.
 * Shared icon contract ({size, className}, color rides currentColor).
 */
import type { ModeIconProps } from '@deepseek-ai/dsh-client-ui-sdkwork-app-modes/client'

/** Course mode, outline: hollow mortarboard with its head band and tassel cord. */
export const CourseIcon = ({ size = 24, className }: ModeIconProps) => (
  <svg width={size} height={size} className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false">
    <path d="M12 4.8 3.6 9.4 12 14 20.4 9.4Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
    <path d="M7.1 11.3v4.5a4.9 3.2 0 0 0 9.8 0v-4.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M20.4 9.4v5.2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
  </svg>
)

/** Course mode, filled: solid mortarboard, head band, and tassel cord. */
export const CourseIconFilled = ({ size = 24, className }: ModeIconProps) => (
  <svg width={size} height={size} className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false">
    <path d="M12 4.8 3.6 9.4 12 14 20.4 9.4ZM7.1 10.9v4.9a4.9 3.2 0 0 0 9.8 0v-4.9Z" fill="currentColor" />
    <rect x="19.5" y="9.4" width="1.8" height="6.1" rx="0.9" fill="currentColor" />
  </svg>
)
