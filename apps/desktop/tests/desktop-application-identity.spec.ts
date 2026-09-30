/**
 * The packaged shell must own every OS resource Electron derives from its identity.
 *
 * FORK DIVERGENCE (AGENTS.md, "Desktop application identity"): upstream's packaged
 * manifest carries no `productName`, so Electron names both applications after the
 * shared scoped package `@deepseek-ai/dsh-desktop`. The userData directory, the
 * Chromium single-instance lock, the logs directory, `keybindings.json`, the
 * background-close marker and the updater cache are then the same for an installed
 * upstream DeepSeek Harness desktop application and for this one.
 */

import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, it, onTestFinished } from 'vitest'
import {
  DESKTOP_CLI_COMMAND_NAME,
  DESKTOP_PRODUCT_NAME,
  DESKTOP_PROTOCOL_SCHEME,
  DESKTOP_UPDATER_CACHE_DIR_NAME,
  readAsarEntry,
  verifyPackagedApplicationIdentity,
} from '../scripts/desktop-application-identity.mjs'

const source = (relative: string): string => readFileSync(new URL(`../${relative}`, import.meta.url), 'utf8')

/** Strip `;` comments so a guard cannot trip over the divergence note that names the removed symbol. */
const nsisCode = (text: string): string => text.split('\n').map(line => line.replace(/;.*$/u, '')).join('\n')

