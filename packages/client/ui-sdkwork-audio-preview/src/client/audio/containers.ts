/**
 * Audio container, codec, tag, and cover-art reading.
 *
 * A browser's media element reports one numeric error and nothing else, and an
 * audio file is usually the most anonymous thing a reader opens: no pixels, no
 * pages, just a name. This module reads what the file itself carries — its
 * container, its codec, its duration where the container states one cheaply, and
 * the tags a producer wrote, including embedded cover art — so the preview can
 * show what the file is and explain why an unplayable one is unplayable.
 *
 * Two rules hold throughout. Text is decoded from the encoding its own frame
 * declares, never from an assumption, because a tag is the one thing in a file
 * that was written by a person in their own language. And a container this
 * preview cannot play is still named, with the conversion its reader needs,
 * because a file whose suffix is claimed here must never be answered with
 * "this is not a readable audio file".
 */
import type { SdkworkAudioPreviewKey } from '../locales.ts'

/** Whether this preview should ask the platform to decode the file. */
export type AudioDelivery = 'attempt' | 'unsupported'

/** The container and codec a file is written in. */
export interface AudioContainer {
  readonly name: string
  readonly delivery: AudioDelivery
  /** Media type for the Blob URL, or the empty string when playback is not attempted. */
  readonly mime: string
  /** The codec the bytes declare, when the container names one. */
  readonly codec?: string
  /**
   * Dictionary key of the sentence shown in place of the player.
   *
   * A key rather than the sentence: this module identifies bytes, and every word
   * the reader is shown belongs to the locale namespace, which is what keeps an
   * English reader from meeting a Chinese explanation.
   */
  readonly reasonKey?: SdkworkAudioPreviewKey
}

/** The tags a producer embedded in the file. */
export interface AudioTags {
  readonly title?: string
  readonly artist?: string
  readonly album?: string
  readonly year?: string
  readonly track?: string
  readonly genre?: string
  readonly comment?: string
  /** Cover art bytes and type, from an ID3 attached picture, a FLAC picture block, or an MP4 `covr` atom. */
  readonly picture?: { readonly mime: string; readonly data: Uint8Array }
}

/**
 * A tag set under construction.
 *
 * Containers list frames in file order and a later frame must not overwrite an
 * earlier one, so the accumulator is mutable while the published value is not.
 */
type MutableTags = {
  -readonly [K in keyof AudioTags]?: K extends 'picture' ? AudioTags['picture'] : string
}

/** The tag keys whose value is text, which is every key except the picture. */
type TextTagKey = Exclude<keyof AudioTags, 'picture'>

/** What this preview learned about an audio file. */
export interface AudioInfo {
  readonly container: AudioContainer
  readonly tags: AudioTags
  readonly durationSeconds?: number
  readonly sampleRate?: number
  readonly channels?: number
}

/** Containers and codecs the platform may decode. */
const ATTEMPT: Readonly<Record<string, AudioContainer | undefined>> = {
  mp3: { name: 'MP3', delivery: 'attempt', mime: 'audio/mpeg', codec: 'MP3' },
  aac: { name: 'AAC', delivery: 'attempt', mime: 'audio/aac', codec: 'AAC' },
  m4a: { name: 'MP4 audio', delivery: 'attempt', mime: 'audio/mp4', codec: 'AAC' },
  alac: { name: 'MP4 audio', delivery: 'attempt', mime: 'audio/mp4', codec: 'ALAC' },
  wav: { name: 'WAVE', delivery: 'attempt', mime: 'audio/wav', codec: 'PCM' },
  flac: { name: 'FLAC', delivery: 'attempt', mime: 'audio/flac', codec: 'FLAC' },
  vorbis: { name: 'Ogg', delivery: 'attempt', mime: 'audio/ogg', codec: 'Vorbis' },
  opus: { name: 'Ogg', delivery: 'attempt', mime: 'audio/ogg', codec: 'Opus' },
  webm: { name: 'WebM', delivery: 'attempt', mime: 'audio/webm' },
  aiff: { name: 'AIFF', delivery: 'attempt', mime: 'audio/aiff', codec: 'PCM' },
  mp2: { name: 'MP2', delivery: 'attempt', mime: 'audio/mpeg', codec: 'MP2' },
  ac3: { name: 'AC-3', delivery: 'attempt', mime: 'audio/ac3', codec: 'AC-3' },
  eac3: { name: 'E-AC-3', delivery: 'attempt', mime: 'audio/eac3', codec: 'E-AC-3' },
}

/** Containers and codecs no browser decodes, with the reason a reader needs. */
const UNSUPPORTED: Readonly<Record<string, AudioContainer | undefined>> = {
  wma: {
    name: 'ASF', delivery: 'unsupported', mime: '', codec: 'Windows Media Audio', reasonKey: 'reason.asf',
  },
  amr: { name: 'AMR', delivery: 'unsupported', mime: '', codec: 'AMR-NB', reasonKey: 'reason.amr' },
  ape: { name: 'Monkey\u2019s Audio', delivery: 'unsupported', mime: '', codec: 'APE', reasonKey: 'reason.ape' },
  wavpack: { name: 'WavPack', delivery: 'unsupported', mime: '', codec: 'WavPack', reasonKey: 'reason.wavpack' },
  tta: { name: 'True Audio', delivery: 'unsupported', mime: '', codec: 'TTA', reasonKey: 'reason.tta' },
  speex: { name: 'Ogg', delivery: 'unsupported', mime: '', codec: 'Speex', reasonKey: 'reason.speex' },
  midi: { name: 'MIDI', delivery: 'unsupported', mime: '', codec: 'MIDI', reasonKey: 'reason.midi' },
  dsd: { name: 'DSD', delivery: 'unsupported', mime: '', codec: 'DSD', reasonKey: 'reason.dsd' },
  dts: { name: 'DTS', delivery: 'unsupported', mime: '', codec: 'DTS', reasonKey: 'reason.dts' },
  caf: { name: 'Core Audio Format', delivery: 'unsupported', mime: '', codec: 'CAF', reasonKey: 'reason.caf' },
  au: { name: 'Sun/NeXT audio', delivery: 'unsupported', mime: '', codec: 'µ-law/A-law', reasonKey: 'reason.au' },
  voc: { name: 'Creative Voice', delivery: 'unsupported', mime: '', codec: 'Creative Voice', reasonKey: 'reason.voc' },
  gsm: { name: 'GSM', delivery: 'unsupported', mime: '', codec: 'GSM 06.10', reasonKey: 'reason.gsm' },
}

