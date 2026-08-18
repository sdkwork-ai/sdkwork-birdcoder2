/**
 * The image generation page: the center-column surface for the `image` mode,
 * keyed into the frame's `mode.page` slot. Mounts the SDKWork Agents creative
 * (生成) PC surface through this plugin's host adapter.
 */
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
// Type-only: pulls ui-layout's SlotMap merge ('mode.page' owner share).
import type {} from '@deepseek-ai/dsh-client-ui-layout/client'
import { CreativeApp } from './creativeHost.ts'
import css from './GenerationsPage.module.css'

/** Injected business face: which mode this keyed entry renders. */
export interface ImageGenerationsPageInjected {
  /** The page's own mode id (the keyed registration's key). */
  mode: 'image'
}

/** Full component props: runtime share + injected mode + the locale seat. */
export type ImageGenerationsPageProps =
  PropsRuntime<'mode.page'>
  & ImageGenerationsPageInjected
  & PropsLocale<'generationsImage'>

/**
 * Render the SDKWork Agents creative (生成) page.
 * @param props - composed slot props (contract share + injected mode + locale seat).
 * @returns the page element tree.
 */
export function ImageGenerationsPage({ mode }: ImageGenerationsPageProps) {
  return (
    <div className={css.page} data-creative-surface="sdkwork" data-mode={mode} data-mode-page={mode}>
      <CreativeApp />
    </div>
  )
}
