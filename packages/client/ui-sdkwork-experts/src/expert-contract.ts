import { z } from 'zod'

/** Host 与 Client 共用的自定义专家数据契约，不包含运行时服务依赖。 */
export const DEFAULT_EXPERT_EMOJI = '🧩'
export const CUSTOM_EXPERT_LIMIT = 200
export const CUSTOM_EXPERT_SLUG = /^custom-[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u
const segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' })

/** 允许一个完整 Emoji（含肤色、旗帜和 ZWJ 组合），拒绝普通文本和多图标。 */
export function isExpertEmoji(value: string): boolean {
  return value.length <= 32 && [...segmenter.segment(value)].length === 1
    && /\p{Extended_Pictographic}|\p{Regional_Indicator}|\p{Emoji_Presentation}|[0-9#*]\uFE0F?\u20E3/u.test(value)
}

const nameSchema = z.string().trim().min(1).max(40).refine(value => !/[@\u0000-\u001f\u007f]/u.test(value))
export const customExpertInputSchema = z.object({
  slug: z.string().regex(CUSTOM_EXPERT_SLUG).optional(),
  name: nameSchema,
  description: z.string().trim().min(1).max(160),
  division: z.string().regex(/^[a-z][a-z0-9-]{0,63}$/u),
  emoji: z.string().default(DEFAULT_EXPERT_EMOJI).transform((value) => {
    const trimmed = value.trim()
    return trimmed !== '' && isExpertEmoji(trimmed) ? trimmed : DEFAULT_EXPERT_EMOJI
  }),
  avatar: z.number().int().min(0).max(35).default(0),
  prompt: z.string().trim().min(1).max(20_000),
}).strict()

export const customExpertSchema = customExpertInputSchema.extend({
  slug: z.string().regex(CUSTOM_EXPERT_SLUG),
  deleted: z.boolean().optional(),
  wasEnabled: z.boolean().optional(),
})
export type CustomExpertInput = z.input<typeof customExpertInputSchema>
export type CustomExpert = z.output<typeof customExpertSchema>

export const expertSummarySchema = z.object({
  slug: z.string(), name: z.string(), nameEn: z.string(),
  description: z.string(), descriptionEn: z.string(),
  emoji: z.string(), division: z.string(), divisionZh: z.string(),
  conflict: z.boolean().optional(),
  custom: z.boolean().default(false), avatar: z.number().int().min(0).max(35).optional(),
})
export type ExpertSummary = z.infer<typeof expertSummarySchema>
export const catalogSnapshotSchema = z.object({
  experts: z.array(expertSummarySchema),
  enabled: z.array(z.string()), revision: z.number().int().min(0),
})
export type CatalogSnapshot = z.infer<typeof catalogSnapshotSchema>
export const expertEditSchema = customExpertSchema.omit({ deleted: true, wasEnabled: true })

export { customError, type CustomErrorKey } from './locales/custom-expert-errors.js'
