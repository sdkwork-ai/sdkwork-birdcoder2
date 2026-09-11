/**
 * Container, codec, tag, and geometry identification against real muxer output.
 *
 * The fixtures come from `make_samples.py`, which drives ffmpeg, so every
 * container, codec, and tag asserted here is what a real muxer wrote. This spec
 * runs in the Node environment because it reads files from disk.
 *
 * The tag encodings are the exception: no encoder in this corpus writes a frame
 * as UTF-16 big-endian without a byte-order mark, and an ID3v1 trailer is written
 * by rippers rather than by ffmpeg, so those two are built byte by byte here.
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  AUDIO_EXTENSIONS, inspectAudio, knownPlaybackReason, shouldAttemptPlayback, summarizeAudio,
} from '../src/client/audio/containers.ts'
import type { AudioSummaryTerms } from '../src/client/audio/containers.ts'
import { zh } from '../src/client/locales.ts'

/** Read one generated fixture. */
function fixture(name: string): Uint8Array {
  return new Uint8Array(readFileSync(fileURLToPath(new URL(`./samples/${name}`, import.meta.url))))
}

/** Read a fixture and identify it, which is what every case below starts from. */
function inspect(name: string): ReturnType<typeof inspectAudio> {
  return inspectAudio(fixture(name), name.slice(name.lastIndexOf('.') + 1))
}

/** The words a caller supplies for the language-bearing parts of a summary. */
const TERMS: AudioSummaryTerms = {
  mono: 'mono',
  stereo: 'stereo',
  channels: count => `${count} ch`,
}

/** The tags `make_samples.py` writes into every tagged fixture. */
const EXPECTED_TAGS = {
  title: 'Test Tone',
  artist: 'Preview Spec',
  album: 'Fixtures',
  year: '2024',
  track: '3',
}

/** ASCII code units for a string, one array entry per byte written. */
function ascii(text: string): number[] {
  const units: number[] = []
  for (let index = 0; index < text.length; index += 1) units.push(text.charCodeAt(index))
  return units
}

/** Encode a value the way ID3v2 sizes are written, with the high bit of each byte clear. */
function syncSafeBytes(size: number): number[] {
  return [(size >>> 21) & 0x7f, (size >>> 14) & 0x7f, (size >>> 7) & 0x7f, size & 0x7f]
}

/**
 * Build a file that opens with an ID3v2.3 tag holding one frame.
 * @param frame - the four-character frame id.
 * @param encoding - the frame's declared encoding byte.
 * @param payload - the frame's bytes after that encoding byte.
 * @returns the complete synthetic file.
 */
function id3v23(frame: string, encoding: number, payload: number[]): Uint8Array {
  const body = [encoding, ...payload]
  const header = [
    ...ascii(frame),
    (body.length >>> 24) & 0xff,
    (body.length >>> 16) & 0xff,
    (body.length >>> 8) & 0xff,
    body.length & 0xff,
    0,
    0,
  ]
  return new Uint8Array([...ascii('ID3'), 3, 0, 0, ...syncSafeBytes(header.length + body.length), ...header, ...body])
}

/**
 * Build the payload of an `APIC` frame, without the ten-byte frame header.
 *
 * The order is the media type the frame declares, the picture type, an empty
 * description, then the artwork. The description's terminator is written even
 * though the description is empty, because the reader walks to it before it
 * reaches the bytes.
 * @param mime - the media type the frame declares.
 * @param data - the artwork's bytes.
 * @returns the frame's bytes after its encoding byte.
 */
function apicPayload(mime: string, data: readonly number[]): number[] {
  return [...ascii(mime), 0, 3, 0, ...data]
}

/** A PNG's first eight bytes, which is all the reader needs to recognise one. */
const PNG_MAGIC = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]

/**
 * Build a file whose only tag is the ID3v1 trailer.
 * @param values - the fixed-width fields to write.
 * @returns the complete synthetic file, opening with an MPEG audio frame.
 */
