/**
 * Narrow cloudrouter console i18n slice for the API-key embed: registers the
 * vendored api-keys messages (en + zh only — the full
 * `@sdkwork/cloudrouter-pc-i18n` catalog would drag every console surface's
 * messages into the bundle) onto the GLOBAL react-i18next singleton. See
 * consoleApiKeysMessages.ts for the vendoring rationale.
 *
 * Why the global singleton instead of a scoped `SdkworkI18nProvider`: the
 * console view renders portaled/fixed overlays (CreateKeyDrawer,
 * GroupCellPopover, quick-import dialogs) and shared commons components
 * (GroupPicker) that all consume plain `useTranslation()`. Every consumer
 * must resolve against one instance regardless of where it mounts, and a
 * provider-owned instance risks stale-instance subscriptions when the
 * provider re-creates it. Initializing the global instance is idempotent and
 * I18N_SPEC-conformant: the embed consumes the injected host locale through
 * one bootstrap-style registration, never browser/cookie negotiation.
 */
import i18next, { type i18n as I18nInstance } from 'i18next'
import { initReactI18next } from 'react-i18next'
import { consoleApiKeysMessages } from './consoleApiKeysMessages.ts'

/** The cloudrouter console catalogs use one flat namespace. */
const CONSOLE_API_KEYS_NAMESPACE = 'translation'

/** Map the host locale id onto the cloudrouter catalog's locale ids. */
export function cloudRouterLocale(hostLocale: string): string {
  return hostLocale === 'zh' ? 'zh-CN' : 'en-US'
}

const CONSOLE_API_KEYS_RESOURCES = {
  'en-US': { [CONSOLE_API_KEYS_NAMESPACE]: consoleApiKeysMessages.en },
  'zh-CN': { [CONSOLE_API_KEYS_NAMESPACE]: consoleApiKeysMessages.zh },
} as const

let initialized = false

/**
 * Idempotently register the api-keys catalog on the global react-i18next
 * singleton and apply `language`. First call initializes (synchronously, so
 * the first render already resolves keys); later calls only changeLanguage —
 * re-init would wipe subscribers' language state.
 */
export function ensureConsoleApiKeysI18n(language: string): I18nInstance {
  if (!initialized) {
    void i18next.use(initReactI18next).init({
      defaultNS: CONSOLE_API_KEYS_NAMESPACE,
      fallbackLng: 'en-US',
      // Flat dotted keys: disable the default '.'/':' separators so lookups
      // hit the flat catalog directly instead of relying on i18next's
      // ignoreJSONStructure fallback.
      initAsync: false,
      interpolation: {
        defaultVariables: { platformName: 'BirdCoder' },
        escapeValue: false,
      },
      keySeparator: false,
      lng: cloudRouterLocale(language),
      ns: [CONSOLE_API_KEYS_NAMESPACE],
      nsSeparator: false,
      resources: CONSOLE_API_KEYS_RESOURCES,
      returnNull: false,
      supportedLngs: ['en-US', 'zh-CN'],
    })
    initialized = true
    return i18next
  }
  void i18next.changeLanguage(cloudRouterLocale(language))
  return i18next
}

// Initialize at module-load time, not in a render effect: every
// useTranslation() consumer (drawers, dialogs, commons components) must
// never observe the uninitialized singleton, not even for one render. The
// modal effect corrects the language to the host locale right after.
ensureConsoleApiKeysI18n('en-US')
