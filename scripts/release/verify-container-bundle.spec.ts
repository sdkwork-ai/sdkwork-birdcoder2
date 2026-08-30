/** Packaged container deployment manifest and image-identity verification. */

import { createHash } from 'node:crypto'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { verifyContainerBundle } from './verify-container-bundle.ts'

const VERSION = '1.2.3-test.1'
const IMAGE = `localhost/deepseek-harness:${VERSION}`

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex')
}

/**
 * Create the smallest bundle containing every configuration the verifier owns.
 * @param deploymentImage - Image written into the Kubernetes Deployment.
 * @returns The temporary bundle root and its Compose path.
 */
function createBundle(deploymentImage: string = IMAGE): { root: string; composePath: string } {
  const root = mkdtempSync(join(tmpdir(), 'birdcoder-container-bundle-'))
  const kubernetes = join(root, 'deployments', 'kubernetes')
  mkdirSync(kubernetes, { recursive: true })
  const composePath = join(root, 'docker-compose.yml')
  const files = new Map<string, string>([
    ['docker-compose.yml', `services:\n  dsh:\n    image: \${DSH_IMAGE:-${IMAGE}}\n`],
    ['deployments/kubernetes/deployment.yaml', `apiVersion: apps/v1\nkind: Deployment\nspec:\n  template:\n    spec:\n      containers:\n        - name: dsh\n          image: ${deploymentImage}\n`],
    ['deployments/kubernetes/kustomization.yaml', `apiVersion: kustomize.config.k8s.io/v1beta1\nkind: Kustomization\nimages:\n  - name: localhost/deepseek-harness\n    newTag: ${VERSION}\n`],
  ])
  for (const [path, content] of files) writeFileSync(join(root, path), content)
  writeFileSync(join(root, 'manifest.json'), `${JSON.stringify({
    version: VERSION,
    image: IMAGE,
    files: [...files].map(([path, content]) => ({ path, sha256: sha256(content) })),
  }, null, 2)}\n`)
  return { root, composePath }
}

describe('container deployment bundle verification', () => {
  it('accepts a complete bundle whose files and image identity agree', () => {
    const bundle = createBundle()
    try {
      expect(() => { verifyContainerBundle(bundle.root, VERSION, IMAGE) }).not.toThrow()
    } finally {
      rmSync(bundle.root, { recursive: true, force: true })
    }
  })

  it('rejects a file changed after the manifest was written', () => {
    const bundle = createBundle()
    try {
      writeFileSync(bundle.composePath, 'services: {}\n')
      expect(() => { verifyContainerBundle(bundle.root, VERSION, IMAGE) }).toThrow(/hash does not match docker-compose\.yml/)
    } finally {
      rmSync(bundle.root, { recursive: true, force: true })
    }
  })

  it('rejects a manifest-consistent Deployment that references another image', () => {
    const bundle = createBundle('localhost/deepseek-harness:other')
    try {
      expect(() => { verifyContainerBundle(bundle.root, VERSION, IMAGE) }).toThrow(/Deployment image does not match/)
    } finally {
      rmSync(bundle.root, { recursive: true, force: true })
    }
  })
})
