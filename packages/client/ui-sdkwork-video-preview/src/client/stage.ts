/**
 * Stage geometry: how big the picture is, and where the viewport sits on it.
 *
 * Both are DOM measurements, which is why they are not in the component: jsdom
 * has no layout at all, so the branches that guard a missing node would be
 * unreachable through a rendered player and could only ever be covered by
 * contorting a test. Here they are two small functions a spec can call directly
 * with a real element and with none.
 */
/** The smallest scale the stage offers, below which the picture is unusable. */
export const MIN_ZOOM = 0.1

/** The largest scale the stage offers. */
export const MAX_ZOOM = 4

/** The multiple one zoom button press applies, matching the office previews. */
export const ZOOM_STEP = 1.25

/**
 * Clamp a zoom multiple into the supported range.
 *
 * The result is a plain multiple, never `'fit'`: fitting is a state the store
 * holds, not something a caller can ask to be clamped to. Returning the wider
 * type would make every multiple downstream of this a union, so arithmetic on
 * one would be a type error the compiler could not resolve.
 * @param value - the requested multiple.
 * @returns the multiple the stage will actually apply.
 */
export function clampZoom(value: number): number {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, value))
}

/**
 * Centre a scrollport on its content.
 *
 * A zoomed picture grows away from the origin, so without this a reader who
 * zooms in is looking at the top-left corner of the frame. Called with the stage
 * before it mounts, which is why the node is optional.
 * @param node - the stage element, or null before the first ref callback.
 */
export function centreViewport(node: HTMLElement | null): void {
  if (node === null) return
  node.scrollLeft = Math.max(0, (node.scrollWidth - node.clientWidth) / 2)
  node.scrollTop = Math.max(0, (node.scrollHeight - node.clientHeight) / 2)
}
