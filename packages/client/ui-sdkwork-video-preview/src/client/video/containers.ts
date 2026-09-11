/**
 * Video container and codec identification.
 *
 * A `<video>` element reports one thing when it refuses a file: a numeric media
 * error. That is useless to a reader holding a `.wmv`. This module reads the
 * container structure instead and reports what the file actually is — MP4 with
 * HEVC, Matroska with VP9, ASF with Windows Media Video 8, an MPEG transport
 * stream with H.264 — so an undecodable file produces a message that names the
 * format and the conversion it needs.
 *
 * Identification is a hint, never a verdict: the platform codecs decide what
 * plays, so a container classified here as playable is still verified by
 * actually loading it.
 *
 * Two rules hold for everything below.
 *
 * **No user-visible copy.** A reason is a code from `VideoReasonCode`; the
 * document body renders it through the `sdkworkVideoPreview` dictionary. This
 * module has no locale dependency, so a sentence written here could only ever be
 * Chinese.
 *
 * **Total, and bounded.** Every inspector is written so no input can throw, so
 * the body needs no defensive catch around it — a malformed container yields an
 * unknown field or an explanation, never an exception. Every scan is bounded by
 * `SCAN_BUDGET` (or a counted element budget for the ISO-BMFF box walk, which
 * must still reach a trailing `moov`), because this runs on the main thread
 * while the panel paints.
 */

/** Whether this preview should attempt playback. */
export type VideoDelivery =
  /** The platform may decode it; the player verifies before claiming success. */
  | 'attempt'
  /** No browser decodes this container or codec; explain it instead. */
  | 'unsupported'

/**
 * Why a file cannot be played, as a code the body translates.
 *
 * The value names the actual obstacle rather than a symptom, so the sentence a
 * reader gets can also tell them which conversion clears it. Container codes
 * name a packaging no browser opens; codec codes name an encoding inside a
 * container that is otherwise playable.
 */
export type VideoReasonCode =
  | 'avi' | 'asf' | 'dv' | 'flv' | 'matroskaCodec' | 'mpegEs' | 'mpegPs' | 'mxf' | 'noTrack'
  | 'realmedia' | 'roq' | 'mpeg4Visual' | 'prores' | 'vp6' | 'wmv'

/** How an identified container is opened, and what a read-only caller may assume of it. */
export interface ContainerFields {
  /** Display name, such as `MP4` or `Matroska`. Never localized: a format name is data. */
  readonly name: string
  /**
   * Stable identity used by playback decisions.
   *
   * Kept separate from `name` so a decision never depends on a display string:
   * `containerForBrand` already varies the name within one format, and a
   * comparison against it is a silent break waiting to happen.
   */
  readonly key: string
}

/** A container the platform may decode, so no explanation is needed yet. */
export interface AttemptContainer extends ContainerFields {
  readonly delivery: 'attempt'
  /** Media type for the Blob URL. */
  readonly mime: string
}

/** A container or codec no browser decodes, which always carries the reason. */
export interface UnsupportedContainer extends ContainerFields {
  readonly delivery: 'unsupported'
  readonly mime: ''
  /** Why playback is not attempted, rendered as `t(`reason.${reason}`)`. */
  readonly reason: VideoReasonCode
}

/** The container a file is written in. */
export type VideoContainer = AttemptContainer | UnsupportedContainer

/** Where an obstacle sits, which decides how its sentence reads. */
export type VideoObstacle =
  /** The packaging itself cannot play; the conversion advice names a container. */
  | { readonly level: 'container'; readonly reason: VideoReasonCode }
  /** The container is fine but an encoding inside it is not; advice names a codec. */
  | { readonly level: 'codec'; readonly reason: VideoReasonCode }

/** One elementary stream inside a container. */
export interface VideoTrack {
  readonly kind: 'video' | 'audio'
  /** Short codec identifier as the container spells it, such as `avc1` or `V_MPEG4/ISO/AVC`. */
  readonly id: string
  /** Display name, such as `H.264`, or the raw identifier when it is unknown. */
  readonly name: string
  readonly width?: number
  readonly height?: number
}

/** What this preview learned about a video file. */
export interface VideoInfo {
  readonly container: VideoContainer
  readonly tracks: readonly VideoTrack[]
  readonly durationSeconds?: number
  readonly width?: number
  readonly height?: number
}

/** The track summary the metadata list renders, with the words left to the dictionary. */
export interface VideoTrackSummary {
  readonly container: string
  /** The first video track's codec name, absent when no video track was read. */
  readonly codec?: string
  /** How many audio tracks the container declares. */
  readonly audioTracks: number
}

/** The keys of the containers no browser decodes. */
type UnsupportedKey = 'avi' | 'asf' | 'dv' | 'flv' | 'mpeg-es' | 'mpeg-ps' | 'mxf' | 'realmedia' | 'roq'

/**
 * How many leading bytes any structural scan may read.
 *
 * Signatures, stream handlers, program maps and Matroska metadata all live in
 * the head of a file. Bounding the scans here is what keeps a large or hostile
 * file from turning identification into a main-thread stall; the ISO-BMFF box
 * walk is the one exception, because a non-faststart MP4 keeps its `moov` at the
 * tail.
 */
const SCAN_BUDGET = 4 * 1024 * 1024

/** How many ISO-BMFF boxes one walk may visit before giving up. */
const BOX_BUDGET = 8192

/** How many EBML elements one walk may visit before giving up. */
const EBML_ELEMENT_BUDGET = 4096

/** How many FLV tags one walk may visit before giving up. */
const FLV_TAG_BUDGET = 4096

/**
 * The widest frame this preview will report from a container's own header.
 *
 * The bound is what separates a measurement from a number: a damaged or hostile
 * header declares whatever it likes, and a width past the widest frame any codec
 * here encodes is not a picture size, so reporting it would put a figure in the
 * list a reader is using to decide what to do with the file.
 */
const MAX_DIMENSION = 0xffff

/**
 * The longest run time this preview will report from a container's own header.
 *
 * The same bound as the picture size, for the same reason: a frame count and a
 * frame interval whose product is longer than any recording is damage, and a
 * wrong figure in the duration cell is worse than an absent one.
 */
const MAX_DURATION_SECONDS = 60 * 60 * 24 * 30

/** Containers the platform decodes at least sometimes. */
const ISO_BMFF: AttemptContainer = { name: 'MP4', key: 'iso-bmff', delivery: 'attempt', mime: 'video/mp4' }
const MATROSKA: AttemptContainer = { name: 'Matroska', key: 'matroska', delivery: 'attempt', mime: 'video/webm' }
const OGG: AttemptContainer = { name: 'Ogg', key: 'ogg', delivery: 'attempt', mime: 'video/ogg' }
const MPEG_TS: AttemptContainer = { name: 'MPEG transport stream', key: 'mpeg-ts', delivery: 'attempt', mime: 'video/mp2t' }