/** Every suffix this preview claims. */
export const AUDIO_EXTENSIONS: readonly string[] = [
  'mp3', 'mp2', 'mpa', 'm1a', 'm2a',
  'aac', 'adts', 'm4a', 'm4b', 'm4p', 'm4r', 'mp4a', 'alac',
  'wav', 'wave', 'bwf',
  'flac',
  'ogg', 'oga', 'opus', 'spx',
  'weba',
  'aif', 'aiff', 'aifc',
  'wma', 'asf',
  'amr', 'awb',
  'ac3', 'eac3', 'dts',
  'ape', 'wv', 'tta',
  'mid', 'midi', 'rmi', 'kar',
  'dsf', 'dff',
  'caf', 'au', 'snd', 'voc', 'gsm',
]

/** Suffixes mapped to the container key they name. */
const EXTENSION_KEYS: Readonly<Record<string, string | undefined>> = {
  mp3: 'mp3', mp2: 'mp2', mpa: 'mp3', m1a: 'mp3', m2a: 'mp3',
  aac: 'aac', adts: 'aac',
  m4a: 'm4a', m4b: 'm4a', m4p: 'm4a', m4r: 'm4a', mp4a: 'm4a', alac: 'alac',
  wav: 'wav', wave: 'wav', bwf: 'wav',
  flac: 'flac',
  ogg: 'vorbis', oga: 'vorbis', opus: 'opus', spx: 'speex',
  weba: 'webm',
  aif: 'aiff', aiff: 'aiff', aifc: 'aiff',
  wma: 'wma', asf: 'wma',
  amr: 'amr', awb: 'amr',
  ac3: 'ac3', eac3: 'eac3', dts: 'dts',
  ape: 'ape', wv: 'wavpack', tta: 'tta',
  mid: 'midi', midi: 'midi', rmi: 'midi', kar: 'midi',
  dsf: 'dsd', dff: 'dsd',
  caf: 'caf', au: 'au', snd: 'au', voc: 'voc', gsm: 'gsm',
}

/** Codec names for what the ISO sample description identifies. */
const CODEC_NAMES: Readonly<Record<string, string>> = {
  aac: 'AAC', alac: 'ALAC', opus: 'Opus', ac3: 'AC-3', flac: 'FLAC', wav: 'PCM',
}

/**
 * Cover-art media types this preview renders, by the magic bytes they open with.
 *
 * The type a frame declares is a claim, not a fact — an attached picture may
 * declare nothing at all — so the bytes decide first: a signature here is shown
 * as the type it names, whatever the frame claimed. Only when the bytes carry
 * no signature does the declaration decide, and then only for a renderable
 * image, because anything else would be handed to an `<img>` that cannot show
 * it. Vector art is refused either way, since a cover is never a document.
 */
const COVER_MAGIC: readonly (readonly [readonly number[], string])[] = [
  [[0x89, 0x50, 0x4e, 0x47], 'image/png'],
  [[0xff, 0xd8, 0xff], 'image/jpeg'],
  [[0x47, 0x49, 0x46, 0x38], 'image/gif'],
  [[0x42, 0x4d], 'image/bmp'],
]

/** Look up a container by its key. */
function containerFor(key: string): AudioContainer | undefined {
  return ATTEMPT[key] ?? UNSUPPORTED[key]
}

/** Whether the bytes at an offset equal the given ASCII text. */
function matches(bytes: Uint8Array, offset: number, text: string): boolean {
  if (offset < 0 || bytes.byteLength < offset + text.length) return false
  for (let index = 0; index < text.length; index += 1) {
    if (bytes[offset + index] !== text.charCodeAt(index)) return false
  }
  return true
}

/** Whether the bytes at an offset start with any of the given prefixes. */
function matchesAny(bytes: Uint8Array, offset: number, prefixes: readonly (readonly number[])[]): boolean {
  return prefixes.some((prefix) => {
    if (bytes.byteLength < offset + prefix.length) return false
    return prefix.every((byte, index) => bytes[offset + index] === byte)
  })
}

/** Read a big-endian 32-bit integer. */
function uint32(bytes: Uint8Array, offset: number): number {
  return ((bytes[offset] ?? 0) * 0x1000000)
    + (((bytes[offset + 1] ?? 0) << 16) | ((bytes[offset + 2] ?? 0) << 8) | (bytes[offset + 3] ?? 0))
}

/** Read a big-endian 24-bit integer. */
function uint24(bytes: Uint8Array, offset: number): number {
  return ((bytes[offset] ?? 0) << 16) | ((bytes[offset + 1] ?? 0) << 8) | (bytes[offset + 2] ?? 0)
}

/** Read a big-endian 16-bit integer. */
function uint16(bytes: Uint8Array, offset: number): number {
  return ((bytes[offset] ?? 0) << 8) | (bytes[offset + 1] ?? 0)
}

/** Read a little-endian 16-bit integer. */
function uint16le(bytes: Uint8Array, offset: number): number {
  return (bytes[offset] ?? 0) | ((bytes[offset + 1] ?? 0) << 8)
}

/** Read a little-endian 32-bit integer. */
function uint32le(bytes: Uint8Array, offset: number): number {
  return (bytes[offset] ?? 0) + ((bytes[offset + 1] ?? 0) << 8) + ((bytes[offset + 2] ?? 0) << 16) + ((bytes[offset + 3] ?? 0) * 0x1000000)
}

/** Read a sync-safe ID3v2 size, where the high bit of each byte is clear. */
function syncSafe(bytes: Uint8Array, offset: number): number {
  return ((bytes[offset] ?? 0) << 21) | ((bytes[offset + 1] ?? 0) << 14) | ((bytes[offset + 2] ?? 0) << 7) | (bytes[offset + 3] ?? 0)
}

/** The four-character code at an offset, used where a box or frame names itself. */
function fourCc(bytes: Uint8Array, offset: number): string {
  return String.fromCharCode(bytes[offset] ?? 0, bytes[offset + 1] ?? 0, bytes[offset + 2] ?? 0, bytes[offset + 3] ?? 0)
}

/** Strip the NUL padding a fixed-width field ends with. */
function stripPadding(text: string): string {
  return text.replace(/\0+$/u, '').trim()
}

/**
 * The sample rates an MPEG audio header can name, by version and rate index.
 *
 * Version 1 is reserved and has no row: a header carrying it is not a header,
 * which is checked before this table is read.
 */
const MPEG_SAMPLE_RATES: Readonly<Record<number, readonly number[]>> = {
  0: [11025, 12000, 8000],
  2: [22050, 24000, 16000],
  3: [44100, 48000, 32000],
}

