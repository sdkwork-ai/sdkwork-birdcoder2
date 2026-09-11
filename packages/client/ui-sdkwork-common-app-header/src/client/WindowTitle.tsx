/**
 * Window-title projector for non-code modes: names the active module in the
 * host window's chrome — the desktop shell's native title bar, the browser tab
 * on the web — and renders nothing. Code mode keeps its Session title inside
 * the conversation surface, so the frame mounts neither this seat nor
 * ui-layout's own browser-title projection.
 */
import { useEffect } from 'react'
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
// Type-only: pulls ui-layout's SlotMap merge ('shell.window-title' owner share).
import type {} from '@deepseek-ai/dsh-client-ui-layout/client'
import { titleKeyForMode } from './mode-titles.ts'

/** Composed props: owner share (mode + product title) and the locale seat. */
export type WindowTitleProps =
  PropsRuntime<'shell.window-title'>
  & PropsLocale<'appHeader'>

/**
 * Project the active module title into the document title — the title the host
 * window's chrome displays — restoring the bare product title on unmount.
 * @param props - composed slot props (owner share + locale seat).
 * @returns No rendered content.
 */
export function WindowTitle({ mode, productTitle, t }: WindowTitleProps): null {
  const title = t(titleKeyForMode(mode))
  useEffect(() => {
    document.title = `${title} — ${productTitle}`
    return () => { document.title = productTitle }
  }, [title, productTitle])
  return null
}
