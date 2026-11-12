import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  DESKTOP_SDKWORK_PROFILE_VARIABLE,
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

it('reads the credential bundle the launch declares for a home outside the checkout', async () => {
  const root = fixture()
  const home = fixture()
  // The credential lives where the operator provisioned it, under the application
  // code the launch declares — never under the profile directory name
  // (`.../profiles/desktop`), which identifies nothing.
  const bundle = join(home, '.sdkwork', 'birdcoder2', 'credentials', 'standalone.production.json')
  mkdirSync(join(bundle, '..'), { recursive: true })
  writeFileSync(bundle, `${JSON.stringify({ accessToken: 'bundle-token', environment: 'production', deploymentProfile: 'standalone' })}\n`)
  const env: Record<string, string | undefined> = { SDKWORK_APPLICATION_CODE: 'birdcoder2' }

  await applyDesktopLaunchEnvironment({ cwd: root, env, homeDir: home, warn: () => {} })

  expect(env.SDKWORK_ACCESS_TOKEN).toBe('bundle-token')
  expect(env.SDKWORK_APPLICATION_CODE).toBe('birdcoder2')
})

it('would look under the profile directory name without the declared application code', async () => {
  const root = fixture()
  const home = fixture()
  const bundle = join(home, '.sdkwork', 'birdcoder2', 'credentials', 'standalone.production.json')
  mkdirSync(join(bundle, '..'), { recursive: true })
  writeFileSync(bundle, `${JSON.stringify({ accessToken: 'bundle-token', environment: 'production', deploymentProfile: 'standalone' })}\n`)
  const env: Record<string, string | undefined> = {}

  await applyDesktopLaunchEnvironment({ cwd: root, env, homeDir: home, warn: () => {} })

  // Control: without the code the bundle is invisible and the production tier
  // fails closed with no token.
  expect(env.SDKWORK_ACCESS_TOKEN).toBeUndefined()
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
  // The committed public application access token of the pinned profile: the
  // online lane runs on it, and it does not expire (`exp` is a rotation ceiling).
  const publicToken = [
    Buffer.from(JSON.stringify({ alg: 'none', kid: 'public-app-token', typ: 'JWT' })).toString('base64url'),
    Buffer.from(JSON.stringify({
      app_id: 'app_01a18b4f-6f61-7ff1-b86c-75b54995883f',
      aud: 'app_01a18b4f-6f61-7ff1-b86c-75b54995883f',
      environment: 'production',
      exp: 0,
      organization_id: '0',
      tenant_id: '100001',
      token_class: 'application',
      token_type: 'access',
    })).toString('base64url'),
    'public',
  ].join('.')
  writeFileSync(join(root, '.env.standalone.production'), `SDKWORK_ACCESS_TOKEN=${publicToken}\n`)
  const profile = join(root, 'apps', 'desktop', '.desktop-build', 'online', 'home', 'profiles', 'desktop')
  mkdirSync(profile, { recursive: true })
  const env: Record<string, string | undefined> = {
    SDKWORK_ENVIRONMENT: 'production',
    SDKWORK_PROFILE_ID: 'standalone.production',
    SDKWORK_BIRDCODER_PLATFORM_API_GATEWAY_HTTP_URL: 'https://api.birdcoder.com',
    [DESKTOP_SDKWORK_PROFILE_VARIABLE]: 'production',
  }

  const applied = await applyDesktopLaunchEnvironment({ cwd: profile, env, homeDir: fixture(), warn: () => {} })

  // Without the declaration this exact environment is the unmarked packaged-production
  // leak the checkout test drops: the profile would re-resolve onto the checkout's
  // development tier and its tracked development gateway. With it, the production
  // identity and gateway survive, the project layer stays the online home, and the
  // pinned profile's committed non-expiring token reaches the launch snapshot.
  expect(applied.cwd).toBe(profile)
  expect(env).toMatchObject({
    SDKWORK_ENVIRONMENT: 'production',
    SDKWORK_PROFILE_ID: 'standalone.production',
    SDKWORK_BIRDCODER_PLATFORM_API_GATEWAY_HTTP_URL: 'https://api.birdcoder.com',
    SDKWORK_ACCESS_TOKEN: publicToken,
  })
}, 30_000)
