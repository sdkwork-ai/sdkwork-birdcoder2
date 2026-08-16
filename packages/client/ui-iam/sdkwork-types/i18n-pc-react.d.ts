/**
 * Declaration facade for `@sdkwork/i18n-pc-react` — the i18n provider the
 * auth surfaces need. The EMIT project resolves this facade instead of the
 * sdkwork source; the TESTS project checks against the real package. Keep
 * the two in step.
 */

import type { ReactNode } from 'react'

/** Message catalog (opaque to consumers). */
export interface SdkworkMessageCatalog {
  defaultLocale?: string
  locales?: Record<string, unknown>
  namespace?: string
}

/** The i18n provider's props. */
export interface SdkworkI18nProviderProps {
  catalogs?: readonly SdkworkMessageCatalog[]
  children?: ReactNode
  config?: Record<string, unknown>
  defaultVariables?: Readonly<Record<string, unknown>>
  locale?: string | null
  syncDocumentLanguage?: boolean
}

export function SdkworkI18nProvider(props: SdkworkI18nProviderProps): ReactNode
