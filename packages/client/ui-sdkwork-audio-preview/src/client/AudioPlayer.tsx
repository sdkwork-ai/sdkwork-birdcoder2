/**
 * The audio preview body: a transport bar, the file's own picture of itself, and
 * the facts the bytes declare.
 *
 * The shape deliberately matches the office and video previews: a control bar
 * across the top, the stage below it, and the file's own facts in a list at the
 * bottom. What the stage shows is audio's substitute for a picture — the cover
 * art a producer attached, the tags they wrote, and the waveform of the sound
 * itself, which is the only overview a listener can navigate by.
 *
 * Identification is deferred to an effect keyed on the byte identity, so the
 * panel paints before a large file is walked and a file that replaces another
 * really does replace it: a failure the previous file reported cannot survive
 * into the next one. A file the platform will not decode still shows everything
 * the bytes said, and the numeric media error the element reports is replaced
 * with the container and codec already read from those bytes.
 */
import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from 'react'
import type { PropsLocale, PropsStore } from '@deepseek-ai/dsh-client-ui-slots'
import type { DocumentPreviewProps } from '@deepseek-ai/dsh-client-ui-sidebar-documentpreview/client'
import { DEFAULT_AUDIO_VIEW, PLAYBACK_RATES } from './store.ts'
import type { AudioViewStore } from './store.ts'
import type { SdkworkAudioPreviewKey } from './locales.ts'
import { inspectAudio, knownPlaybackReason, shouldAttemptPlayback, summarizeAudio } from './audio/containers.ts'
import type { AudioInfo } from './audio/containers.ts'
import { WAVEFORM_BINS, decodeAudioPeaks, paintWaveform } from './audio/waveform.ts'
import { LoopIcon, PauseIcon, PlayIcon, SkipBackIcon, SkipForwardIcon, VolumeIcon, VolumeMutedIcon } from './icons.tsx'
import css from './AudioPlayer.module.css'

/** How far the transport's jump buttons move the playhead. */
const SKIP_SECONDS = 10

/** How far one arrow key moves the volume, which is the slider's own step. */
const VOLUME_STEP = 0.1

/** The dictionary key for each of the browser's media error codes. */
const MEDIA_ERROR_KEYS: Readonly<Record<number, SdkworkAudioPreviewKey>> = {
  1: 'mediaAborted',
  2: 'mediaNetwork',
  3: 'mediaDecode',
  4: 'mediaUnsupported',
}

/** Standard document props plus the audio dictionary and transport store. */
export type AudioPlayerProps =
  & DocumentPreviewProps
  & PropsLocale<'sdkworkAudioPreview'>
  & PropsStore<AudioViewStore>

/**
 * Format a duration as a clock.
 * @param seconds - the position or duration.
 * @returns `m:ss`, or `h:mm:ss` past an hour.
 */
function clock(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00'
  const whole = Math.floor(seconds)
  const minutes = Math.floor(whole / 60) % 60
  const hours = Math.floor(whole / 3600)
  const part = `${minutes}:${String(whole % 60).padStart(2, '0')}`
  return hours === 0 ? part : `${hours}:${part.padStart(5, '0')}`
}

/** The suffix a resource address ends with, which is only ever a hint. */
function extensionOf(address: string): string {
  const name = address.slice(address.lastIndexOf('/') + 1)
  const dot = name.lastIndexOf('.')
  return dot < 0 ? '' : name.slice(dot + 1)
}

/**
 * The file's own name: the last segment of a resource address.
 *
 * Decoding is per segment, matching how the address was built, so a name
 * carrying a space, `#`, or `?` reads as itself — and the same name the tab
 * chip shows is the one the stage shows.
 * @param address - a `file:`-shaped resource address.
 * @returns the decoded last segment, or `''` when the address has none.
 */
function nameOf(address: string): string {
  const segment = address.slice(address.lastIndexOf('/') + 1)
  if (segment === '') return ''
  try {
    return decodeURIComponent(segment)
  } catch {
    // A malformed percent sequence is still a name; showing it raw beats refusing the address.
    return segment
  }
}

