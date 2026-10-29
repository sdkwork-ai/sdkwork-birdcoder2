/**
 * The brand manifest is the single source of every identity two installed
 * applications must not share: home directory, product name, scheme, command,
 * updater cache and artifact spelling.
 */

import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, it, onTestFinished } from 'vitest'
import {
  BRAND_DIRECTORY,
  brandManifestPath,
  parseBrandManifest,
  readBrandManifest,
  resolveBrand,
  shippedBrand,
} from '../scripts/brand-manifest.mjs'

/** One minimal, valid manifest; individual tests override single fields. */
const ACME = Object.freeze({
  schemaVersion: 1,
  key: 'acme',
  displayName: 'Acme Harness',
  companyName: 'Acme',
  home: { dirName: '.acme', adoptLegacyDshHome: false },
  desktop: {
    appId: 'com.acme.harness',
    productName: 'Acme Harness',
    executableName: 'acme',
    protocol: 'acme',
    commandName: 'acme',
    registryKey: 'Acme',
    updaterCacheDirName: 'acme-updater',
    artifactPrefix: 'Acme-Harness',
  },
})

/** @returns a fresh deep copy of {@link ACME}. */
function acme(): Record<string, unknown> {
  return JSON.parse(JSON.stringify(ACME)) as Record<string, unknown>
}

/** @returns a temporary directory removed when the test finishes. */
function temporaryDirectory(): string {
  const directory = mkdtempSync(join(tmpdir(), 'dsh-brand-'))
  onTestFinished(() => { rmSync(directory, { recursive: true, force: true }) })
  return directory
}

it('ships the BirdCoder brand the fork builds today', () => {
  const brand = shippedBrand()
  expect(brand.key).toBe('birdcoder')
  expect(brand.home).toEqual({ dirName: '.birdcoder', adoptLegacyDshHome: true })
  expect(brand.desktop).toEqual({
    appId: 'com.sdkwork.birdcoder',
    productName: 'BirdCoder',
    executableName: 'birdcoder',
    protocol: 'birdcoder',
    commandName: 'birdcoder',
    registryKey: 'BirdCoder',
    updaterCacheDirName: 'birdcoder-updater',
    artifactPrefix: 'BirdCoder',
  })
  expect(readBrandManifest(join(BRAND_DIRECTORY, 'birdcoder.json'))).toEqual(brand)
})

it('accepts a second brand with its own home and desktop identity', () => {
  const brand = parseBrandManifest(acme(), 'acme.json')
  expect(brand.home.dirName).toBe('.acme')
  expect(brand.desktop.productName).toBe('Acme Harness')
  expect(Object.isFrozen(brand)).toBe(true)
  expect(Object.isFrozen(brand.home)).toBe(true)
})

it('selects one manifest by key, by explicit path, and by default', () => {
  const directory = temporaryDirectory()
  writeFileSync(join(directory, 'acme.json'), JSON.stringify(ACME))
  const explicit = join(directory, 'acme.json')

  expect(resolveBrand({ DSH_BRAND: 'acme' }, directory).key).toBe('acme')
  expect(resolveBrand({ DSH_BRAND_CONFIG: explicit }).key).toBe('acme')
  expect(resolveBrand({}).key).toBe('birdcoder')
  expect(brandManifestPath({}, directory)).toBe(join(directory, 'birdcoder.json'))
  // A blank selection is the shipped brand, never the working directory.
  expect(resolveBrand({ DSH_BRAND: '  ' }).key).toBe('birdcoder')
})

it('rejects an identity that belongs to the upstream application', () => {
  const cases: Array<[string, (manifest: Record<string, unknown>) => void]> = [
    ['home.dirName', (manifest) => { (manifest.home as Record<string, unknown>).dirName = '.dsh' }],
    ['desktop.productName', (manifest) => { (manifest.desktop as Record<string, unknown>).productName = 'DeepSeek Harness' }],
    ['desktop.protocol', (manifest) => { (manifest.desktop as Record<string, unknown>).protocol = 'dsh' }],
    ['desktop.commandName', (manifest) => { (manifest.desktop as Record<string, unknown>).commandName = 'dsh' }],
    ['desktop.appId', (manifest) => { (manifest.desktop as Record<string, unknown>).appId = 'com.deepseek.harness' }],
  ]
  for (const [field, corrupt] of cases) {
    const manifest = acme()
    corrupt(manifest)
    expect(() => parseBrandManifest(manifest), field).toThrow(new RegExp(field.replace('.', '\\.'), 'u'))
  }
})

it('rejects malformed fields instead of falling back', () => {
  const bad: Array<[string, (manifest: Record<string, unknown>) => void]> = [
    ['schemaVersion', (manifest) => { manifest.schemaVersion = 2 }],
    ['key', (manifest) => { manifest.key = 'Acme' }],
    ['home.dirName', (manifest) => { (manifest.home as Record<string, unknown>).dirName = 'acme' }],
    ['home.dirName', (manifest) => { (manifest.home as Record<string, unknown>).dirName = '.ACME' }],
    ['home.adoptLegacyDshHome', (manifest) => { (manifest.home as Record<string, unknown>).adoptLegacyDshHome = 'yes' }],
    ['desktop.appId', (manifest) => { (manifest.desktop as Record<string, unknown>).appId = 'acme' }],
    ['desktop.protocol', (manifest) => { (manifest.desktop as Record<string, unknown>).protocol = 'Acme Scheme' }],
    ['desktop.productName', (manifest) => { (manifest.desktop as Record<string, unknown>).productName = 'Acme/Harness' }],
    ['displayName', (manifest) => { manifest.displayName = 'Acme\u0000' }],
    ['desktop', (manifest) => { delete manifest.desktop }],
  ]
  for (const [field, corrupt] of bad) {
    const manifest = acme()
    corrupt(manifest)
    expect(() => parseBrandManifest(manifest), field).toThrow(/brand:/u)
  }
})

it('packages a second brand with its own identity and ships its manifest', async () => {
  const directory = temporaryDirectory()
  const manifest = join(directory, 'acme.json')
  writeFileSync(manifest, JSON.stringify(ACME))
  const { createElectronBuilderConfig } = await import('../scripts/electron-builder-config.mjs')
  const config = createElectronBuilderConfig({
    DSH_BRAND_CONFIG: manifest,
    DSH_DESKTOP_APP_ID: 'com.acme.harness',
    DSH_DESKTOP_UNSIGNED: '1',
    DSH_DESKTOP_MANDATORY_UPDATE_TEST_ORIGIN: 'https://policy.example.com',
    DSH_DESKTOP_MANDATORY_UPDATE_CONFIG: JSON.stringify({ allowedAuthOrigins: ['https://login.example.com'] }),
  }, 'win32', 'x64')

  expect(config.productName).toBe('Acme Harness')
  expect(config.executableName).toBe('acme')
  expect(config.protocols).toEqual([{ name: 'Acme Harness', schemes: ['acme'] }])
  expect(config.artifactName).toContain('Acme-Harness-')
  // Electron names the application after the packaged manifest, which electron-builder fills from extraMetadata.
  expect(config.extraMetadata.productName).toBe('Acme Harness')
  expect(config.extraMetadata.dshDesktopAppId).toBe('com.acme.harness')
  // The shell reads this file at start to resolve its brand home.
  expect(config.extraResources).toContainEqual({ from: manifest, to: 'brand.json' })
})
