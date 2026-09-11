/**
 * Container and codec identification against real muxer output.
 *
 * The fixtures come from `make_samples.py`, which drives ffmpeg, so every
 * container and codec asserted here is what a real muxer wrote. This spec runs in
 * the Node environment because it reads files from disk.
 *
 * Two properties matter as much as the fixture table and are asserted directly:
 * the claim list may only contain suffixes this module can identify (a claim the
 * identifier cannot answer routes a file to a body that says "not a readable
 * video"), and no byte sequence may make identification throw (the module's
 * contract absolves the body of a defensive catch, so the guarantee has to be
 * real).
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  inspectVideo, playbackObstacle, shouldAttemptPlayback, summarizeTracks, VIDEO_EXTENSIONS,
} from '../src/client/video/containers.ts'

/** Read one generated fixture. */
function fixture(name: string): Uint8Array {
  return new Uint8Array(readFileSync(fileURLToPath(new URL(`./samples/${name}`, import.meta.url))))
}

/** Bytes a fixture builder accepts: a plain list, or an already-built run. */
type Bytes = readonly number[] | Uint8Array

/**
 * One EBML element: a four-byte id, a one-byte length, then the payload.
 * @param id - the element's binary id.
 * @param payload - its payload, itself possibly a nested element.
 * @returns the encoded element.
 */
function ebml(id: readonly number[], payload: Bytes): Uint8Array {
  return new Uint8Array([...id, 0x80 | payload.length, ...payload])
}

/** The EBML header every Matroska file opens with, so the signature path is taken. */
function matroska(inner: Uint8Array): Uint8Array {
  return new Uint8Array([0x1a, 0x45, 0xdf, 0xa3, 0x81, 0x00, ...inner])
}

/** An ISO base media file whose `ftyp` declares the M4V brand and nothing else. */
function m4vWithoutTracks(): Uint8Array {
  const text = (value: string): number[] => Array.from(value, character => character.charCodeAt(0))
  return new Uint8Array([0, 0, 0, 24, ...text('ftyp'), ...text('M4V '), 0, 0, 2, 0, ...text('M4V '), ...text('M4VH')])
}

/** Big-endian 32-bit bytes, as every ISO-BMFF field is written. */
function u32(value: number): number[] {
  return [(value >>> 24) & 0xff, (value >>> 16) & 0xff, (value >>> 8) & 0xff, value & 0xff]
}

/**
 * Little-endian 32-bit bytes, as every RIFF field is written.
 *
 * A separate helper rather than a flag on `u32`, because writing a RIFF chunk
 * size big-endian is what hid a real defect: the fixtures agreed with the parser
 * instead of with the format, so an AVI cobbled together here identified its
 * stream while every AVI an encoder writes identified nothing. What pins the
 * byte order now is the corpus case that reads a real ffmpeg AVI.
 */
function u32le(value: number): number[] {
  return [value & 0xff, (value >>> 8) & 0xff, (value >>> 16) & 0xff, (value >>> 24) & 0xff]
}

/** Little-endian 16-bit bytes. */
function u16le(value: number): number[] {
  return [value & 0xff, (value >>> 8) & 0xff]
}

/**
 * Little-endian 64-bit bytes, as ASF writes every field of that width.
 *
 * The two halves are produced separately rather than with shifts, because `<<`
 * truncates its result to 32 bits and would throw the high word away.
 */
function u64le(value: number): number[] {
  return [...u32le(value % 0x100000000), ...u32le(Math.floor(value / 0x100000000))]
}

/** ASCII bytes for a four-character code. */
function text(value: string): number[] {
  return Array.from(value, character => character.charCodeAt(0))
}

/** One ISO base media file format box. */
function box(type: string, payload: readonly number[]): number[] {
  return [...u32(8 + payload.length), ...text(type), ...payload]
}

/** A `ftyp` box declaring one major brand. */
function ftyp(major: string): number[] {
  return box('ftyp', [...text(major), ...u32(512), ...text(major)])
}

/** One box whose size is written as a 64-bit `largesize`, as a file over 4 GiB does. */
function largeBox(type: string, payload: readonly number[]): number[] {
  return [0, 0, 0, 1, ...text(type), ...u32(0), ...u32(16 + payload.length), ...payload]
}

/**
 * A movie header of the given version.
 * @param version - 0 or 1, which sets how wide the creation and duration fields are.
 * @param timescale - ticks per second, or 0 for a header that declares none.
 * @param duration - the duration in ticks.
 * @returns the encoded `mvhd` box.
 */
function mvhd(version: number, timescale: number, duration: number): number[] {
  const times = version === 1
    ? [...u32(timescale), ...u32(Math.floor(duration / 0x100000000)), ...u32(duration >>> 0)]
    : [...u32(timescale), ...u32(duration)]
  return box('mvhd', [version, 0, 0, 0, ...new Array<number>(version === 1 ? 16 : 8).fill(0), ...times])
}

/** A sample description table holding one entry per format. */
function sampleTable(formats: readonly string[]): number[] {
  const entries = formats.flatMap(format => box(format, new Array<number>(20).fill(0)))
  return box('stsd', [0, 0, 0, 0, ...u32(formats.length), ...entries])
}

/**
 * One track.
 * @param handler - the media handler, or undefined for a `trak` that declares none.
 * @param formats - the sample entries, or none for a `trak` with no sample table.
 * @returns the encoded `trak` box.
 */
function trak(handler: string | undefined, formats: readonly string[]): number[] {
  const hdlr = handler === undefined
    ? []
    : box('hdlr', [0, 0, 0, 0, 0, 0, 0, 0, ...text(handler), ...new Array<number>(12).fill(0)])
  const media = [...hdlr, ...box('minf', box('stbl', formats.length === 0 ? [] : sampleTable(formats)))]
  return box('trak', box('mdia', media))
}

/** An MP4 built from the given movie children. */
function movieOf(...children: readonly (readonly number[])[]): Uint8Array {
  return new Uint8Array([...ftyp('isom'), ...box('moov', children.flat())])
}

