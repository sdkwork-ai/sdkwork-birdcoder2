/**
 * The sixteen targets of the "导入到" hover menu, in CC Switch's app-picker
 * order, minus CodeBuddy: CC Switch rejects CodeBuddy's provider link (its
 * models are added from the CodeBuddy page instead), so a row here could not
 * reproduce the click-to-use write.
 *
 * Labels are product names, so they are not translated; the badge is a
 * two-letter tile because the plugin ships no third-party brand artwork.
 *
 * @module @deepseek-ai/dsh-client-ui-sdkwork-import-to
 */
import type { ApiFormat, ImportTargetDescriptorView, ImportTargetId, TargetDescriptor } from './types.ts'

/** Every supported target, in menu order. */
export const TARGETS: readonly TargetDescriptor[] = [
  {
    id: 'claude',
    label: 'Claude Code',
    badge: { initials: 'CC', color: '#D97757' },
    apiFormats: ['anthropic'],
    defaultApiFormat: 'anthropic',
    requiresModel: false,
    restart: 'terminal',
  },
  {
    id: 'claude-desktop',
    label: 'Claude Desktop',
    badge: { initials: 'CD', color: '#C15F3C' },
    apiFormats: ['anthropic'],
    defaultApiFormat: 'anthropic',
    requiresModel: false,
    restart: 'app',
  },
  {
    id: 'codex',
    label: 'Codex',
    badge: { initials: 'CX', color: '#10A37F' },
    apiFormats: ['openai_responses', 'openai_chat'],
    defaultApiFormat: 'openai_responses',
    requiresModel: false,
    restart: 'terminal',
  },
  {
    id: 'gemini',
    label: 'Gemini CLI',
    badge: { initials: 'GM', color: '#4285F4' },
    apiFormats: ['gemini_native'],
    defaultApiFormat: 'gemini_native',
    requiresModel: false,
    restart: 'terminal',
  },
  {
    id: 'grokbuild',
    label: 'Grok Build',
    badge: { initials: 'GK', color: '#1F2937' },
    apiFormats: ['openai_responses', 'openai_chat', 'anthropic'],
    defaultApiFormat: 'openai_responses',
    requiresModel: false,
    restart: 'terminal',
  },
  {
    id: 'opencode',
    label: 'OpenCode',
    badge: { initials: 'OC', color: '#6366F1' },
    apiFormats: ['openai_chat', 'openai_responses', 'anthropic', 'gemini_native'],
    defaultApiFormat: 'openai_chat',
    requiresModel: false,
    restart: 'terminal',
  },
  {
    id: 'openclaw',
    label: 'OpenClaw',
    badge: { initials: 'CL', color: '#0EA5E9' },
    apiFormats: ['openai_chat', 'openai_responses', 'anthropic', 'gemini_native'],
    defaultApiFormat: 'openai_chat',
    requiresModel: false,
    restart: 'terminal',
  },
  {
    id: 'hermes',
    label: 'Hermes',
    badge: { initials: 'HE', color: '#F59E0B' },
    apiFormats: ['openai_chat', 'openai_responses', 'anthropic'],
    defaultApiFormat: 'openai_chat',
    requiresModel: false,
    restart: 'terminal',
  },
  {
    id: 'pi',
    label: 'Pi',
    badge: { initials: 'PI', color: '#8B5CF6' },
    apiFormats: ['openai_chat', 'openai_responses', 'anthropic', 'gemini_native'],
    defaultApiFormat: 'openai_chat',
    requiresModel: true,
    restart: 'terminal',
  },
  {
    id: 'mcode',
    label: 'MiniMax Code',
    badge: { initials: 'MM', color: '#EF4444' },
    apiFormats: ['openai_chat', 'openai_responses', 'anthropic'],
    defaultApiFormat: 'openai_chat',
    requiresModel: true,
    restart: 'terminal',
  },
  {
    id: 'kimi',
    label: 'Kimi Code',
    badge: { initials: 'KC', color: '#00B2A9' },
    apiFormats: ['openai_chat', 'openai_responses', 'anthropic', 'gemini_native'],
    defaultApiFormat: 'openai_chat',
    requiresModel: true,
    restart: 'terminal',
  },
  {
    id: 'dsh',
    label: 'DeepSeek Harness',
    badge: { initials: 'DS', color: '#2563EB' },
    apiFormats: ['openai_chat', 'openai_responses', 'anthropic'],
    defaultApiFormat: 'openai_chat',
    requiresModel: true,
    restart: 'app',
  },
  {
    id: 'agy',
    label: 'Antigravity',
    badge: { initials: 'AG', color: '#7C3AED' },
    apiFormats: ['gemini_native'],
    defaultApiFormat: 'gemini_native',
    requiresModel: false,
    restart: 'terminal',
  },
  {
    id: 'omp',
    label: 'Oh My Pi',
    badge: { initials: 'OP', color: '#EC4899' },
    apiFormats: ['openai_chat', 'openai_responses', 'anthropic', 'gemini_native'],
    defaultApiFormat: 'openai_chat',
    requiresModel: true,
    restart: 'terminal',
  },
  {
    id: 'copilot',
    label: 'Copilot CLI',
    badge: { initials: 'CP', color: '#6B7280' },
    apiFormats: ['openai_chat', 'openai_responses', 'anthropic'],
    defaultApiFormat: 'openai_chat',
    requiresModel: true,
    restart: 'terminal',
  },
  {
    id: 'workbuddy',
    label: 'WorkBuddy',
    badge: { initials: 'WB', color: '#14B8A6' },
    apiFormats: ['openai_chat'],
    defaultApiFormat: 'openai_chat',
    requiresModel: true,
    restart: 'app',
  },
] as const

/** Id → descriptor lookup. */
export const TARGET_BY_ID: ReadonlyMap<ImportTargetId, TargetDescriptor> = new Map(
  TARGETS.map(target => [target.id, target]),
)

/**
 * Descriptor of one target.
 * @param id - CC Switch application id.
 * @returns the descriptor; throws when the id is not one of the sixteen.
 */
export function targetById(id: ImportTargetId): TargetDescriptor {
  const target = TARGET_BY_ID.get(id)
  if (target === undefined) throw new TypeError(`unknown import target: ${id}`)
  return target
}

/**
 * The hover menu's rows, in catalog order.
 * @returns the sixteen menu targets.
 */
export function menuTargets(): readonly ImportTargetDescriptorView[] {
  return TARGETS.map(({ id, label, badge }) => ({ id, label, badge }))
}

/**
 * Position of one format in a target's menu, used to keep the select stable.
 * @param target - target descriptor.
 * @param format - candidate format.
 * @returns whether the target accepts the format.
 */
export function supportsFormat(target: TargetDescriptor, format: ApiFormat): boolean {
  return target.apiFormats.includes(format)
}

/**
 * Narrow an id that arrived from the menu (a plain string there).
 * @param id - candidate id.
 * @returns whether the id names one of the sixteen targets.
 */
export function isImportTargetId(id: string): id is ImportTargetId {
  return TARGETS.some(target => target.id === id)
}

/**
 * Parse a `<select>` value back into a format the target accepts.
 * @param value - option value.
 * @param allowed - target's formats.
 * @returns the matching format, or the first allowed one when none matches.
 * @throws {TypeError} when the target has no formats.
 */
export function apiFormatFrom(value: string, allowed: readonly ApiFormat[]): ApiFormat {
  const [first] = allowed
  if (first === undefined) throw new TypeError('import target has no api formats')
  return allowed.find(format => format === value) ?? first
}
