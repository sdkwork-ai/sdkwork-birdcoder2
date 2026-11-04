import { describe, expect, it } from 'vitest'
import { makeTranslate } from '@deepseek-ai/dsh-client-test-runtime'
import type { KnowledgeExcerpt } from '@deepseek-ai/dsh-client-ui-sdkwork-knowledge/client'
import {
  knowledgeInsertion, MAX_EXCERPT_CHARS, MAX_EXCERPTS_CHARS, mcpInsertion, skillInsertion,
} from '../src/client/insertion.ts'
import { zh } from '../src/client/locales.ts'

const t = makeTranslate(zh)

describe('skill insertion', () => {
  it('inserts the slash gesture the Host expands', () => {
    expect(skillInsertion('code-review')).toBe('/code-review ')
  })
})

describe('MCP insertion', () => {
  it('names the server and the tool prefix it exposes', () => {
    expect(mcpInsertion('github', t)).toBe('请使用 MCP 服务器「github」的工具（mcp__github__）来完成这条输入。\n')
  })
})

describe('knowledge base insertion', () => {
  it('inserts the link alone when nothing was retrieved', () => {
    expect(knowledgeInsertion('Team Handbook', [], t)).toBe('请结合知识库「Team Handbook」回答这条输入。\n')
  })

  it('appends retrieved passages as numbered quoted lines', () => {
    const excerpts: readonly KnowledgeExcerpt[] = [
      { title: 'Deploy', content: 'Run  pnpm deploy\n on main.' },
      { title: 'Rollback', content: 'Revert the tag.' },
    ]

    expect(knowledgeInsertion('Team Handbook', excerpts, t)).toBe([
      '请结合知识库「Team Handbook」回答这条输入。',
      '从知识库「Team Handbook」检索到的相关内容：',
      '> [1] Deploy: Run pnpm deploy on main.',
      '> [2] Rollback: Revert the tag.',
      '',
    ].join('\n'))
  })

  it('omits an empty title and skips a blank passage', () => {
    const excerpts: readonly KnowledgeExcerpt[] = [
      { title: '', content: 'Body only.' },
      { title: 'Blank', content: '   ' },
    ]

    expect(knowledgeInsertion('KB', excerpts, t)).toBe([
      '请结合知识库「KB」回答这条输入。',
      '从知识库「KB」检索到的相关内容：',
      '> [1] Body only.',
      '',
    ].join('\n'))
  })

  it('bounds each passage and the complete block', () => {
    const long = 'x'.repeat(MAX_EXCERPT_CHARS * 2)
    const excerpts: readonly KnowledgeExcerpt[] = Array.from({ length: 20 }, (_, index) => ({
      title: `Doc ${index}`,
      content: long,
    }))

    const lines = knowledgeInsertion('KB', excerpts, t).trimEnd().split('\n')
    // Directive, header, then only as many passage lines as the block budget allows.
    expect(lines).toHaveLength(2 + Math.ceil(MAX_EXCERPTS_CHARS / (MAX_EXCERPT_CHARS + 20)))
    for (const line of lines.slice(2)) {
      expect(line.startsWith('> [')).toBe(true)
      expect(line.length).toBeLessThanOrEqual(MAX_EXCERPT_CHARS + 20)
    }
  })
})