/** An Ogg file whose header region carries the given codec's identification magic. */
function ogg(magic: readonly number[]): Uint8Array {
  const bytes = new Uint8Array(64)
  bytes.set(text('OggS'), 0)
  bytes.set(magic, 16)
  return bytes
}

/** One RIFF chunk: its identifier, its little-endian size, and its payload. */
function chunk(id: string, payload: readonly number[]): number[] {
  return [...text(id), ...u32le(payload.length), ...payload]
}

/**
 * A `BITMAPINFOHEADER`, which is what a video stream's `strf` chunk holds and
 * what an ASF video media type embeds.
 * @param codec - the `biCompression` four-character code.
 * @param width - `biWidth`.
 * @param height - `biHeight`, which is signed: negative means top down.
 * @param declared - the `biSize` to declare, forty for a real header.
 * @returns the encoded forty-byte header.
 */
function dib(codec: string, width: number, height: number, declared = 40): number[] {
  return [
    ...u32le(declared), ...u32le(width), ...u32le(height >>> 0), ...u16le(1), ...u16le(24),
    ...text(codec), ...u32le(0), ...u32le(0), ...u32le(0), ...u32le(0), ...u32le(0),
  ]
}

/**
 * An `avih` main header, whose frame interval and frame count give the run time.
 * @param frameMicros - microseconds per frame.
 * @param frames - the total frame count.
 * @returns the encoded fifty-six-byte header.
 */
function mainHeader(frameMicros: number, frames: number): number[] {
  return [
    ...u32le(frameMicros), ...u32le(0), ...u32le(0), ...u32le(0), ...u32le(frames),
    ...u32le(0), ...u32le(1), ...u32le(0), ...u32le(64), ...u32le(48),
    ...u32le(0), ...u32le(0), ...u32le(0), ...u32le(0),
  ]
}

/**
 * A RIFF AVI carrying one stream header and, optionally, its stream format and
 * the file's main header.
 * @param kind - `vids` or `auds`.
 * @param handler - the four-character codec code.
 * @param format - the `strf` payload, or none.
 * @param main - the `avih` payload, or none.
 * @returns the encoded file.
 */
function avi(kind: string, handler: string, format?: readonly number[], main?: readonly number[]): Uint8Array {
  const body = [
    ...chunk('strh', [...text(kind), ...text(handler)]),
    ...(format === undefined ? [] : chunk('strf', format)),
    ...(main === undefined ? [] : chunk('avih', main)),
  ]
  const bytes = new Uint8Array(12 + body.length)
  bytes.set(text('RIFF'), 0)
  bytes.set(u32le(bytes.byteLength - 8), 4)
  bytes.set(text('AVI '), 8)
  bytes.set(body, 12)
  return bytes
}

/** The ASF header object, which every ASF file opens with. */
const ASF_HEADER = [0x30, 0x26, 0xb2, 0x75, 0x8e, 0x66, 0xcf, 0x11, 0xa6, 0xd9, 0x00, 0xaa, 0x00, 0x62, 0xce, 0x6c]

/** The ASF stream properties object, whose media type names each stream. */
const ASF_STREAM_PROPERTIES = [0x91, 0x07, 0xdc, 0xb7, 0xb7, 0xa9, 0xcf, 0x11, 0x8e, 0xe6, 0x00, 0xc0, 0x0c, 0x20, 0x53, 0x65]

/** The ASF file properties object, which states the run time. */
const ASF_FILE_PROPERTIES = [0xa1, 0xdc, 0xab, 0x8c, 0x47, 0xa9, 0xcf, 0x11, 0x8e, 0xe4, 0x00, 0xc0, 0x0c, 0x20, 0x53, 0x65]

/** The ASF video media type, which says a stream carries pictures. */
const ASF_VIDEO_MEDIA = [0xc0, 0xef, 0x19, 0xbc, 0x4d, 0x5b, 0xcf, 0x11, 0xa8, 0xfd, 0x00, 0x80, 0x5f, 0x5c, 0x44, 0x2b]

/** One ASF object: its GUID, its own little-endian size, and its payload. */
function asfObject(guid: readonly number[], payload: readonly number[]): number[] {
  return [...guid, ...u64le(24 + payload.length), ...payload]
}

/**
 * An ASF file: a header object holding the objects given.
 *
 * The header object's payload opens with the object count and two reserved
 * bytes, which is what puts its first child thirty bytes into the file rather
 * than twenty-four — the offset an ASF reader has to know.
 * @param objects - the header objects, in order.
 * @returns the encoded file.
 */
function asf(...objects: readonly (readonly number[])[]): Uint8Array {
  const body = [...u32le(objects.length), 1, 2, ...objects.flat()]
  return new Uint8Array([...ASF_HEADER, ...u64le(24 + body.length), ...body])
}

/**
 * A file properties object payload.
 * @param played - the play duration, in 100-nanosecond units.
 * @param preroll - the preroll, in milliseconds.
 * @returns the encoded eighty-byte payload.
 */
function fileProperties(played: number, preroll: number): number[] {
  return [
    ...new Array<number>(16).fill(0), ...u64le(0), ...u64le(0), ...u64le(0),
    ...u64le(played), ...u64le(0), ...u64le(preroll),
    ...u32le(0), ...u32le(0), ...u32le(0), ...u32le(0),
  ]
}

/**
 * A video stream properties object payload.
 * @param header - the media type's type-specific data, which is a bitmap header.
 * @returns the encoded payload, whose type-specific data starts at its offset 54.
 */
function videoStreamProperties(header: readonly number[]): number[] {
  return [
    ...ASF_VIDEO_MEDIA, ...new Array<number>(16).fill(0), ...u64le(0),
    ...u32le(header.length), ...u32le(0), ...u16le(0), ...u32le(0),
    ...header,
  ]
}

/**
 * One 188-byte transport stream packet: header, zeroed payload, and the field
 * bytes a program table needs placed at the offsets a demuxer reads them from.
 * @param pid - the packet's program identifier.
 * @param starts - whether the packet sets the payload-start flag.
 * @param fields - bytes to place from the section's first byte onward.
 * @returns the packet.
 */
