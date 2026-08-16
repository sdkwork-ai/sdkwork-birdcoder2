/** Unified GitHub Release asset assembly and architecture metadata checks. */

import { createHash } from 'node:crypto'
import { mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import yaml from 'js-yaml'
import { afterEach, describe, expect, it } from 'vitest'
import { assembleGitHubRelease, expectedReleaseAssetNames } from './assemble-github-release.ts'

const VERSION = '1.2.3-rc.4'

interface FixtureTarget {
  readonly artifact: string
  readonly os: 'win' | 'mac' | 'linux'
  readonly arch: 'x64' | 'arm64'
  readonly formats: readonly string[]
  readonly updateFormats: readonly string[]
  readonly metadata: string
  readonly blockmapFormats: readonly string[]
}

const TARGETS: readonly FixtureTarget[] = [
  { artifact: 'dsh-desktop-windows-x64', os: 'win', arch: 'x64', formats: ['exe', 'zip'], updateFormats: ['exe'], metadata: 'latest.yml', blockmapFormats: [] },
  { artifact: 'dsh-desktop-windows-arm64', os: 'win', arch: 'arm64', formats: ['exe', 'zip'], updateFormats: ['exe'], metadata: 'latest.yml', blockmapFormats: [] },
  { artifact: 'dsh-desktop-macos-x64', os: 'mac', arch: 'x64', formats: ['dmg', 'zip'], updateFormats: ['dmg', 'zip'], metadata: 'latest-mac.yml', blockmapFormats: ['dmg', 'zip'] },
  { artifact: 'dsh-desktop-macos-arm64', os: 'mac', arch: 'arm64', formats: ['dmg', 'zip'], updateFormats: ['dmg', 'zip'], metadata: 'latest-mac.yml', blockmapFormats: ['dmg', 'zip'] },
  { artifact: 'dsh-desktop-linux-x64', os: 'linux', arch: 'x64', formats: ['AppImage', 'deb', 'rpm', 'tar.gz'], updateFormats: ['AppImage', 'deb', 'rpm'], metadata: 'latest-linux.yml', blockmapFormats: [] },
  { artifact: 'dsh-desktop-linux-arm64', os: 'linux', arch: 'arm64', formats: ['AppImage', 'deb', 'rpm', 'tar.gz'], updateFormats: ['AppImage', 'deb', 'rpm'], metadata: 'latest-linux-arm64.yml', blockmapFormats: [] },
]

const temporaryRoots: string[] = []

function filename(target: FixtureTarget, format: string): string {
  let artifactArch: string = target.arch
  if (target.os === 'linux' && target.arch === 'x64') {
    if (format === 'AppImage' || format === 'rpm') artifactArch = 'x86_64'
    else if (format === 'deb') artifactArch = 'amd64'
  } else if (target.os === 'linux' && target.arch === 'arm64' && format === 'rpm') {
    artifactArch = 'aarch64'
  }
  return `BirdCoder-${VERSION}-${target.os}-${artifactArch}.${format}`
}

function hash(content: string, algorithm: 'sha256' | 'sha512', encoding: 'hex' | 'base64'): string {
  return createHash(algorithm).update(content).digest(encoding)
}

function writeDesktopArtifact(input: string, target: FixtureTarget): void {
  const directory = join(input, target.artifact)
  mkdirSync(directory, { recursive: true })
  for (const format of target.formats) writeFileSync(join(directory, filename(target, format)), `${target.artifact}:${format}`)
  for (const format of target.blockmapFormats) writeFileSync(join(directory, `${filename(target, format)}.blockmap`), `${target.artifact}:blockmap`)
  const files = target.updateFormats.map((format) => {
    const url = filename(target, format)
    const content = `${target.artifact}:${format}`
    return { url, sha512: hash(content, 'sha512', 'base64'), size: Buffer.byteLength(content) }
  })
  const preferred = files.find(file => file.url.endsWith('.zip')) ?? files[0]!
  writeFileSync(join(directory, target.metadata), yaml.dump({
    version: VERSION,
    files,
    path: preferred.url,
    sha512: preferred.sha512,
    releaseDate: target.arch === 'x64' ? '2026-08-15T00:00:00.000Z' : '2026-08-15T00:01:00.000Z',
  }))
}

function writeContainerArtifact(input: string, artifact: string, archive: string): void {
  const directory = join(input, artifact)
  mkdirSync(directory, { recursive: true })
  const content = `${artifact}:archive`
  writeFileSync(join(directory, archive), content)
  writeFileSync(join(directory, `${archive}.sha256`), `${hash(content, 'sha256', 'hex')}  ${archive}\n`)
}

function fixture(): { input: string; output: string } {
  const root = mkdtempSync(join(tmpdir(), 'dsh-github-release-'))
  temporaryRoots.push(root)
  const input = join(root, 'input')
  const output = join(root, 'output')
  mkdirSync(input)
  for (const target of TARGETS) writeDesktopArtifact(input, target)
  writeContainerArtifact(input, `birdcoder-container-deployment-${VERSION}`, `birdcoder-container-${VERSION}.tar.gz`)
  writeContainerArtifact(input, `birdcoder-container-image-${VERSION}-linux-amd64`, `birdcoder-container-image-${VERSION}-linux-amd64.tar.gz`)
  writeContainerArtifact(input, `birdcoder-container-image-${VERSION}-linux-arm64`, `birdcoder-container-image-${VERSION}-linux-arm64.tar.gz`)
  return { input, output }
}

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) rmSync(root, { recursive: true, force: true })
})

