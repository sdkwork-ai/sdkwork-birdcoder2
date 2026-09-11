/**
 * A minimal but complete OOXML presentation package for parser specs.
 *
 * The fixture mirrors the real inheritance chain (presentation → master →
 * layout → slide → theme) so the specs exercise the graph rather than a
 * flattened stand-in, and each part is small enough to read in the test.
 */
import { buildZip, xml } from './zip-fixture.client.ts'
import type { ZipEntryInput } from './zip-fixture.client.ts'

/** The slide body: a title that inherits its geometry from the layout, a body
 * placeholder with two bulleted paragraphs, and a rounded rectangle whose fill
 * comes from the theme's style matrix. */
function slideBody(name: string, title: string): string {
  return xml('p:sld', [
    `<p:cSld name="${name}"><p:spTree>`,
    '<p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>',
    '<p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>',
    '<p:sp><p:nvSpPr><p:cNvPr id="4" name="Title 1"/><p:cNvSpPr/><p:nvPr><p:ph type="title"/></p:nvPr></p:nvSpPr>',
    '<p:spPr/><p:txBody><a:bodyPr/><a:lstStyle/>',
    `<a:p><a:r><a:rPr lang="zh-CN" sz="4400" b="1"/><a:t>${title}</a:t></a:r></a:p>`,
    '</p:txBody></p:sp>',
    '<p:sp><p:nvSpPr><p:cNvPr id="5" name="Content 2"/><p:cNvSpPr/><p:nvPr><p:ph idx="1"/></p:nvPr></p:nvSpPr>',
    '<p:spPr/><p:txBody><a:bodyPr/><a:lstStyle/>',
    '<a:p><a:r><a:rPr lang="zh-CN"/><a:t>芳草鲜美，落英缤纷</a:t></a:r></a:p>',
    '<a:p><a:r><a:rPr lang="zh-CN" i="1"/><a:t>阡陌交通，鸡犬相闻</a:t></a:r></a:p>',
    '</p:txBody></p:sp>',
    '<p:sp><p:nvSpPr><p:cNvPr id="6" name="Rectangle 3"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr>',
    '<p:spPr><a:xfrm><a:off x="914400" y="4572000"/><a:ext cx="2743200" cy="914400"/></a:xfrm>',
    '<a:prstGeom prst="roundRect"><a:avLst><a:gd name="adj" fmla="val 25000"/></a:avLst></a:prstGeom></p:spPr>',
    '<p:style><a:lnRef idx="1"><a:schemeClr val="accent1"/></a:lnRef>',
    '<a:fillRef idx="1"><a:schemeClr val="accent2"/></a:fillRef>',
    '<a:effectRef idx="0"><a:schemeClr val="accent1"/></a:effectRef>',
    '<a:fontRef idx="minor"><a:schemeClr val="lt1"/></a:fontRef></p:style>',
    '<p:txBody><a:bodyPr/><a:lstStyle/><a:p><a:r><a:t>世外桃源</a:t></a:r></a:p></p:txBody></p:sp>',
    '</p:spTree></p:cSld>',
    '<p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr>',
  ].join(''))
}

/** The presentation part for a given slide count. */
function presentation(slides: number, secondMaster: boolean): string {
  const ids = Array.from({ length: slides }, (_, index) => (
    `<p:sldId id="${256 + index}" r:id="rId${index + 1}"/>`
  )).join('')
  const secondMasterId = secondMaster
    ? '<p:sldMasterId id="2147483649" r:id="rIdMaster2"/>'
    : ''
  return xml('p:presentation', [
    `<p:sldMasterIdLst><p:sldMasterId id="2147483648" r:id="rIdMaster"/>${secondMasterId}</p:sldMasterIdLst>`,
    `<p:sldIdLst>${ids}</p:sldIdLst>`,
    '<p:sldSz cx="12192000" cy="6858000"/>',
    '<p:notesSz cx="6858000" cy="9144000"/>',
    '<p:defaultTextStyle><a:lvl1pPr><a:defRPr sz="1800"><a:solidFill><a:schemeClr val="tx1"/></a:solidFill>',
    '<a:latin typeface="+mn-lt"/></a:defRPr></a:lvl1pPr></p:defaultTextStyle>',
  ].join(''))
}

