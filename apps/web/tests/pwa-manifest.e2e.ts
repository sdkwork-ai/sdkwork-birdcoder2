import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'
import { expect, it } from 'vitest'

const DIST_ROOT = fileURLToPath(new URL('../dist', import.meta.url))

it('ships install metadata with the built web application', async () => {
  const index = await readFile(join(DIST_ROOT, 'index.html'), 'utf8')
  expect(index).toContain('<link rel="manifest" href="./manifest.webmanifest" />')

  const manifest: unknown = JSON.parse(await readFile(join(DIST_ROOT, 'manifest.webmanifest'), 'utf8'))
  // No `id`: a browser resolves an explicit `id` against the start URL's origin,
  // so only an absent `id`, which defaults to the resolved `start_url`, gives
  // each mount its own identity. `public-mount.e2e.ts` reads the resolved form.
  // The product name and raster mark are the BirdCoder brand contract
  // (AGENTS.md, "BirdCoder brand assets"): the manifest must never regress to
  // the upstream name or an SVG mark.
  expect(manifest).toEqual({
    name: 'BirdCoder',
    short_name: 'BirdCoder',
    start_url: './',
    scope: './',
    display: 'fullscreen',
    icons: [{
      src: './favicon.png',
      sizes: '1312x1199',
      type: 'image/png',
      purpose: 'any',
    }],
  })
})

it('ships the canonical BirdCoder raster as the document favicon', async () => {
  const index = await readFile(join(DIST_ROOT, 'index.html'), 'utf8')
  expect(index).toContain('<link rel="icon" type="image/png" href="./favicon.png" />')
  // The canonical raster is apps/web/public/favicon.png; dist carries it
  // verbatim, so the shipped bytes must be a real PNG, not a regenerated file.
  const png = await readFile(join(DIST_ROOT, 'favicon.png'))
  expect(png.subarray(1, 4).toString('latin1')).toBe('PNG')
})