describe('GitHub Release assembly', () => {
  it('writes the exact 31-asset set and canonical architecture metadata', () => {
    const { input, output } = fixture()
    assembleGitHubRelease({ input, output, version: VERSION })

    expect(readdirSync(output).sort()).toEqual(expectedReleaseAssetNames(VERSION))
    expect(expectedReleaseAssetNames(VERSION)).toHaveLength(31)
    const windows = yaml.load(readFileSync(join(output, 'latest.yml'), 'utf8')) as { files: Array<{ url: string }> }
    expect(windows.files.map(file => file.url)).toEqual([
      `BirdCoder-${VERSION}-win-x64.exe`,
      `BirdCoder-${VERSION}-win-arm64.exe`,
    ])
    const mac = yaml.load(readFileSync(join(output, 'latest-mac.yml'), 'utf8')) as { files: Array<{ url: string }> }
    expect(mac.files.map(file => file.url)).toEqual([
      `BirdCoder-${VERSION}-mac-x64.zip`,
      `BirdCoder-${VERSION}-mac-arm64.zip`,
      `BirdCoder-${VERSION}-mac-x64.dmg`,
      `BirdCoder-${VERSION}-mac-arm64.dmg`,
    ])
    const linuxArm = yaml.load(readFileSync(join(output, 'latest-linux-arm64.yml'), 'utf8')) as { files: Array<{ url: string }> }
    expect(linuxArm.files.map(file => file.url)).toEqual([
      `BirdCoder-${VERSION}-linux-aarch64.rpm`,
      `BirdCoder-${VERSION}-linux-arm64.AppImage`,
      `BirdCoder-${VERSION}-linux-arm64.deb`,
    ])
    expect(expectedReleaseAssetNames(VERSION)).toEqual(expect.arrayContaining([
      `BirdCoder-${VERSION}-linux-x86_64.AppImage`,
      `BirdCoder-${VERSION}-linux-amd64.deb`,
      `BirdCoder-${VERSION}-linux-x86_64.rpm`,
      `BirdCoder-${VERSION}-linux-x64.tar.gz`,
      `BirdCoder-${VERSION}-linux-aarch64.rpm`,
      `BirdCoder-${VERSION}-linux-arm64.tar.gz`,
    ]))
    expect(readFileSync(join(output, 'SHA256SUMS'), 'utf8').trim().split('\n')).toHaveLength(30)
  })

  it('rejects extra files and a metadata version that does not match the tag', () => {
    const extra = fixture()
    writeFileSync(join(extra.input, 'dsh-desktop-windows-x64', 'unexpected.txt'), 'unexpected')
    expect(() => { assembleGitHubRelease({ ...extra, version: VERSION }) }).toThrow(/wrong files/)

    const mismatched = fixture()
    const path = join(mismatched.input, 'dsh-desktop-linux-x64', 'latest-linux.yml')
    const metadata = yaml.load(readFileSync(path, 'utf8')) as Record<string, unknown>
    writeFileSync(path, yaml.dump({ ...metadata, version: '9.9.9' }))
    expect(() => { assembleGitHubRelease({ ...mismatched, version: VERSION }) }).toThrow(/does not match/)
  })
})