/**
 * What the play button, the stage, and the system media controls call this file.
 *
 * The title a producer wrote wins; without one the file's own name is used
 * rather than a placeholder, because a reader recognises their own file and
 * learns nothing from the word "unknown".
 * @param info - what identification found.
 * @param address - the resource address the stage was handed.
 * @param fallback - the caller's word for a file that has no name at all.
 * @returns the name to show.
 */
function displayTitle(info: AudioInfo, address: string, fallback: string): string {
  return info.tags.title || nameOf(address) || fallback
}

/**
 * The exact bytes of a view, as a Blob part.
 *
 * A view that already covers its whole buffer is handed over as it stands, which
 * is what keeps a large file from being duplicated on the heap; a partial view is
 * copied into a buffer of its own, because a Blob cannot describe an offset.
 * @param value - the bytes to hand over.
 * @returns a buffer holding exactly those bytes.
 */
function blobPart(value: Uint8Array): ArrayBuffer {
  if (value.byteOffset === 0 && value.byteLength === value.buffer.byteLength) return value.buffer as ArrayBuffer
  const copy = new ArrayBuffer(value.byteLength)
  new Uint8Array(copy).set(value)
  return copy
}

/**
 * The audio type's body, registered under `sidebar.right.tab.document`.
 * @param props - file bytes and the framework-owned tab, store, and locale seats.
 * @returns the player, or an explanation of why the file cannot be played.
 */
