/**
 * API key management modal: the wide management surface over the cloudrouter
 * console's ApiKeysView, opened from the settings-menu popover's "中转站 API Key
 * 管理" row. The key table needs more width than the settings panel (which is
 * why this is not a `settings.section` page), so the shared `WideModal` gives it
 * 90% of the viewport. Renders nothing while closed — the settings-menu shell
 * keeps the seat mounted across the menu's lifetime. Close paths: the header
 * button, a mask click, and Escape.
 *
 * Creating and editing a key are the embedded view's own left-side drawers;
 * they open above this panel because they render inside it, and the view's
 * body-portaled popovers are lifted by `apiKeysView.css`.
 *
 * The view speaks react-i18next while the host speaks the LocaleRuntime, so
 * the global react-i18next singleton is initialized with the vendored
 * console catalog (see consoleApiKeysI18n.ts) and its language follows the
 * host's active locale (zh → zh-CN, en → en-US) reactively. All child
 * surfaces — including the fixed-position drawers and portaled popovers the
 * view renders — resolve keys against the same singleton.
 */

import { useEffect, useSyncExternalStore, type ReactNode } from 'react'
import { WideModal } from '@deepseek-ai/dsh-client-ui-primitives'
import { ApiKeysView } from '@sdkwork/cloudrouter-pc-console-api-keys'
import type { ApiKeyHost } from './apikeyHost.ts'
import { ensureConsoleApiKeysI18n } from './consoleApiKeysI18n.ts'
import { APIKEY_EMBED_ATTRIBUTE, APIKEY_EMBED_PORTAL_ATTRIBUTE } from './embedScope.ts'
import type { ApiKeyKey } from './locales.ts'
import css from './ApiKeysModal.module.css'
// The per-plugin Tailwind sheet (token-plan precedent): compiles the
// console view's utility classes — including every dark: variant — into a
// <style data-plugin-css> tag injected when this bundle loads. The packaged
// app's shell sheet does not scan the cloudrouter checkout, so without this
// import the view renders with zero utility classes. The build's
// dsh-apikey-tailwind-css plugin claims this file, emits the compiled CSS, and
// contains it in the embed scope (see embedScope.ts).
import './apiKeysView.css'

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

/** Wide management modal hosting the embedded API key management view. */
export function ApiKeysModal({ open, onClose, host, locale, t }: ApiKeysModalProps): ReactNode {
  // The host locale, read through the uSES-safe snapshot pair so a language
  // switch re-runs the i18n effect below with the mapped cloudrouter locale.
  // The injected face is closure-wrapped, so both members are receiver-free.
  // oxlint-disable-next-line typescript/unbound-method -- closure-wrapped service face
  const localeSnapshot = useSyncExternalStore(locale.subscribe, locale.getSnapshot)

  // Follow the host locale across switches. The singleton itself is
  // initialized at module load (see consoleApiKeysI18n.ts), so the first
  // render already resolves keys.
  useEffect(() => {
    ensureConsoleApiKeysI18n(localeSnapshot.active)
  }, [localeSnapshot.active])

  // The console view portals its group popover, group picker, and quick-import
  // menu to `document.body`, outside the embed root the plugin's scoped
  // stylesheet targets. Marking the body for the modal's open lifetime
  // activates that sheet's body-rooted scope — `body[data-apikeys-embed-portal]
  // to (#root)` — which is what reaches those overlays and stops at the
  // application mount the modal covers.
  useEffect(() => {
    if (!open) return
    document.body.setAttribute(APIKEY_EMBED_PORTAL_ATTRIBUTE, '')
    return () => { document.body.removeAttribute(APIKEY_EMBED_PORTAL_ATTRIBUTE) }
  }, [open])

  return (
    <WideModal
      open={open}
      onClose={onClose}
      title={t('section.title')}
      description={t('section.description')}
      closeLabel={t('close')}
    >
      <div
        className={css.embed}
        {...{ [APIKEY_EMBED_ATTRIBUTE]: host.readReady() ? 'ready' : 'unconfigured' }}
      >
        {host.readReady()
          ? <ApiKeysView />
          : <div className={css.notice}>{t('section.notConfigured')}</div>}
      </div>
    </WideModal>
  )
}
