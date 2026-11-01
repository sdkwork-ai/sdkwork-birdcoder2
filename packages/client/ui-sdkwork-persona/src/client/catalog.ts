/**
 * The persona interest catalog: which directions the picker offers and how a
 * stored list is narrowed back onto it.
 *
 * The catalog carries ids only — display copy lives in `locales.ts` so the i18n
 * gate keeps every product-visible string locale-owned. Role ids are the stored
 * union in `../persona-settings.ts`; this module does not repeat them, because a
 * second ordered list would be a second source of truth for role order.
 */

/** Interest directions the picker offers, in display order. */
export const PERSONA_INTEREST_IDS = [
  'postgraduate',
  'recommendation',
  'employment',
  'civil-service',
  'study-abroad',
  'certification',
  'language',
  'k12',
  'ai-skills',
  'development',
  'content',
  'management',
] as const

/** One interest direction id. */
export type PersonaInterestId = typeof PERSONA_INTEREST_IDS[number]

/**
 * Keep only the interest ids this build offers, in catalog order, without
 * duplicates. Stored values may carry ids a newer or older build wrote.
 * @param values - stored or candidate interest ids.
 * @returns the recognized ids in catalog order.
 */
export function normalizeInterests(values: readonly string[]): PersonaInterestId[] {
  const wanted = new Set(values)
  return PERSONA_INTEREST_IDS.filter(id => wanted.has(id))
}
