/**
 * The Skills market's composed-prompt helpers: the find/create/upload flows
 * all ride the page's prompt-dispatch channel (no direct host skill-install
 * API exists yet, so the agent-side skills execute the request). Each helper
 * fills its template's placeholders from the flow's inputs, with fallbacks
 * for the optional ones.
 */
import type { MarketsKey } from './locales.ts'

/** Translate seat (the locale render currency, keys rendered verbatim in tests). */
type Translate = (key: MarketsKey) => string

/**
 * Compose the find-skills prompt from the catalog search query; a blank
 * query falls back to the generic popular-skills wording.
 */
export function skillSearchPrompt(t: Translate, query: string): string {
  return t('prompt.skills.find')
    .replace('{query}', query.trim() === '' ? t('prompt.skills.query.fallback') : query.trim())
}

/** Compose the import-skill prompt from the picked file and the risk gate. */
export function skillImportPrompt(t: Translate, fileName: string, autoInstall: boolean): string {
  return t('prompt.skills.import')
    .replace('{file}', fileName)
    .replace('{auto}', autoInstall ? t('prompt.skills.auto.yes') : t('prompt.skills.auto.no'))
}
