#!/usr/bin/env node
/**
 * `dsh-sdkwork-env-bootstrap` — CLI for {@link ensureSdkworkBootstrapToken}:
 * apply the source/dev launch profile (identity keys + gateway + overlay),
 * then ensure the SDKWork profile has a bootstrap access token, generating
 * a disposable local JWT for development (and test with
 * `--allow-test-token-generation`) into the gitignored profile overlay.
 * `pnpm build` and `pnpm desktop:dev` run this so Electron does not have to
 * generate the token through the bundled dynamic import.
 * @module @deepseek-ai/dsh-sdkwork-env-bootstrap/bin
 */

import {
  applySdkworkLaunchEnv,
  ensureSdkworkBootstrapToken,
  materializeEnsuredBootstrapAccessToken,
  resolveSdkworkLaunchProfile,
} from './index.ts'

const ALLOW_TEST_FLAG = '--allow-test-token-generation'

const allowTestTokenGeneration = process.argv.includes(ALLOW_TEST_FLAG)
const cwd = process.cwd()
const { cwd: repoRoot } = applySdkworkLaunchEnv({
  cwd,
  profile: resolveSdkworkLaunchProfile(cwd),
  env: process.env,
})

const result = await ensureSdkworkBootstrapToken({
  cwd: repoRoot,
  env: process.env,
  allowTestTokenGeneration,
})

// Materialize an ensured token into the process environment so the ui-sdkwork-env
// host projection (which reads the launch environment synchronously) sees it
// without re-parsing the overlay file.
materializeEnsuredBootstrapAccessToken(result, process.env)

switch (result.status) {
  case 'unconfigured':
    process.stdout.write('sdkwork-env: no SDKWork profile declared; nothing to ensure\n')
    break
  case 'configured':
    process.stdout.write('sdkwork-env: SDKWORK_ACCESS_TOKEN is configured in the environment\n')
    break
  case 'registered':
    process.stdout.write('sdkwork-env: bootstrap access token available from the registration output (.sdkwork.local.env)\n')
    break
  case 'generated':
    process.stdout.write(`sdkwork-env: bootstrap access token ensured at ${result.path}\n`)
    break
  case 'unavailable':
    process.stdout.write(`sdkwork-env: no bootstrap access token ensured (${result.reason}); deferring to interactive IAM login\n`)
    break
  default:
    result satisfies never
}
