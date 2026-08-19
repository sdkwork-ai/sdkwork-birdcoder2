/**
 * Shared app header for non-code modes: a drag-region title bar above every
 * mode page so desktop window controls no longer overlap module content.
 * Code mode keeps its session header inside the conversation surface.
 */
import type { PropsLocale, PropsRenderSlots, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
// Type-only: pulls ui-layout's SlotMap merge ('shell.app-header' owner share).
import type {} from '@deepseek-ai/dsh-client-ui-layout/client'
import { platformOf, titleKeyForMode } from './platform.ts'
import css from './AppHeader.module.css'

/** Injected business face: host platform and desktop bridge presence. */
export interface AppHeaderInjected {
  /** Whether the Electron preload exposes window controls (desktop only). */
  hasWindowControls: boolean
  /** The host OS's window-control convention set (spacer metrics). */
  platform: ReturnType<typeof platformOf>
}

/** Full component props: runtime share + owner share + render share + locale + inject. */
export type AppHeaderProps =
  PropsRuntime<'shell.app-header'>
  & PropsRenderSlots<'shell.app-header.leading' | 'shell.app-header.actions'>
  & PropsLocale<'appHeader'>
  & AppHeaderInjected

/**
 * Render the shared app header for a non-code mode page.
 * @param props - composed slot props (owner share + render slots + locale + inject).
 * @returns the header element tree.
 */
export function AppHeader({
  mode,
  hasWindowControls,
  platform,
  t,
  renderSlot,
}: AppHeaderProps) {
  return (
    <header className={css.header} data-platform={platform} data-mode={mode}>
      <div className={css.row}>
        <div className={css.leading}>
          {renderSlot('shell.app-header.leading', {}, { entryKey: mode })}
          <h1 className={css.title}>{t(titleKeyForMode(mode))}</h1>
        </div>
        <div className={css.trailing}>
          {renderSlot('shell.app-header.actions', {})}
          {hasWindowControls && (
            <span className={css.controlsSpacer} data-platform={platform} aria-hidden="true" />
          )}
        </div>
      </div>
    </header>
  )
}
