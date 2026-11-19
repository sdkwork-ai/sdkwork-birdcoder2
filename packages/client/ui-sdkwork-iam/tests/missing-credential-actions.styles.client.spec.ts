/**
 * The failure-row link stylesheet contract, asserted against the CSS text on
 * disk. The links sit inside the failure sentence in both themes, so they must
 * paint with the theme's dedicated link alias — a `--dsw-*` name the theme does
 * not declare would silently fall back and leave one theme looking wrong.
 */
import { readdirSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const css = readFileSync(
  fileURLToPath(new URL('../src/client/MissingCredentialActions.module.css', import.meta.url)),
  'utf8',
)
// Every theme sheet, so the declaration check covers the light and dark halves
// (and any sibling sheet that declares a name this one consumes).
const tokens = readdirSync(fileURLToPath(new URL('../../ui-theme/src/styles/', import.meta.url)))
  .filter(name => name.endsWith('.css'))
  .map(name => readFileSync(fileURLToPath(new URL(`../../ui-theme/src/styles/${name}`, import.meta.url)), 'utf8'))
  .join('\n')

describe('MissingCredentialActions link styles', () => {
  it('paints the in-sentence links with the theme link alias', () => {
    const named = [...css.matchAll(/var\((--(?:dsw|dsh|ds)-[a-z0-9-]+)/g)].map(match => match[1])
    const undeclared = [...new Set(named)].filter(name => !tokens.includes(`  ${String(name)}:`))
    expect(undeclared).toEqual([])
    expect(css).toMatch(/\.link \{[^}]*color: var\(--dsw-alias-link/)
  })

  it('closes every block, so no rule is swallowed by the one above it', () => {
    const bare = css.replace(/\/\*[\s\S]*?\*\//g, '')
    expect((bare.match(/\}/g) ?? []).length).toBe((bare.match(/\{/g) ?? []).length)
  })
})