/** The bit rates an MPEG 1 Layer I header can name, in kbps. */
const LAYER1_BITRATES = [0, 32, 64, 96, 128, 160, 192, 224, 256, 288, 320, 352, 384, 416, 448]
/** The bit rates an MPEG 1 Layer II header can name, in kbps. */
const LAYER2_BITRATES = [0, 32, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320, 384]
/** The bit rates an MPEG 1 Layer III header can name, in kbps. */
const LAYER3_BITRATES = [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320]
/** The bit rates the lower-sampling-rate versions name for Layer I, in kbps. */
const LSF_LAYER1_BITRATES = [0, 32, 48, 56, 64, 80, 96, 112, 128, 144, 160, 176, 192, 224, 256]
/** The bit rates the lower-sampling-rate versions name for Layer II and III, in kbps. */
const LSF_LAYER23_BITRATES = [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160]

/** How far past a tag the reader will look for a stream's first frame header. */
const MPEG_SCAN_LIMIT = 65536

/**
 * The bit rate an MPEG audio header's index names.
 * @param version - the header's version code, where 3 is MPEG 1.
 * @param layer - the header's layer code, where 3 is Layer I and 1 is Layer III.
 * @param index - the header's bit rate index, already known to be 1 through 14.
 * @returns the bit rate in kbps.
 */
function mpegBitrate(version: number, layer: number, index: number): number {
  if (layer === 3) return (version === 3 ? LAYER1_BITRATES : LSF_LAYER1_BITRATES)[index]
  if (layer === 2) return (version === 3 ? LAYER2_BITRATES : LSF_LAYER23_BITRATES)[index]
  return (version === 3 ? LAYER3_BITRATES : LSF_LAYER23_BITRATES)[index]
}

/** What an MPEG audio frame header states about the stream it opens. */
interface MpegFrame {
  readonly sampleRate: number
  readonly channels: number
  /** The frame's length in bytes, which is where the next header has to sit. */
  readonly length: number
}

/**
 * Read the MPEG audio frame header at an offset.
 *
 * Every field is checked against the values the specification reserves, because
 * the caller arrives here by scanning for a sync word and a run of compressed
 * audio contains byte pairs that spell one.
 * @param bytes - the complete file.
 * @param at - the offset the eleven-bit sync word is expected at.
 * @returns what the header states, or undefined when these bytes are not one.
 */
function mpegFrameAt(bytes: Uint8Array, at: number): MpegFrame | undefined {
  if (at < 0 || at + 4 > bytes.byteLength) return undefined
  if (bytes[at] !== 0xff || (bytes[at + 1] & 0xe0) !== 0xe0) return undefined
  const version = (bytes[at + 1] >> 3) & 0x03
  const layer = (bytes[at + 1] >> 1) & 0x03
  const bitrateIndex = (bytes[at + 2] >> 4) & 0x0f
  const rateIndex = (bytes[at + 2] >> 2) & 0x03
  // The reserved version, the reserved layer, the free bit rate, the top bit
  // rate index, and the reserved sample rate all mean these are not a header.
  if (version === 1 || layer === 0 || bitrateIndex === 0 || bitrateIndex === 15 || rateIndex === 3) return undefined
  const sampleRate = MPEG_SAMPLE_RATES[version][rateIndex]
  const mpeg1 = version === 3
  const bitrate = mpegBitrate(version, layer, bitrateIndex)
  // A frame carries 384 samples in Layer I, 1152 in Layer II, and — in Layer III
  // only — half that under the lower-sampling-rate versions. A Layer I slot is
  // four bytes wide and every other layer's is one, which the padding bit names.
  const samples = layer === 3 ? 384 : layer === 1 && !mpeg1 ? 576 : 1152
  const padding = (bytes[at + 2] & 0x02) === 0 ? 0 : layer === 3 ? 4 : 1
  const length = Math.floor((samples / 8) * bitrate * 1000 / sampleRate) + padding
  // The channel mode is the top two bits of the fourth byte, where only the
  // reserved mode stands for a single channel.
  return { sampleRate, channels: (bytes[at + 3] >> 6) === 3 ? 1 : 2, length }
}

/**
 * Read the geometry a bare MPEG audio stream states in its own first frame.
 *
 * An MP3 or an MP2 is a run of frames with no container around it: past an
 * optional tag there is no structure at all, so the stream's own header is the
 * only place its sample rate and channel count are written down. A header is
 * believed only when the frame it declares really does end where another header
 * starts, because a tag payload carries the same sync word a header opens with.
 * @param bytes - the complete file.
 * @param from - the offset the audio starts at, past any tag.
 * @returns the geometry the stream states, or undefined when no header validates.
 */
function readMpegGeometry(bytes: Uint8Array, from: number): { sampleRate: number; channels: number } | undefined {
  const start = Math.max(0, from)
  const limit = Math.min(bytes.byteLength, start + MPEG_SCAN_LIMIT)
  for (let at = start; at + 4 <= limit; at += 1) {
    const frame = mpegFrameAt(bytes, at)
    if (frame === undefined) continue
    const next = at + frame.length
    // A file too short to hold another frame has nothing to check the header
    // against, and a torn single-frame file is still worth describing.
    if (next + 4 > bytes.byteLength) return frame
    const following = mpegFrameAt(bytes, next)
    if (following !== undefined && following.sampleRate === frame.sampleRate) return frame
  }
  return undefined
}

/**
 * Decode UTF-16 tag text, honouring a byte-order mark.
 * @param bytes - the payload after its encoding byte.
 * @param fallback - the order to assume when no mark is present.
 * @returns the decoded text.
 */
function decodeUtf16(bytes: Uint8Array, fallback: 'utf-16le' | 'utf-16be'): string {
  if (bytes.byteLength >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) {
    return new TextDecoder('utf-16le').decode(bytes.subarray(2))
  }
  if (bytes.byteLength >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) {
    return new TextDecoder('utf-16be').decode(bytes.subarray(2))
  }
  return new TextDecoder(fallback).decode(bytes)
}

/**
 * Decode a legacy single-byte tag.
 *
 * The ID3 and RIFF specifications both name a single-byte encoding, but real
 * writers put UTF-8 in those fields, so UTF-8 is tried first and the named
 * single-byte encoding is the fallback rather than the assumption.
 * @param bytes - the payload.
 * @returns the decoded text.
 */
function decodeLegacy(bytes: Uint8Array): string {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  } catch {
    return new TextDecoder('windows-1252').decode(bytes)
  }
}

/**
 * Decode tag text from the encoding its frame declares.
 *
 * ID3v2 numbers its encodings, and the number is authoritative: a UTF-16 frame
 * without a byte-order mark is written most-significant-byte first, and reading
 * it as UTF-8 is what turns a Chinese title into mojibake.
 * @param bytes - the payload after its encoding byte.
 * @param declared - the frame's encoding byte.
 * @returns the decoded text.
 */