/** Containers no browser decodes, with the reason a reader needs. */
const UNSUPPORTED_CONTAINERS: Readonly<Record<UnsupportedKey, UnsupportedContainer>> = {
  avi: { name: 'AVI', key: 'avi', delivery: 'unsupported', mime: '', reason: 'avi' },
  asf: { name: 'ASF', key: 'asf', delivery: 'unsupported', mime: '', reason: 'asf' },
  dv: { name: 'DV', key: 'dv', delivery: 'unsupported', mime: '', reason: 'dv' },
  flv: { name: 'Flash Video', key: 'flv', delivery: 'unsupported', mime: '', reason: 'flv' },
  'mpeg-es': { name: 'MPEG elementary stream', key: 'mpeg-es', delivery: 'unsupported', mime: '', reason: 'mpegEs' },
  'mpeg-ps': { name: 'MPEG program stream', key: 'mpeg-ps', delivery: 'unsupported', mime: '', reason: 'mpegPs' },
  mxf: { name: 'MXF', key: 'mxf', delivery: 'unsupported', mime: '', reason: 'mxf' },
  realmedia: { name: 'RealMedia', key: 'realmedia', delivery: 'unsupported', mime: '', reason: 'realmedia' },
  roq: { name: 'Id RoQ', key: 'roq', delivery: 'unsupported', mime: '', reason: 'roq' },
}

/** Codec identifiers mapped to the names a reader recognizes, keyed in lower case. */
const CODEC_NAMES: Readonly<Record<string, string | undefined>> = {
  wmv1: 'Windows Media Video 7', wmv2: 'Windows Media Video 8', wmv3: 'Windows Media Video 9',
  vc1: 'VC-1', mp42: 'MPEG-4 Visual', mp43: 'MPEG-4 Visual (v3)', fmp4: 'MPEG-4 Visual',
  avc1: 'H.264', avc3: 'H.264', avc2: 'H.264', avc4: 'H.264',
  hvc1: 'H.265/HEVC', hev1: 'H.265/HEVC', dvhe: 'Dolby Vision (HEVC)', dvh1: 'Dolby Vision (HEVC)',
  av01: 'AV1', vp08: 'VP8', vp09: 'VP9', vp06: 'VP6', s263: 'H.263',
  mp4v: 'MPEG-4 Visual',
  apch: 'Apple ProRes 422 HQ', apcn: 'Apple ProRes 422', apcs: 'Apple ProRes 422 LT',
  apco: 'Apple ProRes 422 Proxy', ap4h: 'Apple ProRes 4444', ap4x: 'Apple ProRes 4444 XQ',
  mp4a: 'AAC', 'ac-3': 'AC-3', 'ec-3': 'E-AC-3', opus: 'Opus', flac: 'FLAC',
  twos: 'PCM', sowt: 'PCM', lpcm: 'PCM', alac: 'ALAC', 'mp3 ': 'MP3', samr: 'AMR', sawb: 'AMR-WB',
  'v_mpeg4/iso/avc': 'H.264', 'v_mpegh/iso/hevc': 'H.265/HEVC', v_av1: 'AV1',
  v_vp8: 'VP8', v_vp9: 'VP9', v_vp6: 'VP6', 'v_mpeg4/iso/asp': 'MPEG-4 Visual',
  'v_ms/vfw/fourcc': 'VFW (see fourcc)', v_theora: 'Theora', v_prores: 'Apple ProRes',
  v_mjpeg: 'Motion JPEG', v_mpeg1: 'MPEG-1 Video', v_mpeg2: 'MPEG-2 Video', 'vc-1': 'VC-1',
  a_aac: 'AAC', a_opus: 'Opus', a_vorbis: 'Vorbis', a_flac: 'FLAC', a_ac3: 'AC-3',
  'a_mpeg/l3': 'MP3', 'a_pcm/int/lit': 'PCM', a_eac3: 'E-AC-3',
}

/** Codecs no browser decodes, keyed in lower case, with the reason code. */
const CODEC_REASONS: Readonly<Record<string, VideoReasonCode | undefined>> = {
  mp4v: 'mpeg4Visual', mp42: 'mpeg4Visual', mp43: 'mpeg4Visual', fmp4: 'mpeg4Visual',
  'v_mpeg4/iso/asp': 'mpeg4Visual',
  apch: 'prores', apcn: 'prores', apcs: 'prores', apco: 'prores', ap4h: 'prores', ap4x: 'prores',
  wmv1: 'wmv', wmv2: 'wmv', wmv3: 'wmv',
  vp6f: 'vp6', vp06: 'vp6', v_vp6: 'vp6',
}

/**
 * Every suffix this preview claims.
 *
 * The list is deliberately not "every suffix a video could use". Three families
 * are excluded because claiming them would take a file away from an owner that
 * serves it better, and this registration outranks the built-in code and text
 * renderers:
 *
 * - `ts` and `mts` are TypeScript and TypeScript-module sources (see
 *   `languages.ts`), which are far more common here than an MPEG transport
 *   stream. `m2ts` carries the transport stream without the collision.
 * - `tsv` is tab-separated data, not a transport stream.
 * - `mka` and `oga` are audio-only; the audio preview claims `oga` and is the
 *   right owner for both.
 *
 * `containers.client.spec.ts` pins the other half of the contract: every suffix
 * listed here must be one `inspectVideo` can actually identify, so a claim can
 * never route a file to a body that answers "this is not a readable video".
 */
export const VIDEO_EXTENSIONS: readonly string[] = [
  'mp4', 'm4v', 'mp4v', 'mov', 'qt', 'webm', 'mkv',
  'ogv', 'ogg',
  'avi', 'divx',
  'wmv', 'asf', 'wm',
  'flv', 'f4v',
  'mpg', 'mpeg', 'mpe', 'm2v', 'mpv', 'm1v', 'vob',
  'm2ts',
  '3gp', '3g2',
  'rm', 'rmvb',
  'dv', 'mxf', 'roq',
]

/**
 * The byte at an offset, or zero when the file ends first.
 *
 * Indexing a `Uint8Array` past its end yields `undefined` rather than throwing,
 * and the walkers below are bounded so it should not happen — but "should not"
 * is not the guarantee this module makes. Funnelling every read through here is
 * what turns "no byte sequence can throw" into something structural, and what
 * keeps a damaged file from putting `NaN` into a size, a timestamp, or a box
 * length, where it would silently disable the bound it was meant to enforce.
 * @param bytes - the complete file.
 * @param offset - the byte to read.
 * @returns the byte, or 0 when the offset is past the end.
 */
function byteAt(bytes: Uint8Array, offset: number): number {
  return bytes[offset] ?? 0
}

/** Read a big-endian 32-bit integer. */
function uint32(bytes: Uint8Array, offset: number): number {
  return byteAt(bytes, offset) * 0x1000000
    + ((byteAt(bytes, offset + 1) << 16) | (byteAt(bytes, offset + 2) << 8) | byteAt(bytes, offset + 3))
}

/**
 * Read a little-endian 32-bit integer.
 *
 * RIFF and ASF are little-endian throughout, unlike the ISO-BMFF, Matroska,
 * transport-stream and FLV structures above. This is not a detail: a RIFF chunk
 * size read big-endian is a number in the billions, so the walk clamps it to the
 * end of the file and every stream header inside the chunk is stepped over —
 * which is how a real AVI came to report no streams at all, and a codec of
 * "unknown", for a file whose `strh` names the codec four bytes in.
 * @param bytes - the file.
 * @param offset - the offset of the first byte.
 * @returns the value.
 */
