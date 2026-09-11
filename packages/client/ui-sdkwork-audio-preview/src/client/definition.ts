/** Audio metadata registration through the document registry and the keyed body slot. */
import type { DocumentPreviewDefinition } from '@deepseek-ai/dsh-client-ui-sidebar-documentpreview/client'
import { AUDIO_EXTENSIONS } from './audio/containers.ts'

/** Audio metadata and keyed body share this package-local implementation identity. */
export const AUDIO_BODY_ID = '@deepseek-ai/dsh-client-ui-sdkwork-audio-preview/audio'

/**
 * Suffixes this renderer claims.
 *
 * The set is deliberately wider than the containers any browser decodes: the
 * families no platform plays — WMA, AMR, Monkey's Audio, WavPack, True Audio,
 * Speex, MIDI, DSD, DTS, CAF, Sun/NeXT, Creative Voice and raw GSM — would
 * otherwise fall through to the plain-text reader, which reports a presentable
 * file as "not text". Claiming them lets the body name the container it read
 * from the bytes and the conversion the reader needs.
 */
export { AUDIO_EXTENSIONS }

/**
 * Describe the audio renderer independently from its keyed body slot.
 *
 * The registration carries no `priority`, which places it in the `extension`
 * band. The document owner lists every candidate for a suffix in its viewer
 * menu, so a builtin reader for the same suffix stays reachable from there.
 * @param title - locale-owned implementation name.
 * @returns the complete-file audio registration.
 */
export function audioBodyDefinition(title: () => string): DocumentPreviewDefinition {
  return {
    id: AUDIO_BODY_ID,
    extensions: AUDIO_EXTENSIONS,
    title,
    loading: 'bytes-complete',
    wrap: false,
  }
}
