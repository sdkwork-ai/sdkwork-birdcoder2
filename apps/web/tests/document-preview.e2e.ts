/** Keyless document-preview smoke through a real Session, Files tab, and shipped renderers. */
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Browser, Locator, Page } from 'playwright'
import { chromium } from 'playwright'
import { afterAll, beforeAll, describe, expect, it, onTestFailed, vi } from 'vitest'
import { pdfFixture } from '../../../packages/client/ui-sidebar-documentpreview/tests/pdf-fixture.ts'
import { assertFixtureInventory, compareOrRefreshGolden, launchWebScaffold, watchConsole, webSnapshotMode, type WebScaffold } from './scaffold.ts'
import { connectFreshWorkspace, newEnglishPage, saveFailureShot } from './support.ts'

const FIXTURE = fileURLToPath(new URL('../../../snapshots/web/lifecycle-chrome/session.v3.jsonl', import.meta.url))
const SNAPSHOT_DIR = fileURLToPath(new URL('../../../snapshots/web/document-preview', import.meta.url))
const EXPECTED = join(SNAPSHOT_DIR, 'document.expected.md')
const PAGING_PATCH = join(SNAPSHOT_DIR, 'paging.patch.yml')
const PAGE_LINES = 64
const SHOT_DIR = fileURLToPath(new URL('../../../.artifacts/screenshots/0908-document-preview', import.meta.url))
const PROMPT = 'Reply with the single word LIGHTHOUSE and stop.'
const MODE = webSnapshotMode()
const TINY_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64',
)

/** Successful render evidence stays outside the committed snapshot inventory. */
async function successShot(page: Page, name: string): Promise<void> {
  await mkdir(SHOT_DIR, { recursive: true })
  await page.screenshot({ path: join(SHOT_DIR, `${name}-${MODE}-${process.pid}.png`), fullPage: true })
}

/** Trigger the document owner's native scroll handler after a real first page overflows. */
async function scrollForNextPage(body: Locator): Promise<void> {
  await body.evaluate((node) => {
    if (node.scrollHeight <= node.clientHeight) throw new Error('paging fixture does not overflow the document body')
    node.scrollTop = node.scrollHeight
  })
}

/** Read the solid vector fill away from antialiased page edges. */
async function canvasColor(canvas: Locator): Promise<string> {
  return await canvas.evaluate((node) => {
    const surface = node as HTMLCanvasElement
    const context = surface.getContext('2d')
    if (context === null) throw new Error('PDF canvas has no 2D context')
    const pixel = context.getImageData(Math.floor(surface.width / 2), Math.floor(surface.height / 2), 1, 1).data
    if (Number(pixel[3]) !== 255) return 'transparent'
    if (Number(pixel[0]) - Number(pixel[2]) > 150) return 'red'
    if (Number(pixel[2]) - Number(pixel[0]) > 150) return 'blue'
    return 'other'
  })
}

