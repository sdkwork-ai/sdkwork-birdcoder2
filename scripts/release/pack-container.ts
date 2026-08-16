/** Package the deployment assets and their hashes for a tagged container release. */

import { createHash } from 'node:crypto'
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { basename, join, relative, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'
import yaml from 'js-yaml'

const ROOT = resolve(fileURLToPath(new URL('../..', import.meta.url)))
const ASSETS = ['docker-compose.yml', 'deploy/kubernetes', 'docs/user/guide/deployment.md', 'docs/user/guide/deployment.zh.md', 'docs/user/guide/deployment.i18n.yaml']

function objectValue(value: unknown, path: string): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) throw new Error(`pack container: ${path} is not an object`)
  return value as Record<string, unknown>
}

function onlyObject(value: unknown, path: string): Record<string, unknown> {
  if (!Array.isArray(value) || value.length !== 1) throw new Error(`pack container: ${path} must contain exactly one entry`)
  return objectValue(value[0], `${path}[0]`)
}

function imageRepository(value: string): string {
  const leaf = value.slice(value.lastIndexOf('/') + 1)
  if (value === '' || value.trim() !== value || /\s|@/.test(value) || value.endsWith('/') || leaf.includes(':')) {
    throw new Error(`pack container: --image-repository must be an untagged image repository, got ${JSON.stringify(value)}`)
  }
  return value
}

function writeYaml(path: string, document: Record<string, unknown>): void {
  writeFileSync(path, yaml.dump(document, { lineWidth: -1, noRefs: true }))
}

function prepareReleaseAssets(staging: string, releaseVersion: string, requestedRepository: string | undefined): string {
  const composePath = join(staging, 'docker-compose.yml')
  const compose = objectValue(yaml.load(readFileSync(composePath, 'utf8')), 'docker-compose.yml')
  const composeService = objectValue(objectValue(compose.services, 'docker-compose.services').dsh, 'docker-compose.services.dsh')
  delete composeService.build

  const kustomizationPath = join(staging, 'deploy/kubernetes/kustomization.yaml')
  const kustomization = objectValue(yaml.load(readFileSync(kustomizationPath, 'utf8')), 'deploy/kubernetes/kustomization.yaml')
  const image = onlyObject(kustomization.images, 'kustomization.images')
  if (typeof image.name !== 'string') throw new Error('pack container: kustomization image name must be a string')
  const sourceRepository = imageRepository(image.name)
  const repository = requestedRepository === undefined ? sourceRepository : imageRepository(requestedRepository)
  const releaseImage = `${repository}:${releaseVersion}`

  composeService.image = `\${DSH_IMAGE:-${releaseImage}}`
  writeYaml(composePath, compose)

  const deploymentPath = join(staging, 'deploy/kubernetes/deployment.yaml')
  const deployment = objectValue(yaml.load(readFileSync(deploymentPath, 'utf8')), 'deploy/kubernetes/deployment.yaml')
  const containers = objectValue(objectValue(objectValue(deployment.spec, 'deployment.spec').template, 'deployment.spec.template').spec, 'deployment.spec.template.spec').containers
  const container = onlyObject(containers, 'deployment.spec.template.spec.containers')
  container.image = releaseImage
  writeYaml(deploymentPath, deployment)

  image.name = repository
  image.newTag = releaseVersion
  writeYaml(kustomizationPath, kustomization)
  return releaseImage
}

function version(): string {
  const manifest = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')) as { version?: unknown }
  if (typeof manifest.version !== 'string' || manifest.version === '') throw new Error('pack container: package.json has no version')
  return manifest.version
}

function filesUnder(root: string): string[] {
  const output: string[] = []
  const visit = (path: string): void => {
    for (const entry of readdirSync(path, { withFileTypes: true })) {
      const child = join(path, entry.name)
      if (entry.isDirectory()) visit(child)
      else output.push(relative(root, child).replaceAll('\\', '/'))
    }
  }
  visit(root)
  return output.sort()
}

function main(): void {
  const releaseVersion = version()
  const { values } = parseArgs({
    options: {
      out: { type: 'string', default: 'dist/container' },
      'image-repository': { type: 'string' },
    },
    allowPositionals: false,
  })
  const out = resolve(ROOT, values.out)
  const staging = join(out, `birdcoder-container-${releaseVersion}`)
  rmSync(staging, { recursive: true, force: true })
  mkdirSync(staging, { recursive: true })

  for (const asset of ASSETS) {
    const source = join(ROOT, asset)
    if (!existsSync(source)) throw new Error(`pack container: missing ${asset}`)
    const target = join(staging, asset)
    if (asset.includes('/')) mkdirSync(resolve(target, '..'), { recursive: true })
    cpSync(source, target, { recursive: true })
  }

  const releaseImage = prepareReleaseAssets(staging, releaseVersion, values['image-repository'])
  const releaseFiles = filesUnder(staging)
  if (!releaseFiles.includes('docker-compose.yml')) throw new Error('pack container: staged release is missing docker-compose.yml')
  if (!releaseFiles.includes('deploy/kubernetes/deployment.yaml')) throw new Error('pack container: staged release is missing the Kubernetes Deployment')
  const hashes = releaseFiles.map((path) => {
    const digest = createHash('sha256').update(readFileSync(join(staging, path))).digest('hex')
    return { path, sha256: digest }
  })
  writeFileSync(join(staging, 'manifest.json'), `${JSON.stringify({ version: releaseVersion, image: releaseImage, files: hashes }, null, 2)}\n`)

  const archive = join(out, `birdcoder-container-${releaseVersion}.tar.gz`)
  rmSync(archive, { force: true })
  const result = spawnSync('tar', ['-czf', archive, '-C', out, basename(staging)], { stdio: 'inherit' })
  if (result.error !== undefined || result.status !== 0) {
    throw new Error(`pack container: tar failed${result.error === undefined ? '' : `: ${result.error.message}`}`)
  }
  const archiveHash = createHash('sha256').update(readFileSync(archive)).digest('hex')
  writeFileSync(`${archive}.sha256`, `${archiveHash}  ${basename(archive)}\n`)
  console.log(`container pack: ${archive}`)
}

main()
