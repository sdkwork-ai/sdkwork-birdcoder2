/**
 * Each brand owns its Harness home, and a first packaged launch moves the
 * legacy `~/.dsh` data into it without ever losing it.
 */

import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, it, onTestFinished } from 'vitest'
import { parseBrandManifest } from '../scripts/brand-manifest.mjs'
import type { BrandHomeFileSystem } from '../src/brand.ts'
import { applyBrandBootstrap, applyBrandHome, resolveRuntimeBrand } from '../src/brand.ts'

/** One brand that takes over the legacy home, and one that never touches it. */
const ADOPTING = parseBrandManifest({
  schemaVersion: 1,
  key: 'birdcoder',
  displayName: 'BirdCoder',
  companyName: 'SDKWork',
  home: { dirName: '.birdcoder', adoptLegacyDshHome: true },
  desktop: {
    appId: 'com.sdkwork.birdcoder', productName: 'BirdCoder', executableName: 'birdcoder', protocol: 'birdcoder',
    commandName: 'birdcoder', registryKey: 'BirdCoder', updaterCacheDirName: 'birdcoder-updater', artifactPrefix: 'BirdCoder',
  },
})
const ISOLATED = parseBrandManifest({
  schemaVersion: 1,
  key: 'acme',
  displayName: 'Acme',
  companyName: 'Acme',
  home: { dirName: '.acme', adoptLegacyDshHome: false },
  desktop: {
    appId: 'com.acme.harness', productName: 'Acme Harness', executableName: 'acme', protocol: 'acme',
    commandName: 'acme', registryKey: 'Acme', updaterCacheDirName: 'acme-updater', artifactPrefix: 'Acme',
  },
})

/** @returns a temporary operating-system home removed when the test finishes. */
function operatingSystemHome(): string {
  const directory = mkdtempSync(join(tmpdir(), 'dsh-brand-home-'))
  onTestFinished(() => { rmSync(directory, { recursive: true, force: true }) })
  return directory
}

/** A filesystem facade whose two mutating operations can fail on demand. */
function failingFiles(outcomes: { rename?: Error; link?: Error }): BrandHomeFileSystem & { linked: string[] } {
  const linked: string[] = []
  return {
    linked,
    exists: path => existsSync(path),
    rename: () => { throw outcomes.rename ?? new Error('not used') },
    link: (target, path) => {
      if (outcomes.link !== undefined) throw outcomes.link
      linked.push(`${target} -> ${path}`)
    },
  }
}

it('keeps an explicit DSH_HOME and never moves data', () => {
  const home = operatingSystemHome()
  mkdirSync(join(home, '.dsh'))
  const env: Record<string, string | undefined> = { DSH_HOME: join(home, 'elsewhere') }
  const result = applyBrandHome({ brand: ADOPTING, env, homeDirectory: home })
  expect(result).toMatchObject({ home: join(home, 'elsewhere'), source: 'env', adoption: 'none' })
  expect(existsSync(join(home, '.dsh'))).toBe(true)
})

it('uses the brand home when no legacy home exists', () => {
  const home = operatingSystemHome()
  const env: Record<string, string | undefined> = {}
  const result = applyBrandHome({ brand: ADOPTING, env, homeDirectory: home, allowAdoption: true })
  expect(result).toMatchObject({ home: join(home, '.birdcoder'), source: 'brand', adoption: 'none' })
  expect(env.DSH_HOME).toBe(join(home, '.birdcoder'))
})

it('renames a legacy home into the brand home on a packaged launch', () => {
  const home = operatingSystemHome()
  mkdirSync(join(home, '.dsh'))
  writeFileSync(join(home, '.dsh', 'credentials.yaml'), 'kept')
  const env: Record<string, string | undefined> = {}
  const result = applyBrandHome({ brand: ADOPTING, env, homeDirectory: home, allowAdoption: true })
  expect(result).toMatchObject({ source: 'brand', adoption: 'renamed' })
  expect(existsSync(join(home, '.dsh'))).toBe(false)
  expect(readFileSync(join(home, '.birdcoder', 'credentials.yaml'), 'utf8')).toBe('kept')
  expect(env.DSH_HOME).toBe(join(home, '.birdcoder'))
})

it('links the brand home when the rename is refused', () => {
  const home = operatingSystemHome()
  mkdirSync(join(home, '.dsh'))
  const files = failingFiles({ rename: Object.assign(new Error('busy'), { code: 'EBUSY' }) })
  const env: Record<string, string | undefined> = {}
  const result = applyBrandHome({ brand: ADOPTING, env, homeDirectory: home, allowAdoption: true, files })
  expect(result).toMatchObject({ home: join(home, '.birdcoder'), source: 'brand', adoption: 'linked' })
  expect(files.linked).toEqual([`${join(home, '.dsh')} -> ${join(home, '.birdcoder')}`])
  expect(existsSync(join(home, '.dsh'))).toBe(true)
})

it('keeps using the legacy home when neither move nor link is possible', () => {
  const home = operatingSystemHome()
  mkdirSync(join(home, '.dsh'))
  const files = failingFiles({ rename: new Error('busy'), link: new Error('denied') })
  const env: Record<string, string | undefined> = {}
  const result = applyBrandHome({ brand: ADOPTING, env, homeDirectory: home, allowAdoption: true, files })
  expect(result).toMatchObject({ home: join(home, '.dsh'), source: 'legacy', adoption: 'kept-legacy' })
  expect(env.DSH_HOME).toBe(join(home, '.dsh'))
})