function packet(pid: number, starts: boolean, fields: readonly number[]): Uint8Array {
  const bytes = new Uint8Array(188)
  bytes.set([0x47, ((pid >> 8) & 0x1f) | (starts ? 0x40 : 0), pid & 0xff, 0x10], 0)
  // The pointer field is present only when the payload-start flag is set, and a
  // zero pointer puts the section immediately after it.
  bytes.set(fields, starts ? 5 : 4)
  return bytes
}

/**
 * Packets framed bare and back to back, as a plain `.ts` writes them.
 * @param packets - the packets, in order.
 * @returns the encoded file.
 */
function stream(...packets: readonly Uint8Array[]): Uint8Array {
  const bytes = new Uint8Array(packets.length * 188)
  packets.forEach((one, index) => { bytes.set(one, index * 188) })
  return bytes
}

/** A packet that carries no table at all, so only its header means anything. */
function filler(pid: number): Uint8Array {
  return packet(pid, true, [])
}

/** A program association table naming one program, whose map table is PID 256. */
const PAT = [
  0x00, 0xb0, 0x0d, 0x00, 0x01, 0xc1, 0x00, 0x00, 0x00, 0x01, 0xe1, 0x00, 0xf0, 0x00,
]

/**
 * A program map table declaring one stream.
 * @param type - the PMT stream type for that stream.
 * @returns the encoded section bytes.
 */
function programMap(type: number): number[] {
  return [0x02, 0xb0, 0x12, 0x00, 0x01, 0xc1, 0x00, 0x00, 0xe1, 0x00, 0xf0, 0x00,
    type, 0xe1, 0x01, 0xf0, 0x00]
}


describe('container and codec identification', () => {
  for (const [name, container, codec, attempt] of [
    ['plain-h264.mp4', 'MP4', 'H.264', true],
    ['plain-h264.m4v', 'MP4 (M4V)', 'H.264', true],
    ['plain-h264.mov', 'QuickTime', 'H.264', true],
    ['plain-h264.mkv', 'Matroska', 'H.264', true],
    ['plain-vp9.webm', 'Matroska', 'VP9', true],
    ['plain-h264.m2ts', 'MPEG transport stream', 'H.264', true],
    ['plain-theora.ogv', 'Ogg', 'Theora', true],
    ['plain-h263.3gp', '3GPP', 'H.263', true],
    ['plain-mpeg4.avi', 'AVI', 'MPEG-4 Visual', false],
    ['plain-wmv2.wmv', 'ASF', 'Windows Media Video 8', false],
    ['plain-flv1.flv', 'Flash Video', 'Sorenson H.263', false],
    ['plain-mpeg2.mpg', 'MPEG program stream', undefined, false],
    ['plain-mpeg4.mov', 'QuickTime', 'MPEG-4 Visual', false],
    ['plain-prores.mov', 'QuickTime', 'Apple ProRes 422 Proxy', false],
  ] as const) {
    it(`identifies ${name} as ${container}${codec === undefined ? '' : ` with ${codec}`}`, () => {
      const info = inspectVideo(fixture(name), name.slice(name.lastIndexOf('.') + 1))
      expect(info?.container.name).toBe(container)
      if (codec !== undefined) {
        expect(info?.tracks.find(track => track.kind === 'video')?.name).toBe(codec)
      }
      expect(shouldAttemptPlayback(info!)).toBe(attempt)
    })
  }

  it('reads the duration and picture size out of the container', () => {
    const info = inspectVideo(fixture('plain-h264.mp4'), 'mp4')
    expect(info?.durationSeconds).toBeCloseTo(1, 0)
    expect([info?.width, info?.height]).toEqual([64, 48])
    expect(summarizeTracks(info!)).toEqual({ container: 'MP4', codec: 'H.264', audioTracks: 0 })
  })

  it('reads the picture size out of a Matroska file', () => {
    const info = inspectVideo(fixture('plain-vp9.webm'), 'webm')
    expect([info?.width, info?.height]).toEqual([64, 48])
    expect(info?.tracks[0]?.id).toBe('V_VP9')
  })

  it('reads the transport stream program map in both framings', () => {
    // The program map decides the track kind, so it is never guessed from a
    // name. The fixture is a real M2TS — 192-byte frames, each a four-byte
    // arrival timestamp in front of a 188-byte packet — and the bare framing is
    // derived from it by dropping that prefix, which is exact: the same packets,
    // reframed. Deriving is also the only way to cover the plain `.ts`
    // alignment here, because a `.ts` file in this repository is TypeScript.
    const m2ts = fixture('plain-h264.m2ts')
    expect(m2ts.byteLength % 192).toBe(0)
    const frames = m2ts.byteLength / 192
    const bare = new Uint8Array(frames * 188)
    for (let frame = 0; frame < frames; frame += 1) {
      bare.set(m2ts.subarray(frame * 192 + 4, frame * 192 + 192), frame * 188)
    }
    expect(bare[0]).toBe(0x47)
    for (const bytes of [m2ts, bare]) {
      const info = inspectVideo(bytes, 'm2ts')
      expect(info?.container.name).toBe('MPEG transport stream')
      expect(info?.tracks).toHaveLength(1)
      expect(info?.tracks[0]).toMatchObject({ kind: 'video', id: '0x1b', name: 'H.264' })
    }
  })

  it('reads a Theora picture size from the identification header', () => {
    const info = inspectVideo(fixture('plain-theora.ogv'), 'ogv')
    expect([info?.width, info?.height]).toEqual([64, 48])
  })

  it('reads the audio-track count and the single-track inflection from the container', () => {
    const info = inspectVideo(fixture('plain-h264.mp4'), 'mp4')
    expect(summarizeTracks({ ...info!, tracks: [...info!.tracks, { kind: 'audio', id: 'mp4a', name: 'AAC' }] }))
      .toEqual({ container: 'MP4', codec: 'H.264', audioTracks: 1 })
  })
})