function uint32le(bytes: Uint8Array, offset: number): number {
  return byteAt(bytes, offset)
    + byteAt(bytes, offset + 1) * 0x100
    + byteAt(bytes, offset + 2) * 0x10000
    + byteAt(bytes, offset + 3) * 0x1000000
}

/**
 * Read a little-endian 32-bit signed integer.
 *
 * A bitmap header's height is signed, and negative means the rows are stored top
 * down. Read unsigned it would be a number near four billion, which is how a
 * top-down frame comes to be rejected as an implausible size instead of being
 * measured by its magnitude.
 * @param bytes - the file.
 * @param offset - the offset of the first byte.
 * @returns the value.
 */
function int32le(bytes: Uint8Array, offset: number): number {
  const value = uint32le(bytes, offset)
  return value > 0x7fffffff ? value - 0x100000000 : value
}

/** Read a big-endian 16-bit integer. */
function uint16(bytes: Uint8Array, offset: number): number {
  return (byteAt(bytes, offset) << 8) | byteAt(bytes, offset + 1)
}

/** Read a big-endian 24-bit integer. */
function uint24(bytes: Uint8Array, offset: number): number {
  return (byteAt(bytes, offset) << 16) | (byteAt(bytes, offset + 1) << 8) | byteAt(bytes, offset + 2)
}

/** Read an ASCII four-character code. */
function fourcc(bytes: Uint8Array, offset: number): string {
  return String.fromCharCode(byteAt(bytes, offset), byteAt(bytes, offset + 1),
    byteAt(bytes, offset + 2), byteAt(bytes, offset + 3))
}

/** Whether the bytes at an offset equal the given ASCII text. */
function matches(bytes: Uint8Array, offset: number, text: string): boolean {
  /* v8 ignore next -- every caller probes within the leading twelve bytes that detectVideoSignature already required. */
  if (bytes.byteLength < offset + text.length) return false
  for (let index = 0; index < text.length; index += 1) {
    if (bytes[offset + index] !== text.charCodeAt(index)) return false
  }
  return true
}

/** Find a byte sequence at or after an offset, within a bound. */
function indexOfBytes(bytes: Uint8Array, needle: readonly number[], from: number, to: number): number {
  outer: for (let offset = from; offset + needle.length <= to; offset += 1) {
    for (let index = 0; index < needle.length; index += 1) {
      if (bytes[offset + index] !== needle[index]) continue outer
    }
    return offset
  }
  return -1
}

/**
 * The name to show for a codec the table does not know.
 *
 * The characters belong to the file: a Matroska `CodecID` is free text, so it
 * reaches `TextDecoder` and then the panel. Everything outside the printable
 * ASCII range is replaced, because a control character or a bidirectional
 * override draws something other than what the file said — a right-to-left
 * override in a label beside the container name is a spoof rather than a
 * curiosity — and because an unprintable identifier renders as a cell that looks
 * empty rather than as one that says "unprintable".
 * @param id - the identifier as the container spelled it.
 * @returns the identifier as it can be shown.
 */
function printableId(id: string): string {
  return id.replace(/[^\x20-\x7e]/gu, '?')
}

/** The codec name a container identifier resolves to, or the raw identifier. */
function codecName(id: string): string {
  return CODEC_NAMES[id.toLowerCase()] ?? printableId(id)
}

/** The known reason a codec cannot be decoded. */
function reasonFor(id: string): VideoReasonCode | undefined {
  return CODEC_REASONS[id.toLowerCase()]
}

/** The description of an unsupported container. */
function unsupported(key: UnsupportedKey): UnsupportedContainer {
  return UNSUPPORTED_CONTAINERS[key]
}

/** One ISO base media file format box. */
interface Box {
  readonly type: string
  readonly start: number
  readonly end: number
}

/**
 * List the child boxes of a range.
 *
 * A box header is eight bytes, so a declared size below that is structural
 * damage rather than a small box; the walk stops instead of stepping through the
 * file two bytes at a time. `limit` counts boxes rather than bytes because a
 * valid file's walk is proportional to its top-level box count, and an invalid
 * one must not be able to run away.
 * @param bytes - the complete file.
 * @param from - the range's first byte.
 * @param to - the range's last byte, exclusive.
 * @param limit - how many boxes may still be visited.
 * @returns the boxes found, in order.
 */
function boxes(bytes: Uint8Array, from: number, to: number, limit = BOX_BUDGET): Box[] {
  const found: Box[] = []
  let offset = from
  while (offset + 8 <= to && found.length < limit) {
    const size = uint32(bytes, offset)
    const type = fourcc(bytes, offset + 4)
    let end = offset + size
    // A size of 1 means a 64-bit length follows the type; a size of 0 runs to the end.
    if (size === 1) {
      const large = uint32(bytes, offset + 8) * 0x100000000 + uint32(bytes, offset + 12)
      end = offset + large
    } else if (size === 0) {
      end = to
    }
    if (end <= offset || end > to) break
    found.push({ type, start: offset, end })
    offset = end
  }
  return found
}

/** How many bytes a box's own header occupies, which a 64-bit size widens to sixteen. */
function headerSize(bytes: Uint8Array, box: Box): number {
  return uint32(bytes, box.start) === 1 ? 16 : 8
}

/** Find a descendant box by path, without descending into media data. */
function findBox(bytes: Uint8Array, from: number, to: number, path: readonly string[]): Box | undefined {
  const [head, ...rest] = path
  for (const box of boxes(bytes, from, to)) {
    if (box.type !== head) continue
    if (rest.length === 0) return box
    return findBox(bytes, box.start + headerSize(bytes, box), box.end, rest)
  }
  return undefined
}

/** The content range of a box, past its header. */
function content(bytes: Uint8Array, box: Box): { readonly from: number; readonly to: number } {
  return { from: box.start + headerSize(bytes, box), to: box.end }
}

/**
 * The container an ISO brand implies, which is a data value rather than copy.
 * @param brand - the `ftyp` major brand.
 * @returns the stable key and display name for that brand.
 */
function containerForBrand(brand: string): { readonly name: string; readonly key: string } {
  switch (brand) {
    case 'qt  ': return { name: 'QuickTime', key: 'quicktime' }
    case '3gp4': case '3gp5': case '3gp6': case '3gg6': return { name: '3GPP', key: '3gpp' }
    case '3g2a': case '3g2b': case '3g2c': return { name: '3GPP2', key: '3gpp2' }
    case 'M4V ': case 'M4VH': return { name: 'MP4 (M4V)', key: 'm4v' }
    case 'avc1': return { name: 'MP4 (AVC)', key: 'iso-bmff' }
    default: return { name: 'MP4', key: 'iso-bmff' }
  }
}

/**
 * Inspect an ISO base media file format file.
 * @param bytes - the complete file.
 * @returns the container, tracks, and duration.
 */