function id3v1(values: {
  readonly title: string
  readonly artist: string
  readonly album: string
  readonly year: string
  readonly comment: string
  readonly track: number
  readonly genre: number
}): Uint8Array {
  const bytes = new Uint8Array(256)
  // A bare MPEG audio frame, so nothing but the trailer identifies this file.
  bytes.set([0xff, 0xfb, 0x90, 0x00], 0)
  const at = bytes.byteLength - 128
  bytes.set(ascii('TAG'), at)
  const field = (offset: number, text: string, length: number): void => {
    bytes.set(ascii(text).slice(0, length), at + offset)
  }
  field(3, values.title, 30)
  field(33, values.artist, 30)
  field(63, values.album, 30)
  field(93, values.year, 4)
  field(97, values.comment, 28)
  bytes[at + 126] = values.track
  bytes[at + 127] = values.genre
  return bytes
}

/**
 * Build a minimal WAVE file, optionally carrying an embedded ID3v2 tag.
 * @param id3 - the tag to place in an `id3 ` chunk, when there is one.
 * @returns the complete synthetic file.
 */
function waveWithId3(id3?: Uint8Array): Uint8Array {
  const chunks: number[] = []
  const chunk = (id: string, payload: readonly number[]): void => {
    chunks.push(
      ...ascii(id),
      payload.length & 0xff,
      (payload.length >>> 8) & 0xff,
      (payload.length >>> 16) & 0xff,
      (payload.length >>> 24) & 0xff,
      ...payload,
    )
  }
  // One channel of 16-bit PCM at 44100 Hz: the fmt chunk a WAVE reader expects.
  chunk('fmt ', [1, 0, 1, 0, 0x44, 0xac, 0, 0, 0x88, 0x58, 1, 0, 2, 0, 16, 0])
  if (id3 !== undefined) chunk('id3 ', [...id3])
  chunk('data', [0, 0, 0, 0])
  const size = 4 + chunks.length
  return new Uint8Array([
    ...ascii('RIFF'), size & 0xff, (size >>> 8) & 0xff, (size >>> 16) & 0xff, (size >>> 24) & 0xff,
    ...ascii('WAVE'), ...chunks,
  ])
}

describe('container and codec identification', () => {
  for (const [name, container, codec, attempt] of [
    ['plain-mp3.mp3', 'MP3', 'MP3', true],
    ['plain-vbr.mp3', 'MP3', 'MP3', true],
    ['plain-aac.m4a', 'MP4 audio', 'AAC', true],
    ['plain-alac.m4a', 'MP4 audio', 'ALAC', true],
    ['plain.wav', 'WAVE', 'PCM', true],
    ['plain.flac', 'FLAC', 'FLAC', true],
    ['plain-vorbis.ogg', 'Ogg', 'Vorbis', true],
    ['plain-opus.ogg', 'Ogg', 'Opus', true],
    ['plain-opus.webm', 'WebM', undefined, true],
    ['plain-aiff.aiff', 'AIFF', 'PCM', true],
    ['plain-mp2.mp2', 'MP2', 'MP2', true],
    ['plain-ac3.ac3', 'AC-3', 'AC-3', true],
    ['plain-eac3.eac3', 'E-AC-3', 'E-AC-3', true],
    ['plain-cover.mp3', 'MP3', 'MP3', true],
    ['plain-cover.m4a', 'MP4 audio', 'AAC', true],
    ['plain-cjk.mp3', 'MP3', 'MP3', true],
    ['plain-wma.wma', 'ASF', 'Windows Media Audio', false],
    ['plain-amr.amr', 'AMR', 'AMR-NB', false],
    ['plain-wavpack.wv', 'WavPack', 'WavPack', false],
    ['plain-tta.tta', 'True Audio', 'TTA', false],
    ['plain-dts.dts', 'DTS', 'DTS', false],
    ['plain-caf.caf', 'Core Audio Format', 'CAF', false],
    ['plain-au.au', 'Sun/NeXT audio', 'µ-law/A-law', false],
    ['plain-voc.voc', 'Creative Voice', 'Creative Voice', false],
  ] as const) {
    it(`identifies ${name} as ${container}${codec === undefined ? '' : ` with ${codec}`}`, () => {
      const info = inspect(name)
      expect(info?.container.name).toBe(container)
      if (codec !== undefined) expect(info?.container.codec).toBe(codec)
      expect(shouldAttemptPlayback(info!)).toBe(attempt)
    })
  }

  it('separates two Dolby formats that share one sync word', () => {
    // Both files open `0b 77`; only the suffix tells AC-3 from E-AC-3.
    expect(inspect('plain-ac3.ac3')?.container.name).toBe('AC-3')
    expect(inspect('plain-eac3.eac3')?.container.name).toBe('E-AC-3')
  })

  it('names the conversion a reader needs for a container no browser decodes', () => {
    const cases: ReadonlyArray<readonly [string, string]> = [
      ['plain-wma.wma', 'ASF'],
      ['plain-amr.amr', 'AMR'],
      ['plain-wavpack.wv', 'WavPack'],
      ['plain-tta.tta', 'True Audio'],
      ['plain-dts.dts', 'DTS'],
      ['plain-caf.caf', 'CAF'],
      ['plain-au.au', 'Sun/NeXT'],
      ['plain-voc.voc', 'Creative Voice'],
    ]
    for (const [name, container] of cases) {
      const key = knownPlaybackReason(inspect(name)!)
      expect(key, name).toBeDefined()
      // The reason is a dictionary key, and its sentence has to name the
      // container it is about and the way out of the format.
      expect(zh[key!], `${name} reason`).toContain(container)
    }
    // A container the platform handles states no reason, so the element decides.
    expect(knownPlaybackReason(inspect('plain-mp3.mp3')!)).toBeUndefined()
    expect(knownPlaybackReason(inspect('plain.flac')!)).toBeUndefined()
  })

  it('identifies every suffix it claims', () => {
    // A claimed suffix that identifies nothing would route a file to this body
    // only to have it answer "this is not a readable audio file", which is the
    // one answer claiming exists to avoid.
    for (const extension of AUDIO_EXTENSIONS) {
      expect(inspectAudio(new Uint8Array(256), extension), extension).toBeDefined()
    }
  })
})

