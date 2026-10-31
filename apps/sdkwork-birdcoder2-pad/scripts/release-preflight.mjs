#!/usr/bin/env node
/**
 * Tablet release preflight.
 *
 * Fails before a store artifact is produced when the selected target,
 * environment file, Tauri configuration, icon set, or signing hygiene is not
 * release-ready. This is a scaffold check: it proves the declarations exist and
 * that no signing material or unresolved placeholder is committed, not that a
 * signed IPA/AAB has already been produced.
 */
import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const hostRoot = path.join(appRoot, 'packages', 'sdkwork-birdcoder2-pad-tauri')
const RUNTIME_TARGETS = new Set(['tablet-ipados', 'tablet-android'])
const DEPLOYMENT_PROFILES = new Set(['standalone', 'cloud'])
const ENVIRONMENTS = new Set(['development', 'test', 'staging', 'demo', 'production'])
const FORBIDDEN_SIGNING_FILES = /\.(?:p12|pfx|mobileprovision|provisionprofile|keystore|jks|pem|key)$/iu
const PLACEHOLDER = /\b(?:TODO|FIXME|REPLACE_ME|CHANGEME|example-signing-identity)\b/u
const LOCAL_ENDPOINT = /\b(?:localhost|127\.0\.0\.1|0\.0\.0\.0)\b/u

function parseArgs(argv) {
  const options = { runtimeTarget: 'tablet-ipados', deploymentProfile: 'standalone', environment: 'production' }
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === '--runtime-target') options.runtimeTarget = argv[++index]
    else if (arg === '--deployment-profile') options.deploymentProfile = argv[++index]
    else if (arg === '--environment') options.environment = argv[++index]
    else throw new Error(`unknown release-preflight option: ${arg}`)
  }
  if (!RUNTIME_TARGETS.has(options.runtimeTarget)) throw new Error(`unsupported runtime target: ${options.runtimeTarget}`)
  if (!DEPLOYMENT_PROFILES.has(options.deploymentProfile)) throw new Error(`unsupported deployment profile: ${options.deploymentProfile}`)
  if (!ENVIRONMENTS.has(options.environment)) throw new Error(`unsupported environment: ${options.environment}`)
  return options
}

function envMode(options) {
  const base = `${options.deploymentProfile}.${options.environment}`
  return options.runtimeTarget === 'tablet-android' ? `${base}.tablet-android` : base
}

function readEnv(mode) {
  const file = path.join(appRoot, `.env.${mode}`)
  if (!fs.existsSync(file)) throw new Error(`missing release environment file: .env.${mode}`)
  const values = new Map()
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/u)) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/u)
    if (match) values.set(match[1], match[2])
  }
  return { file, values }
}

function assertValue(values, key, expected) {
  const value = values.get(key)
  if (!value) throw new Error(`release environment is missing ${key}`)
  if (expected && value !== expected) {
    throw new Error(`release environment ${key} must be ${expected}, found ${value}`)
  }
  return value
}

function collectFiles(directory, predicate, out = []) {
  if (!fs.existsSync(directory)) return out
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const full = path.join(directory, entry.name)
    if (entry.isDirectory()) {
      if (entry.name === 'target' || entry.name === '.tauri' || entry.name === 'gen') continue
      collectFiles(full, predicate, out)
    } else if (predicate(full)) {
      out.push(full)
    }
  }
  return out
}

const options = parseArgs(process.argv.slice(2))
const mode = envMode(options)
const { values } = readEnv(mode)

assertValue(values, 'VITE_SDKWORK_ENVIRONMENT', options.environment)
assertValue(values, 'VITE_SDKWORK_DEPLOYMENT_PROFILE', options.deploymentProfile)
assertValue(values, 'VITE_SDKWORK_RUNTIME_TARGET', options.runtimeTarget)
assertValue(values, 'VITE_SDKWORK_PROFILE_ID', `${options.deploymentProfile}.${options.environment}`)

if (options.deploymentProfile === 'cloud' && options.environment === 'production') {
  const deployUrl = assertValue(values, 'VITE_SDKWORK_BIRDCODER_APPLICATION_PUBLIC_HTTP_URL')
  if (LOCAL_ENDPOINT.test(deployUrl)) {
    throw new Error(`cloud production endpoint must not be a local address: ${deployUrl}`)
  }
}

const targetConfig = path.join(
  hostRoot,
  'src-tauri',
  options.runtimeTarget === 'tablet-ipados' ? 'tauri.ios.conf.json' : 'tauri.android.conf.json',
)
if (!fs.existsSync(targetConfig)) throw new Error(`missing Tauri target config: ${path.relative(appRoot, targetConfig)}`)

const configText = fs.readFileSync(targetConfig, 'utf8')
if (PLACEHOLDER.test(configText)) {
  throw new Error(`Tauri target config contains an unresolved placeholder: ${path.relative(appRoot, targetConfig)}`)
}

const iconDir = path.join(hostRoot, 'src-tauri', 'icons')
const icons = collectFiles(iconDir, (file) => /\.(?:png|icns|ico)$/iu.test(file))
if (icons.length === 0) {
  throw new Error('no tablet icon asset exists under src-tauri/icons; release media is incomplete')
}

const signingFiles = collectFiles(hostRoot, (file) => FORBIDDEN_SIGNING_FILES.test(file))
if (signingFiles.length > 0) {
  throw new Error(`committed signing material found: ${signingFiles.map((file) => path.relative(appRoot, file)).join(', ')}`)
}

console.log(
  `tablet release preflight ok: ${options.runtimeTarget} / ${options.deploymentProfile}.${options.environment} (${icons.length} icon asset(s))`,
)
