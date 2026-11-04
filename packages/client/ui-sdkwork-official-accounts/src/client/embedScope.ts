/**
 * The embed's cascade scope, shared by the two sides that must agree on it:
 * `OfficialAccountsModal.tsx` writes the attributes onto the DOM, and
 * `tsdown.config.ts` wraps the compiled Tailwind sheet in the matching
 * `@layer`/`@scope` pair.
 *
 * The embedded IAM page styles with Tailwind utilities compiled from its own
 * source roots. Every fork bundle that does the same compiles its own copy of
 * `@layer utilities`, and inside one cascade layer document order decides — so
 * a later-loading sheet without the matching `dark:` twin would win the shared
 * class names inside this dialog. Confining the sheet to the dialog subtree,
 * inside a layer that always sorts last, makes the outcome independent of
 * bundle load order (the containment `ui-sdkwork-apikey` documents).
 */

/**
 * Marks the dialog's embed root. The value doubles as the adapter readiness
 * marker (`ready` / `unconfigured`).
 */
export const OFFICIAL_ACCOUNTS_EMBED_ATTRIBUTE = 'data-official-accounts-embed'

/**
 * Set on `<body>` for as long as the dialog is open, so the sheet also reaches
 * the surfaces the IAM page portals to `document.body` (the account drawer,
 * the confirm dialog, and the full-screen custom-menu manager).
 */
export const OFFICIAL_ACCOUNTS_EMBED_PORTAL_ATTRIBUTE = 'data-official-accounts-embed-portal'

/** Scope root of the dialog's own subtree. */
export const OFFICIAL_ACCOUNTS_EMBED_SCOPE = `[${OFFICIAL_ACCOUNTS_EMBED_ATTRIBUTE}]`

/**
 * Scope root of the page's `document.body` overlays. It is the body rather
 * than the overlay itself because inside `@scope` a plain selector cannot
 * match its own scope root — only `:scope` can — and those overlays carry the
 * utilities on their root element.
 */
export const OFFICIAL_ACCOUNTS_EMBED_PORTAL_SCOPE = `body[${OFFICIAL_ACCOUNTS_EMBED_PORTAL_ATTRIBUTE}]`

/**
 * Scoping limit for {@link OFFICIAL_ACCOUNTS_EMBED_PORTAL_SCOPE}: the shell's
 * application mount point (`packages/client/web/src/base.css` states the same
 * relation, and every covering overlay is a body child beside it). Without the
 * limit the body-rooted scope would restyle the whole application behind the
 * dialog.
 */
export const OFFICIAL_ACCOUNTS_EMBED_PORTAL_LIMIT = '#root'

/**
 * Cascade layer the embed's compiled utilities are wrapped in. It must be
 * declared after `utilities` and after the other embedded-surface layers,
 * which is what `apps/web/src/index.css` does up front; layer position comes
 * from a layer's first declaration, so that statement keeps this one last no
 * matter when the bundle loads.
 */
export const OFFICIAL_ACCOUNTS_EMBED_CSS_LAYER = 'dsh-sdkwork-official-accounts-embed'