function inspectIsoBmff(bytes: Uint8Array): VideoInfo {
  const top = boxes(bytes, 0, bytes.byteLength)
  const ftyp = top.find(box => box.type === 'ftyp')
  const brand = ftyp === undefined ? '' : fourcc(bytes, ftyp.start + 8)
  const container: VideoContainer = brand === ''
    ? ISO_BMFF
    : { ...ISO_BMFF, ...containerForBrand(brand) }
  const moov = top.find(box => box.type === 'moov')
  if (moov === undefined) return { container, tracks: [] }
  const tracks: VideoTrack[] = []
  let durationSeconds: number | undefined
  let width: number | undefined
  let height: number | undefined

  const { from, to } = content(bytes, moov)
  const header = findBox(bytes, from, to, ['mvhd'])
  if (header !== undefined) {
    const at = header.start + 8
    const version = byteAt(bytes, at)
    if (version === 1) {
      const timescale = uint32(bytes, at + 20)
      const duration = uint32(bytes, at + 24) * 0x100000000 + uint32(bytes, at + 28)
      if (timescale > 0) durationSeconds = duration / timescale
    } else {
      const timescale = uint32(bytes, at + 12)
      const duration = uint32(bytes, at + 16)
      if (timescale > 0) durationSeconds = duration / timescale
    }
  }

  for (const trak of boxes(bytes, from, to).filter(box => box.type === 'trak')) {
    const range = content(bytes, trak)
    const handler = findBox(bytes, range.from, range.to, ['mdia', 'hdlr'])
    const kind = handler === undefined ? '' : fourcc(bytes, handler.start + 16)
    // `vide` and `soun` are the two handlers this preview reports; every other
    // (hint, subtitle, metadata) carries no picture or sound to describe.
    if (kind !== 'vide' && kind !== 'soun') continue
    const entry = findBox(bytes, range.from, range.to, ['mdia', 'minf', 'stbl', 'stsd'])
    if (entry === undefined) continue
    // The sample description table opens with a version, flags, and entry count.
    const first = entry.start + 16
    const id = fourcc(bytes, first + 4)
    const track: VideoTrack = kind === 'vide'
      ? { kind: 'video', id, name: codecName(id), width: uint16(bytes, first + 32), height: uint16(bytes, first + 34) }
      : { kind: 'audio', id, name: codecName(id) }
    tracks.push(track)
    if (kind === 'vide') {
      if (track.width !== undefined && track.width > 0) width ??= track.width
      if (track.height !== undefined && track.height > 0) height ??= track.height
    }
  }
  return {
    container,
    tracks,
    ...(durationSeconds === undefined ? {} : { durationSeconds }),
    ...(width === undefined ? {} : { width }),
    ...(height === undefined ? {} : { height }),
  }
}

/** Read an EBML variable-length integer. */
function vint(bytes: Uint8Array, offset: number): { readonly value: number; readonly length: number } {
  const first = byteAt(bytes, offset)
  if (first === 0) return { value: 0, length: 1 }
  let length = 1
  while (length <= 8 && (first & (0x80 >> (length - 1))) === 0) length += 1
  let value = first & (0xff >> length)
  for (let index = 1; index < length; index += 1) value = value * 256 + byteAt(bytes, offset + index)
  return { value, length }
}

/** Read an EBML element id, which keeps its length marker. */
function elementId(bytes: Uint8Array, offset: number): { readonly id: number; readonly length: number } {
  const first = byteAt(bytes, offset)
  if (first === 0) return { id: 0, length: 1 }
  let length = 1
  while (length <= 4 && (first & (0x80 >> (length - 1))) === 0) length += 1
  let id = first
  for (let index = 1; index < length; index += 1) id = id * 256 + byteAt(bytes, offset + index)
  return { id, length }
}

/** Matroska element ids this inspector reads. */
const EBML = {
  segment: 0x18538067,
  info: 0x1549a966,
  timecodeScale: 0x2ad7b1,
  duration: 0x4489,
  tracks: 0x1654ae6b,
  trackEntry: 0xae,
  trackType: 0x83,
  codecId: 0x86,
  pixelWidth: 0xb0,
  pixelHeight: 0xba,
} as const

/** Read an unsigned EBML integer payload of up to eight bytes. */
function ebmlUint(bytes: Uint8Array, from: number, length: number): number {
  let value = 0
  for (let index = 0; index < length; index += 1) value = value * 256 + byteAt(bytes, from + index)
  return value
}

/**
 * Read an EBML float payload.
 *
 * A `Duration` element is four or eight bytes. Any other declared length is
 * damage, and reading it as a float would take the `DataView` out of its own
 * bounds and throw out of render — so the length is checked and a damaged
 * element simply carries no duration.
 * @param bytes - the complete file.
 * @param from - the payload's first byte.
 * @param length - the declared payload length.
 * @returns the value, or undefined when the payload is not a float.
 */
function ebmlFloat(bytes: Uint8Array, from: number, length: number): number | undefined {
  if ((length !== 4 && length !== 8) || from + length > bytes.byteLength) return undefined
  const view = new DataView(bytes.buffer, bytes.byteOffset + from, length)
  return length === 4 ? view.getFloat32(0) : view.getFloat64(0)
}

/** The mutable state one Matroska walk accumulates. */
interface EbmlState {
  timecodeScale: number
  duration?: number
  tracks: VideoTrack[]
  width?: number
  height?: number
  /** Elements still allowed to be visited, decremented as the walk descends. */
  budget: number
}

/** Read as much of a Matroska document as identification needs. */
function readEbml(bytes: Uint8Array, from: number, to: number, depth: number, state: EbmlState): void {
  if (depth > 6) return
  let offset = from
  while (offset < to && state.budget > 0) {
    const { id, length: idLength } = elementId(bytes, offset)
    if (id === 0) return
    const { value: size, length: sizeLength } = vint(bytes, offset + idLength)
    const start = offset + idLength + sizeLength
    const end = Math.min(start + size, to)
    if (end <= start) return
    state.budget -= 1
    switch (id) {
      case EBML.timecodeScale:
        state.timecodeScale = ebmlUint(bytes, start, end - start)
        break
      case EBML.duration:
        state.duration = ebmlFloat(bytes, start, end - start) ?? state.duration
        break
      case EBML.codecId: {
        const text = new TextDecoder().decode(bytes.subarray(start, end)).replace(/\0+$/u, '')
        const previous = state.tracks.at(-1)
        if (previous !== undefined && previous.id === '') {
          state.tracks[state.tracks.length - 1] = { ...previous, id: text, name: codecName(text) }
        } else {
          state.tracks.push({ kind: 'video', id: text, name: codecName(text) })
        }
        break
      }
      case EBML.trackType: {
        const kind = ebmlUint(bytes, start, end - start) === 2 ? 'audio' : 'video'
        const previous = state.tracks.at(-1)
        if (previous !== undefined) state.tracks[state.tracks.length - 1] = { ...previous, kind }
        else state.tracks.push({ kind, id: '', name: '' })
        break
      }
      case EBML.pixelWidth:
        state.width = ebmlUint(bytes, start, end - start)
        break
      case EBML.pixelHeight:
        state.height = ebmlUint(bytes, start, end - start)
        break
      case EBML.segment:
      case EBML.info:
      case EBML.tracks:
      case EBML.trackEntry:
        readEbml(bytes, start, end, depth + 1, state)
        break
      default:
        // Elements this inspector does not read either nest (a container id with
        // a size) or carry data; descending is safe because a data element's
        // payload cannot parse as a valid element id at its first byte.
        if (size > 0 && depth < 4) readEbml(bytes, start, end, depth + 1, state)
        break
    }
    offset = end
  }
}

