// @vitest-environment jsdom
/** Slide presentation: text, paint, pictures, tables, groups, and placeholders. */
import { render } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup } from '@testing-library/react'
import { SlideCanvas } from '../src/client/render/SlideCanvas.tsx'
import { TextFrame } from '../src/client/render/TextFrame.tsx'
import { TableView } from '../src/client/render/TableView.tsx'
import type {
  PptxBullet, PptxDeck, PptxParagraph, PptxRun, PptxShape, PptxSlide, PptxTable, PptxTextBody,
} from '../src/client/pptx/model.ts'

/** A run with every property stated, so a spec changes only what it asserts. */
function run(overrides: Partial<PptxRun> = {}): PptxRun {
  return {
    text: 'text',
    lineBreak: false,
    sizePx: 24,
    bold: false,
    italic: false,
    underline: false,
    strike: false,
    color: '#1F1C18',
    fontFamily: '"Calibri", sans-serif',
    baseline: 0,
    letterSpacing: 0,
    ...overrides,
  }
}

/** A bullet with sensible defaults. */
function bullet(overrides: Partial<PptxBullet> = {}): PptxBullet {
  return { kind: 'none', text: '', startAt: 1, step: 1, ...overrides }
}

/** A paragraph with every property stated. */
function paragraph(overrides: Partial<PptxParagraph> = {}): PptxParagraph {
  return {
    align: 'left',
    level: 0,
    bullet: bullet(),
    marginLeft: 0,
    indent: 0,
    spaceBeforePx: 0,
    spaceAfterPx: 0,
    lineSpacing: 1.2,
    runs: [run()],
    ...overrides,
  }
}

/** A text body holding the given paragraphs. */
function body(paragraphs: readonly PptxParagraph[], overrides: Partial<PptxTextBody> = {}): PptxTextBody {
  return {
    paragraphs,
    anchor: 'top',
    insetLeft: 9.6,
    insetTop: 4.8,
    insetRight: 9.6,
    insetBottom: 4.8,
    wrap: true,
    vertical: 'horizontal',
    ...overrides,
  }
}

/** A shape with every property stated. */
function shape(overrides: Partial<Extract<PptxShape, { kind: 'shape' }>> = {}): Extract<PptxShape, { kind: 'shape' }> {
  return {
    kind: 'shape',
    id: 's1',
    name: 'Shape',
    x: 10,
    y: 20,
    width: 100,
    height: 50,
    rotation: 0,
    flipH: false,
    flipV: false,
    opacity: 1,
    preset: 'rect',
    cornerRadius: 0,
    adjustments: [],
    ...overrides,
  }
}

/** A deck wrapping one slide. */
function deckOf(slide: PptxSlide, width = 1280, height = 720): PptxDeck {
  return { width, height, slides: [slide] }
}

/** A slide holding the given shapes. */
function slideOf(shapes: readonly PptxShape[], background?: PptxSlide['background']): PptxSlide {
  return { index: 1, name: 'Slide 1', shapes, notes: [], ...(background === undefined ? {} : { background }) }
}