export function AudioPlayer(props: AudioPlayerProps): ReactNode {
  const { tab } = props.useTabInfo()
  const view = props.useStore(state => state.byTab[tab.id] ?? DEFAULT_AUDIO_VIEW)
  const data = props.content.kind === 'bytes' ? props.content.data : undefined
  const { t, actions, scrollportRef, resourceAddress } = props
  const [info, setInfo] = useState<AudioInfo | undefined>()
  const [inspected, setInspected] = useState(false)
  const [peaks, setPeaks] = useState<Float32Array | undefined>()
  const [playing, setPlaying] = useState(false)
  const [position, setPosition] = useState(view.position)
  const [duration, setDuration] = useState(0)
  const [failed, setFailed] = useState<number>()
  const mediaRef = useRef<HTMLAudioElement | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)

  // Identification is deferred so the panel paints before the bytes are walked,
  // and it is keyed on the data itself: a new file must not inherit the previous
  // file's tags, duration, or refusal.
  useEffect(() => {
    setInspected(false)
    setInfo(undefined)
    setFailed(undefined)
    if (data === undefined) return
    setInfo(inspectAudio(data, extensionOf(resourceAddress)))
    setInspected(true)
  }, [data, resourceAddress])

  // The bytes are handed over as they are: constructing the Blob already copies
  // them once, and a second copy of a large file is heap this preview does not need.
  const url = useMemo(
    () => (data === undefined || info === undefined || info.container.mime === ''
      ? undefined
      : URL.createObjectURL(new Blob([blobPart(data)], { type: info.container.mime }))),
    [data, info],
  )
  const picture = info?.tags.picture
  const coverUrl = useMemo(
    () => (picture === undefined
      ? undefined
      : URL.createObjectURL(new Blob([blobPart(picture.data)], { type: picture.mime }))),
    [picture],
  )
  useEffect(() => () => {
    if (url !== undefined) URL.revokeObjectURL(url)
    if (coverUrl !== undefined) URL.revokeObjectURL(coverUrl)
  }, [url, coverUrl])

  const attempt = info !== undefined && url !== undefined && shouldAttemptPlayback(info)

  // The waveform is decoded through the Web Audio API, which is a second decoder
  // that may well refuse a file the element plays. Absent peaks cost the reader
  // the picture of the sound, never the player.
  useEffect(() => {
    setPeaks(undefined)
    if (data === undefined || info === undefined || !shouldAttemptPlayback(info)) return
    const controller = new AbortController()
    void decodeAudioPeaks(data, WAVEFORM_BINS, controller.signal).then((found) => {
      if (!controller.signal.aborted && found !== undefined) setPeaks(found)
    })
    return () => { controller.abort() }
  }, [data, info])

  /** Draw the waveform and the playhead, and redraw when the box it fills changes. */
  useEffect(() => {
    const canvas = canvasRef.current
    if (canvas === null) return
    const progress = duration > 0 ? Math.min(1, Math.max(0, position / duration)) : undefined
    const draw = (): void => { paintWaveform(canvas, peaks, progress) }
    draw()
    if (typeof ResizeObserver !== 'function') return
    const observer = new ResizeObserver(draw)
    observer.observe(canvas)
    return () => { observer.disconnect() }
  }, [peaks, position, duration])

  const bindStage = useCallback((node: HTMLDivElement | null): void => { scrollportRef(node) }, [scrollportRef])

  /** Apply the stored transport state once the element exists. */
  useEffect(() => {
    const media = mediaRef.current
    if (media === null) return
    media.playbackRate = view.rate
    media.volume = view.volume
    media.muted = view.muted
    media.loop = view.loop
  }, [view.rate, view.volume, view.muted, view.loop, attempt])

  /** Forget a tab whose record has gone, so the transport state does not outlive it. */
  useEffect(() => {
    const { signal } = tab
    const drop = (): void => { actions.forget(tab.id) }
    if (signal.aborted) {
      drop()
      return
    }
    signal.addEventListener('abort', drop, { once: true })
    return () => { signal.removeEventListener('abort', drop) }
  }, [actions, tab.id, tab.signal])

  // A tab left while playing keeps its place, which is the point of storing the
  // playhead at all.
  useEffect(() => () => {
    const media = mediaRef.current
    if (media !== null && Number.isFinite(media.currentTime)) actions.update(tab.id, { position: media.currentTime })
  }, [actions, tab.id])

  const toggle = useCallback((): void => {
    const media = mediaRef.current
    if (media === null) return
    if (media.paused) void media.play().catch(() => { setPlaying(false) })
    else media.pause()
  }, [])

  /** Move the playhead by a signed number of seconds, clamped to the file. */
  const skip = useCallback((seconds: number): void => {
    const media = mediaRef.current
    if (media === null || !Number.isFinite(media.duration)) return
    const target = Math.min(media.duration, Math.max(0, media.currentTime + seconds))
    media.currentTime = target
    setPosition(target)
    actions.update(tab.id, { position: target })
  }, [actions, tab.id])

  /** Seek to a fraction of the duration, which is what the range input reports. */
  const seekTo = useCallback((seconds: number): void => {
    const media = mediaRef.current
    if (media === null || !Number.isFinite(media.duration)) return
    const target = Math.min(media.duration, Math.max(0, seconds))
    media.currentTime = target
    setPosition(target)
    actions.update(tab.id, { position: target })
  }, [actions, tab.id])

  const tags = info?.tags
  const coverArt = tags?.picture === undefined ? [] : [{ src: coverUrl ?? '' }]
  const mediaTitle = info === undefined ? '' : displayTitle(info, resourceAddress, t('unknown'))

  /**
   * The stage's keyboard transport, in the vocabulary the video preview uses.
   *
   * A key that reaches a control inside the stage belongs to that control: the
   * seek slider's own arrow keys would otherwise be applied twice.
   */
  const onStageKey = useCallback((event: ReactKeyboardEvent<HTMLDivElement>): void => {
    if (event.target !== event.currentTarget) return
    const volume = (next: number): void => { actions.update(tab.id, { volume: next, muted: false }) }
    if (event.key === ' ' || event.key === 'k' || event.key === 'K') {
      event.preventDefault()
      toggle()
    } else if (event.key === 'ArrowRight') {
      event.preventDefault()
      skip(SKIP_SECONDS)
    } else if (event.key === 'ArrowLeft') {
      event.preventDefault()
      skip(-SKIP_SECONDS)
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      volume(Math.min(1, view.volume + VOLUME_STEP))
    } else if (event.key === 'ArrowDown') {
      event.preventDefault()
      volume(Math.max(0, view.volume - VOLUME_STEP))
    } else if (event.key === 'm' || event.key === 'M') {
      actions.update(tab.id, { muted: !view.muted })
    } else if (event.key === 'l' || event.key === 'L') {
      actions.update(tab.id, { loop: !view.loop })
    }
  }, [actions, skip, tab.id, toggle, view.loop, view.muted, view.volume])

  // What the operating system shows while this file plays, and what its media
  // keys drive. Both are best-effort: a platform without the API keeps a working
  // player that simply does not appear in the system's own controls.
  useEffect(() => {
    // The seat is present on every platform this ships to, but the DOM type
    // cannot say that, so the cast states what is true at run time: a browser
    // without the Media Session API leaves it undefined and keeps a working
    // player that simply does not appear in the system's own controls.
    const session = (navigator as { mediaSession?: MediaSession }).mediaSession
    if (session === undefined || info === undefined) return
    if (typeof MediaMetadata === 'function') {
      session.metadata = new MediaMetadata({
        title: mediaTitle,
        artist: tags?.artist ?? '',
        album: tags?.album ?? '',
        artwork: coverArt,
      })
    }
    const handlers: readonly (readonly [MediaSessionAction, () => void])[] = [
      ['play', toggle],
      ['pause', toggle],
      ['seekbackward', () => { skip(-SKIP_SECONDS) }],
      ['seekforward', () => { skip(SKIP_SECONDS) }],
    ]
    for (const [action, handler] of handlers) {
      try {
        session.setActionHandler(action, handler)
      } catch {
        // An action this platform does not know is simply not offered.
      }
    }
    return () => {
      session.metadata = null
      for (const [action] of handlers) {
        try {
          session.setActionHandler(action, null)
        } catch {
          // Nothing was registered for it in the first place.
        }
      }
    }
  }, [info, mediaTitle, tags?.artist, tags?.album, coverUrl, toggle, skip])

  if (data === undefined) {
    return <div className={css.status} role="alert" data-audio-status><span>{t('failure.notAudio')}</span></div>
  }
  if (!inspected) {
    return <div className={css.status} data-audio-status><span>{t('loading')}</span></div>
  }
  if (info === undefined) {
    return <div className={css.status} role="alert" data-audio-status><span>{t('failure.notAudio')}</span></div>
  }

  const reason = knownPlaybackReason(info)
  const codec = info.container.codec ?? t('unknown')
  const refused = failed !== undefined
  const total = duration > 0 ? duration : info.durationSeconds ?? 0
  const detail = refused ? t(MEDIA_ERROR_KEYS[failed] ?? 'mediaDecode') : ''
  const summary = summarizeAudio(info, {
    mono: t('mono'),
    stereo: t('stereo'),
    channels: count => t('channelCount', { count }),
  })
  const rows: Array<[string, string | undefined]> = [
    [t('container'), info.container.name],
    [t('codec'), codec],
    [t('sampleRate'), info.sampleRate === undefined ? undefined : `${(info.sampleRate / 1000).toFixed(1)} kHz`],
    [t('channels'), info.channels === undefined
      ? undefined
      : info.channels === 1 ? t('mono') : info.channels === 2 ? t('stereo') : t('channelCount', { count: info.channels })],
    [t('duration'), total > 0 ? clock(total) : undefined],
    [t('track'), tags?.track],
    [t('genre'), tags?.genre],
    [t('coverArt'), tags?.picture === undefined ? undefined : t('yes')],
  ]
  return (
    <div className={css.preview} data-audio-preview>
      <div className={css.bar}>
        <button
          type="button"
          className={css.tool}
          aria-label={playing ? t('pause') : t('play')}
          data-audio-play
          disabled={!attempt || refused}
          onClick={toggle}
        >
          {playing ? <PauseIcon /> : <PlayIcon />}
        </button>
        <button
          type="button"
          className={css.tool}
          aria-label={t('skipBack', { seconds: SKIP_SECONDS })}
          data-audio-back
          disabled={!attempt || refused}
          onClick={() => { skip(-SKIP_SECONDS) }}
        >
          <SkipBackIcon />
        </button>
        <button
          type="button"
          className={css.tool}
          aria-label={t('skipForward', { seconds: SKIP_SECONDS })}
          data-audio-forward
          disabled={!attempt || refused}
          onClick={() => { skip(SKIP_SECONDS) }}
        >
          <SkipForwardIcon />
        </button>
        <button
          type="button"
          className={css.tool}
          aria-label={view.muted ? t('unmute') : t('mute')}
          data-audio-mute
          onClick={() => { actions.update(tab.id, { muted: !view.muted }) }}
        >
          {view.muted || view.volume === 0 ? <VolumeMutedIcon /> : <VolumeIcon />}
        </button>
        <input
          type="range"
          className={css.volume}
          aria-label={t('volume')}
          data-audio-volume
          min={0}
          max={100}
          value={Math.round(view.volume * 100)}
          onChange={(event) => { actions.update(tab.id, { volume: Number(event.currentTarget.value) / 100, muted: false }) }}
        />
        <span className={css.spacer} />
        <span className={css.elapsed} data-audio-elapsed>{t('elapsed', { current: clock(position), total: clock(total) })}</span>
        <button
          type="button"
          className={css.tool}
          aria-label={t('rate')}
          data-audio-rate
          onClick={() => {
            const next = PLAYBACK_RATES[(PLAYBACK_RATES.indexOf(view.rate as 1) + 1) % PLAYBACK_RATES.length] ?? 1
            actions.update(tab.id, { rate: next })
          }}
        >
          {t('rateValue', { rate: String(view.rate) })}
        </button>
        <button
          type="button"
          className={css.tool}
          aria-label={t('loop')}
          aria-pressed={view.loop}
          data-audio-loop
          onClick={() => { actions.update(tab.id, { loop: !view.loop }) }}
        >
          <LoopIcon />
        </button>
      </div>
      <div
        className={css.stage}
        ref={bindStage}
        role="group"
        tabIndex={0}
        aria-label={t('stage', { name: info.container.name })}
        data-audio-stage
        onKeyDown={onStageKey}
      >
        {attempt && !refused ? (
          <>
            {coverUrl === undefined
              ? <div className={css.coverFallback} aria-hidden="true" data-audio-cover-fallback>{info.container.name}</div>
              : <img className={css.cover} src={coverUrl} alt={t('coverArt')} data-audio-cover />}
            <p className={css.title} data-audio-title>{mediaTitle}</p>
            <p className={css.byline} data-audio-byline>
              {[tags?.artist, tags?.album, tags?.year].filter(part => part !== undefined && part !== '').join(' · ')}
            </p>
            <p className={css.summary} data-audio-summary>{summary}</p>
            <div className={css.wave} title={t('waveform')} data-audio-wave>
              <canvas ref={canvasRef} className={css.waveCanvas} aria-hidden="true" data-audio-waveform />
              <input
                type="range"
                className={css.waveSeek}
                aria-label={t('seek')}
                aria-valuetext={t('elapsed', { current: clock(position), total: clock(total) })}
                data-audio-seek
                min={0}
                max={total > 0 ? total : 1}
                step={1}
                value={Math.min(position, total > 0 ? total : 1)}
                disabled={total === 0}
                onChange={(event) => { seekTo(Number(event.currentTarget.value)) }}
              />
            </div>
            <audio
              ref={mediaRef}
              className={css.media}
              src={url}
              data-audio-element
              preload="metadata"
              onLoadedMetadata={(event) => {
                const media = event.currentTarget
                if (Number.isFinite(media.duration)) {
                  setDuration(media.duration)
                  if (view.position > 0 && view.position < media.duration) media.currentTime = view.position
                }
              }}
              onTimeUpdate={(event) => { setPosition(event.currentTarget.currentTime) }}
              onPlay={() => { setPlaying(true) }}
              onPause={() => {
                setPlaying(false)
                const media = mediaRef.current
                if (media !== null) actions.update(tab.id, { position: media.currentTime })
              }}
              onEnded={() => { setPlaying(false) }}
              onError={(event) => { setFailed(event.currentTarget.error?.code ?? 4) }}
            />
          </>
        ) : (
          <div className={css.explain} role="alert" data-audio-explanation>
            <p className={css.explainTitle}>{info.container.name}{info.container.codec === undefined ? '' : ` · ${codec}`}</p>
            <p className={css.explainBody}>
              {refused
                ? t('failure.decode', { container: info.container.name, codec })
                : reason === undefined
                  ? t('failure.decode', { container: info.container.name, codec })
                  : t(reason)}
            </p>
            {detail === '' ? null : <p className={css.explainDetail}>{detail}</p>}
          </div>
        )}
      </div>
      <dl className={css.metadata} data-audio-metadata>
        {rows.filter(([, entry]) => entry !== undefined).map(([label, entry]) => (
          <div key={label}><dt>{label}</dt><dd>{entry}</dd></div>
        ))}
      </dl>
    </div>
  )
}