it('leaves a legacy home alone for a brand that does not adopt it, and for unpackaged launches', () => {
  const home = operatingSystemHome()
  mkdirSync(join(home, '.dsh'))
  writeFileSync(join(home, '.dsh', 'session'), 'other product')
  const isolated: Record<string, string | undefined> = {}
  expect(applyBrandHome({ brand: ISOLATED, env: isolated, homeDirectory: home, allowAdoption: true }))
    .toMatchObject({ home: join(home, '.dsh'), source: 'legacy', adoption: 'skipped' })

  const development: Record<string, string | undefined> = {}
  expect(applyBrandHome({ brand: ADOPTING, env: development, homeDirectory: home }))
    .toMatchObject({ home: join(home, '.dsh'), source: 'legacy', adoption: 'skipped' })
  expect(existsSync(join(home, '.dsh', 'session'))).toBe(true)
  expect(existsSync(join(home, '.birdcoder'))).toBe(false)
})

it('applies nothing outside an installed application or the development launcher', () => {
  const home = operatingSystemHome()
  const env: Record<string, string | undefined> = {}
  const brand = resolveRuntimeBrand({ appPath: 'desktop-test-app', resourcesPath: 'relative-resources', env })
  expect(brand.key).toBe('birdcoder')
  expect(applyBrandBootstrap({ brand, packaged: false, env, resourcesPath: 'relative-resources', homeDirectory: home }))
    .toEqual({ brand, home: undefined })
  expect(env.DSH_HOME).toBeUndefined()
})

it('reads a packaged brand manifest, applies its home, and defaults the OEM profile', () => {
  const home = operatingSystemHome()
  const resources = join(home, 'resources')
  mkdirSync(resources)
  writeFileSync(join(resources, 'brand.json'), JSON.stringify({
    schemaVersion: 1,
    key: 'acme',
    displayName: 'Acme',
    companyName: 'Acme',
    home: { dirName: '.acme' },
    desktop: {
      appId: 'com.acme.harness', productName: 'Acme Harness', executableName: 'acme', protocol: 'acme',
      commandName: 'acme', registryKey: 'Acme', updaterCacheDirName: 'acme-updater', artifactPrefix: 'Acme',
    },
  }))
  writeFileSync(join(resources, 'oem.json'), JSON.stringify({ brand: { name: 'Acme' } }))
  const env: Record<string, string | undefined> = { DSH_DESKTOP_DEV_APP: '1' }
  const brand = resolveRuntimeBrand({ resourcesPath: resources, env })
  expect(brand.home.dirName).toBe('.acme')

  const bootstrap = applyBrandBootstrap({ brand, packaged: false, env, resourcesPath: resources, homeDirectory: home })
  expect(bootstrap.home).toMatchObject({ home: join(home, '.acme'), source: 'brand' })
  expect(env.DSH_HOME).toBe(join(home, '.acme'))
  expect(env.DSH_OEM_CONFIG).toBe(join(resources, 'oem.json'))
})

it('lets a home oem.json win over the shipped profile', () => {  const home = operatingSystemHome()
  const resources = join(home, 'resources')
  mkdirSync(resources)
  mkdirSync(join(home, '.acme'))
  writeFileSync(join(home, '.acme', 'oem.json'), JSON.stringify({ brand: { name: 'Local' } }))
  writeFileSync(join(resources, 'brand.json'), JSON.stringify({
    schemaVersion: 1, key: 'acme', displayName: 'Acme', companyName: 'Acme', home: { dirName: '.acme' },
    desktop: {
      appId: 'com.acme.harness', productName: 'Acme Harness', executableName: 'acme', protocol: 'acme',
      commandName: 'acme', registryKey: 'Acme', updaterCacheDirName: 'acme-updater', artifactPrefix: 'Acme',
    },
  }))
  writeFileSync(join(resources, 'oem.json'), JSON.stringify({ brand: { name: 'Shipped' } }))
  const env: Record<string, string | undefined> = { DSH_DESKTOP_DEV_APP: '1' }
  const brand = resolveRuntimeBrand({ resourcesPath: resources, env })
  applyBrandBootstrap({ brand, packaged: false, env, resourcesPath: resources, homeDirectory: home })
  expect(env.DSH_OEM_CONFIG).toBeUndefined()
})

it('renders the installed CLI launchers for a brand command and home', async () => {
  const directory = operatingSystemHome()
  const manifest = join(directory, 'acme.json')
  writeFileSync(manifest, JSON.stringify({
    schemaVersion: 1, key: 'acme', displayName: 'Acme', companyName: 'Acme', home: { dirName: '.acme' },
    desktop: {
      appId: 'com.acme.harness', productName: 'Acme Harness', executableName: 'acme', protocol: 'acme',
      commandName: 'acme', registryKey: 'Acme', updaterCacheDirName: 'acme-updater', artifactPrefix: 'Acme',
    },
  }))
  const { prepareDesktopCli } = await import('../scripts/prepare-cli.ts')
  prepareDesktopCli(directory, 'win32', { DSH_BRAND_CONFIG: manifest })
  const windows = readFileSync(join(directory, 'bin', 'acme.cmd'), 'utf8')
  expect(windows).toContain('acme.exe')
  expect(windows).toContain('%USERPROFILE%\\.acme')
  expect(windows).not.toContain('birdcoder')

  prepareDesktopCli(directory, 'darwin', { DSH_BRAND_CONFIG: manifest })
  const unix = readFileSync(join(directory, 'bin', 'acme'), 'utf8')
  expect(unix).toContain('MacOS/acme')
  expect(unix).toContain('DSH_HOME="$HOME/.acme"')
})