describe('tracks, geometry, and duration', () => {
  it('distinguishes ALAC from AAC inside the same container', () => {
    // The suffix cannot tell these apart, which is why the sample description
    // is read at all.
    expect(inspect('plain-aac.m4a')?.container.codec).toBe('AAC')
    expect(inspect('plain-alac.m4a')?.container.codec).toBe('ALAC')
    expect(inspect('plain-alac.m4a')?.container.name).toBe('MP4 audio')
  })

  it('reads the duration out of the containers that state one cheaply', () => {
    for (const name of ['plain-aac.m4a', 'plain-alac.m4a', 'plain.wav', 'plain.flac', 'plain-aiff.aiff']) {
      expect(inspect(name)?.durationSeconds, name).toBeCloseTo(1, 1)
    }
  })

  it('reads sample geometry where the container states it', () => {
    for (const name of ['plain.wav', 'plain.flac', 'plain-aiff.aiff']) {
      const info = inspect(name)
      expect(info?.sampleRate, name).toBe(44100)
      expect(info?.channels, name).toBe(1)
    }
  })

  it('reads the geometry an MPEG stream states in its own frame header', () => {
    // An MP3 has no header block around it: the first frame's own four bytes are
    // the only place its sample rate and channel count are written down, and it
    // is the commonest audio file there is.
    for (const name of ['plain-mp3.mp3', 'plain-vbr.mp3', 'plain-cjk.mp3', 'plain-mp2.mp2']) {
      const info = inspect(name)
      expect(info?.sampleRate, name).toBe(44100)
      expect(info?.channels, name).toBe(1)
    }
  })

  it('believes an MPEG header only where the frame it declares ends', () => {
    // `FF FB 90 00` is MPEG 1 Layer III at 128 kbps and 44.1 kHz, which is a
    // 417-byte frame. Bytes that merely spell its sync word are not believed,
    // because a tag payload and a run of compressed audio both contain it.
    const lone = Uint8Array.from([0xff, 0xfb, 0x90, 0x00, ...new Uint8Array(500)])
    expect(inspectAudio(lone, 'mp3')?.sampleRate).toBeUndefined()
    // The same header twice, the second one exactly where the first ends, is a
    // stream: the channel mode's reserved value is what makes it mono, so a
    // header spelling zero there is two channels.
    const stream = Uint8Array.from([0xff, 0xfb, 0x90, 0x00, ...new Uint8Array(413), 0xff, 0xfb, 0x90, 0x00])
    expect(inspectAudio(stream, 'mp3')?.sampleRate).toBe(44100)
    expect(inspectAudio(stream, 'mp3')?.channels).toBe(2)
  })

  it('leaves geometry the container does not state to the element', () => {
    // An MP4 sample entry writes zeros where the real values live in a
    // codec-private descriptor, so nothing is claimed rather than something wrong.
    expect(inspect('plain-aac.m4a')?.sampleRate).toBeUndefined()
    expect(inspect('plain-aac.m4a')?.channels).toBeUndefined()
  })

  it('summarizes what the file is in the caller\'s own words', () => {
    expect(summarizeAudio(inspect('plain.flac')!, TERMS)).toBe('FLAC · 44.1 kHz · mono')
    expect(summarizeAudio(inspect('plain-mp3.mp3')!, TERMS)).toBe('MP3 · 44.1 kHz · mono')
    expect(summarizeAudio(inspect('plain.flac')!, { ...TERMS, mono: '单声道' })).toBe('FLAC · 44.1 kHz · 单声道')
  })
})

