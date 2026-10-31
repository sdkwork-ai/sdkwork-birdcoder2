import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const PROFILES = ['standalone', 'cloud'] as const
const ENVIRONMENTS = ['development', 'test', 'staging', 'demo', 'production'] as const
const TARGETS = ['tablet-ipados', 'tablet-android'] as const

function readEnvFile(name: string): Map<string, string> {
  const values = new Map<string, string>()
  for (const line of fs.readFileSync(path.join(appRoot, name), 'utf8').split(/\r?\n/u)) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/u)
    const key = match?.[1]
    const value = match?.[2]
    if (key !== undefined && value !== undefined) values.set(key, value)
  }
  return values
}

function envFiles(): string[] {
  return fs.readdirSync(appRoot)
    .filter(name => name.startsWith('.env.') && !name.endsWith('.local') && !name.endsWith('.example'))
    .sort()
}

describe('tablet environment matrix', () => {
  it('has an iPadOS and an Android tablet file for every profile and environment', () => {
    const expected: string[] = []
    for (const profile of PROFILES) {
      for (const environment of ENVIRONMENTS) {
        expected.push(`.env.${profile}.${environment}`)
        expected.push(`.env.${profile}.${environment}.tablet-android`)
      }
    }
    expect(envFiles()).toEqual(expected.sort())
  })

  it('declares the full tablet identity in every file', () => {
    for (const name of envFiles()) {
      const values = readEnvFile(name)
      const match = name.match(
        /^\.env\.(standalone|cloud)\.(development|test|staging|demo|production)(\.tablet-android)?$/u,
      )
      expect(match).not.toBeNull()
      const [, profile, environment, androidSuffix] = match as RegExpMatchArray
      const expectedTarget = androidSuffix ? 'tablet-android' : 'tablet-ipados'
      expect(values.get('VITE_SDKWORK_ENVIRONMENT')).toBe(environment)
      expect(values.get('VITE_SDKWORK_DEPLOYMENT_PROFILE')).toBe(profile)
      expect(values.get('VITE_SDKWORK_PROFILE_ID')).toBe(`${profile}.${environment}`)
      expect(values.get('VITE_SDKWORK_RUNTIME_TARGET')).toBe(expectedTarget)
      expect(values.get('VITE_SDKWORK_SURFACE')).toBe('pad')
    }
  })

  it('contains no secret-bearing keys', () => {
    const forbidden = /(?:SECRET|PASSWORD|ACCESS_TOKEN|REFRESH_TOKEN|API_KEY|PRIVATE_KEY)/u
    for (const name of envFiles()) {
      for (const [key, value] of readEnvFile(name)) {
        expect(forbidden.test(key)).toBe(false)
        expect(/^(?:TODO|REPLACE_ME|CHANGEME)$/u.test(value)).toBe(false)
      }
    }
  })

  it('keeps renderer and tablet templates for every profile', () => {
    for (const profile of PROFILES) {
      for (const environment of ENVIRONMENTS) {
        const profileId = `${profile}.${environment}`
        const renderer = JSON.parse(
          fs.readFileSync(path.join(appRoot, 'config', 'browser', `runtime-env.${profileId}.example.json`), 'utf8'),
        ) as { runtimeTargets: string[]; deploymentProfile: string; environment: string }
        expect(renderer.deploymentProfile).toBe(profile)
        expect(renderer.environment).toBe(environment)
        expect(renderer.runtimeTargets).toEqual([...TARGETS])

        const tabletToml = fs.readFileSync(
          path.join(appRoot, 'config', 'tablet', `sdkwork-birdcoder2-pad.${profileId}.toml.example`),
          'utf8',
        )
        expect(tabletToml).toContain('secure_storage_provider')
        expect(tabletToml).toContain(`profile_id = "${profileId}"`)
        expect(tabletToml).not.toMatch(/^\s*(?:password|secret|access_token)\s*=/imu)
      }
    }
  })

  it('does not carry server or container config in the pad root', () => {
    expect(fs.existsSync(path.join(appRoot, 'config', 'server'))).toBe(false)
    expect(fs.existsSync(path.join(appRoot, 'config', 'container'))).toBe(false)
  })
})

describe('tablet application manifest', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(appRoot, 'agent.app.config.json'), 'utf8')) as {
    app: { appType: string }
    runtime: {
      family: string
      framework: string
      clientArchitectures: string[]
      targetPlatforms: string[]
      supportedDeploymentProfiles: string[]
      defaultDeploymentProfile: string
    }
    publish: { platforms: string[] }
    artifacts: { installConfig: { packages: { runtimeTarget: string; clientArchitecture: string; deploymentProfile: string }[] } }
  }

  it('declares the canonical tablet runtime shape', () => {
    expect(manifest.app.appType).toBe('APP_REACT')
    expect(manifest.runtime.family).toBe('desktop')
    expect(manifest.runtime.framework).toBe('react-tauri')
    expect(manifest.runtime.clientArchitectures).toEqual(['tauri'])
    expect(manifest.runtime.targetPlatforms.sort()).toEqual(['android-tablet', 'ipados'])
    expect(manifest.runtime.supportedDeploymentProfiles.sort()).toEqual(['cloud', 'standalone'])
    expect(manifest.runtime.supportedDeploymentProfiles).toContain(manifest.runtime.defaultDeploymentProfile)
  })

  it('publishes only iPadOS and Android tablet store platforms', () => {
    expect(manifest.publish.platforms.sort()).toEqual(['APP_ANDROID', 'APP_IOS'])
  })

  it('binds every package to a tablet target and tauri architecture', () => {
    const packages = manifest.artifacts.installConfig.packages
    expect(packages.length).toBeGreaterThan(0)
    for (const pkg of packages) {
      expect(TARGETS).toContain(pkg.runtimeTarget)
      expect(pkg.clientArchitecture).toBe('tauri')
      expect(['standalone', 'cloud']).toContain(pkg.deploymentProfile)
    }
    const profiles = new Set(packages.map(pkg => pkg.deploymentProfile))
    expect([...profiles].sort()).toEqual(['cloud', 'standalone'])
  })
})

describe('tablet host package', () => {
  it('owns exactly one pad-tauri host package', () => {
    const packageNames = fs.readdirSync(path.join(appRoot, 'packages'))
      .filter(name => fs.statSync(path.join(appRoot, 'packages', name)).isDirectory())
    const hosts = packageNames.filter(name => /-(?:tauri|electron|capacitor|host|desktop)$/u.test(name))
    expect(hosts).toEqual(['sdkwork-birdcoder2-pad-tauri'])
  })

  it('keeps the host manifest and native targets in place', () => {
    const hostRoot = path.join(appRoot, 'packages', 'sdkwork-birdcoder2-pad-tauri')
    for (const relative of [
      'package.json',
      'src-tauri/tauri.conf.json',
      'src-tauri/tauri.ios.conf.json',
      'src-tauri/tauri.android.conf.json',
      'src-tauri/Cargo.toml',
    ]) {
      expect(fs.existsSync(path.join(hostRoot, relative))).toBe(true)
    }
  })
})
