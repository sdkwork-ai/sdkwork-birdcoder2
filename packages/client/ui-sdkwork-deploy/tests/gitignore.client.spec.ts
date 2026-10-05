/** Git-ignore matcher behavior: the publish-as-template directory packer's
 * selection semantics, held to git's documented rules. */
import { describe, expect, it } from 'vitest'
import { isIgnoredByChain, parseGitIgnore } from '../src/client/gitignore.ts'

/** Parse one root-level `.gitignore` body. */
const root = (text: string) => parseGitIgnore(text, '')
/** The chain of rule sets the packer hands the cascade, shallowest first. */
const chain = (...sets: ReturnType<typeof root>[]) => sets

describe('parseGitIgnore + isIgnoredByChain', () => {
  it('ignores plain names at any depth and honors last-match-wins negation', () => {
    const rules = root('*.log\n!important.log\n')
    expect(isIgnoredByChain('debug.log', false, chain(rules))).toBe(true)
    expect(isIgnoredByChain('a/b/debug.log', false, chain(rules))).toBe(true)
    expect(isIgnoredByChain('important.log', false, chain(rules))).toBe(false)
    expect(isIgnoredByChain('src/keep.log', false, chain(rules))).toBe(true)
  })

  it('skips blank lines and comments', () => {
    const rules = root('# build output\n\n   \n*.log\n')
    expect(isIgnoredByChain('x.log', false, chain(rules))).toBe(true)
    expect(isIgnoredByChain('# build output', false, chain(rules))).toBe(false)
  })

  it('treats a trailing slash as directory-only', () => {
    const rules = root('build/\n')
    expect(isIgnoredByChain('build', true, chain(rules))).toBe(true)
    expect(isIgnoredByChain('build', false, chain(rules))).toBe(false)
    expect(isIgnoredByChain('packages/build', true, chain(rules))).toBe(true)
    expect(isIgnoredByChain('packages/build/index.js', false, chain(rules))).toBe(false)
  })

  it('anchors patterns containing an inner slash to the rule set base', () => {
    const rules = root('dist/output.js\n')
    expect(isIgnoredByChain('dist/output.js', false, chain(rules))).toBe(true)
    expect(isIgnoredByChain('packages/dist/output.js', false, chain(rules))).toBe(false)
  })

  it('anchors a leading slash but still matches deeper basenames unanchored', () => {
    const anchored = root('/node_modules\n')
    expect(isIgnoredByChain('node_modules', true, chain(anchored))).toBe(true)
    expect(isIgnoredByChain('packages/node_modules', true, chain(anchored))).toBe(false)
    const unanchored = root('node_modules\n')
    expect(isIgnoredByChain('packages/node_modules', true, chain(unanchored))).toBe(true)
  })

  it('spans segments with ** and single segments with * / ?', () => {
    const rules = root('a/**/z\n*.min.js\nfile?.txt\n')
    expect(isIgnoredByChain('a/z', false, chain(rules))).toBe(true)
    expect(isIgnoredByChain('a/b/c/z', false, chain(rules))).toBe(true)
    expect(isIgnoredByChain('a/x/y.min.js', false, chain(rules))).toBe(true)
    expect(isIgnoredByChain('a/x/y.min.js.bak', false, chain(rules))).toBe(false)
    expect(isIgnoredByChain('file1.txt', false, chain(rules))).toBe(true)
    expect(isIgnoredByChain('file12.txt', false, chain(rules))).toBe(false)
  })

  it('translates [!] character classes', () => {
    const rules = root('[Tt]emp?\n')
    expect(isIgnoredByChain('Temp1', false, chain(rules))).toBe(true)
    expect(isIgnoredByChain('temp9', false, chain(rules))).toBe(true)
    expect(isIgnoredByChain('tempX', false, chain(rules))).toBe(true)
    expect(isIgnoredByChain('tempXY', false, chain(rules))).toBe(false)
  })

  it('scopes rule sets to their base directory and lets deeper sets override', () => {
    const rootRules = root('*.log\n')
    // A `.gitignore` inside `packages/`: its unanchored `*.log` also applies
    // anywhere below it, and its negation overrides the root exclusion.
    const packagesRules = parseGitIgnore('!keep.log\n', 'packages/')
    const both = chain(rootRules, packagesRules)
    expect(isIgnoredByChain('outside.log', false, both)).toBe(true)
    expect(isIgnoredByChain('packages/keep.log', false, both)).toBe(false)
    expect(isIgnoredByChain('packages/drop.log', false, both)).toBe(true)
    // Deeper decisions never leak upward.
    expect(isIgnoredByChain('keep.log', false, both)).toBe(true)
  })

  it('leaves a shallower decision standing when the deeper set does not match', () => {
    const rootRules = root('*.log\n')
    const packagesRules = parseGitIgnore('!keep.log\n', 'packages/')
    const both = chain(rootRules, packagesRules)
    expect(isIgnoredByChain('packages/drop.log', false, both)).toBe(true)
    expect(isIgnoredByChain('packages/keep.log', false, both)).toBe(false)
  })

  it('ignores paths outside a set base by skipping that set entirely', () => {
    const deep = parseGitIgnore('*\n', 'vendor/')
    expect(isIgnoredByChain('src/index.ts', false, chain(deep))).toBe(false)
  })
})
