import { expect, it } from 'vitest'
import { usesProductCaption } from '../src/caption-platform.ts'

it.each(['win32', 'linux'] as const)('draws the product caption on %s', (platform) => {
  expect(usesProductCaption(platform)).toBe(true)
})

it.each(['darwin', 'freebsd', 'openbsd'] as const)('leaves the OS frame to %s', (platform) => {
  expect(usesProductCaption(platform)).toBe(false)
})
