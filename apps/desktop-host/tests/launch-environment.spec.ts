import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  DESKTOP_SDKWORK_PROFILE_VARIABLE,
  DESKTOP_SDKWORK_RELEASE_ENV_FILE_VARIABLE,
  applyDesktopLaunchEnvironment,
  resolveDesktopLaunchProfile,
} from '../src/launch-environment.ts'

const roots: string[] = []
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})

function fixture(): string {
  const root = mkdtempSync(join(tmpdir(), 'desktop-launch-environment-'))
  roots.push(root)
  return root
}

/** One source checkout: the manifest that identifies it plus the tracked environment. */
function checkout(root: string, environment: string, gateway: string): void {
  writeFileSync(join(root, 'agent.app.config.json'), '{}\n')
  // The tracked two-segment materialization, not a retired overlay; env-naming:allow.
  writeFileSync(join(root, `.env.standalone.${environment}`), `SDKWORK_BIRDCODER_PLATFORM_API_GATEWAY_HTTP_URL=${gateway}\n`)
}

it('fills the production identity and gateway for a profile outside any checkout', async () => {
  const root = fixture()
  const env: Record<string, string | undefined> = {}

  const applied = await applyDesktopLaunchEnvironment({ cwd: root, env, warn: () => {} })

  // An installed application's home directory carries no checkout manifest, so the
  // launcher declares production and the invoking directory stays the project layer.
  expect(applied.cwd).toBe(root)
  expect(env).toMatchObject({
    SDKWORK_ENVIRONMENT: 'production',
    SDKWORK_PROFILE_ID: 'standalone.production',
    SDKWORK_BIRDCODER_PLATFORM_API_GATEWAY_HTTP_URL: 'https://api.birdcoder.com',
  })
  // Production credentials come from a private secret source, never from a fixture.
  expect(env.SDKWORK_ACCESS_TOKEN).toBeUndefined()
})

it('resolves the checkout root and its tracked environment from a nested profile directory', async () => {
  const root = fixture()
  checkout(root, 'development', 'http://127.0.0.1:10240')
  writeFileSync(join(root, '.sdkwork.local.env'), 'SDKWORK_ACCESS_TOKEN=registered-token\n')
  const profile = join(root, 'apps', 'desktop', '.desktop-build', 'development', 'home', 'profiles', 'desktop')
  mkdirSync(profile, { recursive: true })
  const env: Record<string, string | undefined> = {}

  const applied = await applyDesktopLaunchEnvironment({ cwd: profile, env, warn: () => {} })

  // The development profile directory sits inside the checkout: the project layer is
  // the checkout root, its tracked gateway wins over the built-in default, and the
  // registration output reaches the launch snapshot the browser reads.
  expect(applied.cwd).toBe(root)
  expect(env).toMatchObject({
    SDKWORK_ENVIRONMENT: 'development',
    SDKWORK_BIRDCODER_PLATFORM_API_GATEWAY_HTTP_URL: 'http://127.0.0.1:10240',
    SDKWORK_ACCESS_TOKEN: 'registered-token',
  })
  // A development profile first tries the IAM application-bootstrap provisioning
  // path, whose first use transforms the sibling SDK packages; on a loaded host
  // that costs seconds while every other case here stays under a millisecond.
}, 30_000)

it('keeps an inherited gateway and token instead of replacing them', async () => {
  const root = fixture()
  checkout(root, 'development', 'http://127.0.0.1:10240')
  const env: Record<string, string | undefined> = {
    SDKWORK_BIRDCODER_PLATFORM_API_GATEWAY_HTTP_URL: 'https://gateway.example',
    SDKWORK_ACCESS_TOKEN: 'provisioned-token',
  }

  await applyDesktopLaunchEnvironment({ cwd: root, env, warn: () => {} })

  expect(env).toMatchObject({
    SDKWORK_BIRDCODER_PLATFORM_API_GATEWAY_HTTP_URL: 'https://gateway.example',
    SDKWORK_ACCESS_TOKEN: 'provisioned-token',
  })
})

