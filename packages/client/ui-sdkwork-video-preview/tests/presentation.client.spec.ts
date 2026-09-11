// @vitest-environment jsdom
/**
 * The stage's geometry and the two browser-owned presentation modes.
 *
 * Both modules exist so their guards can be tested directly. jsdom implements
 * neither a layout nor the fullscreen and picture-in-picture APIs, so a rendered
 * player can only ever reach one side of every guard — a node that is always
 * present, and an API that is always absent. Called here with an element and with
 * none, both sides are real.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { clampZoom, centreViewport, MAX_ZOOM, MIN_ZOOM, ZOOM_STEP } from '../src/client/stage.ts'
import { isFullscreen, isPictureInPicture, toggleFullscreen, togglePictureInPicture } from '../src/client/presentation.ts'

/** A stage element with a content box, which jsdom will not compute. */
function stageWith(content: { scrollWidth: number; scrollHeight: number; clientWidth: number; clientHeight: number }): HTMLElement {
  const node = document.createElement('div')
  Object.defineProperties(node, {
    scrollWidth: { value: content.scrollWidth },
    scrollHeight: { value: content.scrollHeight },
    clientWidth: { value: content.clientWidth },
    clientHeight: { value: content.clientHeight },
  })
  return node
}

/**
 * Give the document one of the browser properties jsdom leaves out.
 * @param key - the property name.
 * @param value - the value to expose, or undefined to model a browser that has no such property.
 */
function define(key: string, value: unknown): void {
  Object.defineProperty(document, key, { configurable: true, value })
}

afterEach(() => {
  vi.restoreAllMocks()
  // jsdom defines these on the prototype, so removing the own property restores
  // the null-valued original.
  for (const key of ['fullscreenElement', 'pictureInPictureElement', 'exitFullscreen', 'exitPictureInPicture']) {
    Reflect.deleteProperty(document, key)
  }
})

describe('zoom', () => {
  it('clamps a multiple into the range the stage supports', () => {
    expect(clampZoom(1)).toBe(1)
    expect(clampZoom(0.001)).toBe(MIN_ZOOM)
    expect(clampZoom(100)).toBe(MAX_ZOOM)
    // The step composes: one press stays inside the range, and the press after
    // it still lands on a value the toolbar can show.
    expect(clampZoom(MAX_ZOOM * ZOOM_STEP)).toBe(MAX_ZOOM)
    expect(clampZoom(MIN_ZOOM / ZOOM_STEP)).toBe(MIN_ZOOM)
  })
})

describe('centreViewport', () => {
  it('centres a scrollport on content larger than it', () => {
    const node = stageWith({ scrollWidth: 400, scrollHeight: 300, clientWidth: 100, clientHeight: 50 })
    centreViewport(node)
    expect([node.scrollLeft, node.scrollTop]).toEqual([150, 125])
  })

  it('does not scroll a content box that already fits', () => {
    const node = stageWith({ scrollWidth: 40, scrollHeight: 40, clientWidth: 100, clientHeight: 100 })
    centreViewport(node)
    expect([node.scrollLeft, node.scrollTop]).toEqual([0, 0])
  })

  it('tolerates being called before the stage mounts', () => {
    expect(() => { centreViewport(null) }).not.toThrow()
  })
})

describe('fullscreen', () => {
  it('reports the browser state, including a browser that has no such state', () => {
    expect(isFullscreen()).toBe(false)
    define('fullscreenElement', undefined)
    expect(isFullscreen()).toBe(false)
    define('fullscreenElement', document.body)
    expect(isFullscreen()).toBe(true)
  })

  it('requests fullscreen on the stage and leaves it again once granted', async () => {
    const request = vi.fn()
    const exit = vi.fn()
    define('exitFullscreen', exit)
    const node = document.createElement('div')
    Object.defineProperty(node, 'requestFullscreen', { configurable: true, value: request })

    await toggleFullscreen(node)
    expect(request).toHaveBeenCalledTimes(1)
    expect(exit).not.toHaveBeenCalled()

    define('fullscreenElement', node)
    await toggleFullscreen(node)
    expect(exit).toHaveBeenCalledTimes(1)
    expect(request).toHaveBeenCalledTimes(1)
  })

  it('does nothing when there is no stage, or no API to ask', async () => {
    await expect(toggleFullscreen(null)).resolves.toBeUndefined()
    await expect(toggleFullscreen(document.createElement('div'))).resolves.toBeUndefined()
  })
})

describe('picture in picture', () => {
  it('reports the browser state, including a browser that has no such state', () => {
    expect(isPictureInPicture()).toBe(false)
    define('pictureInPictureElement', undefined)
    expect(isPictureInPicture()).toBe(false)
    define('pictureInPictureElement', document.body)
    expect(isPictureInPicture()).toBe(true)
  })

  it('requests picture in picture on the element and leaves it again once granted', async () => {
    const request = vi.fn()
    const exit = vi.fn()
    define('exitPictureInPicture', exit)
    const media = document.createElement('video')
    Object.defineProperty(media, 'requestPictureInPicture', { configurable: true, value: request })

    await togglePictureInPicture(media)
    expect(request).toHaveBeenCalledTimes(1)

    define('pictureInPictureElement', media)
    await togglePictureInPicture(media)
    expect(exit).toHaveBeenCalledTimes(1)
    expect(request).toHaveBeenCalledTimes(1)
  })

  it('does nothing for a file that has no player, or no API to ask', async () => {
    await expect(togglePictureInPicture(null)).resolves.toBeUndefined()
    await expect(togglePictureInPicture(document.createElement('video'))).resolves.toBeUndefined()
  })
})
