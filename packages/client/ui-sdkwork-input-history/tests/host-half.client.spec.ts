/**
 * The plugin's host half is intentionally empty: the package participates in
 * the Host Loader while the browser half ships through exports["./client"].
 */
import { describe, expect, it } from 'vitest'
import { apply } from '../src/index.ts'

describe('input history host half', () => {
  it('registers no host behavior', () => {
    expect(typeof apply).toBe('function')
    expect(() => { apply() }).not.toThrow()
  })
})
