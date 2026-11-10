#!/usr/bin/env node
/**
 * Normalizes one packaged target into the published layout the seeds and the
 * updater expect.
 *
 * electron-builder names artifacts `BirdCoder-<version>-<os>-<arch>.<ext>` and
 * writes an updater metadata file (`latest.yml`) whose URLs point at the local
 * build. The download catalog and the update feeds need stable, version-free
 * names and one feed directory per platform/architecture:
 *
 *   BirdCoder-win-x64.exe          https://<dataset>/BirdCoder-win-x64.exe
 *   BirdCoder-mac-arm64.dmg        https://<dataset>/BirdCoder-mac-arm64.dmg
 *   feeds/<target>/nightly.yml     (mac: nightly-mac.yml)
 *
 * The deploy seeds (database/seeds/common/010..014) reference exactly this
 * layout, so running this script per target and uploading the output removes the
 * manual URL editing the seeds used to require.
 *
 * Usage:
 *   node scripts/publish-release-artifacts.mjs --target win-x64 --input dist --out release
 *   node scripts/publish-release-artifacts.mjs --target mac-arm64 --channel stable --dry-run
 */

import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url))
const DESKTOP_ROOT = resolve(SCRIPT_DIR, '..')
const REPO_ROOT = resolve(DESKTOP_ROOT, '..', '..')

const TARGETS = {
  'win-x64': { os: 'win', arch: 'x64', ext: 'exe' },
  'win-arm64': { os: 'win', arch: 'arm64', ext: 'exe' },
  'mac-arm64': { os: 'mac', arch: 'arm64', ext: 'dmg' },
  'mac-x64': { os: 'mac', arch: 'x64', ext: 'dmg' },
  'linux-x64': { os: 'linux', arch: 'x64', ext: 'AppImage' },
  'linux-arm64': { os: 'linux', arch: 'arm64', ext: 'AppImage' },
}

const DEFAULT_BASE_URL = 'https://www.modelscope.cn/datasets/sdkwork/birdcoder/resolve/master'
const DEFAULT_BRAND = 'birdcoder'

function usage() {
  return [
    'Usage: publish-release-artifacts.mjs --target <' + Object.keys(TARGETS).join('|') + '>',
    '         --input <electron-builder output dir> [--out release] [--channel nightly|stable]',
    '         [--version <semver>] [--brand birdcoder] [--prefix BirdCoder]',
    '         [--base-url <dataset raw base>] [--metadata latest.yml] [--dry-run]',
  ].join('\n')
}

function parseArguments(argv) {
  const options = { channel: 'nightly', brand: DEFAULT_BRAND, metadata: 'latest.yml', dryRun: false }
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index]
    const value = () => {
      index += 1
      if (index >= argv.length) throw new Error(`${flag} requires a value`)
      return argv[index]
    }
    switch (flag) {
      case '--target': options.target = value(); break
      case '--input': options.input = value(); break
      case '--out': options.out = value(); break
      case '--channel': options.channel = value(); break
      case '--version': options.version = value(); break
      case '--brand': options.brand = value(); break
      case '--prefix': options.prefix = value(); break
      case '--base-url': options.baseUrl = value(); break
      case '--metadata': options.metadata = value(); break
      case '--dry-run': options.dryRun = true; break
      case '--help':
      case '-h': options.help = true; break
      default: throw new Error(`unknown argument ${flag}\n${usage()}`)
    }
  }
  return options
}

function brandPrefix(brandKey) {
  const brandPath = join(REPO_ROOT, 'brands', `${brandKey}.json`)
  if (!existsSync(brandPath)) throw new Error(`brand manifest not found: ${brandPath}`)
  const brand = JSON.parse(readFileSync(brandPath, 'utf8'))
  const prefix = brand?.desktop?.artifactPrefix
  if (typeof prefix !== 'string' || prefix.trim() === '') {
    throw new Error(`${brandPath} has no desktop.artifactPrefix`)
  }
  return prefix.trim()
}

function desktopVersion() {
  const manifest = JSON.parse(readFileSync(join(DESKTOP_ROOT, 'package.json'), 'utf8'))
  if (typeof manifest.version !== 'string' || manifest.version === '') {
    throw new Error('apps/desktop/package.json has no version')
  }
  return manifest.version
}