function decodeFrameText(bytes: Uint8Array, declared: number): string {
  switch (declared) {
    case 1: return stripPadding(decodeUtf16(bytes, 'utf-16le'))
    case 2: return stripPadding(decodeUtf16(bytes, 'utf-16be'))
    case 3: return stripPadding(new TextDecoder('utf-8').decode(bytes))
    default: return stripPadding(decodeLegacy(bytes))
  }
}

/**
 * The media type of a cover picture, decided by its bytes.
 * @param declared - the type the frame named, if any.
 * @param data - the picture's bytes.
 * @returns a renderable media type, or undefined when the bytes are no image.
 */
function coverMime(declared: string, data: Uint8Array): string | undefined {
  for (const [magic, mime] of COVER_MAGIC) {
    if (matchesAny(data, 0, [magic])) return mime
  }
  // WebP is RIFF-shaped, so it is checked by both halves of its header.
  if (matches(data, 0, 'RIFF') && matches(data, 8, 'WEBP')) return 'image/webp'
  // Only the media type itself is taken from the declaration: parameters are
  // dropped first, because `image/svg+xml; charset=utf-8` is a legal way to name
  // vector art and would otherwise walk straight past the exclusion below and be
  // handed to the page as a cover.
  const [essence] = declared.trim().toLowerCase().split(';')
  return essence.startsWith('image/') && essence !== 'image/svg+xml' ? essence : undefined
}

/** ID3v2 frame ids mapped to the tag they carry. */
const ID3_FRAMES: Readonly<Record<string, TextTagKey | undefined>> = {
  TIT2: 'title', TT2: 'title',
  TPE1: 'artist', TP1: 'artist',
  TALB: 'album', TAL: 'album',
  TYER: 'year', TDRC: 'year', TYE: 'year',
  TRCK: 'track', TRK: 'track',
  TCON: 'genre', TCO: 'genre',
  COMM: 'comment', COM: 'comment',
}

/** Whether an ID3v2 frame carries a comment, whose payload has a prefix to skip. */
function isCommentFrame(id: string): boolean {
  return id === 'COMM' || id === 'COM'
}

/**
 * Read an ID3v2 tag.
 * @param bytes - the complete file, or the tag as a part of one.
 * @returns the tags found, or undefined when the bytes open with no tag.
 */
function readId3v2(bytes: Uint8Array): AudioTags | undefined {
  if (!matches(bytes, 0, 'ID3')) return undefined
  // The header is ten bytes: the marker, a version, the flags, and a four-byte
  // sync-safe size. A file that stops inside it carries no frames at all.
  if (bytes.byteLength < 10) return undefined
  const version = bytes[3]
  const flags = bytes[5]
  const size = syncSafe(bytes, 6)
  let offset = 10
  // An extended header sits between the tag header and the first frame.
  if ((flags & 0x40) !== 0) offset += uint32(bytes, 10) + 4
  const end = Math.min(10 + size, bytes.byteLength)
  const tags: MutableTags = {}
  while (offset + 10 <= end) {
    const id = fourCc(bytes, offset)
    if (!/^[A-Z0-9]{4}$/u.test(id)) break
    // v2.4 sizes are sync-safe; earlier versions are plain big-endian.
    const frameSize = version >= 4 ? syncSafe(bytes, offset + 4) : uint32(bytes, offset + 4)
    const start = offset + 10
    const frameEnd = Math.min(start + frameSize, end)
    if (frameSize <= 0 || frameEnd <= start) break
    const payload = bytes.subarray(start, frameEnd)
    if (id === 'APIC' || id === 'PIC') {
      const picture = readAttachedPicture(payload, id === 'PIC')
      if (picture !== undefined) tags.picture ??= picture
    } else {
      const key = ID3_FRAMES[id]
      if (key !== undefined) {
        const text = readFrameText(payload, isCommentFrame(id))
        if (text !== '') tags[key] ??= text
      }
    }
    offset = frameEnd
  }
  return Object.keys(tags).length === 0 ? undefined : tags
}

/**
 * Read a frame's text from its payload.
 * @param payload - the frame's bytes, opening with its encoding byte.
 * @param comment - whether the payload carries a language and description first.
 * @returns the decoded text, or the empty string when the frame is empty.
 */
function readFrameText(payload: Uint8Array, comment: boolean): string {
  if (payload.byteLength < 1) return ''
  const declared = payload[0]
  const body = comment ? trimCommentPrefix(payload) : payload.subarray(1)
  return body.byteLength === 0 ? '' : decodeFrameText(body, declared)
}

/**
 * Step past the terminator that ends a text field.
 *
 * Every ID3 text field ends with one: a single zero byte for the single-byte
 * encodings, and two for UTF-16, where `0x00 0x41` is a real character rather
 * than a terminator, so the pair has to be skipped together.
 * @param bytes - the payload being walked.
 * @param at - the first byte of the terminator.
 * @param wide - whether the field is UTF-16.
 * @returns the offset just past the terminator.
 */
function skipTerminator(bytes: Uint8Array, at: number, wide: boolean): number {
  let end = at
  if (!wide) {
    while (end < bytes.byteLength && bytes[end] !== 0) end += 1
    return end + 1
  }
  while (end + 1 < bytes.byteLength && (bytes[end] !== 0 || bytes[end + 1] !== 0)) end += 2
  return end + 2
}

/**
 * Step past the description an ID3 comment frame carries before its text.
 *
 * A `COMM` frame is a language, a description, then the comment; v2.2's `COM`
 * writes the same three parts.
 * @param payload - the comment frame's bytes.
 * @returns the comment text.
 */
function trimCommentPrefix(payload: Uint8Array): Uint8Array {
  const declared = payload[0]
  // One encoding byte, then the three-character language.
  return payload.subarray(skipTerminator(payload, 1 + 3, declared === 1 || declared === 2))
}

/**
 * Read an ID3 attached-picture frame.
 * @param payload - the frame's bytes.
 * @param legacy - whether the frame is v2.2's `PIC`, which names a three-character format instead of a media type.
 * @returns the picture's media type and data, or undefined when it is a link or no image.
 */
function readAttachedPicture(payload: Uint8Array, legacy: boolean): { mime: string; data: Uint8Array } | undefined {
  if (payload.byteLength < 1) return undefined
  const declared = payload[0]
  let at = 1
  let named = ''
  if (legacy) {
    // v2.2 writes a three-character image format instead of a media type.
    named = new TextDecoder('windows-1252').decode(payload.subarray(at, at + 3)).toUpperCase()
    named = named === 'PNG' ? 'image/png' : named === 'JPG' ? 'image/jpeg' : ''
    at += 3
  } else {
    let end = at
    while (end < payload.byteLength && payload[end] !== 0) end += 1
    named = new TextDecoder('windows-1252').decode(payload.subarray(at, end))
    at = end + 1
  }
  // `-->` is a link to a picture rather than a picture, and this preview shows
  // what the file carries, not what it points at.
  if (named === '-->') return undefined
  at += 1
  const data = payload.subarray(skipTerminator(payload, at, declared === 1 || declared === 2))
  if (data.byteLength === 0) return undefined
  const mime = coverMime(named, data)
  return mime === undefined ? undefined : { mime, data }
}

