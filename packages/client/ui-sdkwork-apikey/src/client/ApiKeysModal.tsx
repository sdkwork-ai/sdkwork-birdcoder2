/**
 * API key management modal: the independent wide modal surface over the
 * cloudrouter console's ApiKeysView, opened from the settings-menu popover's
 * "API Key 管理" row. The key table needs more width than the settings panel
 * (which is why this is not a `settings.section` page), so the panel is
 * 80vw-centered. Renders nothing while closed — the settings-menu shell keeps
 * the seat mounted across the menu's lifetime. Close paths: the header
 * button, a mask click, and Escape.
 *
 * The view speaks react-i18next while the host speaks the LocaleRuntime, so
 * the global react-i18next singleton is initialized with the vendored
 * console catalog (see consoleApiKeysI18n.ts) and its language follows the
 * host's active locale (zh → zh-CN, en → en-US) reactively. All child
 * surfaces — including the fixed-position drawers and portaled popovers the
 * view renders — resolve keys against the same singleton.
 */

import { useEffect, useRef, useSyncExternalStore, type ReactNode } from 'react'
import { IconCloseOutline16 } from '@deepseek-ai/dsh-client-ui-primitives'
import { ApiKeysView } from '@sdkwork/cloudrouter-pc-console-api-keys'
import type { ApiKeyHost } from './apikeyHost.ts'
import { ensureConsoleApiKeysI18n } from './consoleApiKeysI18n.ts'
import type { ApiKeyKey } from './locales.ts'
import css from './ApiKeysModal.module.css'

/**
 * Minimal locale face the modal consumes. Structural on purpose: the injected
 * value is the locale service closure-wrapped at the inject site, because
 * React invokes the useSyncExternalStore members unbound and the service's
 * getSnapshot reads `this.snapshot`.
 */
export interface ApiKeyLocaleFace {
  /** Current immutable locale snapshot; stable reference between changes. */
  getSnapshot(): { active: string }
  /** Observe snapshot changes (locale switches, dictionary registrations). */
  subscribe(listener: () => void): () => void
}

/** Modal component props: the owner visibility share plus the injected seat. */
export interface ApiKeysModalProps {
  open: boolean
  onClose: () => void
  host: ApiKeyHost
  locale: ApiKeyLocaleFace
  t: (key: ApiKeyKey) => string
}

/** Wide independent modal hosting the embedded API key management view. */
export function ApiKeysModal({ open, onClose, host, locale, t }: ApiKeysModalProps): ReactNode {
  const titleId = 'ui-sdkwork-apikeys-modal-title'

  // The host locale, read through the uSES-safe snapshot pair so a language
  // switch re-runs the i18n effect below with the mapped cloudrouter locale.
  const localeSnapshot = useSyncExternalStore(locale.subscribe, locale.getSnapshot)

  // Follow the host locale across switches. The singleton itself is
  // initialized at module load (see consoleApiKeysI18n.ts), so the first
  // render already resolves keys.
  useEffect(() => {
    ensureConsoleApiKeysI18n(localeSnapshot.active)
  }, [localeSnapshot.active])

  // Escape closes while mounted-and-open; the mask click path is declarative.
  useEffect(() => {
    if (!open) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => { document.removeEventListener('keydown', onKeyDown) }
  }, [open, onClose])

  // Baseline focus management: entering the dialog lands on the close button.
  const closeButton = useRef<HTMLButtonElement | null>(null)
  useEffect(() => {
    if (open) closeButton.current?.focus()
  }, [open])

  if (!open) return null

  return (
    <div className={css.overlay} role="presentation">
      <div className={css.mask} aria-hidden="true" onClick={onClose} />
      <div className={css.panel} role="dialog" aria-modal="true" aria-labelledby={titleId} data-apikeys-modal="true">
        <div className={css.header}>
          <div className={css.heading}>
            <div id={titleId} className={css.title}>{t('section.title')}</div>
            <div className={css.description}>{t('section.description')}</div>
          </div>
          <button ref={closeButton} type="button" className={css.close} onClick={onClose} aria-label={t('close')}>
            <IconCloseOutline16 size={14} />
          </button>
        </div>
        <div className={css.body} data-apikeys-embed={host.readReady() ? 'ready' : 'unconfigured'}>
          {host.readReady()
            ? <ApiKeysView />
            : <div className={css.notice}>{t('section.notConfigured')}</div>}
        </div>
      </div>
    </div>
  )
}
