/**
 * Catalog behavior: the hover menu lists the sixteen CC Switch applications in
 * CC Switch's own order, each with one badge and at least one accepted format.
 */
import { describe, expect, it } from 'vitest'
import {
  apiFormatFrom,
  isImportTargetId,
  menuTargets,
  supportsFormat,
  TARGETS,
  targetById,
} from '../src/client/targets.ts'

/** Menu labels, in the order the screenshot and CC Switch's picker show. */
const MENU_LABELS = [
  'Claude Code',
  'Claude Desktop',
  'Codex',
  'Gemini CLI',
  'Grok Build',
  'OpenCode',
  'OpenClaw',
  'Hermes',
  'Pi',
  'MiniMax Code',
  'Kimi Code',
  'DeepSeek Harness',
  'Antigravity',
  'Oh My Pi',
  'Copilot CLI',
  'WorkBuddy',
]

describe('import target catalog', () => {
  it('lists the sixteen tools in menu order', () => {
    expect(menuTargets().map(row => row.label)).toEqual(MENU_LABELS)
  })

  it('uses CC Switch application ids as its ids', () => {
    expect(menuTargets().map(row => row.id)).toEqual([
      'claude',
      'claude-desktop',
      'codex',
      'gemini',
      'grokbuild',
      'opencode',
      'openclaw',
      'hermes',
      'pi',
      'mcode',
      'kimi',
      'dsh',
      'agy',
      'omp',
      'copilot',
      'workbuddy',
    ])
  })

  it('gives every row a two-letter badge', () => {
    for (const row of menuTargets()) {
      expect(row.badge.initials).toMatch(/^[A-Z]{2}$/)
      expect(row.badge.color).toMatch(/^#[0-9A-F]{6}$/)
    }
  })

  it('keeps ids unique and resolvable', () => {
    const ids = TARGETS.map(target => target.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const id of ids) expect(targetById(id).label).not.toBe('')
  })

  it('defaults to a format the target accepts', () => {
    for (const target of TARGETS) {
      expect(target.apiFormats).toContain(target.defaultApiFormat)
      expect(target.apiFormats.length).toBeGreaterThan(0)
    }
  })

  it('marks only the targets CC Switch rejects a link without a model for', () => {
    const required = TARGETS.filter(target => target.requiresModel).map(target => target.id)
    expect(required).toEqual(['pi', 'mcode', 'kimi', 'dsh', 'omp', 'copilot', 'workbuddy'])
  })

  it('narrows menu ids that arrive as plain strings', () => {
    expect(isImportTargetId('claude-desktop')).toBe(true)
    expect(isImportTargetId('codebuddy')).toBe(false)
    expect(isImportTargetId('')).toBe(false)
  })

  it('parses select values back to an accepted format', () => {
    const codex = targetById('codex')
    expect(apiFormatFrom('openai_chat', codex.apiFormats)).toBe('openai_chat')
    expect(apiFormatFrom('gemini_native', codex.apiFormats)).toBe('openai_responses')
    expect(supportsFormat(codex, 'openai_responses')).toBe(true)
    expect(supportsFormat(codex, 'gemini_native')).toBe(false)
  })
})
