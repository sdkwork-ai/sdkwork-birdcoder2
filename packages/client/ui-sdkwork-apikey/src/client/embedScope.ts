/**
 * The embed's cascade scope, shared by the two sides that must agree on it:
 * `ApiKeysModal.tsx` writes the attributes onto the DOM, and
 * `tsdown.config.ts` wraps the compiled Tailwind sheet in the matching
 * `@layer`/`@scope` pair.
 *
 * Why the sheet needs containing at all: every fork client bundle that styles
 * with Tailwind compiles its own copy of `@layer utilities` from its own
 * source roots and injects it as a `data-plugin-css` style tag at load. Those
 * sheets carry overlapping class names but different variant sets, and inside
 * one cascade layer document order decides — so whichever bundle loaded last
 * owned `bg-white`, and when that sheet had no `dark:bg-*` twin the api-key
 * embed's toolbar, table and drawer rendered white on a dark host while the
 * classes only this sheet defined (`bg-slate-50`, `sm:w-72`) stayed correct.
 * Confining this sheet to its own surfaces, inside a layer that always sorts
 * last, makes the outcome independent of bundle load order.
 */

/**
 * Marks the modal's embed root. The value doubles as the host-adapter
 * readiness marker (`ready` / `unconfigured`).
 */
export const APIKEY_EMBED_ATTRIBUTE = 'data-apikeys-embed'

/**
 * Set on `<body>` for as long as the modal is open, so the sheet also reaches
 * the surfaces the console view portals to `document.body` (the group cell
 * popover, the group picker, and the quick-import menu).
 */
export const APIKEY_EMBED_PORTAL_ATTRIBUTE = 'data-apikeys-embed-portal'

/** Scope root of the embed's own subtree. */
export const APIKEY_EMBED_SCOPE = `[${APIKEY_EMBED_ATTRIBUTE}]`

/**
 * Scope root of the view's `document.body` overlays. It is the body rather
 * than the overlay itself because inside `@scope` a plain selector cannot
 * match its own scope root — only `:scope` can — and those overlays carry the
 * utilities on their root element.
 */
export const APIKEY_EMBED_PORTAL_SCOPE = `body[${APIKEY_EMBED_PORTAL_ATTRIBUTE}]`

/**
 * Scoping limit for {@link APIKEY_EMBED_PORTAL_SCOPE}: the shell's application
 * mount point (`packages/client/web/src/base.css` states the same relation, and
 * every covering overlay is a body child beside it). Without the limit the
 * body-rooted scope would restyle the whole application behind the modal.
 */
export const APIKEY_EMBED_PORTAL_LIMIT = '#root'

/**
 * Cascade layer the embed's compiled utilities are wrapped in. It must be
 * declared after `utilities` and after the fork's shared
 * `dsh-sdkwork-embedded-app` layer, which is what `apps/web/src/index.css`
 * does up front; layer position comes from a layer's first declaration, so
 * that statement keeps this one last no matter when the bundle loads.
 */
export const APIKEY_EMBED_CSS_LAYER = 'dsh-sdkwork-apikey-embed'
