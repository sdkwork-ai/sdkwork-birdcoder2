/**
 * SDKWork extension icons that are not part of the upstream deepseek icon
 * set: the official `@deepseek-ai/dsh-client-ui-primitives` icons package
 * stays byte-identical to upstream, so these three glyphs live here (the
 * settings menu's own module) and are re-used by sibling SDKWork packages.
 * @module @deepseek-ai/dsh-client-ui-sdkwork-settings-menu/sdkwork-icons
 */

import type { CSSProperties } from 'react'

interface SdkworkIconProps {
  /** Rendered width and height in px. */
  size?: number
  /** Optional class name. */
  className?: string
  /** Optional inline style. */
  style?: CSSProperties
}

/** ic_ds_logout_outline_14: door panel + handle + arrow exiting right. */
export function IconLogoutOutline14({ size = 14, className, style }: SdkworkIconProps) {
  return (
    <svg width={size} height={size} className={className} style={style} viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <path
        d="M2 2.5H5.5V5.8H4.3V8.2H5.5V11.5H2C1.72 11.5 1.5 11.28 1.5 11V3C1.5 2.72 1.72 2.5 2 2.5Z"
        fill="currentColor"
      />
      <path d="M3.7 6.3H4.3V7.7H3.7V6.3Z" fill="currentColor" />
      <path d="M4.4 6.3H9.6V7.7H4.4V6.3Z" fill="currentColor" />
      <path d="M9.6 4.2L12.7 7L9.6 9.8V4.2Z" fill="currentColor" />
    </svg>
  )
}

/** ic_ds_crown_outline_16: three-peak crown with orbs and a pedestal bar. */
export function IconCrownOutline16({ size = 16, className, style }: SdkworkIconProps) {
  return (
    <svg width={size} height={size} className={className} style={style} viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <path
        d="M2.2 6.6L5.3 4.4L7.4 7.2L9.6 4.4L12.7 6.6L12.5 10.7H2.4L2.2 6.6Z"
        fill="currentColor"
      />
      <path d="M2.5 11.5H13.5V12.7H2.5V11.5Z" fill="currentColor" />
      <circle cx="5.3" cy="4.4" r="1.05" fill="currentColor" />
      <circle cx="9.6" cy="4.4" r="1.05" fill="currentColor" />
    </svg>
  )
}

/** ic_ds_coin_outline_16: circular coin with a currency glyph. */
export function IconCoinOutline16({ size = 16, className, style }: SdkworkIconProps) {
  return (
    <svg width={size} height={size} className={className} style={style} viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M8 1.4C4.35 1.4 1.4 4.35 1.4 8C1.4 11.65 4.35 14.6 8 14.6C11.65 14.6 14.6 11.65 14.6 8C14.6 4.35 11.65 1.4 8 1.4ZM8 3.5C5.51 3.5 3.5 5.51 3.5 8C3.5 10.49 5.51 12.5 8 12.5C10.49 12.5 12.5 10.49 12.5 8C12.5 5.51 10.49 3.5 8 3.5Z"
        fill="currentColor"
      />
      <path d="M7.45 5.7H8.55V11.4H7.45V5.7Z" fill="currentColor" />
      <path d="M5.2 6.2L7.45 8.6V9.5L4.8 6.9L5.2 6.2Z" fill="currentColor" />
      <path d="M10.8 6.2L8.55 8.6V9.5L11.2 6.9L10.8 6.2Z" fill="currentColor" />
      <path d="M6.1 10.2H9.9V11.1H6.1V10.2Z" fill="currentColor" />
    </svg>
  )
}
