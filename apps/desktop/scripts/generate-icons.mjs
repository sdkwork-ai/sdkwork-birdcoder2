/**
 * Generate the platform app icons for the desktop shell from the product
 * icon (assets/birdcoder2-appicon.png — the same raster the web GUI ships as
 * its favicon). Resizes the PNG with sharp, then assembles the Windows ICO
 * (PNG-compressed entries), the macOS ICNS, and the Linux 512 PNG under
 * apps/desktop/build/. Re-run after changing the source icon:
 *   pnpm --filter @deepseek-ai/dsh-desktop run generate-icons
 */

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

const ROOT = fileURLToPath(new URL('../../..', import.meta.url))
const SOURCE_ICON = join(ROOT, 'assets', 'birdcoder2-appicon.png')
const OUT_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'build')

/** Rasterize the source PNG to an RGBA PNG at `size` (square). */
async function renderPng(size) {
  return sharp(readFileSync(SOURCE_ICON))
    .resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer()
}

/** Windows ICO container with PNG-compressed entries (Vista+ format). */
function assembleIco(pngs) {
  const header = Buffer.alloc(6)
  header.writeUInt16LE(0, 0) // reserved
  header.writeUInt16LE(1, 2) // type: icon
  header.writeUInt16LE(pngs.length, 4)
  const entries = []
  let offset = 6 + 16 * pngs.length
  for (const { size, png } of pngs) {
    const entry = Buffer.alloc(16)
    entry.writeUInt8(size >= 256 ? 0 : size, 0) // width byte (0 = 256)
    entry.writeUInt8(size >= 256 ? 0 : size, 1) // height byte
    entry.writeUInt8(0, 2) // palette
    entry.writeUInt8(0, 3) // reserved
    entry.writeUInt16LE(1, 4) // planes
    entry.writeUInt16LE(32, 6) // bit count
    entry.writeUInt32LE(png.length, 8)
    entry.writeUInt32LE(offset, 12)
    entries.push(entry)
    offset += png.length
  }
  return Buffer.concat([header, ...entries, ...pngs.map(({ png }) => png)])
}

/** macOS ICNS container with PNG-compressed entries (big-endian). */
function assembleIcns(pngs) {
  const types = new Map([
    [16, 'icp4'], [32, 'icp5'], [64, 'icp6'],
    [128, 'ic07'], [256, 'ic08'], [512, 'ic09'], [1024, 'ic10'],
  ])
  const chunks = []
  for (const { size, png } of pngs) {
    const type = types.get(size)
    if (type === undefined) continue
    const chunk = Buffer.alloc(8 + png.length)
    chunk.write(type, 0, 'ascii')
    chunk.writeUInt32BE(8 + png.length, 4)
    png.copy(chunk, 8)
    chunks.push(chunk)
  }
  const total = 8 + chunks.reduce((sum, chunk) => sum + chunk.length, 0)
  const header = Buffer.alloc(8)
  header.write('icns', 0, 'ascii')
  header.writeUInt32BE(total, 4)
  return Buffer.concat([header, ...chunks])
}

const sizes = [16, 24, 32, 48, 64, 128, 256, 512, 1024]
const pngs = []
for (const size of sizes) pngs.push({ size, png: await renderPng(size) })

mkdirSync(OUT_DIR, { recursive: true })
// Windows: multi-resolution ICO.
writeFileSync(join(OUT_DIR, 'icon.ico'), assembleIco(pngs.filter(({ size }) => size !== 1024)))
// macOS: the standard ICNS sizes (16…1024).
writeFileSync(join(OUT_DIR, 'icon.icns'), assembleIcns(pngs))
// Linux: 512 PNG (electron-builder also uses it as the generic fallback).
writeFileSync(join(OUT_DIR, 'icon.png'), pngs.find(({ size }) => size === 512).png)

console.log(`generated desktop icons in ${OUT_DIR}: icon.ico, icon.icns, icon.png (from ${SOURCE_ICON})`)
