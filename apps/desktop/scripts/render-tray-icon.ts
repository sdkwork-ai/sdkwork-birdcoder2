/**
 * Render the Windows tray icon from the canonical BirdCoder mark.
 *
 * FORK DIVERGENCE: BirdCoder brand assets (AGENTS.md). Upstream renders an
 * enlarged whale from `resources/icon-windows.svg`; the fork ships no vector
 * artwork originals, so every size rasterizes from the canonical
 * `apps/web/public/favicon.png` raster instead.
 *
 * The tray shows the icon at 16 logical pixels, so Windows picks one of the
 * bundled bitmaps by display scale. Each size is rasterized from the large
 * source separately instead of downscaling one small bitmap, which keeps edges
 * crisp at every scale. The committed `resources/tray-windows.ico` is the output;
 * rerun `pnpm run render:tray-icon` in `apps/desktop` after changing the canonical raster.
 */

import { readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

/** Bitmap edge lengths bundled in the tray icon: 16 px at 100 % through 400 % display scale. */
export const TRAY_ICON_SIZES = [16, 20, 24, 32, 40, 48, 64] as const

/** Canonical raster and committed output of the tray icon. */
export const TRAY_ICON_PATHS = {
  source: fileURLToPath(new URL('../../web/public/favicon.png', import.meta.url)),
  output: fileURLToPath(new URL('../resources/tray-windows.ico', import.meta.url)),
} as const

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
const ICON_DIRECTORY_BYTES = 6
const ICON_ENTRY_BYTES = 16

/** One bitmap of an icon file. */
export interface IcoEntry {
  readonly size: number
  /** Complete PNG stream; Windows Vista and later read PNG-compressed entries directly. */
  readonly png: Buffer
}

/**
 * Pack PNG bitmaps into one ICO file.
 * @param entries - Bitmaps in ascending size; each PNG must be square with the declared edge.
 * @returns the ICO bytes.
 */
export function packIco(entries: readonly IcoEntry[]): Buffer {
  const header = Buffer.alloc(ICON_DIRECTORY_BYTES + ICON_ENTRY_BYTES * entries.length)
  header.writeUInt16LE(0, 0)
  header.writeUInt16LE(1, 2)
  header.writeUInt16LE(entries.length, 4)
  let offset = header.length
  entries.forEach((entry, index) => {
    if (entry.size < 1 || entry.size > 256) throw new Error(`tray icon: unsupported bitmap edge ${String(entry.size)}`)
    const { width, height } = pngDimensions(entry.png)
    if (width !== entry.size || height !== entry.size) {
      throw new Error(`tray icon: bitmap ${String(index)} is ${String(width)}x${String(height)}, expected ${String(entry.size)}`)
    }
    const at = ICON_DIRECTORY_BYTES + ICON_ENTRY_BYTES * index
    // 256 px is encoded as 0 in the one-byte edge fields.
    header.writeUInt8(entry.size % 256, at)
    header.writeUInt8(entry.size % 256, at + 1)
    header.writeUInt8(0, at + 2)
    header.writeUInt8(0, at + 3)
    header.writeUInt16LE(1, at + 4)
    header.writeUInt16LE(32, at + 6)
    header.writeUInt32LE(entry.png.length, at + 8)
    header.writeUInt32LE(offset, at + 12)
    offset += entry.png.length
  })
  return Buffer.concat([header, ...entries.map(entry => entry.png)])
}

/**
 * Read the bitmaps back out of one ICO file.
 * @param ico - Bytes written by {@link packIco} or another PNG-entry ICO producer.
 * @returns entries in directory order, each PNG checked against its declared edge.
 */
export function unpackIco(ico: Buffer): IcoEntry[] {
  if (ico.length < ICON_DIRECTORY_BYTES || ico.readUInt16LE(0) !== 0 || ico.readUInt16LE(2) !== 1) {
    throw new Error('tray icon: not an ICO file')
  }
  const count = ico.readUInt16LE(4)
  return Array.from({ length: count }, (_, index) => {
    const at = ICON_DIRECTORY_BYTES + ICON_ENTRY_BYTES * index
    const declared = ico.readUInt8(at)
    const size = declared === 0 ? 256 : declared
    const length = ico.readUInt32LE(at + 8)
    const offset = ico.readUInt32LE(at + 12)
    const png = ico.subarray(offset, offset + length)
    const { width, height } = pngDimensions(png)
    if (width !== size || height !== size) throw new Error(`tray icon: entry ${String(index)} declares ${String(size)} but holds ${String(width)}x${String(height)}`)
    return { size, png }
  })
}

/**
 * Rasterize the canonical mark at each tray size.
 * @param raster - Square source PNG of the BirdCoder mark.
 * @param sizes - Bitmap edges to render.
 * @returns PNG entries in the given order.
 */
export async function renderTrayIconEntries(raster: Buffer, sizes: readonly number[] = TRAY_ICON_SIZES): Promise<IcoEntry[]> {
  pngDimensions(raster)
  return Promise.all(sizes.map(async size => ({
    size,
    png: await sharp(raster).resize(size, size).png().toBuffer(),
  })))
}

function pngDimensions(png: Buffer): { width: number; height: number } {
  if (png.length < 24 || !png.subarray(0, PNG_SIGNATURE.length).equals(PNG_SIGNATURE)) throw new Error('tray icon: bitmap is not a PNG stream')
  return { width: png.readUInt32BE(16), height: png.readUInt32BE(20) }
}

async function main(): Promise<void> {
  const entries = await renderTrayIconEntries(await readFile(TRAY_ICON_PATHS.source))
  await writeFile(TRAY_ICON_PATHS.output, packIco(entries))
  console.info(`tray icon: wrote ${TRAY_ICON_PATHS.output} with ${entries.map(entry => String(entry.size)).join(', ')} px bitmaps`)
}

if (process.argv[1] !== undefined && import.meta.filename === resolve(process.argv[1])) await main()
