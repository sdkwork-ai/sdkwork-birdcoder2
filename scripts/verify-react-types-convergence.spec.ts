import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

import { collectReactFamilyVersions, verifyReactTypesConvergence } from './verify-react-types-convergence.ts'

const CONVERGED_LOCKFILE = [
  'packages:',
  '',
  "  '@types/react@19.2.18':",
  '    resolution: {integrity: sha512-converged}',
  '',
  '  react@19.2.8:',
  '    resolution: {integrity: sha512-converged}',
  '',
  '  react-dom@19.2.8(react@19.2.8):',
  '    resolution: {integrity: sha512-converged}',
].join('\n')

const MIXED_LOCKFILE = [
  'packages:',
  '',
  "  '@types/react@18.3.31':",
  '    resolution: {integrity: sha512-legacy}',
  '',
  "  '@types/react@19.2.18':",
  '    resolution: {integrity: sha512-converged}',
  '',
  '  react@19.2.8:',
  '    resolution: {integrity: sha512-converged}',
  '',
  // Peer-suffix keys may mention other react-family versions without counting
  // as copies of the head package.
  '  lucide-react@1.7.0(react@18.3.1):',
  '    resolution: {integrity: sha512-icons}',
  '',
  '  lucide-react@1.7.0(react@19.2.8):',
  '    resolution: {integrity: sha512-icons}',
].join('\n')

describe('collectReactFamilyVersions', () => {
  it('collects the head version per react-family package and ignores peer suffixes', () => {
    const versions = collectReactFamilyVersions(MIXED_LOCKFILE)
    expect(versions['@types/react']).toEqual(new Set(['18.3.31', '19.2.18']))
    expect(versions['react']).toEqual(new Set(['19.2.8']))
    expect(versions['react-dom']).toEqual(new Set())
    expect(versions['@types/react-dom']).toEqual(new Set())
  })
})

describe('verifyReactTypesConvergence', () => {
  it('accepts a lockfile where each react-family package resolves to one version', () => {
    expect(verifyReactTypesConvergence('.', CONVERGED_LOCKFILE)).toEqual([])
  })

  it('fails with an actionable remedy when @types/react materializes twice', () => {
    const errors = verifyReactTypesConvergence('.', MIXED_LOCKFILE)
    expect(errors).toEqual([
      '@types/react resolves to 2 copies in pnpm-lock.yaml: 18.3.31, 19.2.18.',
      expect.stringContaining('TS2786'),
      expect.stringContaining('overrides'),
    ])
  })

  it('reports a missing lockfile instead of throwing', () => {
    const tempRoot = mkdtempSync(join(tmpdir(), 'react-types-convergence-'))
    try {
      const errors = verifyReactTypesConvergence(tempRoot)
      expect(errors).toHaveLength(1)
      expect(errors[0]).toContain('pnpm-lock.yaml not found')
    } finally {
      rmSync(tempRoot, { recursive: true, force: true })
    }
  })
})