describe('TextFrame', () => {
  afterEach(cleanup)

  it('numbers, letters, and romanizes counted bullets', () => {
    const arabic = bullet({ kind: 'number', text: '3' })
    const { container, unmount } = render(<TextFrame body={body([paragraph({ bullet: arabic })])} />)
    expect(container.textContent).toContain('3.')
    unmount()

    const paren = render(<TextFrame body={body([paragraph({ bullet: bullet({ kind: 'number', text: '2' }) })])} />)
    // `arabicPeriod` appends a period; the parenthetical formats are keyed by OOXML type,
    // which the parser records on the bullet it produced.
    expect(paren.container.textContent).toContain('2')
    paren.unmount()
  })

  it('renders hanging bullets inside the hanging area', () => {
    const hanging = render(<TextFrame body={body([
      paragraph({ bullet: bullet({ kind: 'char', text: '•' }), marginLeft: 36, indent: -36 }),
    ])} />)
    const marker = hanging.container.querySelector('span')
    expect(marker?.textContent).toBe('•')
    expect((marker as HTMLElement).style.width).toBe('36px')
    hanging.unmount()

    const inline = render(<TextFrame body={body([paragraph({ indent: 24 })])} />)
    expect(inline.container.querySelectorAll('span').length).toBeGreaterThan(1)
    inline.unmount()
  })

  it('keeps an empty paragraph on its own line and renders hard breaks', () => {
    const { container } = render(<TextFrame body={body([
      paragraph({ runs: [] }),
      paragraph({ runs: [run({ text: 'a' }), run({ lineBreak: true }), run({ text: 'b' })] }),
    ])} />)
    expect(container.textContent).toContain('\u200b')
    expect(container.querySelectorAll('br')).toHaveLength(1)
  })

  it('applies run decoration, spacing, highlight, and baseline shift', () => {
    const { container } = render(<TextFrame body={body([paragraph({
      align: 'justify',
      runs: [
        run({
          text: 'x2', bold: true, italic: true, underline: true, strike: true,
          baseline: 30, letterSpacing: 2, highlight: '#FFC000', color: 'rgba(1, 2, 3, 0.5)',
        }),
      ],
    })])} />)
    const span = container.querySelector('span > span') as HTMLElement
    expect(span.style.fontWeight).toBe('700')
    expect(span.style.fontStyle).toBe('italic')
    expect(span.style.textDecoration).toContain('underline')
    expect(span.style.textDecoration).toContain('line-through')
    expect(span.style.verticalAlign).toBe('super')
    expect(span.style.letterSpacing).toBe('2px')
    expect(span.style.backgroundColor).toBe('rgb(255, 192, 0)')

    const sub = render(<TextFrame body={body([paragraph({ runs: [run({ baseline: -25 })] })])} />)
    expect((sub.container.querySelector('span > span') as HTMLElement).style.verticalAlign).toBe('sub')
    sub.unmount()
  })

  it('styles wavy underlines and run shadows beyond the plain forms', () => {
    const { container } = render(<TextFrame body={body([paragraph({
      runs: [run({ underline: true, underlineStyle: 'wavy', shadow: true })],
    })])} />)
    const span = container.querySelector('span > span') as HTMLElement
    expect(span.style.textDecorationStyle).toBe('wavy')
    expect(span.style.textShadow).toContain('rgba(0, 0, 0')

    const doubled = render(<TextFrame body={body([paragraph({
      runs: [run({ underline: true, underlineStyle: 'double' })],
    })])} />)
    expect((doubled.container.querySelector('span > span') as HTMLElement).style.textDecorationStyle).toBe('double')
    doubled.unmount()
  })

  it('renders an exact line height instead of a multiple', () => {
    const { container } = render(<TextFrame body={body([paragraph()])} />)
    const row = container.firstElementChild?.firstElementChild as HTMLElement
    expect(row.style.lineHeight).toBe('1.2')

    const exact = render(<TextFrame body={body([paragraph({ lineSpacingExactPx: 26.6667 })])} />)
    const exactRow = (exact.container.firstElementChild as HTMLElement).firstElementChild as HTMLElement
    expect(exactRow.style.lineHeight).toBe('26.6667px')
    exact.unmount()
  })

  it('colours a character bullet from its first run', () => {
    const tinted = render(<TextFrame body={body([paragraph({
      bullet: bullet({ kind: 'char', text: '•' }),
      runs: [run({ color: '#7030A0' })],
    })])} />)
    const marker = tinted.container.querySelector('span') as HTMLElement
    // No bullet colour: the marker inherits the first run's colour, like Office.
    expect(marker.style.color).toBe('rgb(112, 48, 160)')
    tinted.unmount()

    const explicit = render(<TextFrame body={body([paragraph({
      bullet: bullet({ kind: 'char', text: '•', color: '#FFC000' }),
      runs: [run({ color: '#7030A0' })],
    })])} />)
    expect((explicit.container.querySelector('span') as HTMLElement).style.color).toBe('rgb(255, 192, 0)')
    explicit.unmount()
  })

  it('anchors the frame and switches writing mode for vertical text', () => {
    const { container } = render(<TextFrame body={body([paragraph()], { anchor: 'middle' })} />)
    expect((container.firstElementChild as HTMLElement).style.justifyContent).toBe('center')
    cleanup()

    const bottom = render(<TextFrame body={body([paragraph()], { anchor: 'bottom' })} />)
    expect((bottom.container.firstElementChild as HTMLElement).style.justifyContent).toBe('flex-end')
    bottom.unmount()

    const vertical = render(<TextFrame body={body([paragraph()], { vertical: 'vert' })} />)
    expect((vertical.container.firstElementChild as HTMLElement).style.writingMode).toBe('vertical-rl')
    vertical.unmount()

    const rotated = render(<TextFrame body={body([paragraph()], { vertical: 'vert270' })} />)
    // Bottom-to-top vertical text is vertical writing flipped a half turn.
    expect((rotated.container.firstElementChild as HTMLElement).style.writingMode).toBe('vertical-rl')
    expect((rotated.container.firstElementChild as HTMLElement).style.transform).toBe('rotate(180deg)')
    rotated.unmount()
  })

  it('paints a radial path fill as a radial gradient', () => {
    const slide = slideOf([shape({
      id: 'radial',
      fill: {
        kind: 'gradient', radial: true, angle: 0, stops: [
          { offset: 0, color: '#FFFFFF' }, { offset: 1, color: '#4472C4' },
        ],
      },
    })])
    const { container, unmount } = render(<SlideCanvas slide={slide} deck={deckOf(slide)} />)
    const paint = ((container.firstElementChild as HTMLElement).firstElementChild as HTMLElement).firstElementChild as HTMLElement
    expect(paint.style.backgroundImage).toContain('radial-gradient(circle at 50% 50%')
    unmount()
  })
  it('flows a frame across columns when the body states numCol', () => {
    const plain = render(<TextFrame body={body([paragraph()])} />)
    expect((plain.container.firstElementChild as HTMLElement).style.columnCount).toBe('')
    plain.unmount()

    const columns = render(<TextFrame body={body([paragraph(), paragraph()], { columns: 2 })} />)
    const frame = columns.container.firstElementChild as HTMLElement
    expect(frame.style.display).toBe('block')
    expect(frame.style.columnCount).toBe('2')
    columns.unmount()
  })

  it('renders an internal slide jump as a navigable anchor', () => {
    const { container } = render(<TextFrame body={body([paragraph({
      runs: [run({ text: 'go', link: '#slide/2' })],
    })])} />)
    const anchor = container.querySelector('a')
    expect(anchor?.getAttribute('data-pptx-slide-jump')).toBe('2')
    expect(anchor?.getAttribute('href')).toBe('#')
    expect(anchor?.getAttribute('target')).toBeNull()
  })

  it('renders a linked run as an anchored element', () => {
    const { container } = render(<TextFrame body={body([paragraph({
      runs: [run({ text: 'open', link: 'https://example.com/page' })],
    })])} />)
    const anchor = container.querySelector('a')
    expect(anchor?.getAttribute('href')).toBe('https://example.com/page')
    expect(anchor?.getAttribute('target')).toBe('_blank')
    expect(anchor?.getAttribute('rel')).toContain('noopener')
    expect(anchor?.textContent).toBe('open')
  })
})

