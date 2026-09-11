/**
 * The two presentation modes a video preview offers beyond its own panel.
 *
 * Both are browser-owned: the preview asks for fullscreen on the stage and for
 * picture-in-picture on the element, and reads back what the browser granted
 * rather than tracking its own idea of the state. That matters because the
 * browser can leave either mode without the preview — Escape, a system gesture,
 * the element losing its metadata — and a preview with its own flag would then
 * show a button whose meaning no longer matches the screen.
 *
 * These live outside the component so every branch is testable directly: jsdom
 * implements neither API, so the null cases and the optional calls are pinned
 * here rather than through a rendered element.
 */

/**
 * The presentation APIs as a host that implements none of them presents itself.
 *
 * The DOM types declare all six members as always present, which is true of the
 * browsers this ships to but not of every host a preview can render in — jsdom
 * among them, and jsdom is where the branches below are actually exercised.
 * Describing them as optional here is what keeps "the platform has no fullscreen"
 * a reachable branch instead of a condition the compiler can prove dead.
 */
interface PresentationApi {
  readonly fullscreenElement?: Element | null
  readonly pictureInPictureElement?: Element | null
  readonly requestFullscreen?: () => Promise<void>
  readonly exitFullscreen?: () => Promise<void>
  /**
   * Resolves once the element is in picture-in-picture. The window it opens is
   * not what this preview consumes, and describing the promise as `void` here is
   * what lets the element be viewed as such a host at all.
   */
  readonly requestPictureInPicture?: () => Promise<unknown>
  readonly exitPictureInPicture?: () => Promise<void>
}

/**
 * The document viewed as such a host.
 *
 * Going through `unknown` is the point rather than noise: the DOM types promise
 * every member is there, so a direct assertion reads as redundant widening. It
 * is not — it is the opposite, a deliberate re-interpretation of a type that is
 * too confident for the hosts this code actually runs in.
 * @returns the document, with every presentation member possibly absent.
 */
function presentationDocument(): PresentationApi {
  const host: unknown = document
  return host as PresentationApi
}

/**
 * Whether the stage is currently the fullscreen element.
 * @returns true when the browser reports a fullscreen element.
 */
export function isFullscreen(): boolean {
  const element = presentationDocument().fullscreenElement
  return element !== null && element !== undefined
}

/**
 * Whether the media element is currently in picture-in-picture.
 * @returns true when the browser reports a picture-in-picture element.
 */
export function isPictureInPicture(): boolean {
  const element = presentationDocument().pictureInPictureElement
  return element !== null && element !== undefined
}

/**
 * Enter or leave fullscreen on the stage.
 *
 * The request is a no-op where the platform implements no fullscreen API, so a
 * preview rendered in an environment without it keeps a working button that
 * simply cannot change anything.
 * @param stage - the element to present fullscreen, or null before it mounts.
 */
export async function toggleFullscreen(stage: HTMLElement | null): Promise<void> {
  if (stage === null) return
  if (isFullscreen()) await presentationDocument().exitFullscreen?.()
  else await (stage as PresentationApi).requestFullscreen?.()
}

/**
 * Enter or leave picture-in-picture on the media element.
 * @param media - the video element, or null for a file that has no player.
 */
export async function togglePictureInPicture(media: HTMLVideoElement | null): Promise<void> {
  if (media === null) return
  if (isPictureInPicture()) await presentationDocument().exitPictureInPicture?.()
  else await (media as PresentationApi).requestPictureInPicture?.()
}
