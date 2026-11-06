/**
 * Pure value handling for the mini-program account dialog: draft validation,
 * failure text, and locale-free timestamp formatting. The component owns
 * presentation and locale copy.
 */

/** Why a mini-program account form cannot be submitted. */
export type MiniProgramProblem =
  | 'appIdRequired'
  | 'appSecretRequired'
  | 'displayNameRequired'

/** Validation result of a form. */
export type MiniProgramValidation = { ok: true } | { ok: false; problem: MiniProgramProblem }

/**
 * Validate the create form.
 * @param draft - the entered AppID, AppSecret, and display name.
 * @returns whether the request may be sent.
 */
export function validateMiniProgramDraft(draft: {
  appId: string
  appSecret: string
  displayName: string
}): MiniProgramValidation {
  if (draft.appId.trim() === '') return { ok: false, problem: 'appIdRequired' }
  if (draft.appSecret.trim() === '') return { ok: false, problem: 'appSecretRequired' }
  if (draft.displayName.trim() === '') return { ok: false, problem: 'displayNameRequired' }
  return { ok: true }
}

/**
 * Validate the edit form. The AppSecret stays optional: a blank value keeps the
 * stored credential, matching the backend's rotate-only-when-supplied rule.
 * @param edit - the entered display name (and optional AppID/AppSecret).
 * @returns whether the request may be sent.
 */
export function validateMiniProgramEdit(edit: { displayName: string }): MiniProgramValidation {
  if (edit.displayName.trim() === '') return { ok: false, problem: 'displayNameRequired' }
  return { ok: true }
}

/**
 * Read a user-visible failure message.
 * @param error - the rejected value.
 * @returns trimmed message text, or an empty string when there is none.
 */
export function errorText(error: unknown): string {
  if (error instanceof Error) return error.message.trim()
  if (typeof error === 'string') return error.trim()
  return ''
}

/**
 * Render an API timestamp in a stable, locale-free minute form.
 * @param value - the wire timestamp.
 * @returns `YYYY-MM-DD HH:mm` (UTC), or an empty string when absent or invalid.
 */
export function formatTimestamp(value: string | undefined): string {
  if (value === undefined || value === '') return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return date.toISOString().slice(0, 16).replace('T', ' ')
}
