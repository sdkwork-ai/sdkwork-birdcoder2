// @vitest-environment jsdom
/** Handing an edited workbook back through the browser's own download. */
import { afterEach, describe, expect, it } from 'vitest'
import { SAVED_COPY_NAME, WORKBOOK_MIME, saveCopy } from '../src/client/save.ts'

/** What one save asked the browser to do. */
interface Recorded {
  readonly blobs: Blob[]
  readonly revoked: string[]
  readonly links: { readonly href: string | null; readonly download: string }[]
}

/** The globals jsdom ships with, restored after every spec. */
const createObjectURL = URL.createObjectURL
const revokeObjectURL = URL.revokeObjectURL
const click = HTMLAnchorElement.prototype.click

/**
 * Record the download an object-URL release would otherwise make unrepeatable.
 *
 * jsdom implements neither the blob registry nor a download, so the three calls
 * a save makes are replaced with ones a spec can read back.
 * @returns the recorded save.
 */
function recordDownloads(): Recorded {
  const record: Recorded = { blobs: [], revoked: [], links: [] }
  let counter = 0
  URL.createObjectURL = (blob: Blob): string => {
    record.blobs.push(blob)
    counter += 1
    return `blob:saved/${counter}`
  }
  URL.revokeObjectURL = (url: string): void => { record.revoked.push(url) }
  HTMLAnchorElement.prototype.click = function click(this: HTMLAnchorElement): void {
    record.links.push({ href: this.getAttribute('href'), download: this.download })
  }
  return record
}

afterEach(() => {
  URL.createObjectURL = createObjectURL
  URL.revokeObjectURL = revokeObjectURL
  HTMLAnchorElement.prototype.click = click
})

describe('saveCopy', () => {
  it('downloads the workbook under its own name and type', () => {
    const record = recordDownloads()
    saveCopy(new Uint8Array([1, 2, 3]))
    expect(record.links).toEqual([{ href: 'blob:saved/1', download: SAVED_COPY_NAME }])
    expect(record.blobs).toHaveLength(1)
    expect(record.blobs[0].type).toBe(WORKBOOK_MIME)
    expect(record.blobs[0].size).toBe(3)
    // The URL is released in the same turn, so a session cannot leak a blob per
    // save.
    expect(record.revoked).toEqual(['blob:saved/1'])
  })

  it('saves under a name the caller states', () => {
    const record = recordDownloads()
    saveCopy(new Uint8Array([9]), 'report.xlsx')
    expect(record.links).toEqual([{ href: 'blob:saved/1', download: 'report.xlsx' }])
  })

  it('gives the blob a buffer of its own rather than a view over the package', () => {
    const record = recordDownloads()
    const bytes = new Uint8Array([1, 2, 3])
    saveCopy(bytes)
    // Mutating the source after the save cannot reach what was handed over.
    bytes[0] = 99
    expect(record.blobs[0].size).toBe(3)
  })
})