/**
 * Inspect a Matroska or WebM file.
 * @param bytes - the complete file.
 * @returns the container, tracks, and duration.
 */
function inspectMatroska(bytes: Uint8Array): VideoInfo {
  const state: EbmlState = { timecodeScale: 1_000_000, tracks: [], budget: EBML_ELEMENT_BUDGET }
  const head = Math.min(bytes.byteLength, SCAN_BUDGET)
  readEbml(bytes, 0, head, 0, state)
  const durationSeconds = state.duration === undefined
    ? undefined
    : state.duration * state.timecodeScale / 1e9
  return {
    container: MATROSKA,
    tracks: state.tracks,
    ...(durationSeconds === undefined ? {} : { durationSeconds }),
    ...(state.width === undefined ? {} : { width: state.width }),
    ...(state.height === undefined ? {} : { height: state.height }),
  }
}

/**
 * Whether a run time a container declared is one worth reporting.
 *
 * Both little-endian containers below state their run time as a count of units
 * rather than as a time, so a damaged header produces a number that is finite,
 * positive and meaningless. This is where such a number is turned back into
 * "unreadable" instead.
 * @param seconds - the run time the header's own fields produce.
 * @returns true when the value is a time a recording could have.
 */
function plausibleDuration(seconds: number): boolean {
  return seconds > 0 && seconds <= MAX_DURATION_SECONDS
}

/**
 * The picture size a bitmap header declares.
 *
 * Both little-endian containers this module reads put one of these in front of
 * their video format: a RIFF video stream's `strf` chunk *is* the header, and an
 * ASF video media type embeds it in a `VIDEOINFOHEADER`. The caller says where
 * the header starts, because the two disagree — RIFF fixes it at the chunk's
 * first byte, while ASF anchors it on the compression code, since producers pad
 * the structure differently and a fixed offset is what their padding moves.
 *
 * Every field is little-endian, and every read is bounds-guarded by `byteAt`, so
 * a file that ends inside the header declares no size rather than a wrong one.
 * @param bytes - the complete file.
 * @param header - the header's first byte.
 * @returns the size in pixels, or undefined when the header declares none.
 */
function dibPictureSize(bytes: Uint8Array, header: number): { readonly width: number; readonly height: number } | undefined {
  // A `BITMAPCOREHEADER` is twelve bytes long and keeps its dimensions in
  // sixteen bits, so a declared length below the forty of a `BITMAPINFOHEADER`
  // is a structure this reader cannot measure — including the zero a file that
  // ends inside the field reads as.
  if (uint32le(bytes, header) < 40) return undefined
  const width = uint32le(bytes, header + 4)
  // A negative height marks a top-down bitmap, whose magnitude is the height.
  const height = Math.abs(int32le(bytes, header + 8))
  if (width === 0 || height === 0 || width > MAX_DIMENSION || height > MAX_DIMENSION) return undefined
  return { width, height }
}

/**
 * Inspect a RIFF AVI file for its stream handlers, its picture, and its length.
 *
 * Three chunks answer the questions a reader has. `strh` names each stream and
 * its codec, `strf` carries the video stream's `BITMAPINFOHEADER` — which is
 * where the picture size is — and `avih` carries the frame interval and the
 * total frame count, whose product is the run time. The last two matter more
 * here than they look: this container is refused by every browser, so the card
 * that explains it is the whole of what a reader gets, and resolution and length
 * are exactly what they need to choose a conversion.
 * @param bytes - the complete file.
 * @returns the container, tracks, picture size, and duration.
 */
function inspectAvi(bytes: Uint8Array): VideoInfo {
  const tracks: VideoTrack[] = []
  let width: number | undefined
  let height: number | undefined
  let durationSeconds: number | undefined
  // The stream the last `strh` described, so the `strf` that follows it inside
  // the same `strl` list is attributed to the right one. An audio stream's
  // format chunk is a `WAVEFORMATEX`, and reading its bytes as a picture header
  // would invent a size out of a sample rate.
  let lastStream: 'video' | 'audio' | undefined
  const head = Math.min(bytes.byteLength, SCAN_BUDGET)
  const visit = (from: number, to: number, depth: number, budget: { left: number }): void => {
    if (depth > 3) return
    let offset = from
    while (offset + 8 <= to && budget.left > 0) {
      const id = fourcc(bytes, offset)
      // RIFF, not ISO-BMFF: the chunk size is little-endian.
      const size = uint32le(bytes, offset + 4)
      const start = offset + 8
      const end = Math.min(start + size, to)
      /* v8 ignore next -- the loop bound keeps `to` at or past `start`, so the clamp can never move the range backwards. */
      if (end < start) return
      budget.left -= 1
      if (id === 'LIST' || id === 'RIFF') {
        visit(start + 4, end, depth + 1, budget)
      } else if (id === 'strh') {
        const kind = fourcc(bytes, start)
        const handler = fourcc(bytes, start + 4)
        lastStream = kind === 'vids' ? 'video' : kind === 'auds' ? 'audio' : undefined
        if (lastStream !== undefined) {
          tracks.push({ kind: lastStream, id: handler, name: codecName(handler.trim()) })
        }
      } else if (id === 'strf' && lastStream === 'video') {
        const picture = dibPictureSize(bytes, start)
        if (picture !== undefined) {
          width ??= picture.width
          height ??= picture.height
        }
      } else if (id === 'avih') {
        // The frame interval is in microseconds and the frame count is the
        // number of frames, so their product is the file's run time in seconds.
        // `dwTotalFrames` is the fifth field, sixteen bytes in.
        const seconds = uint32le(bytes, start + 16) * uint32le(bytes, start) / 1e6
        if (plausibleDuration(seconds)) durationSeconds = seconds
      }
      // RIFF chunks are word-aligned.
      offset = end + (end % 2)
    }
  }
  visit(12, head, 0, { left: EBML_ELEMENT_BUDGET })
  return {
    container: unsupported('avi'),
    tracks,
    ...(width === undefined ? {} : { width }),
    ...(height === undefined ? {} : { height }),
    ...(durationSeconds === undefined ? {} : { durationSeconds }),
  }
}

/** The ASF stream properties object, which names each stream's media type. */
const ASF_STREAM_PROPERTIES = [0x91, 0x07, 0xdc, 0xb7, 0xb7, 0xa9, 0xcf, 0x11, 0x8e, 0xe6, 0x00, 0xc0, 0x0c, 0x20, 0x53, 0x65]

/** The ASF file properties object, whose play duration and preroll give the run time. */
const ASF_FILE_PROPERTIES = [0xa1, 0xdc, 0xab, 0x8c, 0x47, 0xa9, 0xcf, 0x11, 0x8e, 0xe4, 0x00, 0xc0, 0x0c, 0x20, 0x53, 0x65]

/** The ASF video media type, whose type-specific data opens with a BITMAPINFOHEADER. */
const ASF_VIDEO_MEDIA = [0xc0, 0xef, 0x19, 0xbc, 0x4d, 0x5b, 0xcf, 0x11, 0xa8, 0xfd, 0x00, 0x80, 0x5f, 0x5c, 0x44, 0x2b]