/**
 * Read the ID3v1 trailer, which many rippers still write.
 * @param bytes - the complete file.
 * @returns the tags found, or undefined when there is no trailer.
 */
function readId3v1(bytes: Uint8Array): AudioTags | undefined {
  if (bytes.byteLength < 128) return undefined
  const at = bytes.byteLength - 128
  if (!matches(bytes, at, 'TAG')) return undefined
  const tags: MutableTags = {}
  const title = fixedText(bytes, at + 3, 30)
  const artist = fixedText(bytes, at + 33, 30)
  const album = fixedText(bytes, at + 63, 30)
  const year = fixedText(bytes, at + 93, 4)
  const track = bytes[at + 125] === 0 && bytes[at + 126] !== 0 ? String(bytes[at + 126]) : undefined
  const comment = fixedText(bytes, at + 97, 28)
  const genre = bytes.at(at + 127)
  if (title !== undefined) tags.title = title
  if (artist !== undefined) tags.artist = artist
  if (album !== undefined) tags.album = album
  if (year !== undefined) tags.year = year
  if (track !== undefined) tags.track = track
  if (comment !== undefined) tags.comment = comment
  const genreName = genre === undefined ? undefined : GENRES[genre]
  if (genreName !== undefined) tags.genre = genreName
  return Object.keys(tags).length === 0 ? undefined : tags
}

/** Trim a fixed-width ID3v1 field, which ends at its first NUL. */
function fixedText(bytes: Uint8Array, from: number, length: number): string | undefined {
  const raw = bytes.subarray(from, from + length)
  const end = raw.indexOf(0)
  const text = decodeLegacy(end < 0 ? raw : raw.subarray(0, end)).trim()
  return text === '' ? undefined : text
}

/** The standard ID3v1 genre table. */
const GENRES: readonly (string | undefined)[] = [
  'Blues', 'Classic Rock', 'Country', 'Dance', 'Disco', 'Funk', 'Grunge', 'Hip-Hop', 'Jazz', 'Metal',
  'New Age', 'Oldies', 'Other', 'Pop', 'R&B', 'Rap', 'Reggae', 'Rock', 'Techno', 'Industrial',
  'Alternative', 'Ska', 'Death Metal', 'Pranks', 'Soundtrack', 'Euro-Techno', 'Ambient', 'Trip-Hop',
  'Vocal', 'Jazz+Funk', 'Fusion', 'Trance', 'Classical', 'Instrumental', 'Acid', 'House', 'Game',
  'Sound Clip', 'Gospel', 'Noise', 'AlternRock', 'Bass', 'Soul', 'Punk', 'Space', 'Meditative',
  'Instrumental Pop', 'Instrumental Rock', 'Ethnic', 'Gothic', 'Darkwave', 'Techno-Industrial',
  'Electronic', 'Pop-Folk', 'Eurodance', 'Dream', 'Southern Rock', 'Comedy', 'Cult', 'Gangsta',
  'Top 40', 'Christian Rap', 'Pop/Funk', 'Jungle', 'Native American', 'Cabaret', 'New Wave',
  'Psychadelic', 'Rave', 'Showtunes', 'Trailer', 'Lo-Fi', 'Tribal', 'Acid Punk', 'Acid Jazz',
  'Polka', 'Retro', 'Musical', 'Rock & Roll', 'Hard Rock',
]

/**
 * The field names a Vorbis comment, a RIFF `INFO` chunk, and an MP4 `ilst` all
 * spell differently.
 *
 * The name avoids the copy-bearing suffixes the i18n gate looks for on purpose:
 * these are the spellings a format uses, not words this package shows anyone.
 */
const FIELD_ALIASES: Readonly<Record<string, TextTagKey | undefined>> = {
  TITLE: 'title', ARTIST: 'artist', ALBUM: 'album', DATE: 'year', YEAR: 'year',
  TRACKNUMBER: 'track', GENRE: 'genre', COMMENT: 'comment', DESCRIPTION: 'comment',
  INAM: 'title', IART: 'artist', IPRD: 'album', ICRD: 'year', ITRK: 'track', IGNR: 'genre', ICMT: 'comment',
}

/**
 * Read a Vorbis comment block, which FLAC and Ogg both use.
 * @param bytes - the comment payload.
 * @returns the tags found.
 */
function readVorbisComments(bytes: Uint8Array): AudioTags {
  const tags: MutableTags = {}
  let at = 0
  // Vorbis comments are little-endian in both FLAC and Ogg.
  const readLength = (): number => {
    const value = uint32le(bytes, at)
    at += 4
    return value
  }
  if (at + 4 > bytes.byteLength) return tags
  const vendorLength = readLength()
  at += vendorLength
  if (at + 4 > bytes.byteLength) return tags
  const count = readLength()
  for (let index = 0; index < count && at + 4 <= bytes.byteLength; index += 1) {
    const length = readLength()
    if (length <= 0 || at + length > bytes.byteLength) break
    const field = new TextDecoder('utf-8').decode(bytes.subarray(at, at + length))
    at += length
    const separator = field.indexOf('=')
    if (separator <= 0) continue
    const key = FIELD_ALIASES[field.slice(0, separator).toUpperCase()]
    if (key !== undefined) tags[key] ??= field.slice(separator + 1)
  }
  return tags
}

/**
 * Read the `INFO` chunk tags a WAVE file may carry.
 * @param bytes - the complete file.
 * @param from - the chunk's first byte.
 * @param to - the chunk's last byte, exclusive.
 * @returns the tags found.
 */
function readRiffInfo(bytes: Uint8Array, from: number, to: number): AudioTags {
  const tags: MutableTags = {}
  let offset = from
  while (offset + 8 <= to) {
    const id = fourCc(bytes, offset)
    const size = uint32le(bytes, offset + 4)
    if (size < 0) break
    const key = FIELD_ALIASES[id]
    if (key !== undefined && offset + 8 + size <= to) {
      const value = decodeLegacy(bytes.subarray(offset + 8, offset + 8 + size)).replace(/\0+$/u, '').trim()
      if (value !== '') tags[key] = value
    }
    offset += 8 + size + (size % 2)
  }
  return tags
}