/** Presentation relationships: every slide plus the masters. */
function presentationRelationships(slides: number, secondMaster: boolean): string {
  const rows = Array.from({ length: slides }, (_, index) => (
    `<Relationship Id="rId${index + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide${index + 1}.xml"/>`
  )).join('')
  const secondMasterRow = secondMaster
    ? '<Relationship Id="rIdMaster2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster" Target="slideMasters/slideMaster2.xml"/>'
    : ''
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
${rows}
<Relationship Id="rIdMaster" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster" Target="slideMasters/slideMaster1.xml"/>
${secondMasterRow}
</Relationships>`
}

/** Package relationships naming the presentation part. */
const PACKAGE_RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="ppt/presentation.xml"/>
</Relationships>`

/** Theme with the Office colour scheme and one major/minor typeface pair. */
const THEME = xml('a:theme', [
  '<a:themeElements>',
  '<a:clrScheme name="Office">',
  '<a:dk1><a:sysClr val="windowText" lastClr="000000"/></a:dk1>',
  '<a:lt1><a:sysClr val="window" lastClr="FFFFFF"/></a:lt1>',
  '<a:dk2><a:srgbClr val="44546A"/></a:dk2>',
  '<a:lt2><a:srgbClr val="E7E6E6"/></a:lt2>',
  '<a:accent1><a:srgbClr val="4472C4"/></a:accent1>',
  '<a:accent2><a:srgbClr val="ED7D31"/></a:accent2>',
  '<a:accent3><a:srgbClr val="A5A5A5"/></a:accent3>',
  '<a:accent4><a:srgbClr val="FFC000"/></a:accent4>',
  '<a:accent5><a:srgbClr val="5B9BD5"/></a:accent5>',
  '<a:accent6><a:srgbClr val="70AD47"/></a:accent6>',
  '<a:hlink><a:srgbClr val="0563C1"/></a:hlink>',
  '<a:folHlink><a:srgbClr val="954F72"/></a:folHlink>',
  '</a:clrScheme>',
  '<a:fontScheme name="Office">',
  '<a:majorFont><a:latin typeface="Calibri Light"/><a:ea typeface=""/></a:majorFont>',
  '<a:minorFont><a:latin typeface="Calibri"/><a:ea typeface="宋体"/></a:minorFont>',
  '</a:fontScheme>',
  '<a:fmtScheme name="Office"/>',
  '</a:themeElements>',
].join(''))

/** Master carrying the colour map and the title/body/other text styles. */
const MASTER = xml('p:sldMaster', [
  '<p:cSld><p:bg><p:bgPr><a:solidFill><a:schemeClr val="bg1"/></a:solidFill></p:bgPr></p:bg>',
  '<p:spTree>',
  '<p:sp><p:nvSpPr><p:cNvPr id="1" name="Title Placeholder"/>',
  '<p:cNvSpPr><a:spLocks noGrp="1"/></p:cNvSpPr>',
  '<p:nvPr><p:ph type="title"/></p:nvPr></p:nvSpPr>',
  '<p:spPr><a:xfrm><a:off x="838200" y="365125"/><a:ext cx="10515600" cy="1325563"/></a:xfrm></p:spPr>',
  '<p:txBody><a:bodyPr anchor="b"/><a:lstStyle/><a:p><a:r><a:t>Click to edit</a:t></a:r></a:p></p:txBody></p:sp>',
  '</p:spTree></p:cSld>',
  '<p:clrMap bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2" accent1="accent1" accent2="accent2" '
  + 'accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" hlink="hlink" folHlink="folHlink"/>',
  '<p:txStyles>',
  '<p:titleStyle><a:lvl1pPr algn="l"><a:defRPr sz="4000" b="1"><a:solidFill><a:schemeClr val="tx1"/>'
  + '</a:solidFill><a:latin typeface="+mj-lt"/></a:defRPr></a:lvl1pPr></p:titleStyle>',
  '<p:bodyStyle><a:lvl1pPr marL="342900" indent="-342900"><a:buChar char="•"/>'
  + '<a:defRPr sz="1800"><a:solidFill><a:schemeClr val="tx1"/></a:solidFill></a:defRPr></a:lvl1pPr></p:bodyStyle>',
  '<p:otherStyle><a:lvl1pPr><a:defRPr sz="1800"><a:solidFill><a:schemeClr val="tx1"/></a:solidFill>'
  + '</a:defRPr></a:lvl1pPr></p:otherStyle>',
  '</p:txStyles>',
].join(''))

/** Master relationships pointing at the layout and the theme. */
const MASTER_RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout1.xml"/>
<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/theme" Target="../theme/theme1.xml"/>
</Relationships>`

/** Layout declaring the placeholders a slide inherits geometry from. */
const LAYOUT = xml('p:sldLayout', [
  '<p:cSld name="Title and Content"><p:spTree>',
  '<p:sp><p:nvSpPr><p:cNvPr id="2" name="Title 1"/><p:cNvSpPr/><p:nvPr><p:ph type="title"/></p:nvPr></p:nvSpPr>',
  '<p:spPr><a:xfrm><a:off x="838200" y="365125"/><a:ext cx="10515600" cy="1325563"/></a:xfrm></p:spPr>',
  '<p:txBody><a:bodyPr anchor="b"/><a:lstStyle/><a:p/></p:txBody></p:sp>',
  '<p:sp><p:nvSpPr><p:cNvPr id="3" name="Content 2"/><p:cNvSpPr/><p:nvPr><p:ph idx="1"/></p:nvPr></p:nvSpPr>',
  '<p:spPr><a:xfrm><a:off x="838200" y="1825625"/><a:ext cx="10515600" cy="4351338"/></a:xfrm></p:spPr>',
  '<p:txBody><a:bodyPr/><a:lstStyle/><a:p/></p:txBody></p:sp>',
  '</p:spTree></p:cSld>',
  '<p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr>',
].join(''))

/** Layout relationships. */
const LAYOUT_RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster" Target="../slideMasters/slideMaster1.xml"/>
</Relationships>`

/** A second theme whose accent1 is green, to prove themes follow their master. */
const THEME2 = xml('a:theme', [
  '<a:themeElements>',
  '<a:clrScheme name="Second">',
  '<a:dk1><a:sysClr val="windowText" lastClr="000000"/></a:dk1>',
  '<a:lt1><a:sysClr val="window" lastClr="FFFFFF"/></a:lt1>',
  '<a:dk2><a:srgbClr val="44546A"/></a:dk2>',
  '<a:lt2><a:srgbClr val="E7E6E6"/></a:lt2>',
  '<a:accent1><a:srgbClr val="70AD47"/></a:accent1>',
  '<a:accent2><a:srgbClr val="ED7D31"/></a:accent2>',
  '<a:accent3><a:srgbClr val="A5A5A5"/></a:accent3>',
  '<a:accent4><a:srgbClr val="FFC000"/></a:accent4>',
  '<a:accent5><a:srgbClr val="5B9BD5"/></a:accent5>',
  '<a:accent6><a:srgbClr val="4472C4"/></a:accent6>',
  '<a:hlink><a:srgbClr val="0563C1"/></a:hlink>',
  '<a:folHlink><a:srgbClr val="954F72"/></a:folHlink>',
  '</a:clrScheme>',
  '<a:fontScheme name="Second">',
  '<a:majorFont><a:latin typeface="Georgia"/><a:ea typeface=""/></a:majorFont>',
  '<a:minorFont><a:latin typeface="Georgia"/><a:ea typeface=""/></a:minorFont>',
  '</a:fontScheme>',
  '<a:fmtScheme name="Second"/>',
  '</a:themeElements>',
].join(''))

/** The non-placeholder decoration bar every slide of the second master paints. */
const MASTER2_DECORATION =
  '<p:sp><p:nvSpPr><p:cNvPr id="90" name="Master Bar"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr>'
  + '<p:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="12192000" cy="365760"/></a:xfrm>'
  + '<a:prstGeom prst="rect"/><a:solidFill><a:schemeClr val="accent1"/></a:solidFill></p:spPr>'
  + '<p:txBody><a:bodyPr/><a:lstStyle/></p:txBody></p:sp>'

/** Second master: one decoration bar plus the title placeholder. */
const MASTER2 = xml('p:sldMaster', [
  '<p:cSld><p:spTree>',
  '<p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>',
  '<p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>',
  MASTER2_DECORATION,
  '<p:sp><p:nvSpPr><p:cNvPr id="91" name="Title Placeholder"/><p:cNvSpPr/><p:nvPr><p:ph type="title"/></p:nvPr></p:nvSpPr>',
  '<p:spPr><a:xfrm><a:off x="838200" y="365125"/><a:ext cx="10515600" cy="1325563"/></a:xfrm></p:spPr>',
  '<p:txBody><a:bodyPr/><a:lstStyle/><a:p/></p:txBody></p:sp>',
  '</p:spTree></p:cSld>',
  '<p:clrMap bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2" accent1="accent1" accent2="accent2" '
  + 'accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" hlink="hlink" folHlink="folHlink"/>',
  '<p:txStyles>',
  '<p:titleStyle><a:lvl1pPr><a:defRPr sz="4000" b="1"/></a:lvl1pPr></p:titleStyle>',
  '<p:bodyStyle><a:lvl1pPr><a:defRPr sz="1800"/></a:lvl1pPr></p:bodyStyle>',
  '<p:otherStyle><a:lvl1pPr><a:defRPr sz="1800"/></a:lvl1pPr></p:otherStyle>',
  '</p:txStyles>',
].join(''))

/** Second master relationships. */
const MASTER2_RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/theme" Target="../theme/theme2.xml"/>
</Relationships>`

/** Second layout: its own decoration bar plus the title placeholder. */
const LAYOUT2 = xml('p:sldLayout', [
  '<p:cSld name="Second Layout"><p:spTree>',
  '<p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>',
  '<p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>',
  '<p:sp><p:nvSpPr><p:cNvPr id="80" name="Layout Bar"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr>',
  '<p:spPr><a:xfrm><a:off x="0" y="365760"/><a:ext cx="12192000" cy="182880"/></a:xfrm>',
  '<a:prstGeom prst="rect"/><a:solidFill><a:schemeClr val="accent1"/></a:solidFill></p:spPr>',
  '<p:txBody><a:bodyPr/><a:lstStyle/></p:txBody></p:sp>',
  '<p:sp><p:nvSpPr><p:cNvPr id="81" name="Title 1"/><p:cNvSpPr/><p:nvPr><p:ph type="title"/></p:nvPr></p:nvSpPr>',
  '<p:spPr><a:xfrm><a:off x="838200" y="365125"/><a:ext cx="10515600" cy="1325563"/></a:xfrm></p:spPr>',
  '<p:txBody><a:bodyPr/><a:lstStyle/><a:p/></p:txBody></p:sp>',
  '</p:spTree></p:cSld>',
  '<p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr>',
].join(''))

/** Second layout relationships, naming the second master. */
const LAYOUT2_RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster" Target="../slideMasters/slideMaster2.xml"/>
</Relationships>`

/** Options that vary the fixture package beyond the slide count. */
export interface FixtureOptions {
  /** Declare a second master with its own theme and hang slide 2 off it. */
  readonly secondMaster?: boolean
}

/**
 * Every part of the fixture package.
 * @param slides - how many slides the presentation lists.
 * @param options - variation switches.
 * @returns the ZIP entry list.
 */
export function fixtureEntries(slides = 1, options: FixtureOptions = {}): readonly ZipEntryInput[] {
  const secondMaster = options.secondMaster === true
  const entries: ZipEntryInput[] = [
    { name: 'ppt/presentation.xml', text: presentation(slides, secondMaster) },
    { name: 'ppt/_rels/presentation.xml.rels', text: presentationRelationships(slides, secondMaster) },
    { name: 'ppt/slideLayouts/slideLayout1.xml', text: LAYOUT },
    { name: 'ppt/slideLayouts/_rels/slideLayout1.xml.rels', text: LAYOUT_RELS },
    { name: 'ppt/slideMasters/slideMaster1.xml', text: MASTER },
    { name: 'ppt/slideMasters/_rels/slideMaster1.xml.rels', text: MASTER_RELS },
    { name: 'ppt/theme/theme1.xml', text: THEME },
    { name: '_rels/.rels', text: PACKAGE_RELS, stored: true },
  ]
  if (secondMaster) {
    entries.push(
      { name: 'ppt/slideLayouts/slideLayout2.xml', text: LAYOUT2 },
      { name: 'ppt/slideLayouts/_rels/slideLayout2.xml.rels', text: LAYOUT2_RELS },
      { name: 'ppt/slideMasters/slideMaster2.xml', text: MASTER2 },
      { name: 'ppt/slideMasters/_rels/slideMaster2.xml.rels', text: MASTER2_RELS },
      { name: 'ppt/theme/theme2.xml', text: THEME2 },
    )
  }
  for (let index = 1; index <= slides; index += 1) {
    const layoutTarget = secondMaster && index === 2 ? '../slideLayouts/slideLayout2.xml' : '../slideLayouts/slideLayout1.xml'
    entries.push({ name: `ppt/slides/slide${index}.xml`, text: slideBody(`Fixture Slide ${index}`, `桃花源记 ${index}`) })
    entries.push({
      name: `ppt/slides/_rels/slide${index}.xml.rels`,
      text: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="${layoutTarget}"/>
</Relationships>`,
    })
  }
  return entries
}

/**
 * Build the fixture package.
 * @param slides - how many slides the presentation lists.
 * @returns the container bytes.
 */
export async function fixturePackage(slides = 1): Promise<Uint8Array> {
  return await buildZip(fixtureEntries(slides))
}

/**
 * Build the fixture package with every part stored uncompressed.
 *
 * Environments that provide `DOMParser` without `DecompressionStream` still
 * need a parseable package; storing the parts exercises the same graph without
 * the inflate step.
 * @param slides - how many slides the presentation lists.
 * @param options - variation switches.
 * @returns the container bytes.
 */
export async function storedFixturePackage(slides = 1, options: FixtureOptions = {}): Promise<Uint8Array> {
  return await buildZip(fixtureEntries(slides, options).map(entry => ({ ...entry, stored: true })))
}