describe('the obstacle a file presents', () => {
  it('names the conversion a reader needs, as a code and not a sentence', () => {
    expect(playbackObstacle(inspectVideo(fixture('plain-prores.mov'), 'mov')!)).toEqual({ level: 'codec', reason: 'prores' })
    expect(playbackObstacle(inspectVideo(fixture('plain-mpeg4.mov'), 'mov')!)).toEqual({ level: 'codec', reason: 'mpeg4Visual' })
    expect(playbackObstacle(inspectVideo(fixture('plain-wmv2.wmv'), 'wmv')!)).toEqual({ level: 'container', reason: 'asf' })
    expect(playbackObstacle(inspectVideo(fixture('plain-mpeg4.avi'), 'avi')!)).toEqual({ level: 'container', reason: 'avi' })
    expect(playbackObstacle(inspectVideo(fixture('plain-flv1.flv'), 'flv')!)).toEqual({ level: 'container', reason: 'flv' })
    expect(playbackObstacle(inspectVideo(fixture('plain-mpeg2.mpg'), 'mpg')!)).toEqual({ level: 'container', reason: 'mpegPs' })
    // A container the platform handles states no obstacle, so the element decides.
    expect(playbackObstacle(inspectVideo(fixture('plain-h264.mp4'), 'mp4')!)).toBeUndefined()
  })

  it('blocks an M4V that declares no track at all', () => {
    const info = inspectVideo(m4vWithoutTracks(), 'm4v')
    expect(info?.container).toMatchObject({ name: 'MP4 (M4V)', key: 'm4v' })
    expect(playbackObstacle(info!)).toEqual({ level: 'codec', reason: 'noTrack' })
  })

  it('blocks a Matroska file whose codec is outside the WebM set', () => {
    // VFW-wrapped codecs have no table entry of their own, which is the case
    // that needs the Matroska-level sentence.
    const codecId = Array.from('V_MS/VFW/FOURCC', character => character.charCodeAt(0))
    const bytes = matroska(ebml([0x18, 0x53, 0x80, 0x67], ebml([0x16, 0x54, 0xae, 0x6b], ebml([0xae], [
      ...ebml([0x83], [1]),
      ...ebml([0x86], codecId),
    ]))))
    const info = inspectVideo(bytes, 'mkv')
    expect(info?.container.key).toBe('matroska')
    expect(playbackObstacle(info!)).toEqual({ level: 'codec', reason: 'matroskaCodec' })
  })
})

describe('the claim list', () => {
  it('claims every suffix of the containers it knows', () => {
    for (const extension of ['mp4', 'm4v', 'mov', 'webm', 'mkv', 'ogv', 'avi', 'wmv', 'flv', 'mpg', 'm2ts', '3gp', 'rmvb', 'vob', 'mxf', 'dv']) {
      expect(VIDEO_EXTENSIONS).toContain(extension)
    }
  })

  it('can identify every suffix it claims', () => {
    // A claimed suffix the identifier cannot answer routes a file to this body,
    // which then reports "not a readable video" — the exact wrong explanation.
    const unidentified = VIDEO_EXTENSIONS.filter(extension => inspectVideo(new Uint8Array(300).fill(0x41), extension) === undefined)
    expect(unidentified).toEqual([])
  })

  it('leaves the suffixes another renderer owns alone', () => {
    // TypeScript sources and tab-separated data must never reach this preview:
    // it registers in the extension band, which outranks the code preview's
    // builtin band, so claiming either would take the file away from the
    // renderer that can actually show it.
    for (const extension of ['ts', 'tsv', 'mts', 'mka', 'oga', '3gpp', '3gpp2', 'tod']) {
      expect(VIDEO_EXTENSIONS).not.toContain(extension)
      expect(inspectVideo(new Uint8Array(300).fill(0x41), extension)).toBeUndefined()
    }
  })

  it('claims no suffix twice', () => {
    expect(new Set(VIDEO_EXTENSIONS).size).toBe(VIDEO_EXTENSIONS.length)
  })
})

describe('identification is total and bounded', () => {
  it('identifies MXF and DV from their signatures rather than their suffix', () => {
    const mxf = new Uint8Array(64)
    mxf.set([0x06, 0x0e, 0x2b, 0x34, 0x02, 0x05, 0x01, 0x01, 0x0d, 0x01, 0x02], 0)
    expect(inspectVideo(mxf, 'bin')?.container).toMatchObject({ key: 'mxf', reason: 'mxf' })
    const dv = new Uint8Array(64)
    dv.set([0x1f, 0x07, 0x00, 0x00], 0)
    expect(inspectVideo(dv, 'bin')?.container).toMatchObject({ key: 'dv', reason: 'dv' })
  })

  it('never throws, whatever the bytes are', () => {
    // The body has no defensive catch around this call, so a throw here reaches
    // the right Sidebar's dock. Everything below is damage a real file can carry:
    // truncation, a length field that contradicts the file, and a container that
    // opens correctly and then stops.
    const mp4 = fixture('plain-h264.mp4')
    const mkv = fixture('plain-h264.mkv')
    const wmv = fixture('plain-wmv2.wmv')
    const real = fixture('plain-h264.m2ts')
    const damaged: Uint8Array[] = [
      new Uint8Array(0),
      new Uint8Array(1),
      new Uint8Array([0x1a, 0x45, 0xdf, 0xa3]),
      // A Matroska Duration declaring three bytes: a float read of that length
      // used to take the DataView out of its own bounds.
      matroska(ebml([0x18, 0x53, 0x80, 0x67], ebml([0x15, 0x49, 0xa9, 0x66], ebml([0x44, 0x89], [0, 0, 0])))),
      // An ISO box whose declared size is smaller than its own header.
      new Uint8Array([0, 0, 0, 2, 0x66, 0x72, 0x65, 0x65]),
      // The same file, every box two bytes wide: the walk must not step through it.
      (() => {
        const bytes = new Uint8Array(64)
        for (let at = 0; at + 8 <= bytes.length; at += 2) bytes.set([0, 2, 0, 0, 0x66, 0x72, 0x65, 0x65], at)
        return bytes
      })(),
      // An FLV header whose first tag declares a size larger than the file.
      new Uint8Array([0x46, 0x4c, 0x56, 1, 0, 0, 0, 9, 0, 0, 0, 9, 9, 0xff, 0xff, 0xff]),
    ]
    for (const length of [0, 1, 4, 12, 13, 188, 189, 4096]) {
      damaged.push(mp4.slice(0, length), mkv.slice(0, length), wmv.slice(0, length), real.slice(0, length))
    }
    for (const bytes of damaged) {
      for (const extension of ['', 'mp4', 'mkv', 'wmv', 'm2ts', 'bin']) {
        expect(() => inspectVideo(bytes, extension)).not.toThrow()
      }
    }
  })

  it('stops walking a stream of tags instead of running through the whole file', () => {
    // An FLV whose only video tag is buried under thousands of empty ones: the
    // walk is counted, so identification reports no codec rather than spending
    // the main thread on a media file that declares nothing.
    const tag = [9, 0, 0, 5, 0, 0, 0, 0, 0, 0, 0, 0x27]
    const header = [0x46, 0x4c, 0x56, 1, 0, 0, 0, 9, 0, 0, 0, 9]
    /** An FLV header followed by `count` empty tags, then the video tag. */
    const withTagsBefore = (count: number): Uint8Array => {
      const bytes = new Uint8Array(13 + count * 15 + tag.length)
      bytes.set(header, 0)
      bytes.set(tag, 13 + count * 15)
      return bytes
    }
    expect(inspectVideo(withTagsBefore(10), 'flv')?.tracks[0]?.name).toBe('H.264')
    expect(inspectVideo(withTagsBefore(4096), 'flv')?.tracks).toEqual([])
  })

  it('falls back to the suffix when no signature matches and still identifies', () => {
    const unknown = new Uint8Array(256)
    expect(inspectVideo(unknown, 'mkv')?.container.name).toBe('Matroska')
    expect(inspectVideo(unknown, 'rmvb')?.container.name).toBe('RealMedia')
    expect(inspectVideo(unknown, 'm2ts')?.container.name).toBe('MPEG transport stream')
    expect(inspectVideo(unknown, 'wmv')?.container.name).toBe('ASF')
    expect(inspectVideo(unknown, 'roq')?.container.name).toBe('Id RoQ')
    expect(inspectVideo(unknown, 'zzz')).toBeUndefined()
  })
})

