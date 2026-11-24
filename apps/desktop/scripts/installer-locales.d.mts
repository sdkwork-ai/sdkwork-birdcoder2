/** One installer language's compiler identifier, UI strings and NSIS Modern UI test expectations. */
export interface InstallerLocale {
  /** electron-builder language and resource filename without its suffix. */
  id: string
  /** NSIS LANG_ constant suffix. */
  nsisLanguage: string
  /** Custom installer messages, with Windows printf placeholders preserved. */
  strings: Record<string, string>
  /** Substrings of the upstream Modern UI uninstaller's welcome and finished pages. */
  uninstaller: Record<string, string>
}

/**
 * Read complete per-language JSON resources and reject inconsistent keys or placeholders.
 * @param directory - Resource directory, defaulting to Desktop installer/locales.
 * @returns Validated resources, ordered by filename.
 */
export function readInstallerLocales(directory?: string): InstallerLocale[]

/** Token the language resources carry where the product name belongs. */
export const PRODUCT_TOKEN: '{product}'
/** Product name the shipped brand renders; the default when a caller selects no brand. */
export const SHIPPED_PRODUCT_NAME: 'BirdCoder'
/** Generated header the native installer helper includes for its product name. */
export const PRODUCT_HEADER_FILENAME: 'installer-product.h'
/** Checked-in header that includes the generated one, or the shipped name when absent. */
export const PRODUCT_HEADER_TEMPLATE: 'installer-product-name.h'

/**
 * Generate NSIS LangString declarations from validated resources.
 * @param locales - All configured languages or one isolated native-test language.
 * @param productName - Product name every `{product}` token renders; the shipped brand when omitted.
 * @returns UTF-8 NSIS source with literal text escaped.
 */
export function renderInstallerStrings(locales: InstallerLocale[], productName?: string): string

/**
 * Render the native helper's product-name header.
 * @param productName - Product name the restart banner and report headers use; the shipped brand when omitted.
 * @returns UTF-8 C++ header source.
 */
export function renderInstallerProductHeader(productName?: string): string
