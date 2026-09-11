// @vitest-environment jsdom
/** Editor round trip: edits render in-session and survive packaging. */
import { describe, expect, it } from 'vitest'
import { parsePptx } from '../src/client/pptx/deck.ts'
import { applyTextEdits, buildEditedPackage, textEditKey } from '../src/client/editor.ts'
import { ZipPackage } from '@deepseek-ai/dsh-client-sdkwork-office'
import { fixtureEntries, storedFixturePackage } from './pptx-fixture.client.ts'
import { buildZip } from './zip-fixture.client.ts'

const LABELS = {
  slideName: (index: number) => `Slide ${index}`,
  unsupportedFrame: () => 'unsupported',
  missingImage: () => 'missing image',
}

describe('applyTextEdits', () => {
  it('retexts a shape in the model and keeps its formatting', async () => {
    const parsed = await parsePptx(await storedFixturePackage(), LABELS)
    try {
      const slide = parsed.deck.slides[0]
      const key = textEditKey('ppt/slides/slide1.xml', '4')
      const edited = applyTextEdits(slide, new Map([[key, ['改好的标题']]]))
      const title = edited.shapes.find(shape => shape.id === '4')
      if (title?.kind !== 'shape' || title.text === undefined) throw new Error('expected the title shape')
      expect(title.text.paragraphs[0]?.runs[0]).toMatchObject({ text: '改好的标题', bold: true })
      // A slide without matching edits returns untouched.
      expect(applyTextEdits(slide, new Map())).toBe(slide)
    } finally {
      parsed.dispose()
    }
  })
})

describe('buildEditedPackage', () => {
  it('writes text and notes edits back into the package', async () => {
    // The fixture package carries no notes master; Office decks always do,
    // and the notes creator keys off its presence.
    const original = await buildZip([
      ...fixtureEntries(2).map(entry => ({ ...entry, stored: true })),
      { name: 'ppt/notesMasters/notesMaster1.xml', text: '<p:notesMaster/>' },
    ])
    const texts = new Map([[textEditKey('ppt/slides/slide1.xml', '4'), ['改好的标题']]])
    const notes = new Map([['ppt/slides/slide1.xml', '第一页备注']])
    const edited = await buildEditedPackage(original, { texts, notes })
    const reparsed = await parsePptx(edited, LABELS)
    try {
      expect(reparsed.deck.slides[0].shapes[0]).toMatchObject({ name: 'Title 1' })
      const title = reparsed.deck.slides[0].shapes[0]
      if (title?.kind !== 'shape' || title.text === undefined) throw new Error('expected the title shape')
      expect(title.text.paragraphs[0]?.runs[0]?.text).toBe('改好的标题')
      // Slide 2, untouched, survives the rewrite.
      expect(reparsed.deck.slides[1].shapes[0]).toMatchObject({ name: 'Title 1' })
    } finally {
      reparsed.dispose()
    }
    // The notes part was created from scratch for a deck that had none.
    const notesText = await ZipPackage.open(edited).readText('ppt/notesSlides/notesSlide1.xml')
    expect(notesText).toContain('第一页备注')
    const rels = await ZipPackage.open(edited).readText('ppt/slides/_rels/slide1.xml.rels')
    expect(rels).toContain('notesSlide1.xml')
  })
})