describe.skipIf(MODE === 'record')('web e2e: document preview through Files', () => {
  let scaffold: WebScaffold
  let browser: Browser
  let page: Page
  let tripwire: ReturnType<typeof watchConsole>
  let outsideRoot: string | undefined

  beforeAll(async () => {
    outsideRoot = await mkdtemp(join(tmpdir(), 'dsh-preview-outside-'))
    scaffold = await launchWebScaffold({ replayFixture: FIXTURE, paceMs: 5, compareReplaySession: false, extraOverlayPath: PAGING_PATCH })
    browser = await chromium.launch()
    page = await newEnglishPage(browser)
    tripwire = watchConsole(page)
    await page.goto(scaffold.authenticatedUrl, { waitUntil: 'load' })
    await connectFreshWorkspace(page, scaffold.workspaceCwd)
  })

  afterAll(async () => {
    try {
      await browser?.close()
    } finally {
      try {
        await scaffold?.close()
      } finally {
        if (outsideRoot !== undefined) await rm(outsideRoot, { recursive: true, force: true })
      }
    }
  })

  it('opens text, isolated HTML, intrinsic images, and rendered PDF from the Session workspace', async () => {
    onTestFailed(async () => {
      await mkdir(SHOT_DIR, { recursive: true })
      await saveFailureShot(page, `screenshots/0908-document-preview/smoke-${process.pid}`)
    })
    const settled = scaffold.whenTurnSettled()
    const input = page.locator('[data-composer-input]').first()
    await input.fill(PROMPT)
    await input.press('Enter')
    const sessionId = await settled
    await page.getByText('LIGHTHOUSE', { exact: true }).waitFor({ timeout: 15_000 })
    const cwd = scaffold.ctx.agents.get(sessionId)?.session.header.cwd
    if (cwd === undefined) throw new Error('settled Session has no workspace cwd')
    if (outsideRoot === undefined) throw new Error('outside fixture directory is unavailable')
    const outsideScript = join(outsideRoot, 'outside.js')
    const outsideReference = relative(cwd, outsideScript).replace(/\\/g, '/')
    const markdownText = [
      '# Markdown smoke', '', 'Rendered from the workspace.', '',
      ...Array.from({ length: (PAGE_LINES - 4) / 2 }, (_, index) => [`Paragraph ${index + 1}: ${'visible prefix '.repeat(20)}`, '']).flat(),
      '# Markdown tail',
    ].join('\n')
    const codeLines = [
      ...Array.from({ length: PAGE_LINES }, (_, index) => index === 0 ? 'const prefix = "CODE_PREFIX";' : `// prefix line ${index + 1}`),
      'const tail = "CODE_TAIL";',
    ]
    await Promise.all([
      writeFile(join(cwd, 'smoke.md'), markdownText),
      // `.js` is the paging fixture's suffix on purpose: the code preview claims
      // it and no other preview does, so this section tests paging rather than
      // which renderer wins a contested suffix like `.ts`.
      writeFile(join(cwd, 'pages.js'), codeLines.join('\n')),
      writeFile(join(cwd, 'notes.unknown'), 'UNKNOWN_SUFFIX\nPlain fallback.'),
      writeFile(join(cwd, 'smoke.html'), [
        '<!doctype html><link rel="stylesheet" href="./local.css">',
        '<h1>HTML smoke</h1><p id="result">pending</p><p id="local-result">pending</p><p id="parent-result">pending</p>',
        '<p id="outside-result">pending</p>',
        '<script>document.getElementById("result").textContent="INLINE_OK";',
        'try{parent.document.documentElement.setAttribute("data-document-preview-escape","true");document.getElementById("parent-result").textContent="parent-accessible"}',
        'catch(error){const result=document.getElementById("parent-result");result.textContent="parent-blocked";result.dataset.error=error.name}</script>',
        '<script src="./local.js"></script>',
        `<script src="${outsideReference}"></script>`,
      ].join('\n')),
      writeFile(join(cwd, 'local.js'), 'document.getElementById("local-result").textContent="LOCAL_JS_OK";'),
      writeFile(join(cwd, 'local.css'), '#local-result { color: rgb(12, 34, 56); }'),
      writeFile(outsideScript, 'document.getElementById("outside-result").textContent="OUTSIDE_JS_OK";'),
      writeFile(join(cwd, 'tiny.png'), TINY_PNG),
      writeFile(join(cwd, 'large.svg'), [
        '<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="1600" viewBox="0 0 1200 1600">',
        '<script>parent.document.documentElement.setAttribute("data-image-preview-escape","true")</script>',
        '<rect width="1200" height="1600" fill="#2463eb"/>',
        '</svg>',
      ].join('')),
      writeFile(join(cwd, 'smoke.pdf'), pdfFixture()),
    ])

    const column = page.locator('[data-rightbar-col]')
    await page.locator('[data-sidebar-right-expand]').click()
    await column.locator('[data-files-state="tree"]').waitFor({ state: 'visible' })
    await column.locator('[data-files-reload]').click()
    const filesTab = column.locator('[data-dockkit-tab]').filter({ has: page.getByText('Files', { exact: true }) })
    const addTab = column.locator('[data-dockkit-add-tab]')
    expect(await column.locator('[data-dockkit-tab]').count()).toBe(1)
    const defaultTitle = await filesTab.locator('[data-dockkit-tab-title]').innerText()
    const initialFilesClose = await filesTab.locator('[data-dockkit-tab-close]').count()
    expect(initialFilesClose).toBe(1)
    await filesTab.click({ button: 'right' })
    expect(await page.locator('[data-dockkit-tab-menu]:visible').count()).toBe(1)
    await page.keyboard.press('Escape')
    await addTab.waitFor({ state: 'visible' })
    const initialAdd = await addTab.count()
    expect(initialAdd).toBe(1)
    await addTab.click()
    await column.locator('[data-sidebar-right-guide]').waitFor({ state: 'visible' })
    await expect.poll(() => column.locator('[data-dockkit-tab]').count()).toBe(2)
    const guideTab = column.locator('[data-dockkit-tab]').filter({ hasNot: page.getByText('Files', { exact: true }) })
    const guideClose = await guideTab.locator('[data-dockkit-tab-close]').count()
    const filesCloseWithGuide = await filesTab.locator('[data-dockkit-tab-close]').count()
    expect(guideClose).toBe(1)
    expect(filesCloseWithGuide).toBe(1)
    await expect.poll(() => addTab.count()).toBe(0)
    const addWithGuide = await addTab.count()
    await guideTab.hover()
    await guideTab.locator('[data-dockkit-tab-close]').click()
    await column.locator('[data-files-state="tree"]').waitFor({ state: 'visible' })
    await expect.poll(() => column.locator('[data-sidebar-right-guide]').count()).toBe(0)
    await expect.poll(() => column.locator('[data-dockkit-tab]').count()).toBe(1)
    await addTab.waitFor({ state: 'visible' })
    const restoredFilesClose = await filesTab.locator('[data-dockkit-tab-close]').count()
    const restoredAdd = await addTab.count()
    expect(restoredFilesClose).toBe(1)
    expect(restoredAdd).toBe(1)
    const preview = column.locator('[data-document-preview]')
    const openFile = async (name: string): Promise<void> => {
      await filesTab.click()
      await column.locator('[data-files-entry="file"]').getByRole('button', { name, exact: true }).click()
      await expect.poll(async () => (await preview.getAttribute('data-textpreview-url'))?.endsWith(`/${name}`)).toBe(true)
    }
    const viewer = preview.locator('[data-document-viewer-menu]')
    const body = preview.locator('[data-textpreview-body]')
    const sections = ['# Document preview']
    sections.push([
      '## Sidebar tabs', '',
      `- Default tab: ${defaultTitle}`,
      `- Files close buttons (alone -> with guide -> restored): ${[initialFilesClose, filesCloseWithGuide, restoredFilesClose].join(' -> ')}`,
      `- Manual guide close buttons: ${guideClose}`,
      `- Add buttons (Files -> guide -> Files): ${[initialAdd, addWithGuide, restoredAdd].join(' -> ')}`,
    ].join('\n'))

    await openFile('smoke.md')
    await expect.poll(() => viewer.innerText()).toBe('Markdown')
    await preview.getByRole('heading', { name: 'Markdown smoke', exact: true }).waitFor({ timeout: 15_000 })
    expect(await preview.getByText('Rendered from the workspace.', { exact: true }).isVisible()).toBe(true)
    const heading = await preview.getByRole('heading', { name: 'Markdown smoke', exact: true }).innerText()
    const markdownTail = preview.getByRole('heading', { name: 'Markdown tail', exact: true })
    await expect.poll(() => preview.locator('[data-textpreview-more]').isEnabled()).toBe(true)
    expect(await markdownTail.count()).toBe(0)
    await scrollForNextPage(body)
    await markdownTail.waitFor({ timeout: 15_000 })
    await expect.poll(() => preview.locator('[data-textpreview-more]').count()).toBe(0)
    expect(await preview.getByRole('heading', { name: heading, exact: true }).count()).toBe(1)
    expect(await preview.getByText('Rendered from the workspace.', { exact: true }).count()).toBe(1)
    const tailHeading = await markdownTail.innerText()
    await preview.getByRole('heading', { name: heading, exact: true }).scrollIntoViewIfNeeded()
    await successShot(page, 'markdown')
    const markdownTab = column.locator('[data-dockkit-tab]').filter({ has: page.getByText('smoke.md', { exact: true }) })
    const markdownTabId = await markdownTab.getAttribute('data-dockkit-tab')
    expect(markdownTabId).not.toBeNull()
    const tabCount = await column.locator('[data-dockkit-tab]').count()
    const markdownViewers = [await viewer.innerText()]
    const sourceFonts: Array<{ fontSize: string; lineHeight: string }> = []
    for (const label of ['Code', 'Plain text']) {
      await viewer.click()
      await page.getByRole('menuitem', { name: label, exact: true }).click()
      await expect.poll(() => viewer.innerText()).toBe(label)
      if (label === 'Code') {
        await preview.locator('.shiki').waitFor({ timeout: 15_000 })
        expect(await preview.locator('.shiki').textContent()).toBe(markdownText)
      } else {
        await expect.poll(async () => (await preview.locator('[data-textpreview-line]').first().textContent())?.trim()).toBe('# Markdown smoke')
      }
      const source = label === 'Code' ? preview.locator('.shiki') : preview.locator('[data-textpreview-line]').first()
      sourceFonts.push(await source.evaluate((node) => {
        const style = getComputedStyle(node)
        return { fontSize: style.fontSize, lineHeight: style.lineHeight }
      }))
      expect(await markdownTab.getAttribute('data-dockkit-tab')).toBe(markdownTabId)
      expect(await column.locator('[data-dockkit-tab]').count()).toBe(tabCount)
      markdownViewers.push(await viewer.innerText())
    }
    expect(sourceFonts[1]).toEqual(sourceFonts[0])
    sections.push([
      '## Markdown', '',
      `- Heading: ${heading}`,
      `- Tail loaded by scrolling: ${tailHeading}`,
      `- Viewers: ${markdownViewers.join(' -> ')}`,
      `- Same tab: ${String(await markdownTab.getAttribute('data-dockkit-tab') === markdownTabId)}`,
    ].join('\n'))

    await openFile('smoke.html')
    await expect.poll(() => viewer.innerText()).toBe('HTML')
    const iframe = preview.locator('[data-html-preview]')
    await iframe.waitFor({ timeout: 15_000 })
    expect(await iframe.getAttribute('sandbox')).toBe('allow-scripts')
    expect(await iframe.evaluate((node) => {
      const host = node.closest('[data-textpreview-body]')
      if (!(host instanceof HTMLElement)) throw new Error('HTML preview body is unavailable')
      const outer = host.getBoundingClientRect()
      const frame = node.getBoundingClientRect()
      return {
        top: Math.round(frame.top - outer.top),
        right: Math.round(outer.right - frame.right),
        bottom: Math.round(outer.bottom - frame.bottom),
        left: Math.round(frame.left - outer.left),
      }
    })).toEqual({ top: 0, right: 0, bottom: 0, left: 0 })
    const html = page.frameLocator('[data-html-preview]')
    await html.getByRole('heading', { name: 'HTML smoke', exact: true }).waitFor({ timeout: 15_000 })
    await expect.poll(() => html.locator('#result').innerText()).toBe('INLINE_OK')
    await expect.poll(() => html.locator('#local-result').innerText()).toBe('LOCAL_JS_OK')
    await expect.poll(() => html.locator('#outside-result').innerText()).toBe('OUTSIDE_JS_OK')
    await expect.poll(() => html.locator('#local-result').evaluate(node => getComputedStyle(node).color)).toBe('rgb(12, 34, 56)')
    await expect.poll(() => html.locator('#parent-result').innerText()).toBe('parent-blocked')
    expect(await html.locator('#parent-result').getAttribute('data-error')).toBe('SecurityError')
    expect(await page.locator('html').getAttribute('data-document-preview-escape')).toBeNull()
    await successShot(page, 'html')
    sections.push([
      '## HTML', '',
      `- Viewer: ${await viewer.innerText()}`,
      `- Sandbox: ${await iframe.getAttribute('sandbox')}`,
      `- Inline script: ${await html.locator('#result').innerText()}`,
      `- Local script: ${await html.locator('#local-result').innerText()}`,
      `- Outside-workspace script: ${await html.locator('#outside-result').innerText()}`,
      `- Local stylesheet: ${await html.locator('#local-result').evaluate(node => getComputedStyle(node).color)}`,
      `- Parent access: ${await html.locator('#parent-result').innerText()} (${await html.locator('#parent-result').getAttribute('data-error')})`,
      `- Parent unchanged: ${String(await page.locator('html').getAttribute('data-document-preview-escape') === null)}`,
    ].join('\n'))

    // The image checks run before the PDF section on purpose. They exercise
    // THIS fork's image renderer end to end, and the PDF section below still
    // describes the builtin reader's continuous-page surface, so a failure
    // there must not hide the image contract's own evidence.
    await openFile('tiny.png')
    await expect.poll(() => viewer.innerText()).toBe('Image viewer')
    const stage = preview.locator('[data-image-stage]')
    const tinyImage = preview.getByRole('img', { name: 'Image preview: tiny.png', exact: true })
    await tinyImage.waitFor({ state: 'visible', timeout: 15_000 })
    expect(await tinyImage.evaluate(node => ({
      naturalWidth: (node as HTMLImageElement).naturalWidth,
      naturalHeight: (node as HTMLImageElement).naturalHeight,
      draggable: (node as HTMLImageElement).draggable,
      decoding: (node as HTMLImageElement).decoding,
      referrerPolicy: (node as HTMLImageElement).referrerPolicy,
    }))).toEqual({
      naturalWidth: 1,
      naturalHeight: 1,
      draggable: false,
      decoding: 'async',
      referrerPolicy: 'no-referrer',
    })
    // The stage centres what it holds, and the facts strip sits outside it, so
    // fitting is not thrown off by how many facts a file happens to have.
    const centring = await tinyImage.evaluate((node) => {
      const scroller = node.closest('[data-image-stage]')
      if (!(scroller instanceof HTMLElement)) throw new Error('the image stage is unavailable')
      const image = node.getBoundingClientRect()
      const bounds = scroller.getBoundingClientRect()
      return {
        horizontal: Math.abs((image.left + image.width / 2) - (bounds.left + bounds.width / 2)),
        vertical: Math.abs((image.top + image.height / 2) - (bounds.top + bounds.height / 2)),
      }
    })
    expect(centring.horizontal).toBeLessThan(10)
    expect(centring.vertical).toBeLessThan(10)
    expect(await preview.locator('[data-image-metadata]').count()).toBe(1)
    expect(await preview.locator('[data-image-metadata]').evaluate(node => node.closest('[data-image-stage]') === null)).toBe(true)

    await openFile('large.svg')
    await expect.poll(() => viewer.innerText()).toBe('Image viewer')
    const largeImage = preview.getByRole('img', { name: 'Image preview: large.svg', exact: true })
    await largeImage.waitFor({ state: 'visible', timeout: 15_000 })
    // The element keeps its intrinsic layout box; the wrapper inside the canvas
    // carries the zoom, which is what makes a zoom level visible rather than
    // merely announced.
    const largeBox = await largeImage.evaluate(node => ({
      naturalWidth: (node as HTMLImageElement).naturalWidth,
      naturalHeight: (node as HTMLImageElement).naturalHeight,
      width: getComputedStyle(node).width,
      height: getComputedStyle(node).height,
    }))
    expect(largeBox).toEqual({ naturalWidth: 1200, naturalHeight: 1600, width: '1200px', height: '1600px' })
    // Fitted: the drawn size follows the pane, so the stage has nothing to scroll.
    await expect.poll(() => largeImage.evaluate(node => node.getBoundingClientRect().width)).toBeLessThan(1200)
    const fittedWidth = Math.round(await largeImage.evaluate(node => node.getBoundingClientRect().width))
    const fitted = await stage.evaluate(node => ({
      horizontal: node.scrollWidth > node.clientWidth,
      vertical: node.scrollHeight > node.clientHeight,
    }))
    expect(fitted).toEqual({ horizontal: false, vertical: false })
    // Actual size overflows the stage in both directions, and the stage — not
    // the document body — is what scrolls it.
    await preview.locator('[data-image-zoom-actual]').click()
    await expect.poll(() => stage.evaluate(node => ({
      horizontal: node.scrollWidth > node.clientWidth,
      vertical: node.scrollHeight > node.clientHeight,
    }))).toEqual({ horizontal: true, vertical: true })
    const scrolled = await stage.evaluate((node) => {
      node.scrollLeft = node.scrollWidth
      node.scrollTop = node.scrollHeight
      return { left: node.scrollLeft, top: node.scrollTop }
    })
    expect(scrolled.left).toBeGreaterThan(0)
    expect(scrolled.top).toBeGreaterThan(0)
    expect(await body.evaluate(node => node.scrollWidth <= node.clientWidth)).toBe(true)
    // The SVG's own script only ever reaches an img Blob URL, so it never runs.
    expect(await page.locator('html').getAttribute('data-image-preview-escape')).toBeNull()
    await successShot(page, 'image')
    sections.push([
      '## Image', '',
      `- Viewer: ${await viewer.innerText()}`,
      `- Intrinsic layout box of a 1200x1600 picture: ${largeBox.width} x ${largeBox.height}`,
      `- Fitted drawn width: ${fittedWidth}px`,
      `- Stage overflow fitted -> actual: ${String(fitted.horizontal || fitted.vertical)} -> true`,
      `- Document body horizontal overflow at actual size: ${String(await body.evaluate(node => node.scrollWidth > node.clientWidth))}`,
      `- SVG script reached the parent: ${String(await page.locator('html').getAttribute('data-image-preview-escape') !== null)}`,
    ].join('\n'))

    // Both readers for `.pdf` stay reachable: this fork's renderer takes the
    // suffix by rank, and the builtin stays selectable in the viewer menu. The
    // checks below state the builtin's continuous-page surface, so this section
    // picks that reader on purpose — which is also the assertion that the menu
    // still offers it.
    await openFile('smoke.pdf')
    await expect.poll(() => viewer.innerText()).toBe('PDF document')
    await preview.locator('[data-document-viewer-menu]').click()
    const viewerMenu = page.getByRole('menu')
    await viewerMenu.waitFor({ timeout: 15_000 })
    const offeredReaders = await viewerMenu.getByRole('menuitem').allTextContents()
    // Both readers for the suffix are offered, in rank order, with the universal
    // plain-text fallback still reachable behind them. That menu is the whole
    // reason a second reader for one suffix is safe to register: nothing a
    // reader could do before this fork existed stops working.
    const forkRank = offeredReaders.indexOf('PDF document')
    const builtinRank = offeredReaders.indexOf('PDF')
    expect(forkRank).toBe(0)
    expect(builtinRank).toBe(1)
    expect(offeredReaders).toContain('Plain text')
    await viewerMenu.getByRole('menuitem', { name: 'PDF', exact: true }).click()
    await expect.poll(() => viewer.innerText()).toBe('PDF')
    const canvas = preview.getByRole('img', { name: 'PDF page 1', exact: true })
    await canvas.waitFor({ state: 'visible', timeout: 30_000 })
    expect(await preview.locator('[role="toolbar"]').count()).toBe(0)
    expect(await preview.locator('[data-pdf-page]').count()).toBe(2)
    await expect.poll(() => canvasColor(canvas), { timeout: 30_000 }).toBe('red')
    const firstColor = await canvasColor(canvas)
    expect(firstColor).toBe('red')
    const workerNames = await Promise.all(page.workers().map(worker => worker.evaluate(() => self.name)))
    expect(workerNames).toContain('dsh-pdf')
    await preview.locator('[data-pdf-page="2"]').scrollIntoViewIfNeeded()
    const secondPage = preview.getByRole('img', { name: 'PDF page 2', exact: true })
    await secondPage.waitFor({ state: 'visible', timeout: 30_000 })
    await expect.poll(() => canvasColor(secondPage), { timeout: 30_000 }).toBe('blue')
    const secondColor = await canvasColor(secondPage)
    expect(secondColor).toBe('blue')
    expect(await body.evaluate(node => node.scrollWidth <= node.clientWidth)).toBe(true)
    const pdfTab = column.locator('[data-dockkit-tab]').filter({ has: page.getByText('smoke.pdf', { exact: true }) })
    const pdfTabId = await pdfTab.getAttribute('data-dockkit-tab')
    expect(pdfTabId).not.toBeNull()
    await filesTab.click()
    await column.locator('[data-files-state="tree"]').waitFor({ state: 'visible' })
    await pdfTab.click()
    await preview.locator('[data-pdf-page="2"]').scrollIntoViewIfNeeded()
    await secondPage.waitFor({ state: 'visible', timeout: 30_000 })
    await expect.poll(() => canvasColor(secondPage), { timeout: 30_000 }).toBe('blue')
    const restoredColor = await canvasColor(secondPage)
    expect(restoredColor).toBe('blue')
    expect(await pdfTab.getAttribute('data-dockkit-tab')).toBe(pdfTabId)
    await successShot(page, 'pdf')
    sections.push([
      '## PDF', '',
      `- Offered readers: ${offeredReaders.join(' -> ')}`,
      `- Viewer: ${await viewer.innerText()}`,
      `- Worker: ${workerNames.find(name => name === 'dsh-pdf')}`,
      `- Continuous pages: ${await preview.locator('[data-pdf-page]').count()}`,
      `- Horizontal overflow: ${String(await body.evaluate(node => node.scrollWidth > node.clientWidth))}`,
      `- Canvas fills: ${[firstColor, secondColor, restoredColor].join(' -> ')}`,
      `- Same tab: ${String(await pdfTab.getAttribute('data-dockkit-tab') === pdfTabId)}`,
    ].join('\n'))

    const releaseRead = Promise.withResolvers<undefined>()
    let waitingForRead = false
    /** Every path the held read saw, so a miss says whether the hold was reached. */
    const readPaths: string[] = []
    const readPage = scaffold.ctx.workspaceFiles.read.bind(scaffold.ctx.workspaceFiles)
    const heldRead = vi.spyOn(scaffold.ctx.workspaceFiles, 'read').mockImplementation(async (agent, path, range, signal) => {
      readPaths.push(path)
      if (path === 'pages.js' && (range.offset ?? 1) === 1) {
        waitingForRead = true
        await releaseRead.promise
      }
      return readPage(agent, path, range, signal)
    })
    let initialReading = false
    try {
      await openFile('pages.js')
      // The read is a round trip through the scaffold, so it gets the same
      // budget every other wait in this file has rather than the poll default.
      try {
        await expect.poll(() => waitingForRead, { timeout: 15_000 }).toBe(true)
      } catch (error) {
        throw new Error(`the held read was never reached; the service saw ${readPaths.length === 0 ? 'nothing' : readPaths.join(', ')}`, { cause: error })
      }
      const reading = preview.locator('[data-document-loading]')
      initialReading = await reading.isVisible()
      expect(initialReading).toBe(true)
      expect(await preview.locator('[data-code-preview]').count()).toBe(0)
      const indicator = await reading.boundingBox()
      const scroller = await body.boundingBox()
      if (indicator === null || scroller === null) throw new Error('reading indicator or document body is not rendered')
      expect(indicator.y).toBeGreaterThanOrEqual(scroller.y)
      expect(indicator.y + indicator.height).toBeLessThanOrEqual(scroller.y + scroller.height)
      await successShot(page, 'code-reading')
    } finally {
      releaseRead.resolve(undefined)
      heldRead.mockRestore()
    }
    await expect.poll(() => viewer.innerText()).toBe('Code')
    const highlightedLines = preview.locator('.shiki .line')
    await expect.poll(() => highlightedLines.count(), { timeout: 15_000 }).toBe(PAGE_LINES)
    const codeBlock = preview.locator('.md-code-block')
    const codeScrollport = preview.locator('[data-code-block-content]')
    expect(await codeBlock.getAttribute('data-line-numbers')).toBe('true')
    await expect.poll(() => highlightedLines.first().evaluate(node => getComputedStyle(node, '::before').content))
      .not.toMatch(/^(?:none|normal)$/u)
    const numbering = await highlightedLines.first().evaluate((node) => {
      const line = getComputedStyle(node)
      const before = getComputedStyle(node, '::before')
      return {
        counterIncrement: line.counterIncrement,
        gutterWidth: Number.parseFloat(before.width),
        sourceInset: Number.parseFloat(line.paddingInlineStart),
      }
    })
    expect(numbering.counterIncrement).toBe('source-line 1')
    expect(numbering.gutterWidth).toBeGreaterThan(0)
    expect(numbering.sourceInset).toBeGreaterThan(numbering.gutterWidth)
    const prefix = await highlightedLines.allTextContents()
    expect(prefix).toEqual(codeLines.slice(0, PAGE_LINES))
    await expect.poll(() => preview.locator('[data-textpreview-more]').isEnabled()).toBe(true)
    await scrollForNextPage(codeScrollport)
    await expect.poll(() => highlightedLines.count(), { timeout: 15_000 }).toBe(codeLines.length)
    const completed = await highlightedLines.allTextContents()
    expect(completed).toEqual(codeLines)
    await expect.poll(() => preview.locator('[data-textpreview-more]').count()).toBe(0)
    const scrollTop = await codeScrollport.evaluate((node) => {
      const target = Math.floor((node.scrollHeight - node.clientHeight) / 2)
      if (target <= 0) throw new Error('code fixture does not overflow the document body')
      node.scrollTop = target
      return target
    })
    await expect.poll(() => codeScrollport.evaluate((node) => {
      const codeBlock = node.parentElement
      const banner = codeBlock?.firstElementChild
      const firstLine = node.querySelector('.shiki .line')
      if (!(banner instanceof HTMLElement) || firstLine === null) throw new Error('missing rendered code banner or source line')
      const bounds = node.getBoundingClientRect()
      const clipTop = bounds.top + node.clientTop
      const bannerBounds = banner.getBoundingClientRect()
      return {
        scrollTop: node.scrollTop,
        scrollportBelowBanner: Math.abs(bannerBounds.bottom - bounds.top) < 1,
        firstLineAbove: firstLine.getBoundingClientRect().top < clipTop,
      }
    })).toEqual({ scrollTop, scrollportBelowBanner: true, firstLineAbove: true })
    await page.context().grantPermissions(['clipboard-read', 'clipboard-write'], { origin: new URL(page.url()).origin })
    await page.evaluate(() => navigator.clipboard.writeText(''))
    await codeBlock.getByRole('button', { name: 'Copy', exact: true }).click()
    // The clipboard is the platform's, not the renderer's. Chromium stores the
    // text/plain flavor with the host's own line endings — CRLF here — so the
    // assertion is that the copied lines are the file's lines, not that the
    // operating system kept the newline the renderer wrote.
    const copiedLines = async (): Promise<string[]> => (await page.evaluate(() => navigator.clipboard.readText())).split(/\r?\n/u)
    await expect.poll(copiedLines, { timeout: 15_000 }).toEqual(codeLines)
    sections.push([
      '## Code paging', '',
      `- Viewer: ${await viewer.innerText()}`,
      `- Initial reading indicator: ${initialReading}`,
      `- Lines: ${prefix.length} -> ${completed.length}`,
      `- Prefix retained: ${String(JSON.stringify(completed.slice(0, prefix.length)) === JSON.stringify(prefix))}`,
      `- Tail: ${completed.at(-1)}`,
    ].join('\n'))

    await openFile('notes.unknown')
    await expect.poll(() => viewer.innerText()).toBe('Plain text')
    const plainLines = preview.locator('[data-textpreview-line]')
    await expect.poll(() => plainLines.count()).toBe(2)
    const fallback = (await plainLines.allTextContents()).map(line => line.trim())
    expect(fallback).toEqual(['UNKNOWN_SUFFIX', 'Plain fallback.'])
    sections.push(['## Unknown suffix', '', `- Viewer: ${await viewer.innerText()}`, `- Text: ${fallback.join(' | ')}`].join('\n'))
    expect(tripwire.pageErrors).toEqual([])
    expect(tripwire.warnings).toEqual([])
    await compareOrRefreshGolden(EXPECTED, sections.join('\n\n'), MODE)
    await assertFixtureInventory(SNAPSHOT_DIR, ['document.expected.md', 'paging.patch.yml'])
  })
})