it('applies the packaged release environment an installed application carries', async () => {
  const root = fixture()
  const release = join(root, 'sdkwork-release.env')
  writeFileSync(release, [
    'SDKWORK_ENVIRONMENT=production',
    'SDKWORK_PROFILE_ID=standalone.production',
    'SDKWORK_BIRDCODER_PLATFORM_API_GATEWAY_HTTP_URL=https://gateway.example',
    'SDKWORK_ACCESS_TOKEN=packaged-token',
    '',
  ].join('\n'))
  const env: Record<string, string | undefined> = { [DESKTOP_SDKWORK_RELEASE_ENV_FILE_VARIABLE]: release }
  const warnings: string[] = []

  // The fixture is an installed application's home: no checkout manifest, so the
  // artifact is the only source of the deployment and its bootstrap credential.
  const applied = await applyDesktopLaunchEnvironment({ cwd: root, env, warn: (line) => { warnings.push(line) } })

  expect(applied.cwd).toBe(root)
  expect(env).toMatchObject({
    SDKWORK_ENVIRONMENT: 'production',
    SDKWORK_PROFILE_ID: 'standalone.production',
    SDKWORK_BIRDCODER_PLATFORM_API_GATEWAY_HTTP_URL: 'https://gateway.example',
    SDKWORK_ACCESS_TOKEN: 'packaged-token',
  })
  expect(warnings.some(line => line.includes('packaged SDKWork release value'))).toBe(true)
})

it('keeps the operator environment over the packaged release environment', async () => {
  const root = fixture()
  const release = join(root, 'sdkwork-release.env')
  writeFileSync(release, [
    'SDKWORK_PROFILE_ID=standalone.production',
    'SDKWORK_ACCESS_TOKEN=packaged-token',
    '',
  ].join('\n'))
  const env: Record<string, string | undefined> = {
    [DESKTOP_SDKWORK_RELEASE_ENV_FILE_VARIABLE]: release,
    SDKWORK_ACCESS_TOKEN: 'operator-token',
  }

  await applyDesktopLaunchEnvironment({ cwd: root, env, warn: () => {} })

  expect(env.SDKWORK_ACCESS_TOKEN).toBe('operator-token')
  expect(env.SDKWORK_PROFILE_ID).toBe('standalone.production')
})

it('warns and continues when the named release environment is missing', async () => {
  const root = fixture()
  const env: Record<string, string | undefined> = {
    [DESKTOP_SDKWORK_RELEASE_ENV_FILE_VARIABLE]: join(root, 'absent.env'),
  }
  const warnings: string[] = []

  await applyDesktopLaunchEnvironment({ cwd: root, env, warn: (line) => { warnings.push(line) } })

  expect(warnings.some(line => line.includes('no packaged SDKWork release environment'))).toBe(true)
  expect(env.SDKWORK_ENVIRONMENT).toBe('production')
})

describe('resolveDesktopLaunchProfile', () => {
  const checkoutRoot = join('repo', 'with', 'agent.app.config.json')

  it('keeps the checkout test when no declaration is exported', () => {
    expect(resolveDesktopLaunchProfile({}, checkoutRoot)).toBe('development')
    expect(resolveDesktopLaunchProfile({ [DESKTOP_SDKWORK_PROFILE_VARIABLE]: '  ' }, checkoutRoot)).toBe('development')
  })

  it('lets the desktop:prod declaration pin production over the checkout test', () => {
    expect(resolveDesktopLaunchProfile({ [DESKTOP_SDKWORK_PROFILE_VARIABLE]: 'production' }, checkoutRoot))
      .toBe('production')
  })

  it('fails the launch on any other declared value', () => {
    expect(() => resolveDesktopLaunchProfile({ [DESKTOP_SDKWORK_PROFILE_VARIABLE]: 'development' }, checkoutRoot))
      .toThrow('DSH_DESKTOP_SDKWORK_PROFILE must be "production" or unset')
  })
})

it('applies the online-debug production declaration inside a checkout without dropping the tier', async () => {
  const root = fixture()
  checkout(root, 'development', 'http://127.0.0.1:10240')
  const profile = join(root, 'apps', 'desktop', '.desktop-build', 'online', 'home', 'profiles', 'desktop')
  mkdirSync(profile, { recursive: true })
  const env: Record<string, string | undefined> = {
    SDKWORK_ENVIRONMENT: 'production',
    SDKWORK_PROFILE_ID: 'standalone.production',
    SDKWORK_BIRDCODER_PLATFORM_API_GATEWAY_HTTP_URL: 'https://api.birdcoder.com',
    [DESKTOP_SDKWORK_PROFILE_VARIABLE]: 'production',
  }

  const applied = await applyDesktopLaunchEnvironment({ cwd: profile, env, warn: () => {} })

  // Without the declaration this exact environment is the unmarked packaged-production
  // leak the checkout test drops: the profile would re-resolve onto the checkout's
  // development tier and its tracked development gateway. With it, the production
  // identity and gateway survive, and the project layer stays the online home.
  expect(applied.cwd).toBe(profile)
  expect(env).toMatchObject({
    SDKWORK_ENVIRONMENT: 'production',
    SDKWORK_PROFILE_ID: 'standalone.production',
    SDKWORK_BIRDCODER_PLATFORM_API_GATEWAY_HTTP_URL: 'https://api.birdcoder.com',
  })
}, 30_000)
