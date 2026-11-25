/** Per-language JSON resources shared by NSIS packaging, native UI tests and the i18n check. */
import { readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const defaultDirectory = fileURLToPath(new URL('../installer/locales/', import.meta.url))

/** Token the language resources carry where the product name belongs. */
export const PRODUCT_TOKEN = '{product}'
/** Product name the shipped brand renders; the default for a caller that selects no brand. */
export const SHIPPED_PRODUCT_NAME = 'BirdCoder'
/** Generated header the native installer helper includes for the product name. */
export const PRODUCT_HEADER_FILENAME = 'installer-product.h'
/** Header directory the native helper reads; `installer-product-name.h` falls back when absent. */
export const PRODUCT_HEADER_TEMPLATE = 'installer-product-name.h'

/**
 * Read and validate installer translations before generating compiler input.
 * @param {string} directory - Directory containing one JSON file per installer language.
 * @returns {{id: string, nsisLanguage: string, strings: Record<string, string>, uninstaller: Record<string, string>}[]} Complete language resources.
 */
export function readInstallerLocales(directory = defaultDirectory) {
  const locales = readdirSync(directory).filter(name => name.endsWith('.json')).sort((a, b) =>
    a === 'en_US.json' ? -1 : b === 'en_US.json' ? 1 : a.localeCompare(b)).map(name => {
    if (!/^[a-z]{2}_[A-Z]{2}\.json$/u.test(name)) throw new Error(`${name}: invalid installer language filename`)
    /** @type {unknown} */
    const resource = JSON.parse(readFileSync(`${directory}/${name}`, 'utf8'))
    if (typeof resource !== 'object' || resource === null || !('nsisLanguage' in resource)
      || typeof resource.nsisLanguage !== 'string' || !/^[A-Z]+$/u.test(resource.nsisLanguage)) {
      throw new Error(`${name}: invalid NSIS language identifier`)
    }
    /** @param {unknown} value - Parsed JSON dictionary. @returns {Record<string, string>} Nonempty text values. */
    const dictionary = (value) => {
      if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new Error(`${name}: expected text dictionary`)
      /** @type {Record<string, string>} */
      const result = {}
      for (const [key, text] of Object.entries(value)) {
        if (typeof text !== 'string' || text.trim() === '') throw new Error(`${name}: ${key} must be nonempty text`)
        if (/[\u200b\ufeff]/u.test(text)) throw new Error(`${name}: ${key} contains an invisible locale character`)
        result[key] = text
      }
      return result
    }
    const strings = dictionary('strings' in resource ? resource.strings : undefined)
    if (Object.keys(strings).some(key => !/^INSTALLER_[A-Z_]+$/u.test(key))) throw new Error(`${name}: invalid installer string key`)
    return { id: name.slice(0, -5), nsisLanguage: resource.nsisLanguage, strings,
      uninstaller: dictionary('uninstaller' in resource ? resource.uninstaller : undefined) }
  })
  for (const id of ['en_US', 'zh_CN', 'ja_JP', 'es_ES', 'fr_FR', 'de_DE', 'ru_RU', 'pt_BR']) {
    if (!locales.some(locale => locale.id === id)) throw new Error(`installer locales: missing ${id}.json`)
  }
  const english = locales.find(locale => locale.id === 'en_US')
  if (!english || Object.keys(english.strings).length === 0) throw new Error('installer locales: missing English strings')
  if (Object.keys(english.uninstaller).sort().join(',') !== 'finished,welcome') throw new Error('installer locales: expected uninstaller welcome and finished text')
  const languages = new Set()
  for (const locale of locales) {
    if (languages.has(locale.nsisLanguage)) throw new Error(`${locale.id}: duplicate NSIS language ${locale.nsisLanguage}`)
    languages.add(locale.nsisLanguage)
    for (const field of ['strings', 'uninstaller']) {
      const expected = english[field]
      const actual = locale[field]
      if (Object.keys(expected).sort().join(',') !== Object.keys(actual).sort().join(',')) throw new Error(`${locale.id}: ${field} keys differ from English`)
      for (const [key, text] of Object.entries(expected)) {
        const placeholders = (/** @type {string} */ value) => (value.match(/%.?|\{product\}|(?<![A-Za-z0-9/])\/[A-Z][A-Z_]*(?:=[\w-]+)?/gu) ?? []).join(',')
        if (placeholders(text) !== placeholders(actual[key])) throw new Error(`${locale.id}: ${key} changes format placeholders or commands`)
      }
    }
  }
  return locales
}

/**
 * Generate guarded NSIS LangString declarations from validated JSON resources.
 *
 * The resources spell the product name as {@link PRODUCT_TOKEN}, so one set of
 * translations serves every brand: the caller passes the manifest's product name
 * and the generated declarations carry it.
 * @param {ReturnType<typeof readInstallerLocales>} locales - Resources for all languages or one isolated native-test build.
 * @param {string} [productName] - Product name every string renders; the shipped brand when omitted.
 * @returns {string} UTF-8 NSIS source, with literal dollar signs, quotes and line breaks escaped.
 */
export function renderInstallerStrings(locales, productName = SHIPPED_PRODUCT_NAME) {
  const escape = (/** @type {string} */ text) => text.replace(/\$|"|\r|\n/gu, character => ({ '$': '$$', '"': '$\\"', '\r': '$\\r', '\n': '$\\n' })[character])
  const name = productName.trim()
  if (name === '') throw new Error('installer strings: product name must not be empty')
  return '; Generated from installer/locales/*.json.\n' + locales.map(locale =>
    `!ifdef LANG_${locale.nsisLanguage}\n` + Object.entries(locale.strings).map(([key, text]) =>
      `LangString ${key} \${LANG_${locale.nsisLanguage}} "${escape(text.replaceAll(PRODUCT_TOKEN, name))}"\n`).join('') + '!endif\n').join('')
}

/**
 * Render the native helper's product-name header.
 *
 * The helper draws the restart banner title and writes the extraction and
 * uninstall reports, so its product name is install copy too: packaging writes
 * this header from the selected brand manifest and the helper includes it under
 * `installer-product-name.h`, which falls back to the shipped name when no
 * header was generated.
 * @param {string} [productName] - Product name the helper draws; the shipped brand when omitted.
 * @returns {string} UTF-8 C++ header source.
 */
export function renderInstallerProductHeader(productName = SHIPPED_PRODUCT_NAME) {
  const name = productName.trim()
  if (name === '') throw new Error('installer product header: product name must not be empty')
  if (/[\u0000-\u001f\u007f]/u.test(name)) throw new Error('installer product header: product name must not contain control characters')
  const literal = name.replace(/\\/gu, '\\\\').replace(/"/gu, '\\"')
  return '// Generated from the selected brand manifest.\n'
    + '#pragma once\n'
    + `#define DSH_INSTALLER_PRODUCT_NAME L"${literal}"\n`
}

if (import.meta.main) {
  const locales = readInstallerLocales()
  console.log(`verify-installer-locales: ${locales.length} languages have matching keys and format placeholders.`)
}