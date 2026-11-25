/**
 * Small UI copy helpers shared by the plugin's client surfaces. Product copy
 * lives here rather than inline in components.
 */
import type { AgencyLocale } from '../agency-locale.js'

/**
 * The composer recommendation chip label.
 * @param locale - the active host locale.
 * @returns the localized trigger label.
 */
export function recommendTriggerLabel(locale: AgencyLocale): string {
  return locale === 'zh' ? '推荐专家' : 'Suggestions'
}

/**
 * The composer recommendation chip tooltip.
 * @param locale - the active host locale.
 * @returns the localized title text.
 */
export function recommendTitle(locale: AgencyLocale): string {
  return locale === 'zh' ? '查看任务匹配的专家与团队推荐' : 'View expert suggestions'
}

/**
 * The diagnostic prefix for a failed local API request.
 * @param status - the HTTP status code.
 * @returns the status text used in the thrown error and console diagnostic.
 */
export function httpStatusText(status: number): string {
  return `HTTP ${status}`
}