describe('the structure a real file can present', () => {
  it('walks a box that declares its size as 64-bit', () => {
    // Anything over 4 GiB writes `largesize` instead of `size`, so the walk has
    // to know that header is sixteen bytes and not eight.
    const bytes = new Uint8Array([...ftyp('isom'), ...largeBox('moov', mvhd(0, 600, 1200))])
    const info = inspectVideo(bytes, 'mp4')
    expect(info?.container.name).toBe('MP4')
    expect(info?.durationSeconds).toBeCloseTo(2, 5)
  })

  it('treats a box of size zero as running to the end of the file', () => {
    // A streamed fragment writes size 0 to mean "everything that follows", so a
    // `moov` written after it is inside it rather than a sibling of it.
    const bytes = new Uint8Array([
      ...ftyp('isom'),
      ...u32(0), ...text('mdat'), 0, 0, 0, 0,
      ...box('moov', mvhd(0, 600, 1200)),
    ])
    const info = inspectVideo(bytes, 'mp4')
    expect(info?.container.name).toBe('MP4')
    expect(info?.durationSeconds).toBeUndefined()
  })

  it('reads a movie header whose time fields are 64-bit', () => {
    expect(inspectVideo(movieOf(mvhd(1, 90000, 180000)), 'mov')?.durationSeconds).toBeCloseTo(2, 5)
  })

  it('reports no duration for a header whose timescale is zero, rather than dividing by it', () => {
    expect(inspectVideo(movieOf(mvhd(0, 0, 1200)), 'mov')?.durationSeconds).toBeUndefined()
  })

  it('skips every track that carries no picture and no sound', () => {
    // A `trak` with no handler, one whose handler is not a media type, and one
    // with no sample table are all real: chapter lists and timed metadata.
    const info = inspectVideo(movieOf(
      mvhd(0, 600, 600),
      trak(undefined, ['avc1']),
      trak('meta', ['avc1']),
      trak('vide', []),
      trak('vide', ['avc1']),
    ), 'mp4')
    expect(info?.tracks).toHaveLength(1)
    expect(info?.tracks[0]).toMatchObject({ kind: 'video', name: 'H.264' })
  })

  it('names a codec the table has never heard of by the id the muxer wrote', () => {
    const info = inspectVideo(movieOf(mvhd(0, 600, 600), trak('vide', ['zzzz'])), 'mp4')
    expect(info?.tracks[0]?.name).toBe('zzzz')
  })

  it('reads an AVI stream header, and ignores one that is neither picture nor sound', () => {
    expect(inspectVideo(avi('vids', 'H264'), 'avi')?.tracks).toMatchObject([{ kind: 'video', id: 'H264' }])
    expect(inspectVideo(avi('auds', 's263'), 'avi')?.tracks).toMatchObject([{ kind: 'audio', name: 'H.263' }])
    expect(inspectVideo(avi('txts', 'H264'), 'avi')?.tracks).toEqual([])
  })

  it('reads a real AVI picture size and length, which ffmpeg wrote', () => {
    // The container a browser refuses is the one whose card carries the whole
    // answer, so resolution and run time are the two figures a reader deciding
    // on a conversion needs. Both are in the head: the video stream's `strf` is
    // a `BITMAPINFOHEADER`, and `avih` states the frame interval and the count.
    const info = inspectVideo(fixture('plain-mpeg4.avi'), 'avi')
    expect([info?.width, info?.height]).toEqual([64, 48])
    // Fifteenth of a microsecond-interval: 15 frames at 66666 µs each.
    expect(info?.durationSeconds).toBeCloseTo(1, 2)
  })

  it('reads a hand-built AVI picture size and length through its chunk walk', () => {
    // The real fixture carries these fields inside `LIST hdrl`; this one carries
    // them at the top level, which is the other place a walk can meet them.
    const info = inspectVideo(avi('vids', 'H264', dib('H264', 320, 240), mainHeader(33_333, 300)), 'avi')
    expect([info?.width, info?.height]).toEqual([320, 240])
    expect(info?.durationSeconds).toBeCloseTo(9.9999, 3)
  })

  it('measures a top-down bitmap by the magnitude of its negative height', () => {
    // `biHeight` is signed, and a negative value means the rows are stored top
    // down. Read unsigned that is a number near four billion, which is how a
    // perfectly ordinary frame comes to be rejected as implausible.
    expect(inspectVideo(avi('vids', 'H264', dib('H264', 64, -48)), 'avi')?.height).toBe(48)
  })

  it('reports no picture size for a stream format that is not a measurable one', () => {
    // Every row is damage a real file can carry: a header that declares zero in
    // a field, one whose declared length is a `BITMAPCOREHEADER`'s twelve bytes
    // (sixteen-bit dimensions, so read as a `BITMAPINFOHEADER` its width would be
    // two fields at once), and one whose declared length is past any frame.
    for (const [width, height, declared] of [
      [0, 48, 40], [64, 0, 40], [70_000, 48, 40], [64, 70_000, 40], [64, 48, 12],
    ] as const) {
      const info = inspectVideo(avi('vids', 'H264', dib('H264', width, height, declared)), 'avi')
      expect([info?.width, info?.height]).toEqual([undefined, undefined])
    }
    // An audio stream's `strf` is a `WAVEFORMATEX`, which is not a picture
    // header at all — so it is skipped by the stream it follows rather than by
    // its own bytes, which is the only thing that can tell the two apart.
    expect(inspectVideo(avi('auds', 's263', dib('H264', 64, 48)), 'avi')?.width).toBeUndefined()
  })

  it('reports no duration for a main header whose frame count or interval is damage', () => {
    // Zero frames and a zero interval are a header that declares no length, and
    // a product past any recording is damage rather than a run time.
    expect(inspectVideo(avi('vids', 'H264', undefined, mainHeader(0, 300)), 'avi')?.durationSeconds).toBeUndefined()
    expect(inspectVideo(avi('vids', 'H264', undefined, mainHeader(33_333, 0xffffffff)), 'avi')?.durationSeconds)
      .toBeUndefined()
  })

  it('reads a real ASF picture size and subtracts the preroll it declares', () => {
    // ffmpeg writes a 4.1-second play duration and a 3.1-second preroll for a
    // one-second clip, so the run time is the difference — and the picture size
    // is read relative to the compression code, because ffmpeg's own padding
    // puts the `BITMAPINFOHEADER` eleven bytes into the media type's data.
    const info = inspectVideo(fixture('plain-wmv2.wmv'), 'wmv')
    expect([info?.width, info?.height]).toEqual([64, 48])
    expect(info?.durationSeconds).toBeCloseTo(1, 2)
  })

  it('reads an ASF picture size from anywhere the compression code sits', () => {
    // The padding before the bitmap header is the producer's business, so the
    // width and the height are read twelve and eight bytes before the code.
    const padding = new Array<number>(11).fill(0).map((_, index) => index)
    for (const prefix of [[], padding]) {
      const info = inspectVideo(asf(
        asfObject(ASF_STREAM_PROPERTIES, videoStreamProperties([...prefix, ...dib('WMV3', 176, 144)])),
      ), 'wmv')
      expect([info?.width, info?.height]).toEqual([176, 144])
      expect(info?.tracks[0]?.name).toBe('Windows Media Video 9')
    }
  })

  it('names a video codec whose bitmap header it cannot measure', () => {
    // The code is found and the header around it is not usable, so the codec
    // stands and the size stays unknown rather than becoming a wrong number.
    const info = inspectVideo(asf(
      asfObject(ASF_STREAM_PROPERTIES, videoStreamProperties(dib('WMV2', 64, 48, 12))),
    ), 'wmv')
    expect(info?.tracks).toMatchObject([{ kind: 'video', name: 'Windows Media Video 8' }])
    expect([info?.width, info?.height]).toEqual([undefined, undefined])
  })

  it('reads an ASF run time in the header’s own units, before dividing', () => {
    // Converting each field to seconds and then subtracting leaves `4.1 - 3.1`
    // at `0.9999999999999998`, which floors to `0:00` in the panel. The
    // subtraction therefore happens in 100-nanosecond units.
    const withProperties = (played: number, preroll: number): number | undefined => inspectVideo(
      asf(asfObject(ASF_FILE_PROPERTIES, fileProperties(played, preroll))), 'wmv',
    )?.durationSeconds
    expect(withProperties(5_001 * 1e7, 1000)).toBeCloseTo(5000, 5)
    // Two hours is past what thirty-two bits of 100-nanosecond units can hold,
    // so the high word is not decoration.
    expect(withProperties(7200 * 1e7, 0)).toBeCloseTo(7200, 5)
    // A header that declares no play duration, and one that declares a run time
    // no recording has.
    expect(withProperties(0, 0)).toBeUndefined()
    expect(withProperties(365 * 24 * 3600 * 1e7, 0)).toBeUndefined()
  })

  it('reports an identifier a container can print, not the bytes it declared', () => {
    // A Matroska `CodecID` is free text, so it reaches the panel as whatever the
    // file wrote. A control character or a bidirectional override draws
    // something other than what the file said — a right-to-left override beside
    // the container name is a spoof rather than a curiosity — so everything
    // outside the printable range is replaced.
    const codecId = [0x1b, 0x5b, 0xe2, 0x80, 0xae, 0x41]
    const bytes = matroska(ebml([0x18, 0x53, 0x80, 0x67], ebml([0x16, 0x54, 0xae, 0x6b], ebml([0xae], [
      ...ebml([0x83], [1]),
      ...ebml([0x86], codecId),
    ]))))
    expect(inspectVideo(bytes, 'mkv')?.tracks[0]?.name).toBe('?[?A')
  })

  it('omits the codec of a track whose identifier was never declared', () => {
    // A Matroska entry may declare a `TrackType` and no `CodecID`. Nothing is
    // namable then, and an absent codec is what the body renders as "unknown";
    // an empty string would render as a label with nothing after it, which reads
    // as a broken list rather than as an unnamed codec.
    const bytes = matroska(ebml([0x18, 0x53, 0x80, 0x67], ebml([0x16, 0x54, 0xae, 0x6b], ebml([0xae], [
      ...ebml([0x83], [1]),
    ]))))
    const info = inspectVideo(bytes, 'mkv')!
    expect(info.tracks).toMatchObject([{ kind: 'video', name: '' }])
    expect(summarizeTracks(info)).toEqual({ container: 'Matroska', audioTracks: 0 })
  })

  it('omits the codec of a container that declares no picture at all', () => {
    const info = inspectVideo(ogg(text('vorbis')), 'ogg')!
    expect(summarizeTracks(info)).toEqual({ container: 'Ogg', audioTracks: 1 })
  })

  it('identifies RealMedia and an MPEG elementary stream from their own bytes', () => {
    // A suffix is not always a hint that can be trusted, so these two markers are
    // what decides for a `.rm` and a `.m1v`.
    const real = new Uint8Array(64)
    real.set(text('.RMF'), 0)
    expect(inspectVideo(real, 'rm')?.container).toMatchObject({ name: 'RealMedia', reason: 'realmedia' })
    const elementary = new Uint8Array(64)
    elementary.set([0, 0, 1, 0xb3], 0)
    expect(inspectVideo(elementary, 'm1v')?.container)
      .toMatchObject({ name: 'MPEG elementary stream', reason: 'mpegEs' })
  })

  it('reads an Ogg that carries only sound, and one that carries Daala', () => {
    // A sound-only `.ogg` is a file this preview plays, so it reports the audio
    // track and must not invent a picture size it never read.
    const info = inspectVideo(ogg(text('vorbis')), 'ogg')
    expect(info?.container.name).toBe('Ogg')
    expect(info?.tracks).toMatchObject([{ kind: 'audio', id: 'vorbis', name: 'Vorbis' }])
    expect([info?.width, info?.height]).toEqual([undefined, undefined])
    expect(inspectVideo(ogg([0x80, ...text('daala')]), 'ogv')?.tracks)
      .toMatchObject([{ kind: 'video', id: 'daala', name: 'Daala' }])
  })

  it('reads the sound out of a transport stream program map', () => {
    // The program map decides the kind, so an AAC stream type must come back as
    // audio even though every other fixture in this corpus is video-only.
    const bytes = stream(packet(0, true, PAT), packet(0x100, true, programMap(0x0f)))
    expect(inspectVideo(bytes, 'm2ts')?.tracks)
      .toMatchObject([{ kind: 'audio', id: '0xf', name: 'AAC (ADTS)' }])
  })

  it('reports no tracks for a transport stream whose packets name no program', () => {
    // No packet carries PID 0, so there is no program association table to follow.
    expect(inspectVideo(stream(filler(0x111), filler(0x111)), 'm2ts')?.tracks).toEqual([])
  })

  it('reads no section out of a packet that continues one rather than starting it', () => {
    // A packet whose payload-start flag is clear carries the middle of a section,
    // so reading its payload as a table header would invent a table that is not
    // there. These payload bytes would name a program if they were read.
    const continuation = packet(0, false, PAT)
    expect(inspectVideo(stream(continuation, continuation), 'm2ts')?.tracks).toEqual([])
  })
})

