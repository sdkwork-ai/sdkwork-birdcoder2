/**
 * Draft text one settled capability pick inserts.
 *
 * A skill pick inserts the `/name ` gesture the Host already recognizes and
 * expands, so nothing else is needed. MCP and knowledge base picks insert a
 * short directive sentence naming what the message is linked to; a knowledge
 * base pick may append the passages retrieved for the message being composed.
 * Every builder returns plain text: the composer appends it as a new paragraph,
 * which the user can edit or delete like any other typed text.
 */

import type { TranslateNS } from '@deepseek-ai/dsh-client-locale/client'
import type { KnowledgeExcerpt } from '@deepseek-ai/dsh-client-ui-sdkwork-knowledge/client'

/** One excerpt's content budget, in UTF-16 code units. */
export const MAX_EXCERPT_CHARS = 600

/** Budget of the complete retrieved-passage block, in UTF-16 code units. */
export const MAX_EXCERPTS_CHARS = 4000

/**
 * Build the skill gesture a pick inserts.
 * @param name - skill name without its slash.
 * @returns the `/name ` gesture with a trailing separator.
 */
export function skillInsertion(name: string): string {
  return `/${name} `
}

/**
 * Build the MCP directive a pick inserts.
 * @param name - MCP server name.
 * @param t - namespace translator.
 * @returns the sentence inserted into the draft.
 */
export function mcpInsertion(name: string, t: TranslateNS<'composerCapabilities'>): string {
  return `${t('insert.mcp', { name, prefix: `mcp__${name}__` })}\n`
}

/** Collapse whitespace so one passage stays a single quoted line. */
function oneLine(text: string): string {
  return text.replace(/\s+/gu, ' ').trim()
}

/**
 * Render passages as quoted lines inside one total budget.
 * @param excerpts - retrieved passages.
 * @returns quoted `> [n] title: content` lines in rank order.
 */
function quotedExcerpts(excerpts: readonly KnowledgeExcerpt[]): string[] {
  const lines: string[] = []
  let remaining = MAX_EXCERPTS_CHARS
  for (const [index, excerpt] of excerpts.entries()) {
    if (remaining <= 0) break
    const title = oneLine(excerpt.title)
    const budget = Math.min(MAX_EXCERPT_CHARS, remaining)
    const content = oneLine(excerpt.content).slice(0, budget)
    if (content === '') continue
    const line = `> [${index + 1}] ${title === '' ? '' : `${title}: `}${content}`
    lines.push(line)
    remaining -= line.length
  }
  return lines
}

/**
 * Build the knowledge base directive a pick inserts, with any passages
 * retrieved for the message being composed.
 * @param name - knowledge base name.
 * @param excerpts - passages retrieved for the current draft, possibly empty.
 * @param t - namespace translator.
 * @returns the paragraph inserted into the draft.
 */
export function knowledgeInsertion(
  name: string,
  excerpts: readonly KnowledgeExcerpt[],
  t: TranslateNS<'composerCapabilities'>,
): string {
  const lines = [t('insert.knowledge', { name })]
  const quoted = quotedExcerpts(excerpts)
  if (quoted.length > 0) {
    lines.push(t('insert.excerpts', { name }), ...quoted)
  }
  return `${lines.join('\n')}\n`
}