describe('tag reading', () => {
  for (const name of [
    'plain-mp3.mp3', 'plain-vbr.mp3', 'plain.flac', 'plain-vorbis.ogg', 'plain-opus.ogg',
  ]) {
    it(`reads the ID3 or Vorbis comment tags from ${name}`, () => {
      const tags = inspect(name)?.tags
      expect(tags?.title).toBe(EXPECTED_TAGS.title)
      expect(tags?.artist).toBe(EXPECTED_TAGS.artist)
      expect(tags?.album).toBe(EXPECTED_TAGS.album)
      expect(tags?.year).toBe(EXPECTED_TAGS.year)
      expect(tags?.track).toBe(EXPECTED_TAGS.track)
    })
  }

  it('reads the tags an MP4 carries in its own atoms', () => {
    // `.m4a` is the container most music arrives in, and its tags are not ID3.
    for (const name of ['plain-aac.m4a', 'plain-alac.m4a']) {
      const tags = inspect(name)?.tags
      expect(tags?.title, name).toBe(EXPECTED_TAGS.title)
      expect(tags?.artist, name).toBe(EXPECTED_TAGS.artist)
      expect(tags?.album, name).toBe(EXPECTED_TAGS.album)
      expect(tags?.year, name).toBe(EXPECTED_TAGS.year)
      expect(tags?.track, name).toBe(EXPECTED_TAGS.track)
    }
  })

  it('reads the RIFF INFO tags from a WAVE file', () => {
    // WAVE carries the same values through a different chunk layout.
    const tags = inspect('plain.wav')?.tags
    expect(tags?.title).toBe(EXPECTED_TAGS.title)
    expect(tags?.artist).toBe(EXPECTED_TAGS.artist)
    expect(tags?.album).toBe(EXPECTED_TAGS.album)
  })

  it('reads a title that is not ASCII', () => {
    // What ffmpeg writes for a Chinese title is what the decoder has to handle.
    const tags = inspect('plain-cjk.mp3')?.tags
    expect(tags?.title).toBe('夜色温柔')
    expect(tags?.artist).toBe('测试')
    expect(tags?.album).toBe('样本')
  })

  it('decodes every text encoding an ID3 frame may declare', () => {
    // Byte 0 is the encoding, and the frame's own byte is authoritative: a
    // UTF-16 frame with no byte-order mark is written most-significant first,
    // and reading it as UTF-8 is what turns a Chinese title into mojibake.
    const utf16be = id3v23('TIT2', 2, [0x6d, 0x4b, 0x8b, 0xd5])
    expect(inspectAudio(utf16be, 'mp3')?.tags.title).toBe('测试')

    const utf16le = id3v23('TIT2', 1, [0xff, 0xfe, 0x4b, 0x6d, 0xd5, 0x8b])
    expect(inspectAudio(utf16le, 'mp3')?.tags.title).toBe('测试')

    const utf8 = id3v23('TIT2', 3, [...Buffer.from('夜色', 'utf8')])
    expect(inspectAudio(utf8, 'mp3')?.tags.title).toBe('夜色')

    // A single-byte frame carrying a byte above 0x7f, written by a UTF-8 writer
    // even though the declared encoding names a single-byte one.
    const utf8AsLatin = id3v23('TIT2', 0, [...Buffer.from('Café', 'utf8')])
    expect(inspectAudio(utf8AsLatin, 'mp3')?.tags.title).toBe('Café')

    // The same word in the encoding the byte actually names.
    const windows = id3v23('TIT2', 0, [0x43, 0x61, 0x66, 0xe9])
    expect(inspectAudio(windows, 'mp3')?.tags.title).toBe('Café')
  })

  it('reads a comment frame past its language and description', () => {
    // `COMM` is not a text frame: `eng` and a terminator come before the words.
    const comment = id3v23('COMM', 3, [0x65, 0x6e, 0x67, 0x00, ...Buffer.from('a note', 'utf8')])
    expect(inspectAudio(comment, 'mp3')?.tags.comment).toBe('a note')
  })

  it('reads an ID3v1 trailer when the frame tag is absent', () => {
    const info = inspectAudio(id3v1({
      title: 'Trailer Title', artist: 'Trailer Artist', album: 'Trailer Album',
      year: '1999', comment: 'Trailer Comment', track: 7, genre: 17,
    }), 'mp3')
    expect(info?.container.name).toBe('MP3')
    expect(info?.tags.title).toBe('Trailer Title')
    expect(info?.tags.artist).toBe('Trailer Artist')
    expect(info?.tags.album).toBe('Trailer Album')
    expect(info?.tags.year).toBe('1999')
    expect(info?.tags.track).toBe('7')
    expect(info?.tags.comment).toBe('Trailer Comment')
    // Genre 17 is Rock in the standard table.
    expect(info?.tags.genre).toBe('Rock')
  })

  it('reads tags from a WAVE file\'s own ID3 chunk', () => {
    const info = inspectAudio(waveWithId3(id3v23('TIT2', 3, ascii('Chunk Title'))), 'wav')
    expect(info?.container.name).toBe('WAVE')
    expect(info?.tags.title).toBe('Chunk Title')
  })

  it('reports no tags when the producer wrote none', () => {
    // The file is identified and nothing is invented for it.
    const bare = inspectAudio(id3v23('TIT2', 3, []), 'mp3')
    expect(bare?.container.name).toBe('MP3')
    expect(bare?.tags.title).toBeUndefined()
    expect(inspect('plain-opus.webm')?.tags.title).toBeUndefined()
  })
})

