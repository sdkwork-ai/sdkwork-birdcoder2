/**
 * The video preview body: a transport bar, the stage, and what the file is.
 *
 * The document owner delivers complete file bytes; everything below is this
 * renderer's own. Identification runs first and answers the two questions a bare
 * `<video>` cannot: what container and codec this is, and whether the platform
 * is even worth asking. A file the platform might decode is then verified by
 * loading it, because `canPlayType` is advisory and the element is authoritative
 * — when it refuses, the numeric media error is replaced with the container and
 * codec this preview already read from the bytes.
 *
 * The shape deliberately matches the office previews: a control bar across the
 * top, the picture on the stage below it, and the file's own facts in a list at
 * the bottom. Identification is deferred to an effect and keyed on the byte
 * identity, so the panel paints before a large file is walked and a file that
 * replaces another really does replace it — a failure the previous file reported
 * cannot survive into the next one.
 */
import { useCallback, useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from 'react'
import type { PropsLocale, PropsStore } from '@deepseek-ai/dsh-client-ui-slots'
import type { DocumentPreviewProps } from '@deepseek-ai/dsh-client-ui-sidebar-documentpreview/client'
import { DEFAULT_VIDEO_VIEW, PLAYBACK_RATES } from './store.ts'
import type { VideoViewStore } from './store.ts'
import type { SdkworkVideoPreviewKey } from './locales.ts'
import { inspectVideo, playbackObstacle, summarizeTracks } from './video/containers.ts'
import type { VideoInfo, VideoObstacle } from './video/containers.ts'
import { isFullscreen, isPictureInPicture, toggleFullscreen, togglePictureInPicture } from './presentation.ts'
import { clampZoom, centreViewport, ZOOM_STEP } from './stage.ts'
import { VideoBoundary } from './VideoBoundary.tsx'
import {
  ExitFullscreenIcon, FullscreenIcon, LoopIcon, PauseIcon, PictureInPictureIcon,
  PlayIcon, VolumeIcon, VolumeMutedIcon,
} from './icons.tsx'
import css from './VideoPlayer.module.css'

/** The dictionary key for each of the browser's media error codes. */
const MEDIA_ERROR_KEYS: Readonly<Record<number, SdkworkVideoPreviewKey>> = {
  1: 'mediaAborted',
  2: 'mediaNetwork',
  3: 'mediaDecode',
  4: 'mediaUnsupported',
}

/** How far one arrow-key press moves the playhead, in seconds. */
const SEEK_STEP = 5

/** How much one arrow-key press moves the volume. */
const VOLUME_STEP = 0.05

/** Padding the stage keeps around the fitted picture, in CSS pixels. */
const STAGE_PADDING = 32

/**
 * What the stage shows.
 *
 * A single union rather than a stack of ternaries in the JSX: the element has
 * either refused, or identification blocked the file, or there is a player — and
 * because identification blocks every file the element would only refuse, the
 * blocked arm is the one an unplayable file actually takes.
 */
type Viewing =
  /** The bytes are identified and playable; the Blob URL is not ready yet. */
  | { readonly kind: 'pending' }
  | { readonly kind: 'player'; readonly url: string }
  | { readonly kind: 'decode'; readonly error: number }
  | { readonly kind: 'blocked'; readonly obstacle: VideoObstacle }

/**
 * The body this package registers: the player inside its render fence.
 *
 * The fence is here rather than inside `VideoPlayer` because a component cannot
 * catch its own render, and because the dictionary is already bound at this
 * seat — the failure line a reader sees is translated like every other.
 * @param props - the same seats the player takes.
 * @returns the fenced player.
 */
export function VideoPreviewBody(props: VideoPlayerProps): ReactNode {
  return (
    <VideoBoundary message={props.t('failure.crash')} retry={props.t('retry')}>
      <VideoPlayer {...props} />
    </VideoBoundary>
  )
}

/** One decode attempt's outcome: what the bytes are, or that nothing identified them. */
interface Load {
  readonly data: Uint8Array<ArrayBuffer>
  readonly info: VideoInfo | undefined
}

/** Standard document props plus the video dictionary and transport store. */
export type VideoPlayerProps =
  & DocumentPreviewProps
  & PropsLocale<'sdkworkVideoPreview'>
  & PropsStore<VideoViewStore>

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
 * The audio-track clause of the track summary, inflected for the count.
 * @param count - how many audio tracks the container declares.
 * @param t - the namespace translator.
 * @returns a clause such as `2 audio tracks`, or undefined when there are none.
 */
function audioClause(count: number, t: VideoPlayerProps['t']): string | undefined {
  if (count === 0) return undefined
  return count === 1 ? t('audioTrack', { count }) : t('audioTracks', { count })
}

/**
 * The video type's body, registered under `sidebar.right.tab.document`.
 * @param props - file bytes and the framework-owned tab, store, and locale seats.
 * @returns the player, or an explanation of why the file cannot be played.
 */
export function VideoPlayer(props: VideoPlayerProps): ReactNode {
  const { tab } = props.useTabInfo()
  const view = props.useStore(state => state.byTab[tab.id] ?? DEFAULT_VIDEO_VIEW)
  const data = props.content.kind === 'bytes' ? props.content.data : undefined
  const { t, actions, resourceAddress, scrollportRef } = props
  const [load, setLoad] = useState<Load>()
  const [retryToken, setRetryToken] = useState(0)
  const [url, setUrl] = useState<string>()
  const [playing, setPlaying] = useState(false)
  const [position, setPosition] = useState(0)
  const [duration, setDuration] = useState(0)
  const [stage, setStage] = useState({ width: 0, height: 0 })
  const [measured, setMeasured] = useState<{ readonly width: number; readonly height: number }>()
  const [failed, setFailed] = useState<number>()
  const [fullscreen, setFullscreen] = useState(false)
  const [floating, setFloating] = useState(false)
  const [scrubbing, setScrubbing] = useState(false)
  const stageRef = useRef<HTMLDivElement | null>(null)
  const mediaRef = useRef<HTMLVideoElement | null>(null)

  // The two nodes the effects below attach to, mirrored into state so those
  // effects re-run when the nodes appear.
  //
  // A ref alone is not enough, and this is not a detail: the panel paints a
  // loading line first, so on the commit where the stage and the element are
  // finally mounted there is no state left that has *changed* — `playable` was
  // already true on the previous commit, when both nodes were still absent. An
  // effect keyed on it runs once against a null node and never again, which is
  // exactly how a fix-it-yourself zoom, a read-back picture-in-picture button,
  // and a restored tab's volume each quietly did nothing.
  const [stageNode, setStageNode] = useState<HTMLDivElement | null>(null)
  const [mediaNode, setMediaNode] = useState<HTMLVideoElement | null>(null)

  // The playhead the tab store holds, readable from an effect that must not
  // re-run every time the position changes.
  const storedPosition = useRef(view.position)
  useEffect(() => { storedPosition.current = view.position }, [view.position])

  // Identification and the reset that must accompany it. Keyed on the byte
  // identity, so switching a tab's document to another video starts a new
  // player rather than serving the previous file's duration and failure.
  useEffect(() => {
    if (data === undefined) return
    setLoad({ data, info: inspectVideo(data, extensionOf(resourceAddress)) })
    setFailed(undefined)
    setDuration(0)
    setPlaying(false)
    // Both of these belong to the file that is being replaced. A drag that is
    // still in progress when the tab moves on has no pointerup left to arrive,
    // and a picture size measured from the previous element describes a file
    // that is no longer on screen.
    setScrubbing(false)
    setMeasured(undefined)
    setPosition(storedPosition.current)
  }, [data, resourceAddress, retryToken])

  /** The stage is also the scrollport the document owner restores between mounts. */
  const bindStage = useCallback((node: HTMLDivElement | null): void => {
    stageRef.current = node
    setStageNode(node)
    scrollportRef(node)
  }, [scrollportRef])

  /** The element is what the browser's own presentation events arrive on. */
  const bindMedia = useCallback((node: HTMLVideoElement | null): void => {
    mediaRef.current = node
    setMediaNode(node)
  }, [])

  const info = load !== undefined && load.data === data ? load.info : undefined
  const obstacle = info === undefined ? undefined : playbackObstacle(info)
  const playable = obstacle === undefined
  const codec = info?.tracks.find(track => track.kind === 'video')?.name ?? t('unknown')

  /**
   * The picture size, which is what a zoom multiple is a multiple of.
   *
   * The container's own header is preferred, and the element is the fallback. A
   * transport stream keeps its dimensions inside the elementary stream rather
   * than in a table this preview reads, so its header declares none — and with
   * no size at all, a zoom had nothing to scale: the percentage in the bar moved
   * while the picture stayed at exactly the size the stylesheet gave it. The
   * element knows the size as soon as it has metadata, which is the one place
   * those files can be measured.
   */
  const picture = info?.width === undefined || info.height === undefined
    ? measured
    : { width: info.width, height: info.height }

  // The multiple that fits the picture inside the stage.
  //
  // This is deliberately NOT run through `clampZoom`. That ceiling exists to
  // stop a reader magnifying a picture into mush with the zoom buttons, and
  // applying it here made "fit" mean "as large as the zoom ceiling allows" — so
  // a 64×48 clip sat at 400% in a stage nine times its size while the label
  // claimed 400% and the element was drawn at 100%. The office previews clamp
  // only a multiple a reader asked for; the fitted one is what the stage
  // measures, which is the whole meaning of the word.
  const fitted = picture === undefined || stage.width === 0 || stage.height === 0
    ? 1
    : Math.min(
      (stage.width - STAGE_PADDING) / picture.width,
      (stage.height - STAGE_PADDING) / picture.height,
    )
  const scale = view.zoom === 'fit' ? fitted : view.zoom

  // One geometry, derived from the scale that is actually applied — including
  // when that scale is the fitted one. Letting the stylesheet size a fitted
  // picture instead (as this did) gave the label and the picture two different
  // ideas of the zoom: the label read the fitted multiple while the element was
  // left at its own size, so the first press of zoom-in silently jumped the
  // picture to the ceiling with the percentage unchanged.
  //
  // `undefined` only when the container never declared a picture size — a
  // transport stream, or a file whose sample description was unreadable — and
  // then the stylesheet fits whatever the element turns out to be.
  const size = picture === undefined
    ? undefined
    : { width: `${picture.width * scale}px`, height: `${picture.height * scale}px` }

  // Whether the file has told the element how long it is. An element reports
  // `NaN` until it has metadata, and a stream can keep reporting it forever, so
  // the seek bar and the clock are driven by this rather than by `duration === 0`
  // — a comparison `NaN` walks straight past, which is how a slider ends up
  // carrying `NaN` as its value.
  const seekable = Number.isFinite(duration) && duration > 0

  // The Blob is created from the byte array itself, and revoked by the effect
  // that created it. Slicing first would hold a second full copy of a file that
  // is already entirely in memory.
  useEffect(() => {
    // The order of these three tests is load-bearing beyond readability: each one
    // short-circuits on an input a caller really reaches, so no arm of this guard
    // is a case that cannot happen.
    if (data === undefined || info === undefined || !playable) {
      setUrl(undefined)
      return
    }
    // An attemptable container always declares its media type, so the element
    // gets the real one rather than a generic fallback.
    const created = URL.createObjectURL(new Blob([data], { type: info.container.mime }))
    setUrl(created)
    return () => { URL.revokeObjectURL(created) }
  }, [data, info, playable])

  // The stage is the scrollport the document owner restores between mounts, so
  // it is measured here: a fitted picture needs the box it must fit inside.
  // Keyed on the node rather than on playability, because the node is what the
  // measurement needs and the node is what arrives late.
  useEffect(() => {
    if (stageNode === null) return
    const measure = (): void => { setStage({ width: stageNode.clientWidth, height: stageNode.clientHeight }) }
    measure()
    if (typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(measure)
    observer.observe(stageNode)
    return () => { observer.disconnect() }
  }, [stageNode])

  // A zoom starts with no viewport to restore.
  useEffect(() => { centreViewport(stageRef.current) }, [scale])

  // The browser owns fullscreen and picture-in-picture, so both buttons read
  // back what it granted rather than tracking a state the user can leave by
  // pressing Escape. Picture-in-picture is announced on the element, so the
  // listeners follow the element rather than the panel.
  useEffect(() => {
    const onFullscreen = (): void => { setFullscreen(isFullscreen()) }
    const onFloating = (): void => { setFloating(isPictureInPicture()) }
    document.addEventListener('fullscreenchange', onFullscreen)
    mediaNode?.addEventListener('enterpictureinpicture', onFloating)
    mediaNode?.addEventListener('leavepictureinpicture', onFloating)
    return () => {
      document.removeEventListener('fullscreenchange', onFullscreen)
      mediaNode?.removeEventListener('enterpictureinpicture', onFloating)
      mediaNode?.removeEventListener('leavepictureinpicture', onFloating)
    }
  }, [mediaNode])

  // The stored transport state is applied to the element whenever either side
  // changes, because the element is remounted for every new file. The element
  // itself is one of the two sides: a tab reopened with its own volume, mute,
  // loop or rate has to have them put back on an element that starts at the
  // browser's defaults.
  useEffect(() => {
    if (mediaNode === null) return
    mediaNode.playbackRate = view.rate
    mediaNode.volume = view.volume
    mediaNode.muted = view.muted
    mediaNode.loop = view.loop
  }, [mediaNode, view.rate, view.volume, view.muted, view.loop])

  /**
   * Toggle playback, in the direction the element says it is already going.
   *
   * The element is the authority on whether it is playing, so a second press
   * pauses only once the first has actually left the paused state. Node's media
   * stubs throw rather than settle, and a rejection is not a failure.
   */
  const toggle = (): void => {
    const media = mediaRef.current
    if (media === null) return
    if (media.paused) void media.play().catch(() => { setPlaying(false) })
    else media.pause()
  }

  /** Move the playhead by a delta, clamped to the file. */
  const nudge = (delta: number): void => {
    const media = mediaRef.current
    if (media === null || !Number.isFinite(media.duration)) return
    const target = Math.min(Math.max(media.currentTime + delta, 0), media.duration)
    media.currentTime = target
    setPosition(target)
    actions.update(tab.id, { position: target })
  }

  /** Move the volume by a delta, clamped to silence on one end and unity on the other. */
  const fade = (delta: number): void => {
    const next = Math.min(Math.max(view.volume + delta, 0), 1)
    actions.update(tab.id, { volume: next, muted: false })
  }

  /** Re-run identification, which also rebuilds the Blob the element plays. */
  const retry = (): void => {
    setFailed(undefined)
    setRetryToken(token => token + 1)
  }

  /** Seek to a fraction of the duration, which is what the range input reports. */
  const seek = (fraction: number): void => {
    const media = mediaRef.current
    if (media === null || !Number.isFinite(media.duration)) return
    const target = media.duration * fraction
    media.currentTime = target
    setPosition(target)
    actions.update(tab.id, { position: target })
  }

  /**
   * Step the picture's scale, never against the direction the button names.
   *
   * The fitted multiple can be larger than the zoom ceiling — fitting is the
   * stage's measurement, not a step a reader took — and clamping a step into
   * that ceiling then moves the picture the wrong way: at a 1108% fit,
   * zoom-in computed 1385%, the ceiling pulled it to 400%, and the button made
   * the picture *smaller*. Bounding the result by the scale it started from
   * leaves each button meaning what it says.
   * @param factor - the multiple to apply to the current scale.
   */
  const stepZoom = (factor: number): void => {
    const stepped = clampZoom(scale * factor)
    const next = factor > 1 ? Math.max(scale, stepped) : Math.min(scale, stepped)
    // A step with nowhere to go leaves the state alone: storing the scale it
    // already had would drop the file out of its fitted state and un-press the
    // fit button, for a press that changed nothing on screen.
    if (next !== scale) actions.update(tab.id, { zoom: next })
  }

  /**
   * The keys the stage answers.
   *
   * Shortcuts belong to the stage itself: a key that reaches a focused control
   * inside the bar must do what that control does, exactly once.
   * @param event - the key event that reached the stage.
   */
  const onStageKey = (event: ReactKeyboardEvent<HTMLDivElement>): void => {
    if (event.target !== event.currentTarget) return
    if (event.key === ' ' || event.key === 'k' || event.key === 'K') { event.preventDefault(); toggle() } else if (event.key === 'ArrowRight') { event.preventDefault(); nudge(SEEK_STEP) } else if (event.key === 'ArrowLeft') { event.preventDefault(); nudge(-SEEK_STEP) } else if (event.key === 'ArrowUp') { event.preventDefault(); fade(VOLUME_STEP) } else if (event.key === 'ArrowDown') { event.preventDefault(); fade(-VOLUME_STEP) } else if (event.key === 'm' || event.key === 'M') { actions.update(tab.id, { muted: !view.muted }) } else if (event.key === 'l' || event.key === 'L') { actions.update(tab.id, { loop: !view.loop }) } else if (event.key === 'f' || event.key === 'F') { void toggleFullscreen(stageRef.current) }
  }

  if (data === undefined) {
    return <div className={css.status} role="alert"><span className={css.statusLine}>{t('failure.notVideo')}</span></div>
  }
  if (load?.data !== data) {
    return (
      <div className={css.status} data-video-loading>
        <span className={css.spinner} aria-hidden="true" />
        <span className={css.statusLine}>{t('loading')}</span>
      </div>
    )
  }
  if (info === undefined) {
    return (
      <div className={css.status} role="alert" data-video-unreadable>
        <span className={css.statusLine}>{t('failure.notVideo')}</span>
        <button type="button" className={css.retry} data-video-retry onClick={retry}>{t('retry')}</button>
      </div>
    )
  }

  const viewing: Viewing = failed !== undefined
    ? { kind: 'decode', error: failed }
    : obstacle !== undefined
      ? { kind: 'blocked', obstacle }
      : url === undefined
        ? { kind: 'pending' }
        : { kind: 'player', url }

  // Whether there is an element for the transport to drive. A file
  // identification blocked, or one the element itself refused, has none — and
  // then the bar and the stage's keyboard shortcuts go with it. Leaving them was
  // twelve controls that looked pressable and did nothing: only play,
  // picture-in-picture and the seek bar were even disabled, so volume, speed,
  // loop, zoom and fullscreen each invited a press that could not be honored.
  // The office previews drop their bar for the same reason. What stays is the
  // metadata list, which is the one part of this panel that is not a control:
  // for a file that cannot be played, the container, codec, picture size and
  // length are exactly what a reader deciding on a conversion needs.
  const live = viewing.kind === 'player' || viewing.kind === 'pending'
  const summary = summarizeTracks(info)
  const described = [
    summary.codec,
    audioClause(summary.audioTracks, t),
  ].filter(part => part !== undefined).join(' · ')
  // A container that declared no track this preview can name — an MPEG program
  // stream, whose streams live in the pack headers rather than in a table — left
  // this cell as a heading with nothing after it, which reads as a rendering
  // fault rather than as "nothing was declared".
  const tracks = described === '' ? t('unknown') : described

  /**
   * What goes on the stage: the element, nothing while the Blob is prepared, or
   * the explanation for a file that cannot be played.
   *
   * One value rather than a ternary inside the JSX, because both layouts below
   * render it — the one that carries a transport bar and the one that does not.
   */
  const stageBody = viewing.kind === 'player' ? (
    <video
      ref={bindMedia}
      className={size === undefined ? css.media : css.mediaSized}
      style={size}
      src={viewing.url}
      aria-label={t('stage', { name: info.container.name })}
      data-video-element
      playsInline
      preload="metadata"
      onLoadedMetadata={(event) => {
        const media = event.currentTarget
        setDuration(media.duration)
        // A container whose own header declared no picture size still has one,
        // and a loaded element is the only place it becomes readable: the
        // dimensions of an MPEG transport stream live in its elementary stream,
        // not in a table this preview parses.
        if (media.videoWidth > 0 && media.videoHeight > 0) {
          setMeasured({ width: media.videoWidth, height: media.videoHeight })
        }
        const resume = storedPosition.current
        if (resume > 0 && resume < media.duration) media.currentTime = resume
      }}
      onTimeUpdate={(event) => {
        // While the reader drags the slider, the slider is the truth; a
        // time update landing mid-drag would fight the thumb.
        if (!scrubbing) setPosition(event.currentTarget.currentTime)
      }}
      onPlay={() => { setPlaying(true) }}
      onPause={(event) => {
        setPlaying(false)
        // The element is the event's own target, so reading through a ref
        // here would only add an arm that cannot be true.
        actions.update(tab.id, { position: event.currentTarget.currentTime })
      }}
      onEnded={() => { setPlaying(false) }}
      onError={(event) => { setFailed(event.currentTarget.error?.code ?? 4) }}
    />
  ) : viewing.kind === 'pending' ? null : (
    <div className={css.explain} role="alert" data-video-explanation>
      <p className={css.explainTitle}>{info.container.name}{codec === t('unknown') ? '' : ` · ${codec}`}</p>
      <p className={css.explainBody}>
        {viewing.kind === 'decode'
          ? t('failure.decode', { container: info.container.name, codec })
          : viewing.obstacle.level === 'container'
            ? t('failure.container', { reason: t(`reason.${viewing.obstacle.reason}`) })
            : t('failure.codec', { reason: t(`reason.${viewing.obstacle.reason}`) })}
      </p>
      {viewing.kind === 'decode' && (
        <p className={css.explainDetail}>{t(MEDIA_ERROR_KEYS[viewing.error] ?? 'mediaDecode')}</p>
      )}
      {viewing.kind === 'decode' && (
        <button type="button" className={css.retry} data-video-explain-retry onClick={retry}>
          {t('retry')}
        </button>
      )}
    </div>
  )

  /**
   * The run time a container declared, rounded to the nearest second.
   *
   * Rounded rather than truncated, because a declared run time is a coarse
   * quantity: it is a frame count times a frame interval the header keeps in
   * whole microseconds, so a one-second AVI declares 0.99999 seconds and would
   * otherwise be shown as `0:00`. The element's own duration is a decoder's
   * measurement and shares the playhead's clock, so it is truncated with it.
   */
  const declaredClock = info.durationSeconds === undefined ? t('unknown') : clock(Math.round(info.durationSeconds))

  /**
   * The file's own facts, which a blocked file keeps when its controls go.
   *
   * This is the one part of the panel that is not an affordance, and for a file
   * the platform refuses it is the part that matters: the container, the codec,
   * the picture size and the length are what a reader weighs when deciding
   * whether converting the file is worth their time.
   */
  const facts = (
    <dl className={css.metadata} data-video-metadata>
      <div><dt>{t('container')}</dt><dd>{info.container.name}</dd></div>
      <div><dt>{t('codec')}</dt><dd>{codec}</dd></div>
      <div><dt>{t('dimension')}</dt><dd>{picture === undefined ? t('unknown') : `${picture.width} × ${picture.height}`}</dd></div>
      <div>
        <dt>{t('duration')}</dt>
        <dd>{seekable ? clock(duration) : declaredClock}</dd>
      </div>
      <div><dt>{t('tracks')}</dt><dd>{tracks}</dd></div>
    </dl>
  )

  // A file that cannot be played gets the explanation, the facts, and nothing
  // else. The stage is a plain box here rather than a keyboard-transport group:
  // a focusable region whose keys do nothing is the same dead affordance as a
  // bar full of buttons that do nothing, which is what this replaced.
  if (!live) {
    return (
      <div className={css.preview} data-video-preview>
        <div className={css.stage} ref={bindStage} data-video-stage>{stageBody}</div>
        {facts}
      </div>
    )
  }

  return (
    <div className={css.preview} data-video-preview>
      <div className={css.bar}>
        <button
          type="button"
          className={css.tool}
          aria-label={playing ? t('pause') : t('play')}
          title={playing ? t('pause') : t('play')}
          data-video-play
          disabled={viewing.kind !== 'player'}
          onClick={toggle}
        >
          {playing ? <PauseIcon /> : <PlayIcon />}
        </button>
        <span className={css.elapsed} data-video-elapsed>{t('elapsed', { current: clock(position), total: clock(duration) })}</span>
        <input
          type="range"
          className={css.seek}
          aria-label={t('seek')}
          aria-valuetext={t('elapsed', { current: clock(position), total: clock(duration) })}
          data-video-seek
          min={0}
          max={1000}
          value={seekable ? Math.round((position / duration) * 1000) : 0}
          disabled={viewing.kind !== 'player' || !seekable}
          onPointerDown={() => { setScrubbing(true) }}
          onPointerUp={() => { setScrubbing(false) }}
          // A drag the platform takes away — a touch the browser reads as a
          // scroll, a pointer released outside the window — arrives as a cancel
          // and as no release at all. Without this the scrub flag stayed up for
          // the rest of the session, and the time-update handler it guards then
          // ignored every update, so the clock and the thumb froze for good.
          onPointerCancel={() => { setScrubbing(false) }}
          onChange={(event) => { seek(Number(event.currentTarget.value) / 1000) }}
        />
        <button
          type="button"
          className={css.tool}
          aria-label={view.muted ? t('unmute') : t('mute')}
          title={view.muted ? t('unmute') : t('mute')}
          data-video-mute
          onClick={() => { actions.update(tab.id, { muted: !view.muted }) }}
        >
          {view.muted || view.volume === 0 ? <VolumeMutedIcon /> : <VolumeIcon />}
        </button>
        <input
          type="range"
          className={css.volume}
          aria-label={t('volume')}
          data-video-volume
          min={0}
          max={100}
          value={Math.round(view.volume * 100)}
          onChange={(event) => { actions.update(tab.id, { volume: Number(event.currentTarget.value) / 100, muted: false }) }}
        />
        <select
          className={css.rate}
          aria-label={t('speed')}
          data-video-rate
          value={String(view.rate)}
          onChange={(event) => { actions.update(tab.id, { rate: Number(event.currentTarget.value) }) }}
        >
          {PLAYBACK_RATES.map(rate => (
            <option key={rate} value={String(rate)}>{t('rateValue', { rate: String(rate) })}</option>
          ))}
        </select>
        <button
          type="button"
          className={css.tool}
          aria-label={t('loop')}
          title={t('loop')}
          aria-pressed={view.loop}
          data-video-loop
          onClick={() => { actions.update(tab.id, { loop: !view.loop }) }}
        >
          <LoopIcon />
        </button>
        <span className={css.divider} aria-hidden="true" />
        <button
          type="button"
          className={css.tool}
          aria-label={t('zoomOut')}
          title={t('zoomOut')}
          data-video-zoom-out
          onClick={() => { stepZoom(1 / ZOOM_STEP) }}
        >
          −
        </button>
        <span className={css.zoomLevel} data-video-zoom-level>{t('zoomLevel', { percent: Math.round(scale * 100) })}</span>
        <button
          type="button"
          className={css.tool}
          aria-label={t('zoomFit')}
          title={t('zoomFit')}
          aria-pressed={view.zoom === 'fit'}
          data-video-zoom-fit
          onClick={() => { actions.update(tab.id, { zoom: 'fit' }) }}
        >
          ⤢
        </button>
        <button
          type="button"
          className={css.tool}
          aria-label={t('zoomActual')}
          title={t('zoomActual')}
          data-video-zoom-actual
          onClick={() => { actions.update(tab.id, { zoom: 1 }) }}
        >
          {'1:1'}
        </button>
        <button
          type="button"
          className={css.tool}
          aria-label={t('zoomIn')}
          title={t('zoomIn')}
          data-video-zoom-in
          onClick={() => { stepZoom(ZOOM_STEP) }}
        >
          ＋
        </button>
        <span className={css.divider} aria-hidden="true" />
        <button
          type="button"
          className={css.tool}
          aria-label={t('pictureInPicture')}
          title={t('pictureInPicture')}
          aria-pressed={floating}
          data-video-pip
          disabled={viewing.kind !== 'player'}
          onClick={() => { void togglePictureInPicture(mediaRef.current) }}
        >
          <PictureInPictureIcon />
        </button>
        <button
          type="button"
          className={css.tool}
          aria-label={t('fullscreen')}
          title={t('fullscreen')}
          aria-pressed={fullscreen}
          data-video-fullscreen
          onClick={() => { void toggleFullscreen(stageRef.current) }}
        >
          {fullscreen ? <ExitFullscreenIcon /> : <FullscreenIcon />}
        </button>
      </div>
      <div
        className={css.stage}
        ref={bindStage}
        role="group"
        tabIndex={0}
        data-video-stage
        aria-label={t('stage', { name: info.container.name })}
        onKeyDown={onStageKey}
      >
        {stageBody}
      </div>
      {facts}
    </div>
  )
}