describe('the structure a damaged file can hand over', () => {
  /** An ISO file whose only box is a `ftyp` declaring `major`. */
  function branded(major: string): Uint8Array {
    return new Uint8Array(ftyp(major))
  }

  /** One RIFF list chunk wrapping `children`. */
  function list(children: readonly number[]): number[] {
    return [...text('LIST'), ...u32le(4 + children.length), ...text('movi'), ...children]
  }

  it('names the 3GPP2 and AVC brands of the files that use them', () => {
    for (const brand of ['3g2a', '3g2b', '3g2c']) {
      expect(inspectVideo(branded(brand), '3g2')?.container).toMatchObject({ name: '3GPP2', key: '3gpp2' })
    }
    expect(inspectVideo(branded('avc1'), 'mp4')?.container)
      .toMatchObject({ name: 'MP4 (AVC)', key: 'iso-bmff' })
  })

  it('gives up on a box whose 64-bit length is past the end of the file', () => {
    // The length is where a box over 4 GiB records its size, so a file that
    // stops inside it declares nothing the walk can trust.
    const bytes = new Uint8Array([0, 0, 0, 1, ...text('moov'), 0, 0, 0, 0])
    const info = inspectVideo(bytes, 'mp4')
    expect(info?.container.name).toBe('MP4')
    expect(info?.tracks).toEqual([])
  })

  it('reports a track whose sample description is cut off', () => {
    // The table promises one video entry and the file ends before it, so both
    // the codec id and the picture size are read past the end.
    const bytes = new Uint8Array([
      ...ftyp('isom'),
      ...box('moov', box('trak', box('mdia', [
        ...box('hdlr', [0, 0, 0, 0, 0, 0, 0, 0, ...text('vide'), ...new Array<number>(12).fill(0)]),
        ...box('minf', box('stbl', box('stsd', [0, 0, 0, 0, ...u32(1)]))),
      ]))),
    ])
    expect(inspectVideo(bytes, 'mp4')?.tracks[0]).toMatchObject({ kind: 'video', width: 0, height: 0 })
  })

  it('reports no duration for a movie header the file ends inside', () => {
    expect(inspectVideo(movieOf(box('mvhd', [])), 'mov')?.durationSeconds).toBeUndefined()
  })

  it('reports no duration for a 64-bit movie header that declares no timescale', () => {
    expect(inspectVideo(movieOf(mvhd(1, 0, 180000)), 'mov')?.durationSeconds).toBeUndefined()
  })

  it('stops at an element whose declared length runs past the end', () => {
    // The size is variable-width, so the last element may claim more bytes than
    // the file holds. Reading the value it promises must stay inside the buffer.
    const bytes = new Uint8Array([0x1a, 0x45, 0xdf, 0xa3, 0xff, 0x81, 0x83, 0, 0, 0, 0x81, 0x40])
    const info = inspectVideo(bytes, 'mkv')
    expect(info?.container.name).toBe('Matroska')
    expect(info?.tracks).toEqual([])
  })

  it('reads an EBML float duration of either width', () => {
    // A `Duration` element is four or eight bytes, and the element's own
    // declared length is what says which.
    const four = new Uint8Array(22)
    four.set([0x1a, 0x45, 0xdf, 0xa3, 0xff,
      0x18, 0x53, 0x80, 0x67, 0xff,
      0x15, 0x49, 0xa9, 0x66, 0xff,
      0x44, 0x89, 0x84], 0)
    new DataView(four.buffer).setFloat32(18, 1500)
    expect(inspectVideo(four, 'mkv')?.durationSeconds).toBeCloseTo(1.5, 5)

    const eight = new Uint8Array(26)
    eight.set([0x1a, 0x45, 0xdf, 0xa3, 0xff,
      0x18, 0x53, 0x80, 0x67, 0xff,
      0x15, 0x49, 0xa9, 0x66, 0xff,
      0x44, 0x89, 0x88], 0)
    new DataView(eight.buffer).setFloat64(18, 1000)
    expect(inspectVideo(eight, 'mkv')?.durationSeconds).toBeCloseTo(1, 5)
  })

  it('refuses to descend past its own depth limit in a Matroska document', () => {
    // Seven nested container elements: the walk stops at the limit rather than
    // following a hostile file down its own stack.
    const bytes = new Uint8Array(48)
    bytes.set([0x1a, 0x45, 0xdf, 0xa3, 0xff], 0)
    for (let level = 0; level < 7; level += 1) bytes.set([0x16, 0x54, 0xae, 0x6b, 0xff], 5 + level * 5)
    expect(inspectVideo(bytes, 'mkv')?.tracks).toEqual([])
  })

  it('reports the sound track a Matroska track entry declares', () => {
    const bytes = new Uint8Array([
      0x1a, 0x45, 0xdf, 0xa3, 0xff,
      0x18, 0x53, 0x80, 0x67, 0xff,
      0x16, 0x54, 0xae, 0x6b, 0xff,
      0xae, 0x83, 0x83, 0x81, 0x02,
    ])
    expect(inspectVideo(bytes, 'mkv')?.tracks).toMatchObject([{ kind: 'audio' }])
  })

  it('refuses to descend past its own depth limit in a RIFF list', () => {
    const body = list(list(list(list([]))))
    const bytes = new Uint8Array([...text('RIFF'), ...u32le(4 + body.length), ...text('AVI '), ...body])
    const info = inspectVideo(bytes, 'avi')
    expect(info?.container.name).toBe('AVI')
    expect(info?.tracks).toEqual([])
  })

  it('passes over an ASF stream properties object that describes no picture', () => {
    // The object's media type is what says whether the stream carries pictures,
    // so an audio stream's object must not be read for a codec.
    const bytes = new Uint8Array(200)
    bytes.set(ASF_STREAM_PROPERTIES, 32)
    const info = inspectVideo(bytes, 'wmv')
    expect(info?.container.name).toBe('ASF')
    expect(info?.tracks).toEqual([])
  })

  it('reports no picture size for a Theora header the file ends inside', () => {
    // The size fields sit fourteen bytes into the identification header, so a
    // file that stops just after the magic declares no size rather than zero.
    const bytes = new Uint8Array(32)
    bytes.set(text('OggS'), 0)
    bytes.set([0x80, 0x74, 0x68, 0x65, 0x6f, 0x72, 0x61], 25)
    const info = inspectVideo(bytes, 'ogv')
    expect(info?.tracks).toMatchObject([{ kind: 'video', name: 'Theora' }])
    expect([info?.width, info?.height]).toEqual([undefined, undefined])
  })

  it('reports no codec for a Flash tag the file ends inside', () => {
    const bytes = new Uint8Array(24)
    bytes.set(text('FLV'), 0)
    bytes[13] = 9
    expect(inspectVideo(bytes, 'flv')?.tracks).toEqual([])
  })

  it('reads no program out of a packet whose sync byte is missing', () => {
    // A packet this far into the file is not the one the suffix promised, so the
    // walk must skip it and keep looking for the tables it needs.
    const torn = new Uint8Array(188)
    const bytes = stream(packet(0, true, PAT), filler(0x200), torn, packet(0x100, true, programMap(0x1b)))
    expect(inspectVideo(bytes, 'm2ts')?.tracks).toMatchObject([{ kind: 'video', name: 'H.264' }])
    expect(inspectVideo(stream(filler(1), filler(2), torn), 'm2ts')?.tracks).toEqual([])
  })

  it('reads no table out of a packet that continues the program map', () => {
    // The map table spans two packets; only the first begins a section, so the
    // second must be skipped rather than parsed as a header.
    const bytes = stream(packet(0, true, PAT), packet(0x100, false, programMap(0x1b)),
      packet(0x100, true, programMap(0x1b)))
    expect(inspectVideo(bytes, 'm2ts')?.tracks).toMatchObject([{ kind: 'video', name: 'H.264' }])
  })

  it('gives up on a program association table whose section starts past the packets', () => {
    // A short file gives the pointer field more room than the file has. The
    // walk must stop rather than read a program out of bytes that are not there.
    const bytes = new Uint8Array(200)
    bytes.set([0x47, 0x40, 0x00, 0x10], 0)
    // The pointer field is the packet's fifth byte, and byte 188 is the next
    // packet's sync byte, which is what identifies the framing.
    bytes[4] = 0xff
    bytes[188] = 0x47
    expect(inspectVideo(bytes, 'm2ts')?.tracks).toEqual([])
  })

  it('reads no stream list from a program map whose section starts past the buffer', () => {
    // The pointer field may claim any offset it likes, including one past the
    // packets the file actually holds.
    const beyond = packet(0x100, true, [])
    // The pointer field is the packet's fifth byte.
    beyond[4] = 0xff
    expect(inspectVideo(stream(packet(0, true, PAT), beyond), 'm2ts')?.tracks).toEqual([])
  })
})
