// @vitest-environment jsdom
/** Presentation parsing: inheritance, geometry, colours, text, and refusals. */
import { describe, expect, it } from 'vitest'
import { parsePptx, PptxParseError } from '../src/client/pptx/deck.ts'
import { fixtureEntries, storedFixturePackage } from './pptx-fixture.client.ts'
import { buildZip } from './zip-fixture.client.ts'

/** The labels every parse call needs. */
const LABELS = {
  slideName: (index: number) => `Slide ${index}`,
  unsupportedFrame: () => 'unsupported',
  missingImage: () => 'missing image',
}

describe('parsePptx', () => {
  it('builds the slide model through the layout and master chain', async () => {
    const parsed = await parsePptx(await storedFixturePackage(), LABELS)
    try {
      expect(parsed.deck.width).toBe(1280)
      expect(parsed.deck.height).toBe(720)
      expect(parsed.deck.slides).toHaveLength(1)
      const slide = parsed.deck.slides[0]
      expect(slide.index).toBe(1)
      expect(slide.name).toBe('Fixture Slide 1')
      // The master's solid background resolves through the colour map.
      expect(slide.background).toEqual({ kind: 'solid', color: '#FFFFFF' })

      const [title, body, rectangle] = slide.shapes
      // The title states no geometry of its own, so it inherits the layout's.
      expect(title).toMatchObject({ kind: 'shape', preset: 'rect' })
      expect(title.x).toBeCloseTo(88, 1)
      expect(title.y).toBeCloseTo(38.3, 1)
      // The title style's 40pt becomes pixels at 96 DPI.
      expect(title).toMatchObject({ name: 'Title 1' })
      if (title?.kind !== 'shape') throw new Error('expected an autoshape')
      expect(title.text?.paragraphs[0]?.runs[0]).toMatchObject({
        text: '桃花源记 1',
        sizePx: 58.666666666666664,
        bold: true,
        color: '#000000',
      })

      if (body?.kind !== 'shape') throw new Error('expected an autoshape')
      expect(body.text?.paragraphs).toHaveLength(2)
      // The body style supplies the bullet and its hanging indent.
      expect(body.text?.paragraphs[0]?.bullet.kind).toBe('char')
      expect(body.text?.paragraphs[0]?.bullet.text).toBe('•')
      expect(body.text?.paragraphs[0]?.marginLeft).toBeCloseTo(36, 1)
      expect(body.text?.paragraphs[0]?.indent).toBeCloseTo(-36, 1)
      expect(body.text?.paragraphs[1]?.runs[0]).toMatchObject({ italic: true })

      // The rectangle's fill and line come from the theme style matrix.
      expect(rectangle).toMatchObject({ kind: 'shape', preset: 'roundRect' })
      if (rectangle?.kind !== 'shape') throw new Error('expected an autoshape')
      expect(rectangle.fill).toEqual({ kind: 'solid', color: '#ED7D31' })
      // `lnRef` carries its own scheme colour, which replaces the theme placeholder colour.
      expect(rectangle.line).toMatchObject({ color: '#4472C4', width: 1 })
      expect(rectangle.cornerRadius).toBeCloseTo(24, 1)
      expect(rectangle.text?.paragraphs[0]?.runs[0]?.text).toBe('世外桃源')
    } finally {
      parsed.dispose()
    }
  })

  it('names a slide after its position when the part states no name', async () => {
    const entries = fixtureEntries().map(entry => (
      entry.name === 'ppt/slides/slide1.xml'
        ? { ...entry, text: entry.text.replace(' name="Fixture Slide 1"', '') }
        : entry
    ))
    const parsed = await parsePptx(await buildZip(entries), LABELS)
    try {
      expect(parsed.deck.slides[0].name).toBe('Slide 1')
    } finally {
      parsed.dispose()
    }
  })

  it('reads every slide the presentation lists, in order', async () => {
    const parsed = await parsePptx(await storedFixturePackage(3), LABELS)
    try {
      expect(parsed.deck.slides.map(slide => slide.name)).toEqual([
        'Fixture Slide 1', 'Fixture Slide 2', 'Fixture Slide 3',
      ])
      expect(parsed.deck.slides.map(slide => slide.index)).toEqual([1, 2, 3])
      expect(parsed.deck.slides[2].shapes[0]).toBeDefined()
    } finally {
      parsed.dispose()
    }
  })

  it('refuses a legacy binary presentation', async () => {
    const bytes = new Uint8Array(64)
    bytes.set([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1])
    await expect(parsePptx(bytes, LABELS)).rejects.toMatchObject({ code: 'legacy-binary' })
  })

  it('refuses bytes that are not a package', async () => {
    await expect(parsePptx(new Uint8Array([1, 2, 3, 4]), LABELS)).rejects.toMatchObject({ code: 'not-a-package' })
  })

  it('refuses a package with no office document relationship', async () => {
    const bytes = await buildZip([{ name: 'README.txt', text: 'nothing here' }])
    await expect(parsePptx(bytes, LABELS)).rejects.toMatchObject({ code: 'no-presentation' })
  })

  it('refuses a package whose presentation lists no slides', async () => {
    const entries = fixtureEntries().map(entry => (
      entry.name === 'ppt/presentation.xml'
        ? { ...entry, text: entry.text.replace(/<p:sldIdLst>.*<\/p:sldIdLst>/u, '<p:sldIdLst/>') }
        : entry
    ))
    const failure = await parsePptx(await buildZip(entries), LABELS).catch((error: unknown) => error)
    expect(failure).toBeInstanceOf(PptxParseError)
    expect(failure).toMatchObject({ code: 'no-presentation' })
  })

  it('falls back to the default 16:9 size and default theme when parts are missing', async () => {
    const entries = fixtureEntries()
      .filter(entry => entry.name !== 'ppt/theme/theme1.xml')
      .map(entry => (entry.name === 'ppt/presentation.xml'
        ? { ...entry, text: entry.text.replace('<p:sldSz cx="12192000" cy="6858000"/>', '') }
        : entry))
    const parsed = await parsePptx(await buildZip(entries), LABELS)
    try {
      expect(parsed.deck.width).toBe(1280)
      expect(parsed.deck.height).toBe(720)
      // With no theme part the built-in scheme still resolves the slide background.
      expect(parsed.deck.slides[0].background).toEqual({ kind: 'solid', color: '#FFFFFF' })
    } finally {
      parsed.dispose()
    }
  })

  it('paints the decoration shapes of the second master with its own theme', async () => {
    const parsed = await parsePptx(await storedFixturePackage(2, { secondMaster: true }), LABELS)
    try {
      // Slide 1 hangs off the first master, whose layout carries no decoration.
      expect(parsed.deck.slides[0].shapes[0]).toMatchObject({ name: 'Title 1' })
      const [masterBar, layoutBar, title] = parsed.deck.slides[1].shapes
      if (masterBar?.kind !== 'shape' || layoutBar?.kind !== 'shape') throw new Error('expected autoshapes')
      // Master shapes paint first, then layout shapes, then the slide's own.
      expect(masterBar).toMatchObject({ kind: 'shape', name: 'Master Bar' })
      expect(masterBar.fill).toEqual({ kind: 'solid', color: '#70AD47' })
      expect(layoutBar).toMatchObject({ kind: 'shape', name: 'Layout Bar' })
      expect(layoutBar.fill).toEqual({ kind: 'solid', color: '#70AD47' })
      expect(title).toMatchObject({ name: 'Title 1' })
    } finally {
      parsed.dispose()
    }
  })

  it('suppresses master decorations when the slide or layout opts out', async () => {
    const entries = fixtureEntries(2, { secondMaster: true }).map(entry => (
      entry.name === 'ppt/slides/slide2.xml'
        ? { ...entry, text: entry.text.replace('<p:sld ', '<p:sld showMasterSp="0" ') }
        : entry
    ))
    const parsed = await parsePptx(await buildZip(entries), LABELS)
    try {
      const names = parsed.deck.slides[1].shapes.map(shape => shape.name)
      // The master bar is suppressed; the layout's own decoration stays.
      expect(names).not.toContain('Master Bar')
      expect(names).toContain('Layout Bar')
    } finally {
      parsed.dispose()
    }
  })

  it('marks a slide the presentation hides', async () => {
    const entries = fixtureEntries().map(entry => (
      entry.name === 'ppt/slides/slide1.xml'
        ? { ...entry, text: entry.text.replace('<p:sld ', '<p:sld show="0" ') }
        : entry
    ))
    const parsed = await parsePptx(await buildZip(entries), LABELS)
    try {
      expect(parsed.deck.slides[0].hidden).toBe(true)
    } finally {
      parsed.dispose()
    }
  })

  it('describes a picture whose media part the browser cannot decode', async () => {
    const entries = fixtureEntries().map((entry) => {
      if (entry.name === 'ppt/slides/slide1.xml') {
        const picture = '<p:pic><p:nvPicPr><p:cNvPr id="20" name="Logo"/><p:cNvPicPr/><p:nvPr/></p:nvPicPr>'
          + '<p:blipFill><a:blip r:embed="rIdImage"/></p:blipFill>'
          + '<p:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="914400" cy="914400"/></a:xfrm>'
          + '<a:prstGeom prst="rect"/></p:spPr></p:pic>'
        return { ...entry, text: entry.text.replace('</p:spTree>', `${picture}</p:spTree>`) }
      }
      if (entry.name === 'ppt/slides/_rels/slide1.xml.rels') {
        return {
          ...entry,
          text: entry.text.replace('</Relationships>',
            '<Relationship Id="rIdImage" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/logo.emf"/></Relationships>'),
        }
      }
      return entry
    })
    entries.push({ name: 'ppt/media/logo.emf', text: 'not readable by the browser' })
    const parsed = await parsePptx(await buildZip(entries), LABELS)
    try {
      expect(parsed.deck.slides[0].shapes.at(-1)).toMatchObject({
        kind: 'placeholder', name: 'Logo', label: 'missing image',
      })
    } finally {
      parsed.dispose()
    }
  })

  it('draws a freeform custGeom shape from its projected path', async () => {
    const freeform = '<p:sp><p:nvSpPr><p:cNvPr id="40" name="Freeform"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr>'
      + '<p:spPr><a:xfrm><a:off x="914400" y="1828800"/><a:ext cx="1828800" cy="914400"/></a:xfrm>'
      + '<a:custGeom><a:avLst/><a:pathLst><a:path w="100" h="50">'
      + '<a:moveTo><a:pt x="0" y="0"/></a:moveTo>'
      + '<a:lnTo><a:pt x="100" y="0"/></a:lnTo>'
      + '<a:lnTo><a:pt x="50" y="50"/></a:lnTo>'
      + '<a:close/></a:path></a:pathLst></a:custGeom></p:spPr></p:sp>'
    const entries = fixtureEntries().map(entry => (
      entry.name === 'ppt/slides/slide1.xml'
        ? { ...entry, text: entry.text.replace('</p:spTree>', `${freeform}</p:spTree>`) }
        : entry
    ))
    const parsed = await parsePptx(await buildZip(entries), LABELS)
    try {
      const freeformShape = parsed.deck.slides[0].shapes.at(-1)
      if (freeformShape?.kind !== 'shape') throw new Error('expected an autoshape')
      // The path coordinate space (100×50) scales onto the 192×96 pixel box.
      expect(freeformShape.custGeomPath).toBe('M 0 0 L 192 0 L 96 96 Z')
    } finally {
      parsed.dispose()
    }
  })

  it('shows the cached fallback picture of a chart frame', async () => {
    const chart = '<mc:AlternateContent xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006">'
      + '<mc:Choice xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart" Requires="c">'
      + '<p:graphicFrame><p:nvGraphicFramePr><p:cNvPr id="51" name="Chart 5"/><p:cNvGraphicFramePr/><p:nvPr/></p:nvGraphicFramePr>'
      + '<p:xfrm><a:off x="0" y="914400"/><a:ext cx="1828800" cy="1828800"/></p:xfrm>'
      + '<a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/chart">'
      + '<c:chart xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart" r:id="rIdChart"/></a:graphicData></a:graphic></p:graphicFrame>'
      + '</mc:Choice>'
      + '<mc:Fallback><p:pic><p:nvPicPr><p:cNvPr id="50" name="Chart 4"/><p:cNvPicPr/><p:nvPr/></p:nvPicPr>'
      + '<p:blipFill><a:blip r:embed="rIdChart"/></p:blipFill>'
      + '<p:spPr><a:xfrm><a:off x="0" y="914400"/><a:ext cx="1828800" cy="1828800"/></a:xfrm>'
      + '<a:prstGeom prst="rect"/></p:spPr></p:pic></mc:Fallback>'
      + '</mc:AlternateContent>'
    const entries = fixtureEntries().map((entry) => {
      if (entry.name === 'ppt/slides/slide1.xml') {
        return { ...entry, text: entry.text.replace('</p:spTree>', `${chart}</p:spTree>`) }
      }
      if (entry.name === 'ppt/slides/_rels/slide1.xml.rels') {
        return {
          ...entry,
          text: entry.text.replace('</Relationships>',
            '<Relationship Id="rIdChart" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/chart1.png"/></Relationships>'),
        }
      }
      return entry
    })
    entries.push({ name: 'ppt/media/chart1.png', text: 'chart-bytes' })
    // jsdom ships no blob URL store; a fixed stub keeps the picture resolvable.
    const owner = URL as unknown as Record<string, unknown>
    const originalCreate = owner.createObjectURL
    const originalRevoke = owner.revokeObjectURL
    owner.createObjectURL = () => 'blob:stub'
    owner.revokeObjectURL = () => { }
    try {
      const parsed = await parsePptx(await buildZip(entries), LABELS)
      try {
        expect(parsed.deck.slides[0].shapes.at(-1)).toMatchObject({
          kind: 'picture', name: 'Chart 4', src: 'blob:stub',
        })
      } finally {
        parsed.dispose()
      }
    } finally {
      owner.createObjectURL = originalCreate
      owner.revokeObjectURL = originalRevoke
    }
  })

  it('carries an exact line height from spcPts through to the model', async () => {
    const spaced = '<p:sp><p:nvSpPr><p:cNvPr id="60" name="Spaced"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr>'
      + '<p:spPr><a:xfrm><a:off x="914400" y="914400"/><a:ext cx="2743200" cy="914400"/></a:xfrm></p:spPr>'
      + '<p:txBody><a:bodyPr/><a:lstStyle/><a:p><a:pPr><a:lnSpc><a:spcPts val="2000"/></a:lnSpc></a:pPr>'
      + '<a:r><a:t>evenly spaced</a:t></a:r></a:p></p:txBody></p:sp>'
    const entries = fixtureEntries().map(entry => (
      entry.name === 'ppt/slides/slide1.xml'
        ? { ...entry, text: entry.text.replace('</p:spTree>', `${spaced}</p:spTree>`) }
        : entry
    ))
    const parsed = await parsePptx(await buildZip(entries), LABELS)
    try {
      const spacedShape = parsed.deck.slides[0].shapes.at(-1)
      if (spacedShape?.kind !== 'shape' || spacedShape.text === undefined) throw new Error('expected a text shape')
      const paragraph = spacedShape.text.paragraphs[0]
      // 20pt renders at its pixel height instead of a runaway multiple.
      expect(paragraph?.lineSpacingExactPx).toBeCloseTo(26.6667, 3)
      expect(paragraph?.lineSpacing).toBeCloseTo(1.2, 5)
    } finally {
      parsed.dispose()
    }
  })

  it('applies the default table style to cells that state no fill', async () => {
    const table = '<p:graphicFrame><p:nvGraphicFramePr><p:cNvPr id="30" name="Table 3"/><p:cNvGraphicFramePr/><p:nvPr/></p:nvGraphicFramePr>'
      + '<p:xfrm><a:off x="914400" y="914400"/><a:ext cx="5486400" cy="1828800"/></p:xfrm>'
      + '<a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/table"><a:tbl>'
      + '<a:tblPr firstRow="1" bandRow="1"/>'
      + '<a:tblGrid><a:gridCol w="2743200"/><a:gridCol w="2743200"/></a:tblGrid>'
      + '<a:tr h="457200"><a:tc><a:txBody><a:bodyPr/><a:p><a:r><a:t>Head</a:t></a:r></a:p></a:txBody><a:tcPr/></a:tc>'
      + '<a:tc><a:txBody><a:bodyPr/><a:p><a:r><a:t>Second</a:t></a:r></a:p></a:txBody><a:tcPr/></a:tc></a:tr>'
      + '<a:tr h="457200"><a:tc><a:txBody><a:bodyPr/><a:p><a:r><a:t>a</a:t></a:r></a:p></a:txBody><a:tcPr/></a:tc>'
      + '<a:tc><a:txBody><a:bodyPr/><a:p><a:r><a:t>b</a:t></a:r></a:p></a:txBody><a:tcPr/></a:tc></a:tr>'
      + '<a:tr h="457200"><a:tc><a:txBody><a:bodyPr/><a:p><a:r><a:t>c</a:t></a:r></a:p></a:txBody><a:tcPr/></a:tc>'
      + '<a:tc><a:txBody><a:bodyPr/><a:p><a:r><a:t>d</a:t></a:r></a:p></a:txBody><a:tcPr/></a:tc></a:tr>'
      + '</a:tbl></a:graphicData></a:graphic></p:graphicFrame>'
    const entries = fixtureEntries().map(entry => (
      entry.name === 'ppt/slides/slide1.xml'
        ? { ...entry, text: entry.text.replace('</p:spTree>', `${table}</p:spTree>`) }
        : entry
    ))
    const parsed = await parsePptx(await buildZip(entries), LABELS)
    try {
      const tableShape = parsed.deck.slides[0].shapes.at(-1)
      if (tableShape?.kind !== 'table') throw new Error('expected a table')
      // The header row takes the theme accent; its default-coloured runs turn
      // white and bold the way Office's built-in style does.
      expect(tableShape.rows[0]?.cells[0]?.fill).toEqual({ kind: 'solid', color: '#4472C4' })
      expect(tableShape.rows[0]?.cells[0]?.text?.paragraphs[0]?.runs[0]).toMatchObject({
        color: '#FFFFFF', bold: true,
      })
      // Banding skips the row after the header, then tints every second row.
      expect(tableShape.rows[1]?.cells[0]?.fill).toBeUndefined()
      expect(tableShape.rows[2]?.cells[0]?.fill).toEqual({ kind: 'solid', color: '#DAE3F3' })
    } finally {
      parsed.dispose()
    }
  })

  it('resolves a percent bullet against its own run size', async () => {
    const bulleted = '<p:sp><p:nvSpPr><p:cNvPr id="70" name="Bulleted"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr>'
      + '<p:spPr><a:xfrm><a:off x="914400" y="914400"/><a:ext cx="2743200" cy="914400"/></a:xfrm></p:spPr>'
      + '<p:txBody><a:bodyPr/><a:lstStyle/><a:p><a:pPr marL="0" indent="0"><a:buSzPct val="150000"/>'
      + '<a:buChar char="›"/></a:pPr><a:r><a:rPr sz="2400"/><a:t>sized</a:t></a:r></a:p></p:txBody></p:sp>'
    const entries = fixtureEntries().map(entry => (
      entry.name === 'ppt/slides/slide1.xml'
        ? { ...entry, text: entry.text.replace('</p:spTree>', `${bulleted}</p:spTree>`) }
        : entry
    ))
    const parsed = await parsePptx(await buildZip(entries), LABELS)
    try {
      const bulletedShape = parsed.deck.slides[0].shapes.at(-1)
      if (bulletedShape?.kind !== 'shape' || bulletedShape.text === undefined) throw new Error('expected a text shape')
      const { bullet, runs } = bulletedShape.text.paragraphs[0]
      // 150% of the run's 24pt (32px) is 48px, not 150% of a fixed base.
      expect(bullet?.sizePercent).toBe(1.5)
      expect(runs[0]?.sizePx).toBeCloseTo(32, 5)
      expect(bullet?.sizePx).toBeCloseTo(48, 5)
    } finally {
      parsed.dispose()
    }
  })

  it('resolves hyperlinks with theme colour and underline, whitelisting schemes', async () => {
    const linked = '<p:sp><p:nvSpPr><p:cNvPr id="80" name="Links"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr>'
      + '<p:spPr><a:xfrm><a:off x="914400" y="914400"/><a:ext cx="2743200" cy="1828800"/></a:xfrm></p:spPr>'
      + '<p:txBody><a:bodyPr/><a:lstStyle/>'
      + '<a:p><a:r><a:rPr lang="en-US"><a:hlinkClick r:id="rIdWeb"/></a:rPr><a:t>web</a:t></a:r></a:p>'
      + '<a:p><a:r><a:rPr lang="en-US"><a:hlinkClick r:id="rIdBad"/></a:rPr><a:t>script</a:t></a:r></a:p>'
      + '<a:p><a:r><a:rPr lang="en-US" u="none"><a:hlinkClick r:id="rIdWeb"/><a:solidFill><a:srgbClr val="FF0000"/></a:solidFill></a:rPr><a:t>styled</a:t></a:r></a:p>'
      + '</p:txBody></p:sp>'
    const entries = fixtureEntries().map((entry) => {
      if (entry.name === 'ppt/slides/slide1.xml') {
        return { ...entry, text: entry.text.replace('</p:spTree>', `${linked}</p:spTree>`) }
      }
      if (entry.name === 'ppt/slides/_rels/slide1.xml.rels') {
        return {
          ...entry,
          text: entry.text.replace('</Relationships>',
            '<Relationship Id="rIdWeb" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink" Target="https://example.com/page" TargetMode="External"/>'
            + '<Relationship Id="rIdBad" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink" Target="javascript:alert(1)" TargetMode="External"/></Relationships>'),
        }
      }
      return entry
    })
    const parsed = await parsePptx(await buildZip(entries), LABELS)
    try {
      const linkedShape = parsed.deck.slides[0].shapes.at(-1)
      if (linkedShape?.kind !== 'shape' || linkedShape.text === undefined) throw new Error('expected a text shape')
      const [web, script, styled] = linkedShape.text.paragraphs
      // A plain hyperlink takes the theme hlink colour and an underline.
      expect(web?.runs[0]).toMatchObject({ link: 'https://example.com/page', color: '#0563C1', underline: true })
      // A hostile scheme stays plain text.
      expect(script?.runs[0]?.link).toBeUndefined()
      // Explicit colour and underline overrides survive.
      expect(styled?.runs[0]).toMatchObject({ link: 'https://example.com/page', color: '#FF0000', underline: false })
    } finally {
      parsed.dispose()
    }
  })

  it('draws footer and slide-number placeholders the master enables', async () => {
    const footer = '<p:sp><p:nvSpPr><p:cNvPr id="95" name="Footer"/><p:cNvSpPr/><p:nvPr><p:ph type="ftr" sz="quarter"/></p:nvPr></p:nvSpPr>'
      + '<p:spPr><a:xfrm><a:off x="0" y="6492248"/><a:ext cx="3657600" cy="365760"/></a:xfrm></p:spPr>'
      + '<p:txBody><a:bodyPr/><a:lstStyle/><a:p><a:r><a:t>BirdCoder</a:t></a:r></a:p></p:txBody></p:sp>'
    const number = '<p:sp><p:nvSpPr><p:cNvPr id="96" name="Number"/><p:cNvSpPr/><p:nvPr><p:ph type="sldNum" sz="quarter"/></p:nvPr></p:nvSpPr>'
      + '<p:spPr><a:xfrm><a:off x="10972800" y="6492248"/><a:ext cx="914400" cy="365760"/></a:xfrm></p:spPr>'
      + '<p:txBody><a:bodyPr/><a:lstStyle/><a:p><a:fld id="{GUID}" type="slidenum"><a:rPr/><a:t>9</a:t></a:fld></a:p></p:txBody></p:sp>'
    const entries = fixtureEntries(2).map((entry) => {
      if (entry.name === 'ppt/slideMasters/slideMaster1.xml') {
        return {
          ...entry,
          text: entry.text
            .replace('<p:txStyles>', '<p:hf ftr="1" sldNum="1"/><p:txStyles>')
            .replace('</p:spTree>', `${footer}${number}</p:spTree>`),
        }
      }
      return entry
    })
    const parsed = await parsePptx(await buildZip(entries), LABELS)
    try {
      const names = parsed.deck.slides[0].shapes.map(shape => shape.name)
      expect(names).toContain('Footer')
      expect(names).toContain('Number')
      // The slidenum field resolves to the slide's real position, not the
      // producer's cached placeholder text.
      const numberShape = parsed.deck.slides[0].shapes.find(shape => shape.name === 'Number')
      if (numberShape?.kind !== 'shape' || numberShape.text === undefined) throw new Error('expected the number shape')
      expect(numberShape.text.paragraphs[0]?.runs[0]?.text).toBe('1')
      const second = parsed.deck.slides[1].shapes.find(shape => shape.name === 'Number')
      if (second?.kind !== 'shape' || second.text === undefined) throw new Error('expected the second number shape')
      expect(second.text.paragraphs[0]?.runs[0]?.text).toBe('2')

    } finally {
      parsed.dispose()
    }
  })

  it('resolves the table style part roles before the accent heuristic', async () => {
    const tableStyles = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<a:tblStyles xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" def="{GUID}">
<a:tblStyle styleId="{GUID}">
<a:firstRow><a:tcPr><a:solidFill><a:srgbClr val="FFC000"/></a:solidFill></a:tcPr></a:firstRow>
<a:band2H><a:tcPr><a:solidFill><a:schemeClr val="accent1"><a:lumMod val="20000"/><a:lumOff val="80000"/></a:schemeClr></a:solidFill></a:tcPr></a:band2H>
<a:band2V><a:tcPr><a:solidFill><a:srgbClr val="00B050"/></a:solidFill></a:tcPr></a:band2V>
<a:wholeTbl><a:tcPr><a:solidFill><a:srgbClr val="EEEEEE"/></a:solidFill></a:tcPr></a:wholeTbl>
</a:tblStyle></a:tblStyles>`
    const rel = '<Relationship Id="rIdTbl" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/tableStyles" Target="tableStyles.xml"/>'
    const cell = (text: string): string => `<a:tc><a:txBody><a:bodyPr/><a:p><a:r><a:t>${text}</a:t></a:r></a:p></a:txBody><a:tcPr/></a:tc>`
    const table = (grid: readonly (readonly string[])[], flags: string): string => '<p:graphicFrame><p:nvGraphicFramePr><p:cNvPr id="30" name="Table"/><p:cNvGraphicFramePr/><p:nvPr/></p:nvGraphicFramePr>'
      + '<p:xfrm><a:off x="914400" y="914400"/><a:ext cx="5486400" cy="914400"/></p:xfrm>'
      + '<a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/table"><a:tbl>'
      + `<a:tblPr ${flags}/><a:tableStyleId>{GUID}</a:tableStyleId>`
      + '<a:tblGrid>'
      + grid.map(() => '<a:gridCol w="1828800"/>').join('')
      + '</a:tblGrid>'
      + grid.map(row => `<a:tr h="457200">${row.map(name => cell(name)).join('')}</a:tr>`).join('')
      + '</a:tbl></a:graphicData></a:graphic></p:graphicFrame>'
    const entries = fixtureEntries().map((entry) => {
      if (entry.name === 'ppt/slides/slide1.xml') {
        const body = table([['a', 'b'], ['c', 'd'], ['e', 'f']], 'firstRow="1" bandRow="1"')
          + table([['g', 'h', 'i'], ['j', 'k', 'l']], 'firstRow="1" firstCol="1" bandCol="1"')
        return { ...entry, text: entry.text.replace('</p:spTree>', `${body}</p:spTree>`) }
      }
      if (entry.name === 'ppt/_rels/presentation.xml.rels') {
        return { ...entry, text: entry.text.replace('</Relationships>', `${rel}</Relationships>`) }
      }
      return entry
    })
    entries.push({ name: 'ppt/tableStyles.xml', text: tableStyles })
    const parsed = await parsePptx(await buildZip(entries), LABELS)
    try {
      const [styleTable, colTable] = parsed.deck.slides[0].shapes.filter(shape => shape.kind === 'table')
      if (styleTable?.kind !== 'table' || colTable?.kind !== 'table') throw new Error('expected tables')
      // The firstRow role part fills the header exactly, even a light colour,
      // which keeps the header text dark instead of forcing white.
      expect(styleTable.rows[0]?.cells[0]?.fill).toEqual({ kind: 'solid', color: '#FFC000' })
      expect(styleTable.rows[0]?.cells[0]?.text?.paragraphs[0]?.runs[0]?.color).toBe('#000000')
      // Band1 states nothing, so its cells fall through to wholeTbl; band2H
      // tints the second data row through the slide's own theme.
      expect(styleTable.rows[1]?.cells[1]?.fill).toEqual({ kind: 'solid', color: '#EEEEEE' })
      expect(styleTable.rows[2]?.cells[1]?.fill).toEqual({ kind: 'solid', color: '#DAE3F3' })
      // Column banding on the second table: the first data column takes
      // band1V (nothing), the second band2V, and the last falls to wholeTbl.
      expect(colTable.rows[1]?.cells[1]?.fill).toEqual({ kind: 'solid', color: '#EEEEEE' })
      expect(colTable.rows[1]?.cells[2]?.fill).toEqual({ kind: 'solid', color: '#00B050' })
    } finally {
      parsed.dispose()
    }
  })

  it('reads the direction, distance, blur, and colour of a shape shadow', async () => {
    const shadowed = '<p:sp><p:nvSpPr><p:cNvPr id="85" name="Shadowed"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr>'
      + '<p:spPr><a:xfrm><a:off x="914400" y="914400"/><a:ext cx="914400" cy="914400"/></a:xfrm>'
      + '<a:effectLst><a:outerShdw blurRad="50800" dist="38100" dir="2700000" rotWithShape="0">'
      + '<a:srgbClr val="000000"><a:alpha val="40000"/></a:srgbClr></a:outerShdw></a:effectLst></p:spPr></p:sp>'
    const entries = fixtureEntries().map(entry => (
      entry.name === 'ppt/slides/slide1.xml'
        ? { ...entry, text: entry.text.replace('</p:spTree>', `${shadowed}</p:spTree>`) }
        : entry
    ))
    const parsed = await parsePptx(await buildZip(entries), LABELS)
    try {
      const shape = parsed.deck.slides[0].shapes.at(-1)
      if (shape?.kind !== 'shape') throw new Error('expected an autoshape')
      // dist 4px at 45 degrees and blur 5.33px, with the stated 40% alpha.
      expect(shape.shadow).toBe('2.83px 2.83px 5.33px rgba(0, 0, 0, 0.4)')
    } finally {
      parsed.dispose()
    }
  })

  it('counts lowercase roman and parenthesised alpha bullets', async () => {
    const numbered = '<p:sp><p:nvSpPr><p:cNvPr id="90" name="Numbered"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr>'
      + '<p:spPr><a:xfrm><a:off x="914400" y="914400"/><a:ext cx="2743200" cy="1828800"/></a:xfrm></p:spPr>'
      + '<p:txBody><a:bodyPr/><a:lstStyle/>'
      + '<a:p><a:pPr marL="0" indent="0"><a:buAutoNum type="romanLcPeriod"/></a:pPr><a:r><a:t>one</a:t></a:r></a:p>'
      + '<a:p><a:pPr marL="0" indent="0"><a:buAutoNum type="romanLcPeriod"/></a:pPr><a:r><a:t>two</a:t></a:r></a:p>'
      + '</p:txBody></p:sp>'
    const alpha = '<p:sp><p:nvSpPr><p:cNvPr id="92" name="Alpha"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr>'
      + '<p:spPr><a:xfrm><a:off x="3657600" y="914400"/><a:ext cx="2743200" cy="1828800"/></a:xfrm></p:spPr>'
      + '<p:txBody><a:bodyPr/><a:lstStyle/>'
      + '<a:p><a:pPr marL="0" indent="0"><a:buAutoNum type="alphaUcParenBoth"/></a:pPr><a:r><a:t>one</a:t></a:r></a:p>'
      + '</p:txBody></p:sp>'
    const entries = fixtureEntries().map(entry => (
      entry.name === 'ppt/slides/slide1.xml'
        ? { ...entry, text: entry.text.replace('</p:spTree>', `${numbered}${alpha}</p:spTree>`) }
        : entry
    ))
    const parsed = await parsePptx(await buildZip(entries), LABELS)
    try {
      const shapes = parsed.deck.slides[0].shapes
      const roman = shapes.filter(shape => shape.kind === 'shape' && shape.name === 'Numbered').at(-1)
      const alphaShape = shapes.filter(shape => shape.kind === 'shape' && shape.name === 'Alpha').at(-1)
      if (roman?.kind !== 'shape' || roman.text === undefined) throw new Error('expected the roman shape')
      if (alphaShape?.kind !== 'shape' || alphaShape.text === undefined) throw new Error('expected the alpha shape')
      const { createElement } = await import('react')
      const { TextFrame } = await import('../src/client/render/TextFrame.tsx')
      const { render } = await import('@testing-library/react')
      const romanView = render(createElement(TextFrame, { body: roman.text }))
      // Lowercase roman numerals stay lowercase, and both counters advance.
      expect(romanView.container.textContent).toContain('i.')
      expect(romanView.container.textContent).toContain('ii.')
      romanView.unmount()
      const alphaView = render(createElement(TextFrame, { body: alphaShape.text }))
      expect(alphaView.container.textContent).toContain('(A)')
      alphaView.unmount()
    } finally {
      parsed.dispose()
    }
  })

  it('resolves an internal slide jump on slide 1 to a later slide', async () => {
    const toc = '<p:sp><p:nvSpPr><p:cNvPr id="97" name="TOC"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr>'
      + '<p:spPr><a:xfrm><a:off x="914400" y="914400"/><a:ext cx="2743200" cy="914400"/></a:xfrm></p:spPr>'
      + '<p:txBody><a:bodyPr/><a:lstStyle/><a:p><a:r><a:rPr lang="en-US">'
      + '<a:hlinkClick r:id="rIdJump" action="ppaction://hlinksldjump"/></a:rPr>'
      + '<a:t>jump ahead</a:t></a:r></a:p></p:txBody></p:sp>'
    const entries = fixtureEntries(2).map((entry) => {
      if (entry.name === 'ppt/slides/slide1.xml') {
        return { ...entry, text: entry.text.replace('</p:spTree>', `${toc}</p:spTree>`) }
      }
      if (entry.name === 'ppt/slides/_rels/slide1.xml.rels') {
        return {
          ...entry,
          text: entry.text.replace('</Relationships>',
            '<Relationship Id="rIdJump" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slide2.xml"/></Relationships>'),
        }
      }
      return entry
    })
    const parsed = await parsePptx(await buildZip(entries), LABELS)
    try {
      const tocShape = parsed.deck.slides[0].shapes.at(-1)
      if (tocShape?.kind !== 'shape' || tocShape.text === undefined) throw new Error('expected a text shape')
      // The jump is internal, so it never passes the external scheme whitelist;
      // it resolves through the slide part index instead.
      expect(tocShape.text.paragraphs[0]?.runs[0]?.link).toBe('#slide/2')
    } finally {
      parsed.dispose()
    }
  })
})