/**
 * Inspect a Windows Media ASF file.
 *
 * The header object opens with the file properties, which state the run time,
 * and goes on to one stream properties object per stream, whose media type says
 * what that stream carries. For video the media type's type-specific data is a
 * `VIDEOINFOHEADER`, and its `biCompression` field is the codec's
 * four-character code.
 *
 * Both numbers are worth the reading. A browser refuses every ASF file, so this
 * container reaches a reader only as an explanation, and an explanation of a
 * `.wmv` that cannot say how big the picture is or how long it runs is missing
 * the two figures that decide whether converting it is worth anyone's time.
 * @param bytes - the complete file.
 * @returns the container, tracks, picture size, and duration.
 */
function inspectAsf(bytes: Uint8Array): VideoInfo {
  const tracks: VideoTrack[] = []
  let width: number | undefined
  let height: number | undefined
  let durationSeconds: number | undefined
  const head = Math.min(bytes.byteLength, SCAN_BUDGET)
  // The file properties object is a sibling of the stream properties objects
  // rather than a child of one, so the run time is read once, before the walk.
  const file = indexOfBytes(bytes, ASF_FILE_PROPERTIES, 0, head)
  if (file >= 0) {
    // A play duration is in 100-nanosecond units and already includes the
    // preroll the encoder declared, in milliseconds, so a file's run time is the
    // difference. Subtracting it is not a rounding detail: ffmpeg declares a
    // 3.1-second preroll on every WMV it writes, so a one-second clip without
    // the subtraction reports itself as four seconds.
    //
    // The subtraction happens in the header's own units, before the division, so
    // the answer is exact: converting each field to seconds first and then
    // subtracting leaves `4.1 - 3.1` at `0.9999999999999998`, which floors to a
    // clock reading of `0:00` for a one-second file.
    const played = uint32le(bytes, file + 64) + uint32le(bytes, file + 68) * 0x100000000
    const preroll = uint32le(bytes, file + 80) + uint32le(bytes, file + 84) * 0x100000000
    const seconds = (played - preroll * 10_000) / 1e7
    if (plausibleDuration(seconds)) durationSeconds = seconds
  }
  // A stream properties object is its GUID, its size, the stream type GUID, the
  // error-correction GUID, a time offset, two lengths, flags, and a reserved
  // field; the type-specific data follows at a fixed offset.
  const TYPE_SPECIFIC = 78
  let from = 0
  while (tracks.length === 0) {
    const properties = indexOfBytes(bytes, ASF_STREAM_PROPERTIES, from, head)
    if (properties < 0) break
    from = properties + 16
    // The stream type GUID sits inside the object's fixed header; reading it is
    // what separates a video stream from an audio one.
    if (indexOfBytes(bytes, ASF_VIDEO_MEDIA, properties + 16, Math.min(properties + TYPE_SPECIFIC, head)) < 0) continue
    // The four-character code is taken as the first run of printable characters
    // rather than at a fixed offset, because producers pad the `VIDEOINFOHEADER`
    // differently. ASF is little-endian, so the object's declared data length is
    // read the same way the RIFF chunk sizes are.
    const dataLength = uint32le(bytes, properties + 64)
    const dataStart = properties + TYPE_SPECIFIC
    const dataEnd = Math.min(dataStart + Math.max(16, Math.min(dataLength, 256)), head)
    for (let at = dataStart; at + 4 <= dataEnd; at += 1) {
      const candidate = fourcc(bytes, at)
      if (/^[\x20-\x7e]{4}$/u.test(candidate) && candidate.trim() !== '') {
        const codec = candidate.trim()
        tracks.push({ kind: 'video', id: codec, name: codecName(codec) })
        // `biCompression` is sixteen bytes into the `BITMAPINFOHEADER`, so the
        // width and the height sit twelve and eight bytes before the code. That
        // relationship is what survives the padding a fixed offset would not.
        const picture = dibPictureSize(bytes, at - 16)
        if (picture !== undefined) {
          width = picture.width
          height = picture.height
        }
        break
      }
    }
  }
  return {
    container: unsupported('asf'),
    tracks,
    ...(width === undefined ? {} : { width }),
    ...(height === undefined ? {} : { height }),
    ...(durationSeconds === undefined ? {} : { durationSeconds }),
  }
}

/** FLV codec ids this preview names. */
const FLV_CODECS: Readonly<Record<number, string | undefined>> = {
  2: 'Sorenson H.263', 3: 'Screen video', 4: 'VP6', 5: 'VP6 alpha', 6: 'Screen video 2', 7: 'H.264',
}

/**
 * Inspect a Flash Video file.
 *
 * The first video tag's codec id lives in the low nibble of its payload's first
 * byte. Tags are walked by their declared size rather than scanned for, because
 * a byte-at-a-time search over a media file is a main-thread stall that reports
 * nothing a correct walk does not.
 * @param bytes - the complete file.
 * @returns the container and tracks.
 */
function inspectFlv(bytes: Uint8Array): VideoInfo {
  const tracks: VideoTrack[] = []
  const head = Math.min(bytes.byteLength, SCAN_BUDGET)
  // The FLV header is nine bytes and its preceding-tag-size field four, so the
  // first tag starts at thirteen.
  let offset = 13
  for (let visited = 0; visited < FLV_TAG_BUDGET && offset + 11 <= head; visited += 1) {
    const type = byteAt(bytes, offset)
    const size = uint24(bytes, offset + 1)
    if (type === 9) {
      const codec = byteAt(bytes, offset + 11) & 0x0f
      const name = FLV_CODECS[codec]
      if (name !== undefined) tracks.push({ kind: 'video', id: `flv${codec}`, name })
      break
    }
    offset += 11 + size + 4
  }
  return { container: unsupported('flv'), tracks }
}

/** The Theora identification header's magic, which opens with a byte no character decoder preserves. */
const THEORA_MAGIC = [0x80, 0x74, 0x68, 0x65, 0x6f, 0x72, 0x61]

/** The Daala identification header's magic, which opens with the same 0x80 prefix. */
const DAALA_MAGIC = [0x80, 0x64, 0x61, 0x61, 0x6c, 0x61]

/**
 * Inspect an Ogg file for the codec its first page carries.
 *
 * The Xiph codecs whose magic starts with `0x80` are matched against the bytes,
 * not against a decoded string. `latin1` is not ISO-8859-1 under the WHATWG
 * encoding standard — it is windows-1252, where byte `0x80` is U+20AC — so
 * searching the decoded text for the Theora magic can never match, which is what
 * silently cost every Theora file its picture size.
 * @param bytes - the complete file.
 * @returns the container and tracks.
 */
