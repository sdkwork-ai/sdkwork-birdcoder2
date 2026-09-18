import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const conversationCss = readFileSync(fileURLToPath(new URL(
  '../src/client/skeleton/ConversationRoot.module.css',
  import.meta.url,
)), 'utf8')

const SEAT = 'conversation.session.header.surface'

/** Return one stylesheet rule body for a selector that starts its own line. */
function rule(css: string, selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  // Anchored to the line start so a rule that only appears as a descendant of
  // another selector (e.g. `:global(...) .titleRow {`) is never mistaken for it.
  const match = new RegExp(`^${escaped}\\s*\\{([^}]*)\\}`, 'sm').exec(css)
  expect(match, `missing ${selector} rule`).not.toBeNull()
  return match?.[1] ?? ''
}

describe('conversation header seat layout styles', () => {
  /*
   * The regression this guards (2026-09-18): the seat outlet's anchor carries
   * `display: contents`, so it generates no box and can NEVER be a flex item —
   * a `flex` declared on the anchor itself is silently inert. With the flex on
   * the anchor, the claiming body shrink-wrapped to its content: measured in
   * Chrome at a 1440px stage, the body stayed at 604px inside a 1392px row and
   * the whole header crowded into the left edge with ~760px of empty row to its
   * right. The flex must therefore reach the anchor's CHILDREN (`> *`).
   */
  it('puts the row flex on the seat anchor children, where display:contents leaves them', () => {
    const seatChildren = rule(conversationCss, `.titleRow > [data-slot='${SEAT}'] > *`)
    expect(seatChildren).toMatch(/flex:\s*1/)
    expect(seatChildren).toMatch(/min-width:\s*0/)
  })

  it('never declares flex on the anchor itself, which display:contents makes inert', () => {
    // A rule targeting the anchor directly would compile fine and do nothing —
    // exactly the silent failure this test exists to prevent.
    const anchorOnly = new RegExp(
      `\\.titleRow\\s*>\\s*\\[data-slot='${SEAT}'\\]\\s*\\{`, 's',
    )
    expect(conversationCss).not.toMatch(anchorOnly)
  })

  it('keeps the row a wrapping flex row so the fallback tabs strip takes its own line', () => {
    const row = rule(conversationCss, '.titleRow')
    expect(row).toMatch(/display:\s*flex/)
    expect(row).toMatch(/flex-wrap:\s*wrap/)
  })
})
