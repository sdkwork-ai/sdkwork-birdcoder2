/**
 * Transport icons.
 *
 * The transport bar used to lean on `▶`, `❙❙`, `🔊` and `🔇`. The first two are
 * text glyphs whose metrics differ per platform, and the last two are colour
 * emoji: they ignore `currentColor`, so a muted and an unmuted player disagreed
 * with the rest of the chrome in both themes. These are single-path SVGs on
 * `currentColor` instead, which is what makes the bar look like one control
 * surface rather than three sources of artwork.
 *
 * The zoom controls stay text glyphs on purpose — that is the house style the
 * Word, PowerPoint and PDF previews already use for theirs.
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

/** Four outward corners for the fullscreen action. */
export function FullscreenIcon({ size = 14 }: IconProps): ReactNode {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2.5 6V2.5H6M10 2.5h3.5V6M13.5 10v3.5H10M6 13.5H2.5V10" />
    </svg>
  )
}

/** Four inward corners for leaving fullscreen. */
export function ExitFullscreenIcon({ size = 14 }: IconProps): ReactNode {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 2.5V6H2.5M13.5 6H10V2.5M10 13.5V10h3.5M2.5 10H6v3.5" />
    </svg>
  )
}

/** A picture inside a frame, for the picture-in-picture action. */
export function PictureInPictureIcon({ size = 14 }: IconProps): ReactNode {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
      <rect x="1.8" y="3" width="12.4" height="10" rx="1.6" />
      <rect x="8.2" y="8" width="4.6" height="3.6" rx="0.8" fill="currentColor" />
    </svg>
  )
}