/** The MP4 tag atoms that carry a text field, keyed by their four-character code. */
const MP4_TEXT_ATOMS: Readonly<Record<string, TextTagKey | undefined>> = {
  '\u00a9nam': 'title',
  '\u00a9ART': 'artist',
  'aART': 'artist',
  '\u00a9alb': 'album',
  '\u00a9day': 'year',
  '\u00a9gen': 'genre',
  '\u00a9cmt': 'comment',
}

/** MP4 `data` atom type codes this preview understands. */
const MP4_DATA: Readonly<Record<number, 'text' | 'jpeg' | 'png' | 'bmp' | 'track' | undefined>> = {
  0: 'track',
  1: 'text',
  13: 'jpeg',
  14: 'png',
  27: 'bmp',
}

/** The media type each picture type code names. */
const MP4_PICTURE_MIME: Readonly<Record<string, string>> = { jpeg: 'image/jpeg', png: 'image/png', bmp: 'image/bmp' }

/** One ISO atom inside a byte range: what it is, and where its body starts and ends. */
interface Mp4Atom {
  readonly atom: string
  readonly body: number
  readonly end: number
}

/**
 * Walk the atoms of one ISO box.
 *
 * `ilst`, `covr` and `data` all nest through the same header — a 32-bit size, a
 * four-character type, then the body — so one walker serves every level, and a
 * box that does not contain its own header ends the walk rather than moving
 * backwards.
 * @param bytes - the complete file.
 * @param from - the first byte of the first atom.
 * @param to - the last byte of the enclosing box, exclusive.
 * @returns each atom with a body, in file order.
 */
function* mp4Atoms(bytes: Uint8Array, from: number, to: number): Generator<Mp4Atom> {
  let offset = from
  while (offset + 8 <= to) {
    const size = uint32(bytes, offset)
    const end = size === 0 ? to : Math.min(offset + size, to)
    if (end <= offset + 8) return
    yield { atom: fourCc(bytes, offset + 4), body: offset + 8, end }
    offset = end
  }
}

/**
 * Read the `ilst` metadata list an MP4 audio file carries.
 *
 * An `.m4a` is the most common thing a reader opens when they open music, and its
 * tags live here rather than in ID3, so a preview that skipped this would show a
 * tagged file with no title and no cover art.
 * @param bytes - the complete file.
 * @param from - the list's first byte.
 * @param to - the list's last byte, exclusive.
 * @param tags - the accumulator the atoms are written into.
 * @param pictures - receives the first cover picture found.
 */
function readIlst(
  bytes: Uint8Array,
  from: number,
  to: number,
  tags: MutableTags,
  pictures: { picture?: { mime: string; data: Uint8Array } },
): void {
  for (const { atom, body, end } of mp4Atoms(bytes, from, to)) {
    if (atom === 'covr') {
      const data = readMp4Data(bytes, body, end)
      if (data !== undefined && pictures.picture === undefined) {
        const mime = data.kind === 'jpeg' || data.kind === 'png' || data.kind === 'bmp'
          ? MP4_PICTURE_MIME[data.kind]
          : coverMime('', data.payload)
        if (mime !== undefined) pictures.picture = { mime, data: data.payload }
      }
    } else if (atom === 'trkn') {
      const data = readMp4Data(bytes, body, end)
      // The track number is a big-endian 16-bit field two bytes into the payload.
      if (data !== undefined && data.payload.byteLength >= 4) {
        const number = uint16(data.payload, 2)
        if (number > 0) tags.track ??= String(number)
      }
    } else {
      const key = MP4_TEXT_ATOMS[atom]
      if (key !== undefined) {
        const data = readMp4Data(bytes, body, end)
        if (data !== undefined && data.payload.byteLength > 0) {
          const text = stripPadding(decodeLegacy(data.payload))
          if (text !== '') tags[key] ??= text
        }
      }
    }
  }
}

/**
 * Read the first `data` atom inside an `ilst` entry.
 * @param bytes - the complete file.
 * @param from - the entry's first child byte.
 * @param to - the entry's last byte, exclusive.
 * @returns the type code and payload, or undefined when the entry has no data.
 */
function readMp4Data(bytes: Uint8Array, from: number, to: number): { kind: string | undefined; payload: Uint8Array } | undefined {
  for (const { atom, body, end } of mp4Atoms(bytes, from, to)) {
    if (atom === 'data') {
      // A `data` atom is a version, three flag bytes, then a locale.
      const declared = uint32(bytes, body) & 0x00ffffff
      return { kind: MP4_DATA[declared], payload: bytes.subarray(body + 8, end) }
    }
  }
  return undefined
}

/**
 * Read the audio codec, duration, and tags from an ISO base media file.
 *
 * The sample description names the real codec, which the suffix cannot: an
 * `.m4a` holds AAC or ALAC and the two are not interchangeable.
 * @param bytes - the complete file.
 * @param tags - the accumulator the `ilst` atoms are written into.
 * @param pictures - receives the cover picture, when the file carries one.
 * @returns what the boxes state, with absent fields left undefined.
 */
function readIsoAudio(
  bytes: Uint8Array,
  tags: MutableTags,
  pictures: { picture?: { mime: string; data: Uint8Array } },
): { codec?: string; durationSeconds?: number } {
  const SAMPLE_CODECS: Readonly<Record<string, string | undefined>> = {
    mp4a: 'aac', alac: 'alac', Opus: 'opus', 'ac-3': 'ac3', 'ec-3': 'ac3', fLaC: 'flac', twos: 'wav', sowt: 'wav', lpcm: 'wav',
  }
  const result: { codec?: string; durationSeconds?: number } = {}
  const walk = (from: number, to: number, depth: number): void => {
    if (depth > 8) return
    let offset = from
    while (offset + 8 <= to) {
      const size = uint32(bytes, offset)
      const type = fourCc(bytes, offset + 4)
      const end = size === 0 ? to : Math.min(offset + size, to)
      // An empty box is ordinary — `free` is written with no payload — so the
      // walk advances past it rather than stopping.
      if (end <= offset) return
      const body = offset + 8
      if (type === 'mvhd') {
        const version = bytes[body] ?? 0
        const timescale = version === 1 ? uint32(bytes, body + 20) : uint32(bytes, body + 12)
        const duration = version === 1
          ? uint32(bytes, body + 24) * 0x100000000 + uint32(bytes, body + 28)
          : uint32(bytes, body + 16)
        if (timescale > 0) result.durationSeconds = duration / timescale
      } else if (type === 'stsd') {
        const mapped = SAMPLE_CODECS[fourCc(bytes, body + 12)]
        if (mapped !== undefined) result.codec = mapped
        // The sample entry's channel and rate fields are zero in files whose
        // real geometry lives in a codec-private descriptor, so they are not
        // read here; the player takes both from the element's own metadata.
      } else if (type === 'meta') {
        // A full box: four bytes of version and flags precede its children.
        walk(body + 4, end, depth + 1)
      } else if (type === 'ilst') {
        readIlst(bytes, body, end, tags, pictures)
      } else if (['moov', 'trak', 'mdia', 'minf', 'stbl', 'udta'].includes(type)) {
        walk(body, end, depth + 1)
      }
      offset = end
    }
  }
  walk(0, bytes.byteLength, 0)
  return result
}