describe('cover art', () => {
  it('reads the attached picture from an ID3 frame', () => {
    const picture = inspect('plain-cover.mp3')?.tags.picture
    expect(picture?.mime).toBe('image/png')
    expect(picture?.data.byteLength).toBeGreaterThan(100)
    // The type is decided by the bytes, not by what the frame claims.
    expect([...(picture?.data.slice(0, 4) ?? [])]).toEqual([0x89, 0x50, 0x4e, 0x47])
  })

  it('reads the cover an MP4 carries in a `covr` atom', () => {
    const picture = inspect('plain-cover.m4a')?.tags.picture
    expect(picture?.mime).toBe('image/png')
    expect([...(picture?.data.slice(0, 4) ?? [])]).toEqual([0x89, 0x50, 0x4e, 0x47])
  })

  it('does not treat a linked picture as a picture', () => {
    // `-->` means the frame holds a URL, so there are no image bytes to show.
    const linked = id3v23('APIC', 3, [...ascii('-->'), 0, ...ascii('http://example.test/a.png')])
    expect(inspectAudio(linked, 'mp3')?.tags.picture).toBeUndefined()
  })

  it('drops a picture whose declared type is not an image', () => {
    // Nothing an `<img>` can render is named here, and the bytes carry no
    // signature to overrule the declaration.
    const bogus = id3v23('APIC', 3, apicPayload('application/octet-stream', ascii('not an image')))
    expect(inspectAudio(bogus, 'mp3')?.tags.picture).toBeUndefined()

    const untyped = id3v23('APIC', 3, apicPayload('', ascii('not an image')))
    expect(inspectAudio(untyped, 'mp3')?.tags.picture).toBeUndefined()
  })

  it('lets the bytes overrule the declared type', () => {
    // The frame claims JPEG and the bytes are a PNG; the artwork is shown as
    // what it is, which is the whole point of reading the signature first.
    const mismatched = id3v23('APIC', 3, apicPayload('image/jpeg', PNG_MAGIC))
    expect(inspectAudio(mismatched, 'mp3')?.tags.picture?.mime).toBe('image/png')
  })

  it('shows a cover whose declared type it cannot verify', () => {
    // A format with no signature to read is still shown on the strength of the
    // type the file named for it, so modern artwork is not silently dropped.
    const declared = id3v23('APIC', 3, apicPayload('image/avif', ascii('no signature here')))
    expect(inspectAudio(declared, 'mp3')?.tags.picture?.mime).toBe('image/avif')
  })

  it('drops vector art even when the declared type carries parameters', () => {
    // Media-type parameters are a legal way to spell the same type, so the
    // exclusion has to look at the type itself. `image/svg+xml; charset=utf-8`
    // was handed to the page as a cover precisely because it is not the bare
    // string `image/svg+xml`, so this is the case the essence check exists for.
    const svg = id3v23('APIC', 3, apicPayload(
      'image/svg+xml; charset=utf-8',
      ascii('<svg xmlns="http://www.w3.org/2000/svg"><rect width="8" height="8"/></svg>'),
    ))
    expect(inspectAudio(svg, 'mp3')?.tags.picture).toBeUndefined()

    // Whitespace and case are both free to differ from the canonical spelling.
    const spaced = id3v23('APIC', 3, apicPayload('  IMAGE/SVG+XML  ', ascii('<svg/>')))
    expect(inspectAudio(spaced, 'mp3')?.tags.picture).toBeUndefined()

    const unspaced = id3v23('APIC', 3, apicPayload('image/svg+xml;charset=utf-8', ascii('<svg/>')))
    expect(inspectAudio(unspaced, 'mp3')?.tags.picture).toBeUndefined()

    // The gate stays open for the formats the preview is meant to show: a
    // declaration with parameters still yields a cover when it names a bitmap.
    const bitmap = id3v23('APIC', 3, apicPayload('image/png; charset=utf-8', ascii('no png magic here')))
    expect(inspectAudio(bitmap, 'mp3')?.tags.picture?.mime).toBe('image/png')
  })

  it('reports no cover art for a file that carries none', () => {
    expect(inspect('plain-mp3.mp3')?.tags.picture).toBeUndefined()
    expect(inspect('plain.flac')?.tags.picture).toBeUndefined()
  })
})

