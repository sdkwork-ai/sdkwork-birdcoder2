/**
 * Transport icons.
 *
 * The transport bar used to lean on `▶`, `❙❙`, `🔊`, `🔇` and `↻`. The first two
 * are text glyphs whose metrics differ per platform, and the emoji ignore
 * `currentColor`, so a muted and an unmuted player disagreed with the rest of the
 * chrome in both themes. These are single-path SVGs on `currentColor` instead,
 * which is what makes the bar look like one control surface rather than three
 * sources of artwork.
 *
 * The playback-rate control stays a text glyph on purpose — that is the house
 * style the Word, PowerPoint and PDF previews already use for their zoom, and a
 * rate is a number a reader wants to read rather than a picture.
 */
import type { ReactNode } from 'react'

/** One icon's geometry, sized by the caller. */
export interface IconProps {
  /** Rendered box in CSS pixels. */
  readonly size?: number
}

/** A filled triangle for the play action. */
export function PlayIcon({ size = 14 }: IconProps): ReactNode {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden="true" focusable="false" fill="currentColor">
      <path d="M4.5 2.6v10.8a.6.6 0 0 0 .92.5l8.4-5.4a.6.6 0 0 0 0-1L5.42 2.1a.6.6 0 0 0-.92.5Z" />
    </svg>
  )
}

/** Two bars for the pause action. */
export function PauseIcon({ size = 14 }: IconProps): ReactNode {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden="true" focusable="false" fill="currentColor">
      <rect x="3.6" y="2.6" width="3.2" height="10.8" rx="1" />
      <rect x="9.2" y="2.6" width="3.2" height="10.8" rx="1" />
    </svg>
  )
}

/** Two triangles against a stop bar, for an audible jump backwards. */
export function SkipBackIcon({ size = 14 }: IconProps): ReactNode {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden="true" focusable="false" fill="currentColor">
      <path d="M8.1 3.4v9.2a.5.5 0 0 1-.78.42L2.6 9.42a.5.5 0 0 1 0-.84l4.72-3.6a.5.5 0 0 1 .78.42Z" />
      <path d="M14.1 3.4v9.2a.5.5 0 0 1-.78.42L8.6 9.42a.5.5 0 0 1 0-.84l4.72-3.6a.5.5 0 0 1 .78.42Z" />
      <rect x="1" y="2.6" width="1.6" height="10.8" rx="0.8" />
    </svg>
  )
}

/** The same pair facing the other way. */
export function SkipForwardIcon({ size = 14 }: IconProps): ReactNode {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden="true" focusable="false" fill="currentColor">
      <path d="M1.9 3.4v9.2a.5.5 0 0 0 .78.42l4.72-3.6a.5.5 0 0 0 0-.84L2.68 2.98a.5.5 0 0 0-.78.42Z" />
      <path d="M7.9 3.4v9.2a.5.5 0 0 0 .78.42l4.72-3.6a.5.5 0 0 0 0-.84L8.68 2.98a.5.5 0 0 0-.78.42Z" />
      <rect x="13.4" y="2.6" width="1.6" height="10.8" rx="0.8" />
    </svg>
  )
}

/** A speaker with two sound arcs. */
export function VolumeIcon({ size = 14 }: IconProps): ReactNode {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
      <path d="M8.4 3.1 4.9 6H2.5v4h2.4l3.5 2.9V3.1Z" fill="currentColor" strokeWidth="1.1" />
      <path d="M11.4 6.1a2.8 2.8 0 0 1 0 3.8" />
      <path d="M13.3 4.2a5.4 5.4 0 0 1 0 7.6" />
    </svg>
  )
}

/** The same speaker with a stroke through it. */
export function VolumeMutedIcon({ size = 14 }: IconProps): ReactNode {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
      <path d="M8.4 3.1 4.9 6H2.5v4h2.4l3.5 2.9V3.1Z" fill="currentColor" strokeWidth="1.1" />
      <path d="m11.3 6.4 3.2 3.2M14.5 6.4l-3.2 3.2" />
    </svg>
  )
}

/** A closed circular arrow for the loop toggle. */
export function LoopIcon({ size = 14 }: IconProps): ReactNode {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 8a5 5 0 0 1 5-5h4.2" />
      <path d="m10.6 1.2 2 1.8-2 1.8" />
      <path d="M13 8a5 5 0 0 1-5 5H3.8" />
      <path d="m5.4 14.8-2-1.8 2-1.8" />
    </svg>
  )
}
