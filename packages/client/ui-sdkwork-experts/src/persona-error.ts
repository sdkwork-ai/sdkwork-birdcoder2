import { teamText, type TeamLocale } from './team-i18n.js'
import { PERSONA_MESSAGES } from './locales/persona-messages.js'

/** 仅文件不存在允许语言回退，不能把权限或文件系统故障当成缺少译文。 */
export class PersonaError extends Error {
  constructor(readonly code: keyof typeof PERSONA_MESSAGES, locale: TeamLocale, cause?: unknown) {
    super(teamText(locale, PERSONA_MESSAGES[code]), { cause })
    this.name = 'PersonaError'
  }
}
