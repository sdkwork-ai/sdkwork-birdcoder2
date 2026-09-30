import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, expect, it } from 'vitest'
import { applyDesktopLaunchEnvironment } from '../src/launch-environment.ts'

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
  writeFileSync(join(root, 'sdkwork.app.config.json'), '{}\n')
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
