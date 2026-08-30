/** Verify the extracted contents of a packaged container deployment archive. */

import { createHash } from 'node:crypto'
import { readFileSync, readdirSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import { parseArgs } from 'node:util'
import yaml from 'js-yaml'
import { isEntry } from './process.ts'

interface ContainerManifestFile {
  path: string
  sha256: string
}

interface ContainerManifest {
  version: string
  image: string
  files: ContainerManifestFile[]
}

function fail(message: string): never {
  throw new Error(`container bundle verify: ${message}`)
}

function assert(condition: boolean, message: string): asserts condition {
  if (!condition) fail(message)
}

function objectValue(value: unknown, path: string): Record<string, unknown> {
  assert(value !== null && typeof value === 'object' && !Array.isArray(value), `${path} is not an object`)
  return value as Record<string, unknown>
}

function filesUnder(root: string): string[] {
  const output: string[] = []
  const visit = (path: string): void => {
    for (const entry of readdirSync(path, { withFileTypes: true })) {
      const child = join(path, entry.name)
      if (entry.isDirectory()) visit(child)
      else {
        assert(entry.isFile(), `${relative(root, child)} is not a regular file`)
        output.push(relative(root, child).replaceAll('\\', '/'))
      }
    }
  }
  visit(root)
  return output.sort()
}

function readManifest(root: string): ContainerManifest {
  const raw = objectValue(JSON.parse(readFileSync(join(root, 'manifest.json'), 'utf8')) as unknown, 'manifest.json')
  assert(typeof raw.version === 'string' && raw.version !== '', 'manifest version is missing')
  assert(typeof raw.image === 'string' && raw.image !== '', 'manifest image is missing')
  assert(Array.isArray(raw.files), 'manifest files is not an array')
  const files = raw.files.map((value, index) => {
    const entry = objectValue(value, `manifest.files[${String(index)}]`)
    assert(typeof entry.path === 'string' && entry.path !== '', `manifest.files[${String(index)}].path is missing`)
    assert(!entry.path.startsWith('/') && !entry.path.includes('\\') && !entry.path.split('/').includes('..'), `manifest path is unsafe: ${entry.path}`)
    assert(typeof entry.sha256 === 'string' && /^[a-f0-9]{64}$/.test(entry.sha256), `manifest hash is invalid for ${entry.path}`)
    return { path: entry.path, sha256: entry.sha256 }
  })
  return { version: raw.version, image: raw.image, files }
}

function verifyFiles(root: string, manifest: ContainerManifest): void {
  const paths = manifest.files.map(entry => entry.path)
  assert(new Set(paths).size === paths.length, 'manifest contains duplicate paths')
  const actualPaths = filesUnder(root).filter(path => path !== 'manifest.json')
  assert(JSON.stringify(actualPaths) === JSON.stringify([...paths].sort()), 'manifest file list does not match the extracted archive')
  for (const entry of manifest.files) {
    const actual = createHash('sha256').update(readFileSync(join(root, entry.path))).digest('hex')
    assert(actual === entry.sha256, `manifest hash does not match ${entry.path}`)
  }
}

function verifyDeployment(root: string, manifest: ContainerManifest): void {
  const tagIndex = manifest.image.lastIndexOf(':')
  assert(tagIndex > manifest.image.lastIndexOf('/'), `manifest image has no tag: ${manifest.image}`)
  const repository = manifest.image.slice(0, tagIndex)
  const tag = manifest.image.slice(tagIndex + 1)
  assert(tag === manifest.version, `manifest image tag ${tag} does not match version ${manifest.version}`)

  const compose = objectValue(yaml.load(readFileSync(join(root, 'docker-compose.yml'), 'utf8')), 'docker-compose.yml')
  const service = objectValue(objectValue(compose.services, 'docker-compose.services').dsh, 'docker-compose.services.dsh')
  assert(service.build === undefined, 'packaged Compose must not contain a source build')
  assert(service.image === `\${DSH_IMAGE:-${manifest.image}}`, 'packaged Compose image does not match the manifest')

  const deployment = objectValue(yaml.load(readFileSync(join(root, 'deployments/kubernetes/deployment.yaml'), 'utf8')), 'deployment.yaml')
  const podSpec = objectValue(objectValue(objectValue(deployment.spec, 'deployment.spec').template, 'deployment.spec.template').spec, 'deployment.spec.template.spec')
  assert(Array.isArray(podSpec.containers) && podSpec.containers.length === 1, 'Deployment must contain one container')
  assert(objectValue(podSpec.containers[0], 'deployment.container').image === manifest.image, 'Deployment image does not match the manifest')

  const kustomization = objectValue(yaml.load(readFileSync(join(root, 'deployments/kubernetes/kustomization.yaml'), 'utf8')), 'kustomization.yaml')
  assert(Array.isArray(kustomization.images) && kustomization.images.some((value) => {
    const image = objectValue(value, 'kustomization.image')
    return image.name === repository && image.newTag === manifest.version
  }), 'Kustomization image does not match the manifest')
}

/**
 * Verify an extracted deployment bundle against its manifest and release identity.
 * @param root - Extracted deployment bundle root.
 * @param expectedVersion - Version selected by the release job.
 * @param expectedImage - Tagged image restored from the sibling image archive.
 * @returns Nothing; invalid or inconsistent bundles throw.
 */
export function verifyContainerBundle(root: string, expectedVersion: string, expectedImage: string): void {
  const resolvedRoot = resolve(root)
  const manifest = readManifest(resolvedRoot)
  assert(manifest.version === expectedVersion, `manifest version ${manifest.version} does not match ${expectedVersion}`)
  assert(manifest.image === expectedImage, `manifest image ${manifest.image} does not match ${expectedImage}`)
  verifyFiles(resolvedRoot, manifest)
  verifyDeployment(resolvedRoot, manifest)
}

/** Parse command-line arguments and verify one extracted deployment bundle. */
function main(): void {
  const { values } = parseArgs({
    options: {
      root: { type: 'string' },
      version: { type: 'string' },
      image: { type: 'string' },
    },
    allowPositionals: false,
  })
  if (values.root === undefined || values.version === undefined || values.image === undefined) {
    fail('usage: verify-container-bundle.ts --root <directory> --version <version> --image <tagged image>')
  }
  const root = resolve(values.root)
  verifyContainerBundle(root, values.version, values.image)
  console.log(`container bundle verify: ${root}`)
}

if (isEntry(import.meta.url)) main()