/** Rewrites the few metadata fields the published layout changes. */
function rewriteMetadata(text, { version, url, releaseDate }) {
  const lines = text.split(/\r?\n/)
  let replacedUrl = false
  let replacedPath = false
  let replacedVersion = false
  const output = lines.map((line) => {
    if (/^\s*-\s*url:/.test(line)) {
      replacedUrl = true
      return line.replace(/url:.*$/u, `url: ${url}`)
    }
    if (/^path:/.test(line)) {
      replacedPath = true
      return line.replace(/path:.*$/u, `path: ${url}`)
    }
    if (/^version:/.test(line)) {
      replacedVersion = true
      return line.replace(/version:.*$/u, `version: ${version}`)
    }
    if (/^releaseDate:/.test(line)) {
      return line.replace(/releaseDate:.*$/u, `releaseDate: '${releaseDate}'`)
    }
    return line
  })
  if (!replacedUrl) throw new Error('metadata has no files[].url entry')
  if (!replacedVersion) throw new Error('metadata has no version entry')
  if (!replacedPath) {
    // electron-updater still reads the legacy top-level path.
    output.push(`path: ${url}`)
  }
  if (!output.some((line) => /^releaseDate:/.test(line))) output.push(`releaseDate: '${releaseDate}'`)
  return `${output.join('\n').replace(/\n{3,}/gu, '\n\n').trimEnd()}\n`
}

function main() {
  let options
  try {
    options = parseArguments(process.argv.slice(2))
  } catch (error) {
    console.error(error.message)
    process.exit(2)
  }
  if (options.help) {
    console.log(usage())
    return
  }
  if (!options.target || !TARGETS[options.target]) {
    console.error(`--target must be one of ${Object.keys(TARGETS).join(', ')}\n${usage()}`)
    process.exit(2)
  }
  const target = TARGETS[options.target]
  const prefix = options.prefix?.trim() || brandPrefix(options.brand)
  const version = options.version?.trim() || desktopVersion()
  const baseUrl = (options.baseUrl?.trim() || DEFAULT_BASE_URL).replace(/\/+$/u, '')
  const input = resolve(options.input ?? join(DESKTOP_ROOT, '.desktop-build'))
  const output = resolve(options.out ?? join(DESKTOP_ROOT, '.desktop-build', 'release'))
  const channel = options.channel.trim()
  if (channel !== 'nightly' && channel !== 'stable') {
    console.error('--channel must be nightly or stable')
    process.exit(2)
  }

  const sourceName = `${prefix}-${version}-${target.os}-${target.arch}.${target.ext}`
  const publishedName = `${prefix}-${target.os}-${target.arch}.${target.ext}`
  const sourcePath = join(input, sourceName)
  const url = `${baseUrl}/${publishedName}`
  const channelFile = target.os === 'mac' ? `${channel}-mac.yml` : `${channel}.yml`
  const feedPath = join(output, 'feeds', options.target, channelFile)
  const metaPath = join(input, options.metadata)

  const report = {
    target: options.target,
    channel,
    version,
    source: sourcePath,
    published: join(output, publishedName),
    feed: feedPath,
    url,
    dryRun: options.dryRun,
  }

  if (options.dryRun) {
    report.sourceExists = existsSync(sourcePath)
    report.metadataExists = existsSync(metaPath)
    console.log(JSON.stringify(report, null, 2))
    return
  }
  if (!existsSync(sourcePath)) throw new Error(`installer not found: ${sourcePath}`)
  if (!existsSync(metaPath)) throw new Error(`updater metadata not found: ${metaPath}`)

  mkdirSync(output, { recursive: true })
  copyFileSync(sourcePath, join(output, publishedName))
  // The differential updater derives the blockmap URL from the file URL.
  const sourceBlockmap = `${sourcePath}.blockmap`
  if (existsSync(sourceBlockmap)) {
    copyFileSync(sourceBlockmap, join(output, `${publishedName}.blockmap`))
  }
  const metadata = rewriteMetadata(readFileSync(metaPath, 'utf8'), {
    version,
    url,
    releaseDate: new Date().toISOString(),
  })
  mkdirSync(dirname(feedPath), { recursive: true })
  writeFileSync(feedPath, metadata, 'utf8')
  console.log(JSON.stringify(report, null, 2))
}

main()
