/** Fail fast when workspace-linked generated TypeScript SDKs use pre-1.0.11 generator output. */
import { readFileSync } from 'node:fs'
import { globSync } from 'node:fs'
import { relative, resolve } from 'node:path'

const STALE_OPTIONAL_REQUEST_PATTERN = /signal:\s*requestOptions\?\./
const STALE_BASE_REQUEST_PATTERN = /\{\s*method:\s*method as any,\s*body,\s*params,\s*headers,\s*contentType\s*\}/
const STALE_HTTP_OVERRIDE_PATTERN = /^\s*protected buildHeaders\(/m

const CLIENT_TEST_FACE = /\.(client|host)\.spec\.(?:ts|tsx)$/

const root = resolve(import.meta.dirname, '..')
const WORKSPACE_FILE = 'pnpm-workspace.yaml'

/**
 * Validate generated SDK TypeScript and client test placement under the harness root.
 * @param harnessRoot - repository root.
 * @returns diagnostics; an empty array means the checks passed.
 */
export function verifyGeneratedSdkTypescript(harnessRoot: string): string[] {
  const errors: string[] = []
  errors.push(...verifyStaleGeneratedSdkSources(harnessRoot))
  errors.push(...verifyClientTestPlacement(harnessRoot))
  return errors
}

function loadWorkspaceGeneratedSdkRoots(harnessRoot: string): string[] {
  const workspaceSource = readFileSync(resolve(harnessRoot, WORKSPACE_FILE), 'utf8')
  return workspaceSource
    .split('\n')
    .map((line) => line.trim().replace(/^-\s+"(.+)"$/, '$1').replace(/^-\s+'(.+)'$/, '$1'))
    .filter((member) => member.startsWith('../sdkwork-') && member.includes('/sdks/') && member.endsWith('-typescript'))
    .map((member) => resolve(harnessRoot, member))
}

function verifyStaleGeneratedSdkSources(harnessRoot: string): string[] {
  const errors: string[] = []
  const workspaceRoot = resolve(harnessRoot, '..')
  const generatedFiles = loadWorkspaceGeneratedSdkRoots(harnessRoot).flatMap((sdkRoot) => globSync(
    'generated/server-openapi/src/**/*.ts',
    { cwd: sdkRoot },
  ).map((filePath) => resolve(sdkRoot, filePath)))

  for (const filePath of generatedFiles) {
    const source = readFileSync(filePath, 'utf8')
    const relativePath = relative(workspaceRoot, filePath).replaceAll('\\', '/')
    if (STALE_OPTIONAL_REQUEST_PATTERN.test(source)) {
      errors.push(
        `${relativePath}: stale generator output assigns optional request fields as \`prop: value | undefined\`; regenerate with @sdkwork/sdk-generator >= 1.0.11`,
      )
      continue
    }
    if (relativePath.endsWith('/generated/server-openapi/src/api/base.ts')
      && STALE_BASE_REQUEST_PATTERN.test(source)) {
      errors.push(
        `${relativePath}: stale BaseApi.request() passes undefined optional fields literally; regenerate with @sdkwork/sdk-generator >= 1.0.11`,
      )
      continue
    }
    if (relativePath.endsWith('/generated/server-openapi/src/http/client.ts')
      && STALE_HTTP_OVERRIDE_PATTERN.test(source)
      && !source.includes('protected override buildHeaders(')) {
      errors.push(
        `${relativePath}: HttpClient is missing override modifiers required under strict TypeScript; regenerate with @sdkwork/sdk-generator >= 1.0.11`,
      )
    }
  }

  return errors
}

function verifyClientTestPlacement(harnessRoot: string): string[] {
  const errors: string[] = []
  const testFiles = globSync('packages/client/*/tests/**/*.{ts,tsx}', {
    cwd: harnessRoot,
  }).map((filePath) => resolve(harnessRoot, filePath))

  for (const filePath of testFiles) {
    const relativePath = relative(harnessRoot, filePath).replaceAll('\\', '/')
    if (!relativePath.endsWith('.spec.ts') && !relativePath.endsWith('.spec.tsx')) {
      continue
    }
    if (CLIENT_TEST_FACE.test(relativePath)) {
      continue
    }
    errors.push(
      `${relativePath}: client package tests must use *.client.spec.* or *.host.spec.* so tsconfig.host.json does not type-check browser source through the host aggregate`,
    )
  }

  return errors
}

const errors = verifyGeneratedSdkTypescript(root)
if (import.meta.main) {
  if (errors.length > 0) {
    console.error(errors.join('\n'))
    process.exitCode = 1
  } else {
    console.log('verify-generated-sdk-typescript: generated SDK TypeScript and client test placement are valid.')
  }
}
