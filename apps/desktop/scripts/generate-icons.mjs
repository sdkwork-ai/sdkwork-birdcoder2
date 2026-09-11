/**
 * Generate the shipped desktop application icons from the canonical BirdCoder raster.
 *
 * The source is `apps/web/public/favicon.png` — the single canonical product mark
 * (see AGENTS.md → "BirdCoder brand assets"). sharp trims the transparent margin and
 * renders square RGBA PNGs; the Windows ICO and macOS ICNS containers are assembled
 * here, so the pipeline needs no platform icon tooling. Re-run after changing the
 * product mark:
 *   pnpm --dir apps/desktop run generate-icons
 */

import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

const APP_ROOT = fileURLToPath(new URL('..', import.meta.url))
const SOURCE_ICON = join(APP_ROOT, '..', 'web', 'public', 'favicon.png')
const OUT_DIR = join(APP_ROOT, 'build')

/** Windows ICO sizes; 256 is the largest entry the container addresses. */
const ICO_SIZES = [16, 24, 32, 48, 64, 128, 256]
/** ICNS chunk type per raster size (ICNS stores the pixel size in the chunk type). */
const ICNS_TYPES = new Map([
  [16, 'icp4'], [32, 'icp5'], [64, 'icp6'],
  [128, 'ic07'], [256, 'ic08'], [512, 'ic09'], [1024, 'ic10'],
])
/** Linux and generic fallback raster size. */
const PNG_SIZE = 512

/**
 * Render the product mark as a square RGBA PNG at `size`.
 * @param {number} size - Square edge length in pixels.
 * @returns {Promise<Buffer>} Encoded PNG.
 */
async function renderPng(size) {
  return sharp(SOURCE_ICON)
    .trim()
    .resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer()
}

/**
 * Assemble an ICO container from PNG-compressed entries (Vista and later).
 * @param {{ size: number, png: Buffer }[]} entries - Rasters ordered by ascending size.
 * @returns {Buffer} ICO file bytes.
 */
function assembleIco(entries) {
  const header = Buffer.alloc(6)
  header.writeUInt16LE(0, 0) // reserved
  header.writeUInt16LE(1, 2) // type: icon
  header.writeUInt16LE(entries.length, 4)
  const directory = []
  let offset = 6 + 16 * entries.length
  for (const { size, png } of entries) {
    const entry = Buffer.alloc(16)
    entry.writeUInt8(size >= 256 ? 0 : size, 0) // width byte (0 = 256)
    entry.writeUInt8(size >= 256 ? 0 : size, 1) // height byte
    entry.writeUInt8(0, 2) // palette size
    entry.writeUInt8(0, 3) // reserved
    entry.writeUInt16LE(1, 4) // color planes
    entry.writeUInt16LE(32, 6) // bits per pixel
    entry.writeUInt32LE(png.length, 8)
    entry.writeUInt32LE(offset, 12)
    directory.push(entry)
    offset += png.length
  }
  return Buffer.concat([header, ...directory, ...entries.map(({ png }) => png)])
}

/**
 * Assemble an ICNS container from PNG-compressed chunks (big-endian lengths).
 * @param {{ size: number, png: Buffer }[]} entries - Rasters ordered by ascending size.
 * @returns {Buffer} ICNS file bytes.
 */
function assembleIcns(entries) {
  const chunks = []
  for (const { size, png } of entries) {
    const type = ICNS_TYPES.get(size)
    if (type === undefined) continue
    const chunk = Buffer.alloc(8 + png.length)
    chunk.write(type, 0, 'ascii')
    chunk.writeUInt32BE(8 + png.length, 4)
    png.copy(chunk, 8)
    chunks.push(chunk)
  }
  const header = Buffer.alloc(8)
  header.write('icns', 0, 'ascii')
  header.writeUInt32BE(8 + chunks.reduce((total, chunk) => total + chunk.length, 0), 4)
  return Buffer.concat([header, ...chunks])
}

async function main() {
  const sizes = [...new Set([...ICO_SIZES, ...ICNS_TYPES.keys(), PNG_SIZE])].sort((left, right) => left - right)
  const rendered = new Map()
  for (const size of sizes) rendered.set(size, await renderPng(size))
  const entries = sizes.map(size => ({ size, png: rendered.get(size) }))

  mkdirSync(OUT_DIR, { recursive: true })
  writeFileSync(join(OUT_DIR, 'icon.ico'), assembleIco(entries.filter(({ size }) => ICO_SIZES.includes(size))))
  writeFileSync(join(OUT_DIR, 'icon.icns'), assembleIcns(entries))
  writeFileSync(join(OUT_DIR, 'icon.png'), rendered.get(PNG_SIZE))

  console.log(`generated desktop icons in ${OUT_DIR} from ${SOURCE_ICON}: icon.ico, icon.icns, icon.png`)
}

await main()