function inspectOgg(bytes: Uint8Array): VideoInfo {
  const tracks: VideoTrack[] = []
  const limit = Math.min(bytes.byteLength, 4096)
  const text = new TextDecoder('latin1').decode(bytes.subarray(0, limit))
  const theora = indexOfBytes(bytes, THEORA_MAGIC, 0, limit)
  if (theora >= 0) tracks.push({ kind: 'video', id: 'theora', name: 'Theora' })
  for (const [magic, name] of [['vorbis', 'Vorbis'], ['OpusHead', 'Opus'], ['fLaC', 'FLAC'], ['Speex', 'Speex']] as const) {
    if (text.includes(magic)) tracks.push({ kind: 'audio', id: magic, name })
  }
  if (indexOfBytes(bytes, DAALA_MAGIC, 0, limit) >= 0) tracks.push({ kind: 'video', id: 'daala', name: 'Daala' })
  // Theora's identification header carries the picture size as two 24-bit
  // big-endian fields, after the magic and three version bytes. A header cut
  // short declares zero, which is not a size — reporting it would put "0 × 0"
  // in the metadata list for a file that never declared a picture.
  const width = theora < 0 ? 0 : uint24(bytes, theora + 14)
  const height = theora < 0 ? 0 : uint24(bytes, theora + 17)
  return {
    container: OGG,
    tracks,
    ...(width === 0 ? {} : { width }),
    ...(height === 0 ? {} : { height }),
  }
}

/**
 * The first byte of a transport stream packet's PSI section, or -1 when the
 * packet begins none.
 *
 * A section starts only in the packet that sets the payload-start flag; every
 * other packet carrying the same PID holds the middle of a section, so reading
 * its payload as a header would invent a table the file does not contain. When
 * the flag is set, one pointer byte gives the offset from the end of the header
 * to the section, so the section does not always begin where the header ends.
 * @param bytes - the complete file.
 * @param packetOffset - the packet's first byte, which must be the sync byte.
 * @returns the section's first byte, or -1 when this packet begins no section.
 */
function sectionStart(bytes: Uint8Array, packetOffset: number): number {
  if ((byteAt(bytes, packetOffset + 1) & 0x40) === 0) return -1
  const afterHeader = packetOffset + 4
  return afterHeader + 1 + byteAt(bytes, afterHeader)
}

/** Transport stream types that carry pictures, so the track kind is not guessed from its name. */
const TS_VIDEO_TYPES = new Set([0x01, 0x02, 0x10, 0x1b, 0x24, 0x2d, 0x42, 0xd1, 0xea])

/** MPEG transport stream stream types, by PMT stream_type code. */
const TS_STREAM_TYPES: Readonly<Record<number, string | undefined>> = {
  0x01: 'MPEG-1 Video', 0x02: 'MPEG-2 Video', 0x03: 'MPEG-1 Audio', 0x04: 'MPEG-2 Audio',
  0x0f: 'AAC (ADTS)', 0x10: 'MPEG-4 Visual', 0x11: 'AAC (LATM)', 0x1b: 'H.264', 0x24: 'H.265/HEVC',
  0x2d: 'AV1', 0x81: 'AC-3', 0x87: 'E-AC-3', 0x06: 'private data',
}

/**
 * Inspect an MPEG transport stream by reading its program map table.
 *
 * Two framings are in the wild and both are covered, because a suffix this
 * preview claims has to reach a reader that can actually answer for it: a plain
 * `.ts` writes bare 188-byte packets, while M2TS/BDAV — the framing a camcorder
 * or a Blu-ray rip carries under the `.m2ts` extension — prefixes each packet
 * with a four-byte arrival timestamp. The sync byte therefore sits 188 bytes
 * from the end of the frame, not at its start.
 * @param bytes - the complete file.
 * @param frameSize - the frame's length: 188 for a bare packet, 192 for M2TS.
 * @returns the container and tracks.
 */
function inspectMpegTs(bytes: Uint8Array, frameSize: number): VideoInfo {
  const tracks: VideoTrack[] = []
  const packet = 188
  const firstSync = frameSize - packet
  const head = Math.min(bytes.byteLength, SCAN_BUDGET)
  // Find the program association table, then the first program's map table.
  let pmtPid = -1
  for (let offset = firstSync; offset + packet <= head; offset += frameSize) {
    if (bytes[offset] !== 0x47) continue
    const pid = ((byteAt(bytes, offset + 1) & 0x1f) << 8) | byteAt(bytes, offset + 2)
    if (pid !== 0) continue
    const start = sectionStart(bytes, offset)
    if (start < 0) continue
    if (start + 12 > head) break
    pmtPid = ((byteAt(bytes, start + 10) & 0x1f) << 8) | byteAt(bytes, start + 11)
    break
  }
  if (pmtPid >= 0) {
    for (let offset = firstSync; offset + packet <= head; offset += frameSize) {
      if (bytes[offset] !== 0x47) continue
      const pid = ((byteAt(bytes, offset + 1) & 0x1f) << 8) | byteAt(bytes, offset + 2)
      if (pid !== pmtPid) continue
      const at = sectionStart(bytes, offset)
      if (at < 0) continue
      const programInfoLength = ((byteAt(bytes, at + 10) & 0x0f) << 8) | byteAt(bytes, at + 11)
      let cursor = at + 12 + programInfoLength
      const end = Math.min(offset + packet, head)
      while (cursor + 5 <= end) {
        const type = byteAt(bytes, cursor)
        const elementaryLength = ((byteAt(bytes, cursor + 3) & 0x0f) << 8) | byteAt(bytes, cursor + 4)
        const name = TS_STREAM_TYPES[type]
        if (name !== undefined && type !== 0x06) {
          tracks.push({ kind: TS_VIDEO_TYPES.has(type) ? 'video' : 'audio', id: `0x${type.toString(16)}`, name })
        }
        cursor += 5 + elementaryLength
      }
      break
    }
  }
  return { container: MPEG_TS, tracks }
}

/** The MXF key prefix, which every Material Exchange Format file opens with. */
const MXF_KEY = [0x06, 0x0e, 0x2b, 0x34, 0x02, 0x05, 0x01, 0x01, 0x0d, 0x01, 0x02]

/**
 * Identify a video file and read the tracks it carries.
 *
 * Total by construction: every read is bounds-guarded and every walk is bounded,
 * so no byte sequence makes this throw. A caller therefore needs no defensive
 * catch, and a damaged file reaches the reader as an explanation instead.
 * @param bytes - the complete file.
 * @param extension - the suffix, used only when the bytes are inconclusive.
 * @returns what this preview learned, or undefined when nothing identifies the file.
 */
export function inspectVideo(bytes: Uint8Array, extension: string): VideoInfo | undefined {
  const signature = detectVideoSignature(bytes)
  if (signature !== undefined) return signature
  // Nothing matched, so fall back to what the suffix claimed and say so plainly.
  const suffix = extension.toLowerCase()
  const bySuffix = VIDEO_SUFFIXES[suffix]
  return bySuffix === undefined ? undefined : bySuffix(bytes)
}

