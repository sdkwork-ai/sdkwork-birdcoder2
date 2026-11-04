import { describe, expect, it } from 'vitest'
import type { McpManagedServerView, SkillEntry } from '@deepseek-ai/dsh-api-remotes/client'
import { makeTranslate } from '@deepseek-ai/dsh-client-test-runtime'
import type { KnowledgeBaseSummary } from '@deepseek-ai/dsh-client-ui-sdkwork-knowledge/client'
import { zh } from '../src/client/locales.ts'
import { knowledgeOptions, mcpOptions, skillOptions } from '../src/client/options.ts'

const t = makeTranslate(zh)

function skill(overrides: Partial<SkillEntry> & { name: string }): SkillEntry {
  return {
    name: overrides.name,
    description: overrides.description ?? `${overrides.name} description`,
    userInvocable: overrides.userInvocable ?? true,
    modelInvocable: overrides.modelInvocable ?? true,
    source: overrides.source ?? 'user',
    provider: overrides.provider ?? 'filesystem',
    ...(overrides.path === undefined ? {} : { path: overrides.path }),
  }
}

function server(name: string, status: McpManagedServerView['status']): McpManagedServerView {
  return { name, configured: true, status }
}

describe('skill rows', () => {
  it('offers only user-invocable skills, in catalog order', () => {
    const rows = skillOptions([
      skill({ name: 'code-review' }),
      skill({ name: 'hidden', userInvocable: false }),
      skill({ name: 'docs', description: 'Write docs' }),
    ], '')

    expect(rows).toEqual([
      { id: 'code-review', label: 'code-review', detail: 'code-review description' },
      { id: 'docs', label: 'docs', detail: 'Write docs' },
    ])
  })

  it('marks the skill whose gesture the draft already carries', () => {
    const rows = skillOptions([
      skill({ name: 'docs' }),
      skill({ name: 'docs-plus' }),
      skill({ name: 'review' }),
    ], 'please /review this and also /docs-plus later')

    expect(rows.map(row => row.active === true)).toEqual([false, true, true])
  })

  it('matches gestures on word boundaries only', () => {
    expect(skillOptions([skill({ name: 'docs' })], 'docs')).toEqual([
      { id: 'docs', label: 'docs', detail: 'docs description' },
    ])
    expect(skillOptions([skill({ name: 'docs' })], '/docs')[0]?.active).toBe(true)
    expect(skillOptions([skill({ name: 'docs' })], '/docs-extra')[0]?.active).toBeUndefined()
    expect(skillOptions([skill({ name: 'c++' })], '/c++ ')[0]?.active).toBe(true)
  })
})

describe('MCP rows', () => {
  it('reports the live state and tool prefix of every managed server', () => {
    const rows = mcpOptions([
      server('github', { state: 'connected', toolCount: 7, connectedAt: 1 }),
      server('broken', { state: 'failed', reason: 'gave-up' }),
      server('off', { state: 'disabled' }),
      server('quiet', { state: 'closed', result: { closeConfirmed: true } }),
      server('creds', { state: 'waiting-credentials', lastError: 'missing token' }),
      server('booting', { state: 'connecting', attempt: 0 }),
      server('retrying', { state: 'reconnecting', attempt: 2, maxAttempts: 5, nextRetryAtMs: 10, lastError: 'boom' }),
    ], t)

    expect(rows.map(row => row.label)).toEqual(['github', 'broken', 'off', 'quiet', 'creds', 'booting', 'retrying'])
    expect(rows[0]?.detail).toBe('已连接 · 7 个工具 · 工具前缀 mcp__github__')
    expect(rows[1]?.detail).toBe('不可用 · 工具前缀 mcp__broken__')
    expect(rows[2]?.detail).toBe('已停用 · 工具前缀 mcp__off__')
    expect(rows[3]?.detail).toBe('未连接 · 工具前缀 mcp__quiet__')
    expect(rows[4]?.detail).toBe('等待凭据 · 工具前缀 mcp__creds__')
    expect(rows[5]?.detail).toBe('正在连接 · 工具前缀 mcp__booting__')
    expect(rows[6]?.detail).toBe('正在重连 · 工具前缀 mcp__retrying__')
  })

  it('returns no rows for an empty fleet', () => {
    expect(mcpOptions([], t)).toEqual([])
  })
})

describe('knowledge base rows', () => {
  it('groups rows by the projection split and keeps its order', () => {
    const bases: readonly KnowledgeBaseSummary[] = [
      { id: '11', name: 'Team Handbook', kind: 'team', documentCount: 12 },
      { id: '22', name: 'Personal Notes', kind: 'personal' },
      { id: '33', name: 'Second Team', kind: 'team', documentCount: 0 },
    ]

    expect(knowledgeOptions(bases, t)).toEqual([
      {
        id: '11',
        label: 'Team Handbook',
        detail: '12 个文档',
        group: { name: 'team', label: '团队知识库' },
      },
      {
        id: '33',
        label: 'Second Team',
        detail: '0 个文档',
        group: { name: 'team', label: '团队知识库' },
      },
      {
        id: '22',
        label: 'Personal Notes',
        group: { name: 'personal', label: '个人知识库' },
      },
    ])
  })

  it('returns no rows for an empty catalog', () => {
    expect(knowledgeOptions([], t)).toEqual([])
  })
})
