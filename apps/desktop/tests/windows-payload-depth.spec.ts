/** The install-time Windows budget is what decides whether a shipped payload can unpack. */
import { readFileSync } from 'node:fs'
import { expect, it } from 'vitest'
import {
  WINDOWS_INSTALL_ROOT_LENGTH, WINDOWS_PATH_LIMIT, WINDOWS_PAYLOAD_DEPTH_LIMIT, WINDOWS_STAGING_SUFFIX,
  windowsPayloadOverflow,
} from '../scripts/windows-payload-depth.ts'

const filler = (length: number): string => 'a'.repeat(length)
const resourcePrefix = 'resources\\app.asar.unpacked\\dsh\\node_modules\\@deepseek-ai\\'

it('reserves the install root, staging suffix and separator below MAX_PATH', () => {
  expect(WINDOWS_PAYLOAD_DEPTH_LIMIT)
    .toBe(WINDOWS_PATH_LIMIT - WINDOWS_INSTALL_ROOT_LENGTH - WINDOWS_STAGING_SUFFIX.length - 1)
  expect(WINDOWS_PAYLOAD_DEPTH_LIMIT).toBe(202)
})

it('accepts a payload whose deepest entry still fits the install budget', () => {
  const deepest = `${resourcePrefix}${filler(WINDOWS_PAYLOAD_DEPTH_LIMIT - resourcePrefix.length)}`
  expect(deepest.length).toBe(WINDOWS_PAYLOAD_DEPTH_LIMIT)
  expect(windowsPayloadOverflow(['resources', deepest])).toEqual({ paths: [], total: 0 })
})

it('reports the longest entries of a payload that cannot be unpacked', () => {
  const tooDeep = `resources\\${filler(WINDOWS_PAYLOAD_DEPTH_LIMIT)}`
  const deeper = `resources\\${filler(WINDOWS_PAYLOAD_DEPTH_LIMIT + 40)}`
  const { paths, total } = windowsPayloadOverflow([tooDeep, deeper, 'resources', `resources\\${filler(3)}`])
  expect(total).toBe(2)
  expect(paths).toEqual([deeper, tooDeep])
})

it('caps the report so one failure names a readable sample', () => {
  const deep = Array.from({ length: 40 }, (_, index) => `resources\\${filler(WINDOWS_PAYLOAD_DEPTH_LIMIT + index)}`)
  const { paths, total } = windowsPayloadOverflow(deep)
  expect(total).toBe(40)
  expect(paths).toHaveLength(8)
  expect(paths.at(0)).toBe(deep.at(-1))
})

it('keeps the staged directory name at the budgeted length', () => {
  const script = readFileSync(new URL('../scripts/installer-directories.nsh', import.meta.url), 'utf8')
  // The staged payload is unpacked file by file, so a longer name silently spends the margin.
  expect(script).toContain(`StrCpy $dshNewDirectory "$INSTDIR${WINDOWS_STAGING_SUFFIX}"`)
})
