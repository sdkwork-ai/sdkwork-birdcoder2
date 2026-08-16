/** Assemble and verify the complete desktop and container GitHub Release asset set. */

import { createHash } from 'node:crypto'
import {
  closeSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  openSync,
  readFileSync,
  readdirSync,
  readSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { isDeepStrictEqual, parseArgs } from 'node:util'
import yaml from 'js-yaml'
import { isEntry } from './process.ts'

type DesktopOs = 'win' | 'mac' | 'linux'
type DesktopArch = 'x64' | 'arm64'

interface DesktopTarget {
  readonly artifact: string
  readonly os: DesktopOs
  readonly arch: DesktopArch
  readonly formats: readonly string[]
  readonly updateFormats: readonly string[]
  readonly metadata: string
  readonly blockmapFormats: readonly string[]
}

interface UpdateFile {
  readonly url: string
  readonly sha512: string
  readonly size?: number
  readonly [key: string]: unknown
}

interface UpdateMetadata {
  readonly version: string
  readonly files: readonly UpdateFile[]
  readonly path: string
  readonly sha512: string
  readonly releaseDate: string
  readonly [key: string]: unknown
}

interface ValidatedDesktopTarget {
  readonly target: DesktopTarget
  readonly directory: string
  readonly installers: readonly string[]
  readonly blockmaps: readonly string[]
  readonly metadata: UpdateMetadata
}

interface AssembleOptions {
  /** Directory containing one subdirectory per Actions artifact. */
  readonly input: string
  /** Clean destination for the exact GitHub Release asset set. */
  readonly output: string
  /** Version named by the `birdcoder-v<version>` tag. */
  readonly version: string
}

const DESKTOP_TARGETS: readonly DesktopTarget[] = [
  {
    artifact: 'dsh-desktop-windows-x64',
    os: 'win',
    arch: 'x64',
    formats: ['exe', 'zip'],
    updateFormats: ['exe'],
    metadata: 'latest.yml',
    blockmapFormats: [],
  },
  {
    artifact: 'dsh-desktop-windows-arm64',
    os: 'win',
    arch: 'arm64',
    formats: ['exe', 'zip'],
    updateFormats: ['exe'],
    metadata: 'latest.yml',
    blockmapFormats: [],
  },
  {
    artifact: 'dsh-desktop-macos-x64',
    os: 'mac',
    arch: 'x64',
    formats: ['dmg', 'zip'],
    updateFormats: ['dmg', 'zip'],
    metadata: 'latest-mac.yml',
    blockmapFormats: ['dmg', 'zip'],
  },
  {
    artifact: 'dsh-desktop-macos-arm64',
    os: 'mac',
    arch: 'arm64',
    formats: ['dmg', 'zip'],
    updateFormats: ['dmg', 'zip'],
    metadata: 'latest-mac.yml',
    blockmapFormats: ['dmg', 'zip'],
  },
  {
    artifact: 'dsh-desktop-linux-x64',
    os: 'linux',
    arch: 'x64',
    formats: ['AppImage', 'deb', 'rpm', 'tar.gz'],
    updateFormats: ['AppImage', 'deb', 'rpm'],
    metadata: 'latest-linux.yml',
    blockmapFormats: [],
  },
  {
    artifact: 'dsh-desktop-linux-arm64',
    os: 'linux',
    arch: 'arm64',
    formats: ['AppImage', 'deb', 'rpm', 'tar.gz'],
    updateFormats: ['AppImage', 'deb', 'rpm'],
    metadata: 'latest-linux-arm64.yml',
    blockmapFormats: [],
  },
]

const METADATA_NAMES = ['latest.yml', 'latest-mac.yml', 'latest-linux.yml', 'latest-linux-arm64.yml'] as const
const HASH_BUFFER_SIZE = 1024 * 1024

function fail(message: string): never {
  throw new Error(`github release: ${message}`)
}

function assert(condition: boolean, message: string): asserts condition {
  if (!condition) fail(message)
}

function artifactArch(target: DesktopTarget, format: string): string {
  if (target.os !== 'linux') return target.arch
  if (target.arch === 'arm64') return format === 'rpm' ? 'aarch64' : 'arm64'
  if (format === 'AppImage' || format === 'rpm') return 'x86_64'
  if (format === 'deb') return 'amd64'
  return 'x64'
}

function desktopFilename(target: DesktopTarget, version: string, format: string): string {
  return `BirdCoder-${version}-${target.os}-${artifactArch(target, format)}.${format}`
}

function containerArtifactNames(version: string): string[] {
  return [
    `birdcoder-container-${version}.tar.gz`,
    `birdcoder-container-${version}.tar.gz.sha256`,
    `birdcoder-container-image-${version}-linux-amd64.tar.gz`,
    `birdcoder-container-image-${version}-linux-amd64.tar.gz.sha256`,
    `birdcoder-container-image-${version}-linux-arm64.tar.gz`,
    `birdcoder-container-image-${version}-linux-arm64.tar.gz.sha256`,
  ]
}

function containerArtifactDirectories(version: string): string[] {
  return [
    `birdcoder-container-deployment-${version}`,
    `birdcoder-container-image-${version}-linux-amd64`,
    `birdcoder-container-image-${version}-linux-arm64`,
  ]
}

function hashFile(path: string, algorithm: 'sha256' | 'sha512', encoding: 'hex' | 'base64'): string {
  const hash = createHash(algorithm)
  const buffer = Buffer.allocUnsafe(HASH_BUFFER_SIZE)
  const handle = openSync(path, 'r')
  try {
    for (;;) {
      const length = readSync(handle, buffer, 0, buffer.length, null)
      if (length === 0) break
      hash.update(buffer.subarray(0, length))
    }
  } finally {
    closeSync(handle)
  }
  return hash.digest(encoding)
}

function directoryFiles(directory: string): string[] {
  assert(existsSync(directory), `missing artifact directory ${directory}`)
  const entries = readdirSync(directory, { withFileTypes: true })
  const nonFiles = entries.filter(entry => !entry.isFile())
  assert(nonFiles.length === 0, `${directory} contains non-file entries: ${nonFiles.map(entry => entry.name).join(', ')}`)
  return entries.map(entry => entry.name).sort()
}

function assertExactNames(actual: readonly string[], expected: readonly string[], context: string): void {
  const actualSorted = [...actual].sort()
  const expectedSorted = [...expected].sort()
  if (!isDeepStrictEqual(actualSorted, expectedSorted)) {
    fail(`${context} has the wrong files\nexpected: ${expectedSorted.join(', ')}\nactual:   ${actualSorted.join(', ')}`)
  }
}

function objectValue(value: unknown, context: string): Record<string, unknown> {
  assert(value !== null && typeof value === 'object' && !Array.isArray(value), `${context} is not an object`)
  return value as Record<string, unknown>
}

function stringValue(value: unknown, context: string): string {
  assert(typeof value === 'string' && value !== '', `${context} is not a non-empty string`)
  return value
}

function updateFile(value: unknown, context: string): UpdateFile {
  const record = objectValue(value, context)
  const url = stringValue(record.url, `${context}.url`)
  const sha512 = stringValue(record.sha512, `${context}.sha512`)
  if (record.size !== undefined) assert(typeof record.size === 'number', `${context}.size is not a number`)
  return { ...record, url, sha512 }
}

function parseMetadata(path: string, target: DesktopTarget, version: string, installers: readonly string[]): UpdateMetadata {
  const record = objectValue(yaml.load(readFileSync(path, 'utf8')), path)
  const metadataVersion = stringValue(record.version, `${path}.version`)
  assert(metadataVersion === version, `${path} version ${metadataVersion} does not match ${version}`)
  assert(Array.isArray(record.files) && record.files.length > 0, `${path}.files must be a non-empty array`)
  const files = record.files.map((entry, index) => updateFile(entry, `${path}.files[${String(index)}]`))
  const expectedUpdateFiles = target.updateFormats.map(format => desktopFilename(target, version, format))
  assertExactNames(files.map(file => file.url), expectedUpdateFiles, `${path}.files`)

  for (const file of files) {
    assert(installers.includes(file.url), `${path} references non-installer ${file.url}`)
    const installer = join(dirname(path), file.url)
    const actualSha512 = hashFile(installer, 'sha512', 'base64')
    assert(file.sha512 === actualSha512, `${path} has the wrong SHA-512 for ${file.url}`)
    if (file.size !== undefined) {
      assert(file.size === statSync(installer).size, `${path} has the wrong size for ${file.url}`)
    }
  }

  const legacyPath = stringValue(record.path, `${path}.path`)
  const legacySha512 = stringValue(record.sha512, `${path}.sha512`)
  const legacyFile = files.find(file => file.url === legacyPath)
  assert(legacyFile !== undefined, `${path}.path does not name one of its files`)
  assert(legacyFile.sha512 === legacySha512, `${path}.sha512 does not match its path entry`)
  const releaseDate = stringValue(record.releaseDate, `${path}.releaseDate`)
  assert(!Number.isNaN(Date.parse(releaseDate)), `${path}.releaseDate is not an ISO date`)
  return { ...record, version, files, path: legacyPath, sha512: legacySha512, releaseDate }
}

function validateDesktopTarget(input: string, target: DesktopTarget, version: string): ValidatedDesktopTarget {
  const directory = join(input, target.artifact)
  const installers = target.formats.map(format => desktopFilename(target, version, format))
  const blockmaps = target.blockmapFormats.map(format => `${desktopFilename(target, version, format)}.blockmap`)
  assertExactNames(directoryFiles(directory), [...installers, ...blockmaps, target.metadata], target.artifact)
  const metadata = parseMetadata(join(directory, target.metadata), target, version, installers)
  return { target, directory, installers, blockmaps, metadata }
}

function sharedMetadata(metadata: UpdateMetadata): Record<string, unknown> {
  return Object.fromEntries(Object.entries(metadata).filter(([key]) =>
    key !== 'files' && key !== 'path' && key !== 'sha512' && key !== 'releaseDate'))
}

function updateFormatRank(url: string): number {
  if (url.endsWith('.zip')) return 0
  return 1
}

function mergeMetadata(name: string, sources: readonly ValidatedDesktopTarget[], version: string): UpdateMetadata {
  assert(sources.length > 0, `no source metadata for ${name}`)
  const [first, ...rest] = sources
  assert(first !== undefined, `no source metadata for ${name}`)
  const shared = sharedMetadata(first.metadata)
  for (const source of rest) {
    assert(
      isDeepStrictEqual(sharedMetadata(source.metadata), shared),
      `${name} contains incompatible metadata fields between architectures`,
    )
  }

  const files = sources.flatMap(source => source.metadata.files.map(file => ({ file, arch: source.target.arch })))
    .sort((left, right) =>
      updateFormatRank(left.file.url) - updateFormatRank(right.file.url)
      || (left.arch === right.arch ? 0 : left.arch === 'x64' ? -1 : 1)
      || left.file.url.localeCompare(right.file.url))
    .map(entry => entry.file)
  assert(new Set(files.map(file => file.url)).size === files.length, `${name} contains duplicate update files`)
  const path = files[0]?.url
  assert(path !== undefined, `${name} has no canonical update file`)
  const sha512 = files[0]?.sha512
  assert(sha512 !== undefined, `${name} has no canonical update checksum`)
  const releaseDate = sources.map(source => source.metadata.releaseDate).sort().at(-1)
  assert(releaseDate !== undefined, `${name} has no release date`)
  return { ...shared, version, files, path, sha512, releaseDate }
}

function validateChecksum(directory: string, archiveName: string, checksumName: string): void {
  const line = readFileSync(join(directory, checksumName), 'utf8')
  const match = /^([0-9a-f]{64})  ([^\r\n]+)\r?\n$/.exec(line)
  assert(match !== null, `${checksumName} is not one sha256sum record`)
  assert(match[2] === archiveName, `${checksumName} names ${match[2] ?? '(missing)'}, expected ${archiveName}`)
  const digest = hashFile(join(directory, archiveName), 'sha256', 'hex')
  assert(match[1] === digest, `${checksumName} does not match ${archiveName}`)
}

function validateContainerArtifacts(input: string, version: string): Map<string, string> {
  const names = containerArtifactNames(version)
  const directories = containerArtifactDirectories(version)
  const groups = [names.slice(0, 2), names.slice(2, 4), names.slice(4, 6)]
  const files = new Map<string, string>()
  directories.forEach((artifact, index) => {
    const directory = join(input, artifact)
    const expected = groups[index]
    assert(expected !== undefined && expected.length === 2, `internal container asset group ${String(index)} is incomplete`)
    assertExactNames(directoryFiles(directory), expected, artifact)
    const archive = expected[0]
    const checksum = expected[1]
    assert(archive !== undefined && checksum !== undefined, `${artifact} is incomplete`)
    validateChecksum(directory, archive, checksum)
    files.set(archive, join(directory, archive))
    files.set(checksum, join(directory, checksum))
  })
  return files
}

/**
 * Return the exact public assets for one release version.
 * @param version - release version without the `birdcoder-v` prefix.
 * @returns Sorted asset basenames, including the aggregate checksum file.
 */
export function expectedReleaseAssetNames(version: string): string[] {
  const desktop = DESKTOP_TARGETS.flatMap(target => [
    ...target.formats.map(format => desktopFilename(target, version, format)),
    ...target.blockmapFormats.map(format => `${desktopFilename(target, version, format)}.blockmap`),
  ])
  return [...desktop, ...METADATA_NAMES, ...containerArtifactNames(version), 'SHA256SUMS'].sort()
}

/**
 * Validate Actions artifacts, merge architecture metadata, and write one exact release directory.
 * @param options - input, output, and release version.
 */
export function assembleGitHubRelease(options: AssembleOptions): void {
  assert(/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(options.version), `invalid version ${options.version}`)
  const input = resolve(options.input)
  const output = resolve(options.output)
  const expectedArtifactDirectories = [
    ...DESKTOP_TARGETS.map(target => target.artifact),
    ...containerArtifactDirectories(options.version),
  ]
  const inputEntries = readdirSync(input, { withFileTypes: true })
  assert(inputEntries.every(entry => entry.isDirectory()), `${input} must contain only artifact directories`)
  assertExactNames(inputEntries.map(entry => entry.name), expectedArtifactDirectories, 'downloaded Actions artifacts')

  const desktop = DESKTOP_TARGETS.map(target => validateDesktopTarget(input, target, options.version))
  const container = validateContainerArtifacts(input, options.version)
  const metadata = new Map<string, UpdateMetadata>()
  for (const name of METADATA_NAMES) {
    metadata.set(name, mergeMetadata(name, desktop.filter(source => source.target.metadata === name), options.version))
  }

  rmSync(output, { recursive: true, force: true })
  mkdirSync(output, { recursive: true })
  for (const source of desktop) {
    for (const name of [...source.installers, ...source.blockmaps]) {
      copyFileSync(join(source.directory, name), join(output, name))
    }
  }
  for (const [name, source] of container) copyFileSync(source, join(output, name))
  for (const [name, document] of metadata) {
    writeFileSync(join(output, name), yaml.dump(document, { lineWidth: -1, noRefs: true, sortKeys: false }))
  }

  const expectedWithoutChecksums = expectedReleaseAssetNames(options.version).filter(name => name !== 'SHA256SUMS')
  assertExactNames(directoryFiles(output), expectedWithoutChecksums, 'assembled release before checksums')
  const checksumLines = expectedWithoutChecksums.map(name => `${hashFile(join(output, name), 'sha256', 'hex')}  ${name}`)
  writeFileSync(join(output, 'SHA256SUMS'), `${checksumLines.join('\n')}\n`)
  assertExactNames(directoryFiles(output), expectedReleaseAssetNames(options.version), 'assembled release')
  console.log(`github release: assembled ${String(expectedReleaseAssetNames(options.version).length)} assets in ${output}`)
}

function main(): void {
  const { values } = parseArgs({
    options: {
      input: { type: 'string' },
      output: { type: 'string' },
      version: { type: 'string' },
    },
    allowPositionals: false,
  })
  if (values.input === undefined || values.output === undefined || values.version === undefined) {
    throw new Error('usage: assemble-github-release.ts --input <artifact directory> --output <release directory> --version <x.y.z>')
  }
  assembleGitHubRelease({ input: values.input, output: values.output, version: values.version })
}

if (isEntry(import.meta.url)) main()