describe('suffix fallback and damaged input', () => {
  it('falls back to the suffix when no signature matches and still identifies', () => {
    const unknown = new Uint8Array(256)
    expect(inspectAudio(unknown, 'wma')?.container.name).toBe('ASF')
    expect(inspectAudio(unknown, 'midi')?.container.name).toBe('MIDI')
    expect(inspectAudio(unknown, 'dsf')?.container.name).toBe('DSD')
    expect(inspectAudio(unknown, 'ape')?.container.name).toBe('Monkey\u2019s Audio')
    expect(inspectAudio(unknown, 'gsm')?.container.name).toBe('GSM')
    expect(inspectAudio(unknown, 'zzz')).toBeUndefined()
  })

  it('claims every suffix of the containers it knows', () => {
    for (const extension of [
      'mp3', 'mp2', 'aac', 'm4a', 'alac', 'wav', 'flac', 'ogg', 'oga', 'opus', 'weba',
      'aiff', 'wma', 'amr', 'ac3', 'eac3', 'ape', 'wv', 'tta', 'midi', 'dsf', 'caf', 'au',
      'snd', 'voc', 'gsm', 'spx', 'dts',
    ]) {
      expect(AUDIO_EXTENSIONS).toContain(extension)
    }
  })

  it('survives a truncated or malformed file without throwing', () => {
    // Every reader walks offsets from bytes it did not write, so each one is
    // asked for a file that ends in the middle of its header.
    const samples = ['plain.flac', 'plain.wav', 'plain-aiff.aiff', 'plain-aac.m4a', 'plain-cover.mp3', 'plain-vorbis.ogg']
    for (const name of samples) {
      const bytes = fixture(name)
      const extension = name.slice(name.lastIndexOf('.') + 1)
      for (const length of [0, 1, 3, 7, 12, 64, Math.floor(bytes.byteLength / 2)]) {
        expect(() => inspectAudio(bytes.subarray(0, length), extension), `${name}@${length}`).not.toThrow()
      }
    }
    expect(() => inspectAudio(new Uint8Array(0), 'mp3')).not.toThrow()
    // The suffix still identifies a file whose bytes are entirely absent.
    expect(inspectAudio(new Uint8Array(0), 'mp3')?.container.name).toBe('MP3')
  })
})