/** Strip PowerShell comments, which quote the upstream owner key and mutex this fork replaced. */
const powerShellCode = (text: string): string => text.split('\n').map(line => line.replace(/#.*$/u, '')).join('\n')

const uint32 = (value: number): Buffer => {
  const buffer = Buffer.alloc(4)
  buffer.writeUInt32LE(value)
  return buffer
}

/**
 * Write an `app.asar` carrying one manifest, in the layout `readAsarEntry` reads.
 * @param manifest - Packaged manifest fields.
 * @returns Application directory holding `resources/app.asar`.
 */
function packagedApplication(manifest: Record<string, unknown>): string {
  const root = mkdtempSync(join(tmpdir(), 'dsh-app-identity-'))
  onTestFinished(() => { rmSync(root, { recursive: true, force: true }) })
  const content = Buffer.from(`${JSON.stringify(manifest, undefined, 2)}\n`, 'utf8')
  const header = Buffer.from(JSON.stringify({ files: { 'package.json': { size: content.length, offset: '0' } } }), 'utf8')
  const resources = join(root, 'resources')
  mkdirSync(resources, { recursive: true })
  writeFileSync(join(resources, 'app.asar'), Buffer.concat([
    uint32(4), uint32(8 + header.length), uint32(4 + header.length), uint32(header.length), header, content,
  ]))
  return resources
}

it('reads an entry back out of a packaged archive', () => {
  const resources = packagedApplication({ name: '@deepseek-ai/dsh-desktop', productName: 'BirdCoder' })
  expect(JSON.parse(readAsarEntry(join(resources, 'app.asar'), 'package.json').toString('utf8')))
    .toMatchObject({ productName: 'BirdCoder' })
})

it('accepts the lane identity, and rejects a manifest or cache directory another application owns', () => {
  const identity = { productName: DESKTOP_PRODUCT_NAME, updaterCacheDirName: DESKTOP_UPDATER_CACHE_DIR_NAME }
  expect(() => { verifyPackagedApplicationIdentity(packagedApplication({
    name: '@deepseek-ai/dsh-desktop', productName: 'BirdCoder',
  }), identity) }).not.toThrow()

  // The upstream shape: a scoped package name and no product name.
  expect(() => { verifyPackagedApplicationIdentity(packagedApplication({ name: '@deepseek-ai/dsh-desktop' }), identity) })
    .toThrow(/productName/u)
  // A lane that renames the product without carrying the name into the manifest.
  expect(() => { verifyPackagedApplicationIdentity(packagedApplication({ name: 'dsh-update-test-1' }), {
    productName: 'DSH Update Test 1', updaterCacheDirName: 'dsh-update-test-1-updater',
  }) }).toThrow(/productName/u)
  expect(() => { verifyPackagedApplicationIdentity(packagedApplication({
    name: '@deepseek-ai/dsh-desktop', productName: 'BirdCoder',
  }), { productName: 'BirdCoder', updaterCacheDirName: '@deepseek-aidsh-desktop-updater' }) })
    .toThrow(/updater cache/u)
})

it('ships the product name Electron reads in the application manifest and the builder configuration', async () => {
  const manifest: unknown = JSON.parse(source('package.json'))
  expect(manifest).toMatchObject({ productName: DESKTOP_PRODUCT_NAME })

  const { createElectronBuilderConfig } = await import('../scripts/electron-builder-config.mjs')
  const config = createElectronBuilderConfig({
    DSH_DESKTOP_APP_ID: 'com.sdkwork.birdcoder',
    // The unsigned lane is what the release ships; signing is covered by the macOS specs.
    DSH_DESKTOP_UNSIGNED: '1',
    DSH_DESKTOP_MANDATORY_UPDATE_TEST_ORIGIN: 'https://policy.example.com',
    DSH_DESKTOP_MANDATORY_UPDATE_CONFIG: JSON.stringify({ allowedAuthOrigins: ['https://login.example.com'] }),
  }, 'win32', 'x64')
  expect(config.productName).toBe(DESKTOP_PRODUCT_NAME)
  expect(config.protocols).toEqual([{ name: DESKTOP_PRODUCT_NAME, schemes: [DESKTOP_PROTOCOL_SCHEME] }])
})

it('registers its own URL scheme in the shell and in the development bundle', () => {
  const main = source('src/main.ts')
  expect(main).toContain(`setAsDefaultProtocolClient('${DESKTOP_PROTOCOL_SCHEME}')`)
  expect(main).toContain(`'${DESKTOP_PROTOCOL_SCHEME}://open'`)
  expect(main).not.toContain("'dsh://open'")

  const development = source('scripts/development-app.ts')
  expect(development).toContain(`CFBundleURLSchemes: ['${DESKTOP_PROTOCOL_SCHEME}']`)
  expect(development).toContain('com.sdkwork.birdcoder.dev.')
  expect(development).not.toContain('com.deepseek.harness.dev.')
})

it('installs its own desktop command, launcher and ownership records', () => {
  // The launchers must name the executable this application ships; upstream's
  // `DeepSeek Harness.exe` never exists in a BirdCoder installation.
  expect(source('cli/birdcoder')).toContain('MacOS/birdcoder')
  expect(source(`cli/${DESKTOP_CLI_COMMAND_NAME}.cmd`)).toContain('birdcoder.exe')
  expect(source('scripts/prepare-cli.ts')).toContain('DESKTOP_CLI_COMMAND_NAME')
  expect(source('src/command-manager-entry.ts')).toContain(`'/usr/local/bin/${DESKTOP_CLI_COMMAND_NAME}'`)
  expect(source('src/command-management.ts')).toContain(`'${DESKTOP_CLI_COMMAND_NAME}.cmd'`)
  expect(source('src/command-installation.ts')).toContain(`.${DESKTOP_CLI_COMMAND_NAME}-command.json`)

  const commandPath = powerShellCode(source('scripts/command-path.ps1'))
  expect(commandPath).toContain('Software\\BirdCoder\\Command')
  expect(commandPath).toContain('Global\\BirdCoder.Command.')
  expect(commandPath).not.toContain('DeepSeekHarness')
})

it('retires only its own data on uninstall and leaves the shared upstream directory alone', () => {
  const uninstall = nsisCode(source('installer/uninstall.nsh'))
  expect(uninstall).toContain('$APPDATA\\${PRODUCT_NAME}')
  // `%APPDATA%\@deepseek-ai\dsh-desktop` is an installed upstream application's
  // userData; removing it here would delete that application's Chromium profile.
  expect(uninstall).not.toContain('APP_PACKAGE_NAME')
  expect(uninstall).not.toContain('UninstallRemoveEmptyParents')
})