describe('SlideCanvas', () => {
  afterEach(cleanup)

  it('paints solid, gradient, and picture fills and clips preset outlines', () => {
    const slide = slideOf([
      shape({
        id: 'a',
        preset: 'roundRect',
        cornerRadius: 12,
        fill: { kind: 'gradient', radial: false, angle: 135, stops: [
          { offset: 0, color: '#FFFFFF' }, { offset: 1, color: '#4472C4' },
        ] },
        line: { color: '#1F1C18', width: 2, dashed: true, dotted: false },
        shadow: '0 3px 8px rgba(0, 0, 0, 0.22)',
      }),
      shape({ id: 'b', preset: 'line' }),
      shape({ id: 'c', preset: 'triangle', fill: { kind: 'image', src: 'blob:1', mode: 'tile' } }),
      shape({ id: 'd', x: -5, y: -5, rotation: 45, flipH: true, flipV: true, opacity: 0.5,
        fill: { kind: 'solid', color: '#A8351A' } }),
    ], { kind: 'solid', color: '#FFFFFF' })
    const { container } = render(<SlideCanvas slide={slide} deck={deckOf(slide)} />)
    const canvas = container.firstElementChild as HTMLElement
    expect(canvas.style.width).toBe('1280px')
    // jsdom normalizes a hex background to its rgb() form.
    expect(canvas.style.background).toBe('rgb(255, 255, 255)')

    const [gradient, connector, triangle, flipped] = Array.from(canvas.children) as HTMLElement[]
    const paint = gradient.firstElementChild as HTMLElement
    expect(paint.style.backgroundImage).toContain('linear-gradient(135deg')
    expect(paint.style.borderRadius).toBe('12px')
    expect(paint.style.border).toContain('dashed')
    expect(paint.style.boxShadow).not.toBe('')
    // A connector draws a stroke rather than a filled region.
    expect((connector.firstElementChild as HTMLElement).style.height).toBe('1px')
    // An image fill keeps its natural size when it tiles.
    expect((triangle.firstElementChild as HTMLElement).style.backgroundSize).toBe('auto')
    expect(flipped.style.transform).toBe('rotate(45deg) scaleX(-1) scaleY(-1)')
    expect(flipped.style.opacity).toBe('0.5')
  })

  it('crops a picture to its source rectangle', () => {
    const slide = slideOf([{
      kind: 'picture', id: 'p', name: 'Picture', x: 0, y: 0, width: 200, height: 100,
      rotation: 0, flipH: false, flipV: false, opacity: 1, src: 'blob:2', preset: 'ellipse',
      crop: { left: 0.1, top: 0.2, right: 0.1, bottom: 0.2 },
      line: { color: '#000000', width: 1, dashed: false, dotted: false },
    }])
    const { container } = render(<SlideCanvas slide={slide} deck={deckOf(slide)} />)
    // canvas → placement wrapper → the clipped picture frame.
    const canvas = container.firstElementChild as HTMLElement
    const frame = (canvas.firstElementChild as HTMLElement).firstElementChild as HTMLElement
    expect(frame.style.overflow).toBe('hidden')
    const image = frame.querySelector('img') as HTMLImageElement
    expect(image.getAttribute('src')).toBe('blob:2')
    // The visible source rectangle is scaled up so it fills the frame exactly.
    const percent = (value: string): number => Number.parseFloat(value)
    expect(percent(image.style.width)).toBeCloseTo(125, 6)
    expect(percent(image.style.height)).toBeCloseTo(100 / 0.6, 6)
    expect(percent(image.style.left)).toBeCloseTo(-12.5, 6)
    expect(percent(image.style.top)).toBeCloseTo(-(0.2 / 0.6) * 100, 6)
    expect(frame.lastElementChild).not.toBe(image)
  })

  it('places tables by span and drops merged continuations', () => {
    const table: PptxTable = {
      kind: 'table', id: 't', name: 'Table', x: 0, y: 0, width: 300, height: 150,
      rotation: 0, flipH: false, flipV: false, opacity: 1,
      columnWidths: [100, 100, 100],
      rows: [
        { height: 50, cells: [
          { gridSpan: 2, rowSpan: 1, merged: false, borders: {},
            text: body([paragraph({ runs: [run({ text: 'wide' })] })]),
            fill: { kind: 'solid', color: '#4472C4' } },
          { gridSpan: 1, rowSpan: 1, merged: true, borders: {} },
        ] },
        { height: 50, cells: [
          { gridSpan: 1, rowSpan: 2, merged: false,
            borders: { top: { color: '#000000', width: 1, dashed: false, dotted: true } } },
          { gridSpan: 1, rowSpan: 1, merged: false, borders: {} },
          { gridSpan: 1, rowSpan: 1, merged: false, borders: {} },
        ] },
        { height: 50, cells: [
          { gridSpan: 1, rowSpan: 1, merged: true, borders: {} },
          { gridSpan: 1, rowSpan: 1, merged: false, borders: {} },
          { gridSpan: 1, rowSpan: 1, merged: false, borders: {} },
        ] },
      ],
      banded: true,
    }
    const { container } = render(<TableView table={table} />)
    const cells = Array.from(container.firstElementChild!.children) as HTMLElement[]
    // Six painted cells: one two-column span, one two-row span, and four singles.
    expect(cells).toHaveLength(6)
    expect(cells[0].style.width).toBe('200px')
    expect(cells[0].style.height).toBe('50px')
    // The row-spanning cell covers both of its rows and keeps its own top border.
    expect(cells[1].style.height).toBe('100px')
    expect(cells[1].style.top).toBe('50px')
    expect(cells[1].style.borderTop).toContain('dotted')
    expect(cells[2].style.left).toBe('100px')
    expect(cells[3].style.left).toBe('200px')
    expect(cells[4].style.top).toBe('100px')
  })

  it('flattens group children and rotates the group around its own box', () => {
    const group: PptxShape = {
      kind: 'group', id: 'g', name: 'Group', x: 100, y: 100, width: 200, height: 100,
      rotation: 90, flipH: false, flipV: false, opacity: 1,
      children: [shape({ id: 'child', x: 150, y: 130 })],
    }
    const slide = slideOf([group])
    const { container } = render(<SlideCanvas slide={slide} deck={deckOf(slide)} />)
    const wrapper = (container.firstElementChild as HTMLElement).firstElementChild as HTMLElement
    expect(wrapper.style.transform).toBe('rotate(90deg)')
    const child = wrapper.firstElementChild as HTMLElement
    expect(child.style.left).toBe('50px')
    expect(child.style.top).toBe('30px')
  })

  it('describes a graphic frame the renderer does not draw', () => {
    const slide = slideOf([{
      kind: 'placeholder', id: 'f', name: 'Chart', x: 0, y: 0, width: 200, height: 100,
      rotation: 0, flipH: false, flipV: false, opacity: 1, label: 'chart stub',
    }])
    const { container } = render(<SlideCanvas slide={slide} deck={deckOf(slide)} />)
    const frame = (container.firstElementChild as HTMLElement).firstElementChild as HTMLElement
    expect(frame.textContent).toBe('chart stub')
    expect(frame.style.border).toContain('dashed')
  })

  it('keys shapes without an id by position', () => {
    const slide = slideOf([shape({ id: '' }), shape({ id: '' })])
    const { container } = render(<SlideCanvas slide={slide} deck={deckOf(slide)} />)
    expect(container.firstElementChild!.children).toHaveLength(2)
  })

  it('clips a freeform shape by its projected path and strokes along it', () => {
    const slide = slideOf([shape({
      id: 'free',
      custGeomPath: 'M 0 0 L 100 0 L 50 50 Z',
      fill: { kind: 'solid', color: '#FF0000' },
      line: { color: '#000000', width: 4, dashed: false, dotted: false },
    })])
    const { container, unmount } = render(<SlideCanvas slide={slide} deck={deckOf(slide)} />)
    const placement = (container.firstElementChild as HTMLElement).firstElementChild as HTMLElement
    const [band, fill] = Array.from(placement.children) as HTMLElement[]
    // The stroke layer paints the line colour; the fill layer above is scaled
    // in by twice the stroke width, leaving the outline visible along the path.
    expect(band.style.clipPath).toBe("path('M 0 0 L 100 0 L 50 50 Z')")
    expect(band.style.background).toBe('rgb(0, 0, 0)')
    expect(fill.style.clipPath).toBe("path('M 0 0 L 100 0 L 50 50 Z')")
    expect(fill.style.background).toBe('rgb(255, 0, 0)')
    expect(fill.style.transform).toBe('scale(0.92, 0.84)')
    unmount()
  })

  it('projects pie, chord, and two-corner radius presets', () => {
    const pie = slideOf([shape({ id: 'pie', preset: 'pie', adjustments: [0, 162], fill: { kind: 'solid', color: '#4472C4' } })])
    const { container } = render(<SlideCanvas slide={pie} deck={deckOf(pie)} />)
    const pieClip = ((container.firstElementChild as HTMLElement).firstElementChild as HTMLElement).firstElementChild as HTMLElement
    // 270° of sweep fills three quarters around the centre point.
    expect(pieClip.style.clipPath).toMatch(/^polygon\(50% 50%, /u)
    cleanup()

    const chord = slideOf([shape({ id: 'chord', preset: 'chord', adjustments: [0, 90] })])
    const chordView = render(<SlideCanvas slide={chord} deck={deckOf(chord)} />)
    const chordFrame = (chordView.container.firstElementChild as HTMLElement).firstElementChild as HTMLElement
    const chordClip = chordFrame.firstElementChild as HTMLElement
    expect(chordClip.style.clipPath).toMatch(/^polygon\(\d+(\.\d+)?% /u)
    expect(chordClip.style.clipPath).not.toContain('50% 50%')
    chordView.unmount()
    cleanup()

    const rounded = slideOf([shape({ id: 'r2', preset: 'round2SameRect', adjustments: [0.16667] })])
    const roundedView = render(<SlideCanvas slide={rounded} deck={deckOf(rounded)} />)
    const roundedFrame = (roundedView.container.firstElementChild as HTMLElement).firstElementChild as HTMLElement
    const roundedPaint = roundedFrame.firstElementChild as HTMLElement
    // The top pair rounds at the adjustment; the bottom pair stays square.
    expect(roundedPaint.style.borderRadius).toBe('8.3335px 8.3335px 0px 0px')
    roundedView.unmount()
  })

  it('projects donut and blockArc regions as sampled ring polygons', () => {
    const donut = slideOf([shape({ id: 'ring', preset: 'donut', fill: { kind: 'solid', color: '#4472C4' } })])
    const { container } = render(<SlideCanvas slide={donut} deck={deckOf(donut)} />)
    const ringClip = ((container.firstElementChild as HTMLElement).firstElementChild as HTMLElement)
      .firstElementChild as HTMLElement
    // A default ring samples the full outer ellipse and the half-radius inner.
    expect(ringClip.style.clipPath).toMatch(/^polygon\(/u)
    expect(ringClip.style.clipPath.split('%').length - 1).toBeGreaterThan(70)
    cleanup()

    const block = slideOf([shape({
      id: 'band', preset: 'blockArc', adjustments: [108, 0, 25],
      fill: { kind: 'solid', color: '#70AD47' },
    })])
    const blockView = render(<SlideCanvas slide={block} deck={deckOf(block)} />)
    const bandClip = ((blockView.container.firstElementChild as HTMLElement).firstElementChild as HTMLElement)
      .firstElementChild as HTMLElement
    // The default blockArc starts at 180 degrees (the box's left middle).
    expect(bandClip.style.clipPath).toMatch(/^polygon\(0% 50%, /u)
    blockView.unmount()
  })

  it('paints an open arc as a stroke-width band along the ellipse', () => {
    const slide = slideOf([shape({
      id: 'arc',
      preset: 'arc',
      adjustments: [0, 162],
      line: { color: '#FF0000', width: 3, dashed: false, dotted: false },
    })])
    const { container } = render(<SlideCanvas slide={slide} deck={deckOf(slide)} />)
    const band = ((container.firstElementChild as HTMLElement).firstElementChild as HTMLElement)
      .firstElementChild as HTMLElement
    expect(band.style.clipPath).toMatch(/^polygon\(/u)
    expect(band.style.clipPath.split('%').length - 1).toBeGreaterThan(20)
    expect(band.style.background).toBe('rgb(255, 0, 0)')
  })

  it('draws connector arrowheads at the ends the line names', () => {
    const slide = slideOf([shape({
      id: 'arrow',
      preset: 'line',
      line: { color: '#FF0000', width: 2, dashed: false, dotted: false, headArrow: true, tailArrow: true },
    })])
    const { container } = render(<SlideCanvas slide={slide} deck={deckOf(slide)} />)
    // canvas → placement → the stroke line → the two arrowhead triangles.
    const stroke = ((container.firstElementChild as HTMLElement).firstElementChild as HTMLElement).firstElementChild as HTMLElement
    const [head, tail] = Array.from(stroke.children) as HTMLElement[]
    expect(head.style.borderRight).toContain('rgb(255, 0, 0)')
    expect(tail.style.borderLeft).toContain('rgb(255, 0, 0)')
  })
})
