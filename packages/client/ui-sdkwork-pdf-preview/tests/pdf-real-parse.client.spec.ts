/** Real PDF.js integration: genuine parser output pins the geometry the renderer derives from. */
import { describe, expect, it } from 'vitest'
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs'

/** One drawn page of the generated fixture: MediaBox in points and a text run. */
interface FixturePage {
  readonly width: number
  readonly height: number
  readonly text: string
}

/**
 * Assemble a valid multi-page PDF with a computed xref table. Objects use
 * fixed ids: 1 catalog, 2 pages, then per page (page, content) pairs, and the
 * shared font last.
 */
function buildPdf(pages: readonly FixturePage[]): Uint8Array {
  const fontId = 3 + pages.length * 2
  const objects: string[] = []
  const kids = pages.map((_, index) => `${3 + index * 2} 0 R`).join(' ')
  objects[1] = '<< /Type /Catalog /Pages 2 0 R >>'
  objects[2] = `<< /Type /Pages /Kids [${kids}] /Count ${pages.length} >>`
  pages.forEach((page, index) => {
    const pageId = 3 + index * 2
    const contentId = pageId + 1
    const stream = `BT /F1 24 Tf 72 700 Td (${page.text}) Tj ET`
    objects[pageId] =
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${page.width} ${page.height}] ` +
      `/Contents ${contentId} 0 R /Resources << /Font << /F1 ${fontId} 0 R >> >> >>`
    objects[contentId] = `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`
  })
  objects[fontId] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'

  let body = '%PDF-1.4\n'
  const offsets: number[] = [0]
  for (let id = 1; id < objects.length; id++) {
    offsets[id] = body.length
    body += `${id} 0 obj\n${objects[id]}\nendobj\n`
  }
  const xrefStart = body.length
  body += `xref\n0 ${objects.length}\n0000000000 65535 f \n`
  for (let id = 1; id < objects.length; id++) {
    body += `${String(offsets[id]).padStart(10, '0')} 00000 n \n`
  }
  body += `trailer\n<< /Size ${objects.length} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF\n`
  return new TextEncoder().encode(body)
}

const LETTER: FixturePage = { width: 612, height: 792, text: 'Hello BirdCoder' }
const A4: FixturePage = { width: 595, height: 842, text: 'Second page here' }

describe('real PDF.js parse', () => {
  it('reports the page count and the point-size viewports the renderer scales from', async () => {
    const task = getDocument({ data: buildPdf([LETTER, A4]) })
    const document = await task.promise
    expect(document.numPages).toBe(2)

    // A scale-1 viewport is the page's point size: the thumbnail scaler
    // divides the rail width by it, and the page canvas multiplies it by
    // 96/72 for CSS pixels.
    const letter = await document.getPage(1)
    expect(letter.getViewport({ scale: 1 }).width).toBe(612)
    expect(letter.getViewport({ scale: 1 }).height).toBe(792)
    expect(letter.getViewport({ scale: 96 / 72 }).width).toBeCloseTo(816, 5)

    const a4 = await document.getPage(2)
    expect(a4.getViewport({ scale: 1 }).width).toBe(595)
    expect(a4.getViewport({ scale: 1 }).height).toBe(842)
    await task.destroy()
  })

  it('extracts the text runs the selectable layer and copy deliver', async () => {
    const task = getDocument({ data: buildPdf([LETTER, A4]) })
    const document = await task.promise
    const first = await document.getPage(1)
    const content = await first.getTextContent()
    expect(content.items.map(item => ('str' in item ? item.str : '')).join('')).toContain('Hello BirdCoder')
    const second = await document.getPage(2)
    const trailing = await second.getTextContent()
    expect(trailing.items.map(item => ('str' in item ? item.str : '')).join('')).toContain('Second page here')
    await task.destroy()
  })
})