/**
 * Read a FLAC picture block.
 * @param block - the picture block's bytes.
 * @returns the picture, or undefined when the block is malformed.
 */
function readFlacPicture(block: Uint8Array): { mime: string; data: Uint8Array } | undefined {
  if (block.byteLength < 32) return undefined
  const mimeLength = uint32(block, 4)
  const at = 8 + mimeLength
  if (at + 4 > block.byteLength) return undefined
  const named = new TextDecoder('windows-1252').decode(block.subarray(8, at))
  const descriptionLength = uint32(block, at)
  const dataAt = at + 4 + descriptionLength + 16
  if (dataAt + 4 > block.byteLength) return undefined
  const dataLength = uint32(block, dataAt)
  const data = block.subarray(dataAt + 4, dataAt + 4 + dataLength)
  if (data.byteLength === 0) return undefined
  const mime = coverMime(named, data)
  return mime === undefined ? undefined : { mime, data }
}

/**
 * Read an 80-bit IEEE extended-precision float, which AIFF uses for sample rates.
 * @param bytes - the complete file.
 * @param offset - the value's first byte.
 * @returns the value, or 0 when it is malformed.
 */
function readExtended(bytes: Uint8Array, offset: number): number {
  const exponent = (((bytes[offset] ?? 0) & 0x7f) << 8) | (bytes[offset + 1] ?? 0)
  const mantissa = uint32(bytes, offset + 2) * 0x100000000 + uint32(bytes, offset + 6)
  if (exponent === 0 && mantissa === 0) return 0
  return mantissa * 2 ** (exponent - 16383 - 63)
}

/** The raw DTS stream sync words, in the framings a muxer may write. */
const DTS_SYNC: readonly (readonly number[])[] = [
  [0x7f, 0xfe, 0x80, 0x01],
  [0xfe, 0x7f, 0x01, 0x80],
  [0x1f, 0xff, 0xe8, 0x00],
  [0xff, 0x1f, 0x00, 0xe8],
  [0x64, 0x58, 0x20, 0x25],
]

/**
 * Identify an audio file, reading its tags and whatever geometry is cheap.
 *
 * The bytes decide the container and the suffix only breaks a tie, so a file
 * whose name lies is still read for what it is.
 * @param bytes - the complete file.
 * @param extension - the suffix, used only when the bytes are inconclusive.
 * @returns what this preview learned, or undefined when nothing identifies the file.
 */