/** A suffix this preview claims, and how it is identified when the bytes are silent. */
const VIDEO_SUFFIXES: Readonly<Record<string, ((bytes: Uint8Array) => VideoInfo) | undefined>> = {
  mp4: () => ({ container: ISO_BMFF, tracks: [] }),
  m4v: () => ({ container: ISO_BMFF, tracks: [] }),
  mp4v: () => ({ container: ISO_BMFF, tracks: [] }),
  mov: () => ({ container: ISO_BMFF, tracks: [] }),
  qt: () => ({ container: ISO_BMFF, tracks: [] }),
  '3gp': () => ({ container: ISO_BMFF, tracks: [] }),
  '3g2': () => ({ container: ISO_BMFF, tracks: [] }),
  f4v: () => ({ container: ISO_BMFF, tracks: [] }),
  webm: () => ({ container: MATROSKA, tracks: [] }),
  mkv: () => ({ container: MATROSKA, tracks: [] }),
  ogv: () => ({ container: OGG, tracks: [] }),
  ogg: () => ({ container: OGG, tracks: [] }),
  m2ts: () => ({ container: MPEG_TS, tracks: [] }),
  avi: inspectAvi,
  divx: inspectAvi,
  wmv: inspectAsf,
  asf: inspectAsf,
  wm: inspectAsf,
  flv: inspectFlv,
  mpg: () => ({ container: unsupported('mpeg-ps'), tracks: [] }),
  mpeg: () => ({ container: unsupported('mpeg-ps'), tracks: [] }),
  mpe: () => ({ container: unsupported('mpeg-ps'), tracks: [] }),
  m2v: () => ({ container: unsupported('mpeg-ps'), tracks: [] }),
  mpv: () => ({ container: unsupported('mpeg-ps'), tracks: [] }),
  m1v: () => ({ container: unsupported('mpeg-ps'), tracks: [] }),
  vob: () => ({ container: unsupported('mpeg-ps'), tracks: [] }),
  rm: () => ({ container: unsupported('realmedia'), tracks: [] }),
  rmvb: () => ({ container: unsupported('realmedia'), tracks: [] }),
  dv: () => ({ container: unsupported('dv'), tracks: [] }),
  mxf: () => ({ container: unsupported('mxf'), tracks: [] }),
  roq: () => ({ container: unsupported('roq'), tracks: [] }),
}

/**
 * Identify a file from its leading bytes alone.
 * @param bytes - the complete file.
 * @returns what identification found, or undefined when no signature matched.
 */
function detectVideoSignature(bytes: Uint8Array): VideoInfo | undefined {
  if (bytes.byteLength < 12) return undefined
  if (matches(bytes, 4, 'ftyp') || matches(bytes, 4, 'moov') || matches(bytes, 4, 'mdat') || matches(bytes, 4, 'free')) {
    return inspectIsoBmff(bytes)
  }
  if (bytes[0] === 0x1a && bytes[1] === 0x45 && bytes[2] === 0xdf && bytes[3] === 0xa3) return inspectMatroska(bytes)
  if (matches(bytes, 0, 'RIFF') && matches(bytes, 8, 'AVI ')) return inspectAvi(bytes)
  if (matches(bytes, 0, 'OggS')) return inspectOgg(bytes)
  if (matches(bytes, 0, 'FLV')) return inspectFlv(bytes)
  if (matches(bytes, 0, '.RMF')) return { container: unsupported('realmedia'), tracks: [] }
  if (bytes[0] === 0x47 && bytes[188] === 0x47) return inspectMpegTs(bytes, 188)
  // M2TS/BDAV: the same packets behind a four-byte arrival timestamp, so the
  // first two sync bytes are at 4 and 196 rather than at 0 and 188.
  if (bytes[4] === 0x47 && bytes[196] === 0x47) return inspectMpegTs(bytes, 192)
  // MXF carries no ASCII marker: every file opens with the same SMPTE key.
  if (indexOfBytes(bytes, MXF_KEY, 0, MXF_KEY.length) === 0) return { container: unsupported('mxf'), tracks: [] }
  // A DV frame opens with 1F 07 00 (IEC 61834) or 1F 07 01 (SMPTE 314M). The
  // length guard above already covers the third byte.
  if (bytes[0] === 0x1f && bytes[1] === 0x07 && (bytes[2] & 0xfe) === 0) {
    return { container: unsupported('dv'), tracks: [] }
  }
  if (bytes[0] === 0x00 && bytes[1] === 0x00 && bytes[2] === 0x01 && bytes[3] === 0xba) {
    return { container: unsupported('mpeg-ps'), tracks: [] }
  }
  if (bytes[0] === 0x00 && bytes[1] === 0x00 && bytes[2] === 0x01 && bytes[3] === 0xb3) {
    return { container: unsupported('mpeg-es'), tracks: [] }
  }
  // ASF has no fixed offset: the stream properties GUID is the first reliable
  // marker, and only the head is searched for it.
  if (indexOfBytes(bytes, ASF_STREAM_PROPERTIES, 0, Math.min(bytes.byteLength, SCAN_BUDGET)) >= 0) return inspectAsf(bytes)
  return undefined
}

/**
 * Why this file cannot be played, if anything about it already says so.
 *
 * The single decision point for playback: identification knows the container and
 * the codecs before the element is asked, so an unplayable file is explained
 * from its own bytes rather than retried into a numeric media error.
 * @param info - what identification found.
 * @returns the obstacle and the level its sentence belongs at, or undefined when
 * playback should be attempted.
 */
export function playbackObstacle(info: VideoInfo): VideoObstacle | undefined {
  // The union carries the reason on every unsupported container, so this arm
  // needs no fallback sentence.
  if (info.container.delivery === 'unsupported') return { level: 'container', reason: info.container.reason }
  for (const track of info.tracks) {
    const reason = reasonFor(track.id)
    if (reason !== undefined) return { level: 'codec', reason }
  }
  // A container the platform handles can still carry a codec it does not, and
  // the codec is not always one with its own table entry: a Matroska file
  // declaring an MPEG-4 Visual codec is mislabelled for WebM.
  if (info.container.key === 'matroska'
    && info.tracks.some(track => /^(?:v_ms|v_mpeg4\/iso\/asp)/u.test(track.id.toLowerCase()))) {
    return { level: 'codec', reason: 'matroskaCodec' }
  }
  // An M4V that declares no track at all is usually an audio-only Apple file,
  // which the video element cannot play.
  if (info.container.key === 'm4v' && info.tracks.length === 0) return { level: 'codec', reason: 'noTrack' }
  return undefined
}

/**
 * Whether the platform should be asked to play this file.
 * @param info - what identification found.
 * @returns true when the player should attempt playback.
 */
export function shouldAttemptPlayback(info: VideoInfo): boolean {
  return playbackObstacle(info) === undefined
}

/**
 * The structured summary the metadata list renders.
 *
 * Only the container and codec names cross this boundary; how many audio tracks
 * a file declares is a count, and the sentence around it belongs to the
 * dictionary, where it can inflect for the locale.
 * @param info - what identification found.
 * @returns the container, the video codec, and the audio-track count.
 */
export function summarizeTracks(info: VideoInfo): VideoTrackSummary {
  const video = info.tracks.find(track => track.kind === 'video')
  return {
    container: info.container.name,
    // A track the container described without naming its codec — a Matroska
    // entry that declares a `TrackType` and never a `CodecID` — has nothing to
    // put in this field. Absent is what the body reads as "unknown"; an empty
    // string renders as a label with nothing after it, which reads as a broken
    // list rather than as an unnamed codec.
    ...(video === undefined || video.name === '' ? {} : { codec: video.name }),
    audioTracks: info.tracks.filter(track => track.kind === 'audio').length,
  }
}
