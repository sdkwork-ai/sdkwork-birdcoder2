/**
 * Generate the Windows installer's brand rasters from the canonical BirdCoder mark.
 *
 * Why this file exists (AGENTS.md → "BirdCoder brand assets"): the installer
 * draws no brand text of its own — `installer/pages.nsh` blits one bitmap and
 * `prepare-windows-installer.ps1` only flattens each PNG onto an opaque
 * background. So the upstream rasters under `installer/assets/` carried the
 * upstream whale *and* an upstream wordmark baked into the pixels, which no
 * amount of NSIS code could rebrand. Every upstream merge restored them, so the
 * fork regenerates them here and the committed PNGs are the shipped artwork.
 *
 * The composition deliberately mirrors the upstream layout so the installer's
 * design language is unchanged:
 *   - a 120x120 (logical) light chip, horizontally centred, 16px from the top
 *   - the product mark inside the chip
 *   - a 24px-tall wordmark band centred 28px below the chip
 * `-2x` variants are exactly twice that geometry (1200x392), and the dark
 * variants differ only in the wordmark colour — the chip stays light in both
 * themes, matching upstream, because the mark has white plumage.
 *
 * Re-run after changing the product mark or the wordmark:
 *   pnpm --dir apps/desktop run generate-installer-brand
 */

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

const APP_ROOT = fileURLToPath(new URL('..', import.meta.url))
const SOURCE_MARK = join(APP_ROOT, '..', 'web', 'public', 'favicon.png')
const OUT_DIR = join(APP_ROOT, 'installer', 'assets')

/** Geometry in 96-DPI logical pixels; mirrors the upstream brand rasters. */
const CANVAS = { width: 600, height: 196 }
const CHIP = { size: 120, x: 240, y: 16, radius: 26, fill: '#F8F8F8' }
/** The mark keeps the upstream whale glyph's visual weight inside the chip. */
const CHIP_MARK_SIZE = 88
const WORDMARK = { baselineY: 187, fontSize: 32, letterSpacing: 0.6, light: '#0F1115', dark: '#FFFFFF' }
/** NSIS sidebar artwork; 164x314 is the size MUI reserves for it. */
const SIDEBAR = { width: 164, height: 314, fill: '#F3F4F6', markSize: 96, fontSize: 24, baselineY: 236 }

/**
 * The wordmark's typeface. `Segoe UI` ships with Windows and is what the
 * installer's own controls use for Latin text; the rest are fallbacks so a
 * build host without it still renders words rather than empty boxes.
 */
const WORDMARK_FONT = "'Segoe UI', 'Segoe UI Semibold', Arial, 'Microsoft YaHei UI', sans-serif"
/** The product name as it appears in the wordmark (matches `productName`). */
const WORDMARK_TEXT = 'BirdCoder'

/**
 * Render the canonical product mark as a trimmed, transparent square PNG.
 * @param {number} size - Square edge length in device pixels.
 * @returns {Promise<Buffer>} Encoded PNG.
 */
async function renderMark(size) {
  return sharp(SOURCE_MARK)
    .trim()
    .resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer()
}

/**
 * Build the wordmark band as an SVG, so the typeface is resolved at render time
 * instead of shipping pre-baked glyph outlines the fork cannot author.
 * @param {number} scale - Device-pixel multiplier (1 or 2).
 * @param {string} fill - Wordmark colour.
 * @param {number} width - Band width in device pixels.
 * @param {number} height - Band height in device pixels.
 * @param {number} fontSize - Logical font size before scaling.
 * @param {number} baselineY - Logical baseline offset before scaling.
 * @returns {Buffer} SVG bytes.
 */
function wordmarkSvg(scale, fill, width, height, fontSize, baselineY) {
  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">`
    + `<text x="${width / 2}" y="${baselineY * scale}" text-anchor="middle" `
    + `font-family="${WORDMARK_FONT}" font-size="${fontSize * scale}" font-weight="600" `
    + `letter-spacing="${WORDMARK.letterSpacing * scale}" fill="${fill}">${WORDMARK_TEXT}</text>`
    + '</svg>')
}

/**
 * Compose one brand raster.
 * @param {number} scale - Device-pixel multiplier (1 or 2).
 * @param {'light' | 'dark'} theme - Wordmark colour variant.
 * @returns {Promise<Buffer>} Encoded PNG.
 */
async function renderBrand(scale, theme) {
  const width = CANVAS.width * scale
  const height = CANVAS.height * scale
  const tile = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">`
    + `<rect x="${CHIP.x * scale}" y="${CHIP.y * scale}" width="${CHIP.size * scale}" height="${CHIP.size * scale}" `
    + `rx="${CHIP.radius * scale}" ry="${CHIP.radius * scale}" fill="${CHIP.fill}"/></svg>`)
  const mark = await renderMark(CHIP_MARK_SIZE * scale)
  const inset = ((CHIP.size - CHIP_MARK_SIZE) / 2) * scale
  const wordmark = await sharp(wordmarkSvg(
    scale, theme === 'dark' ? WORDMARK.dark : WORDMARK.light,
    width, height, WORDMARK.fontSize, WORDMARK.baselineY,
  )).png().toBuffer()
  return sharp({ create: { width, height, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([
      { input: tile, top: 0, left: 0 },
      { input: mark, top: CHIP.y * scale + inset, left: CHIP.x * scale + inset },
      { input: wordmark, top: 0, left: 0 },
    ])
    .png()
    .toBuffer()
}

/**
 * Compose the NSIS sidebar raster (installer and uninstaller welcome pages).
 * @returns {Promise<Buffer>} Encoded PNG.
 */
async function renderSidebar() {
  const { width, height, fill, markSize, fontSize, baselineY } = SIDEBAR
  const mark = await renderMark(markSize)
  const wordmark = await sharp(wordmarkSvg(1, WORDMARK.light, width, height, fontSize, baselineY))
    .png().toBuffer()
  return sharp({ create: { width, height, channels: 4, background: fill } })
    .composite([
      { input: mark, top: 40, left: Math.round((width - markSize) / 2) },
      { input: wordmark, top: 0, left: 0 },
    ])
    .png()
    .toBuffer()
}

async function main() {
  mkdirSync(OUT_DIR, { recursive: true })
  const outputs = {
    'brand.png': await renderBrand(1, 'light'),
    'brand-2x.png': await renderBrand(2, 'light'),
    'brand-dark.png': await renderBrand(1, 'dark'),
    'brand-dark-2x.png': await renderBrand(2, 'dark'),
    'uninstaller-sidebar.png': await renderSidebar(),
  }
  for (const [name, buffer] of Object.entries(outputs)) {
    writeFileSync(join(OUT_DIR, name), buffer)
    const meta = await sharp(buffer).metadata()
    console.log(`${name}: ${meta.width}x${meta.height} ${(buffer.length / 1024).toFixed(1)}KB`)
  }
  if (!readFileSync(SOURCE_MARK).length) throw new Error(`${SOURCE_MARK} is empty`)
  console.log(`generated ${Object.keys(outputs).length} installer brand rasters in ${OUT_DIR} from ${SOURCE_MARK}`)
}

await main()