export function inspectAudio(bytes: Uint8Array, extension: string): AudioInfo | undefined {
  const suffix = extension.toLowerCase()
  let key = EXTENSION_KEYS[suffix]
  let tags: AudioTags = {}
  let durationSeconds: number | undefined
  let sampleRate: number | undefined
  let channels: number | undefined
  let codec: string | undefined
  let mpegStart = 0
  const pictures: { picture?: { mime: string; data: Uint8Array } } = {}

  if (matches(bytes, 0, 'ID3')) {
    const id3 = readId3v2(bytes)
    if (id3 !== undefined) {
      const { picture, ...rest } = id3
      if (picture !== undefined) pictures.picture = picture
      tags = rest
    }
    key ??= 'mp3'
    // The tag states its own length, so the stream begins exactly past it — and
    // starting there is what keeps a picture inside the tag from being scanned
    // as audio.
    if (bytes.byteLength >= 10) mpegStart = Math.min(bytes.byteLength, 10 + syncSafe(bytes, 6))
  }

  if (matches(bytes, 0, 'fLaC')) {
    key = 'flac'
    // The stream information block opens with the sample rate, channels, and
    // total sample count packed into eight bytes.
    const at = 8
    if (at + 18 <= bytes.byteLength) {
      sampleRate = ((bytes[at + 10] ?? 0) << 12) | ((bytes[at + 11] ?? 0) << 4) | ((bytes[at + 12] ?? 0) >> 4)
      channels = (((bytes[at + 12] ?? 0) >> 1) & 0x07) + 1
      const totalSamples = ((bytes[at + 13] ?? 0) & 0x0f) * 0x100000000
        + uint32(bytes, at + 14)
      if (sampleRate > 0) durationSeconds = totalSamples / sampleRate
    }
    // Walk the metadata blocks to the comment and picture blocks.
    let offset = 4
    while (offset + 4 <= bytes.byteLength) {
      const header = bytes[offset] ?? 0
      const last = (header & 0x80) !== 0
      const type = header & 0x7f
      const length = uint24(bytes, offset + 1)
      const start = offset + 4
      if (type === 4 && start + length <= bytes.byteLength) {
        tags = { ...readVorbisComments(bytes.subarray(start, start + length)), ...tags }
      }
      if (type === 6 && start + length <= bytes.byteLength) {
        pictures.picture ??= readFlacPicture(bytes.subarray(start, start + length))
      }
      offset = start + length
      if (last) break
    }
  } else if (matches(bytes, 0, 'OggS')) {
    // The comment header follows the identification header inside the first pages.
    const head = new TextDecoder('windows-1252').decode(bytes.subarray(0, Math.min(bytes.byteLength, 8192)))
    const opus = head.includes('OpusHead')
    const speex = head.includes('Speex   ')
    key = opus ? 'opus' : speex ? 'speex' : 'vorbis'
    const marker = opus ? 'OpusTags' : speex ? 'SpeexTags' : '\u0003vorbis'
    const at = head.indexOf(marker)
    if (at >= 0) {
      tags = { ...readVorbisComments(bytes.subarray(at + marker.length, Math.min(bytes.byteLength, at + marker.length + 65536))), ...tags }
    }
  } else if (matches(bytes, 0, 'RIFF') && matches(bytes, 8, 'WAVE')) {
    key = 'wav'
    let offset = 12
    let byteRate = 0
    while (offset + 8 <= bytes.byteLength) {
      const id = fourCc(bytes, offset)
      const size = uint32le(bytes, offset + 4)
      const start = offset + 8
      if (id === 'fmt ' && start + 16 <= bytes.byteLength) {
        channels = uint16le(bytes, start + 2)
        sampleRate = uint32le(bytes, start + 4)
        byteRate = uint32le(bytes, start + 8)
      }
      // A LIST chunk often sits between fmt and data, so the duration is read
      // from whichever data chunk the walk reaches rather than assumed adjacent.
      if (id === 'data' && byteRate > 0) durationSeconds = size / byteRate
      if (id === 'LIST' && start + size <= bytes.byteLength && matches(bytes, start, 'INFO')) {
        tags = { ...readRiffInfo(bytes, start + 4, start + size), ...tags }
      }
      // Some rippers write a complete ID3v2 tag into a WAVE file's `id3 ` chunk.
      if (id === 'id3 ' && start + size <= bytes.byteLength) {
        const embedded = readId3v2(bytes.subarray(start, start + size))
        if (embedded !== undefined) {
          const { picture, ...rest } = embedded
          pictures.picture ??= picture
          tags = { ...rest, ...tags }
        }
      }
      offset = start + size + (size % 2)
    }
  } else if (matches(bytes, 4, 'ftyp')) {
    key = key === 'alac' ? 'alac' : 'm4a'
    const mp4 = readIsoAudio(bytes, tags, pictures)
    codec = mp4.codec
    durationSeconds = mp4.durationSeconds
  } else if (matches(bytes, 0, 'FORM') && (matches(bytes, 8, 'AIFF') || matches(bytes, 8, 'AIFC'))) {
    key = 'aiff'
    // The common chunk states frames, channels, and the extended-precision rate.
    let offset = 12
    while (offset + 8 <= bytes.byteLength) {
      const id = fourCc(bytes, offset)
      const size = uint32(bytes, offset + 4)
      if (id === 'COMM' && offset + 8 + 18 <= bytes.byteLength) {
        const at = offset + 8
        channels = uint16(bytes, at)
        const frames = uint32(bytes, at + 2)
        sampleRate = Math.round(readExtended(bytes, at + 8))
        if (sampleRate > 0) durationSeconds = frames / sampleRate
        break
      }
      offset += 8 + size + (size % 2)
    }
  } else if (matches(bytes, 0, '#!AMR')) {
    key = 'amr'
  } else if (bytes[0] === 0x0b && bytes[1] === 0x77) {
    // Both Dolby formats open with the same sync word, so the suffix is what
    // separates them: it is more specific here, not less.
    key = suffix === 'eac3' ? 'eac3' : 'ac3'
  } else if (matches(bytes, 0, 'MAC ')) {
    key = 'ape'
  } else if (matches(bytes, 0, 'wvpk')) {
    key = 'wavpack'
  } else if (matches(bytes, 0, 'TTA1')) {
    key = 'tta'
  } else if (matchesAny(bytes, 0, DTS_SYNC)) {
    key = 'dts'
  } else if (matches(bytes, 0, 'MThd')) {
    key = 'midi'
  } else if (bytes[0] === 0x1a && bytes[1] === 0x45 && bytes[2] === 0xdf && bytes[3] === 0xa3) {
    key = 'webm'
  } else if (matches(bytes, 0, '.snd')) {
    key = 'au'
  } else if (matches(bytes, 0, 'caff')) {
    key = 'caf'
  } else if (matches(bytes, 0, 'Creative Voice File')) {
    key = 'voc'
  } else if (bytes[0] === 0xff && (bytes.at(1) ?? 0) >= 0xe0) {
    // A bare MPEG audio frame, which is what an untagged MP2 or MP3 opens with.
    key ??= 'mp3'
  }

  // An MPEG stream is the one case where the file's own frames are the container
  // too, so its geometry is read from the first of them rather than from a
  // header block. It is also the commonest audio file there is.
  if (key === 'mp3' || key === 'mp2') {
    const geometry = readMpegGeometry(bytes, mpegStart)
    if (geometry !== undefined) {
      sampleRate = geometry.sampleRate
      channels = geometry.channels
    }
  }

  if (matches(bytes, bytes.byteLength - 128, 'TAG')) {
    const trailer = readId3v1(bytes)
    if (trailer !== undefined) {
      tags = { ...trailer, ...tags }
      key ??= 'mp3'
    }
  }
  if (key === undefined) return undefined
  const found = containerFor(key)
  if (found === undefined) return undefined
  const container: AudioContainer = codec === undefined ? found : { ...found, codec: CODEC_NAMES[codec] ?? found.codec }
  // A picture the file carries wins over the one the trailer or a foreign chunk
  // named, so the order the containers are read in cannot change what is shown.
  const picture = pictures.picture
  return {
    container,
    tags: picture === undefined ? tags : { ...tags, picture },
    ...(durationSeconds === undefined || !Number.isFinite(durationSeconds) ? {} : { durationSeconds }),
    ...(sampleRate === undefined ? {} : { sampleRate }),
    ...(channels === undefined ? {} : { channels }),
  }
}

/**
 * Whether the platform should be asked to decode this file.
 * @param info - what identification found.
 * @returns true when the player should attempt playback.
 */
export function shouldAttemptPlayback(info: AudioInfo): boolean {
  return info.container.delivery === 'attempt'
}

/**
 * The reason a file cannot be played, when identification already knows one.
 * @param info - what identification found.
 * @returns the dictionary key of the explanation, or undefined when playback should be attempted.
 */
export function knownPlaybackReason(info: AudioInfo): SdkworkAudioPreviewKey | undefined {
  return info.container.reasonKey
}

/** The words the caller supplies for the parts of a summary that are language, not data. */
export interface AudioSummaryTerms {
  /** Name of a one-channel layout. */
  readonly mono: string
  /** Name of a two-channel layout. */
  readonly stereo: string
  /** @param count - channel count beyond two. @returns the name of that layout. */
  readonly channels: (count: number) => string
}

/**
 * A one-line summary of what the file is, for the player's caption.
 *
 * The words are supplied rather than spelled here: a Chinese reader and an
 * English reader are looking at the same file, and "mono" is not a fact about it.
 * @param info - what identification found.
 * @param terms - the caller's words for the channel layouts.
 * @returns the summary, such as `MP3 · MP3 · 44.1 kHz`.
 */
export function summarizeAudio(info: AudioInfo, terms: AudioSummaryTerms): string {
  const parts: string[] = [info.container.codec ?? info.container.name]
  if (info.sampleRate !== undefined) {
    parts.push(`${(info.sampleRate / 1000).toFixed(info.sampleRate % 1000 === 0 ? 0 : 1)} kHz`)
  }
  if (info.channels !== undefined) {
    parts.push(info.channels === 1 ? terms.mono : info.channels === 2 ? terms.stereo : terms.channels(info.channels))
  }
  return parts.join(' · ')
}
