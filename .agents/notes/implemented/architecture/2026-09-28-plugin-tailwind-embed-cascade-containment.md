# Agent Note: Contain a plugin-injected Tailwind sheet in its own layer and scope

Status: implemented

English | [中文](2026-09-28-plugin-tailwind-embed-cascade-containment.zh.md)

## Problem

Every fork client bundle that styles with Tailwind compiles its own `@layer utilities` from its own `@source` roots and injects it as a `<style data-plugin-css>` tag when the bundle loads: `ui-sdkwork-apikey`, `ui-sdkwork-token-plan`, `ui-sdkwork-appstore`, `ui-sdkwork-markets`, `ui-sdkwork-knowledge`, `ui-sdkwork-course`, `ui-sdkwork-drive`, `ui-sdkwork-generations-assets`, `ui-sdkwork-generations-image`, and `ui-sdkwork-generations-video`. The sheets share class names but not variant sets — all ten define `.bg-white`, `ui-sdkwork-token-plan` and the three application sheets stop there, while only the api-key sheet also defines `bg-slate-50`, `sm:w-72` and the `dark:bg-*` twins of the console view's palette.

Inside one cascade layer document order decides, so the last-injected sheet owned every class name it happened to define. In the API-key management modal on a dark host that produced a white toolbar card, a white search field, a white table body, a white create drawer, a wrapped primary-button label (another sheet's `.w-full` beat `sm:w-auto`), and a light error banner — while the table header and footer stayed correctly dark, because `bg-slate-50` appears in no other sheet. The symptom therefore looked like a broken `dark:` variant rather than a cross-bundle collision, and it moved with bundle load order rather than with the modal.

The same mechanism hit the App Store sheet family. Its AI-hub agent grid asks for `grid-cols-1 … @3xl:grid-cols-4`, while the course, drive, knowledge and generations sheets carry only the base `.grid-cols-1`; whichever of them loaded last won that class inside the App Store surface, so the agent grid rendered a single 1710px column inside a 1758px container. Load order is deterministic at boot and re-arranged by every HMR rebuild, so the grid flipped between one and four columns with the build instead of the page.

## Decision

The api-key embed's compiled Tailwind sheet is contained on two axes, and both are owned by `packages/client/ui-sdkwork-apikey`.

**Layer.** `tsdown.config.ts` wraps the compiled sheet in `@layer dsh-sdkwork-apikey-embed`. `apps/web/src/index.css` opens with `@layer properties, theme, base, components, utilities, dsh-sdkwork-embedded-app, dsh-sdkwork-appstore-embed, dsh-sdkwork-apikey-embed;`, and layer position comes from a layer's first declaration — so the embed's rules outrank `utilities` and the fork's shared `dsh-sdkwork-embedded-app` layer no matter which bundle loads last.

**Scope.** Inside that layer the sheet is emitted under two `@scope` roots: `[data-apikeys-embed]` for the modal's own subtree, and `body[data-apikeys-embed-portal] to (#root)` for the overlays the console view portals to `document.body` (the group cell popover, the group picker, and the quick-import menu). The second root is the *body*, not the overlay, because a plain selector cannot match its own scope root; the `to (#root)` limit keeps it off the application the modal covers. `ApiKeysModal.tsx` writes `data-apikeys-embed` on the embed root and sets `data-apikeys-embed-portal` on the body for the modal's open lifetime.

`src/client/embedScope.ts` is the single home for the attribute, scope, limit, and layer names, imported by both the component and the build config, so the two sides cannot drift.

**App Store family.** The sheets of `ui-sdkwork-appstore`, `-markets`, `-template-library` and `-demand-hall` compile the same App Store application sheet, so they agree with each other and disagree with the application sheets that carry only their own utilities. Only their `@layer utilities` rules move into their own later layer, `dsh-sdkwork-appstore-embed` (declared after `dsh-sdkwork-embedded-app` and before `dsh-sdkwork-apikey-embed`), wrapped in `@scope (<surface attribute>)` — `[data-appstore-surface]`, `[data-markets-surface]`, `[data-template-library-surface]`, `[data-demand-hall-surface]`. The theme, preflight, component, and document rules stay in `dsh-sdkwork-embedded-app`: moving the whole sheet later carried Tailwind's preflight (`* { margin: 0; padding: 0; border: 0 }`) above every other application's utilities and stripped their padding and borders document-wide (measured: another mode's `p-4` element computed `padding: 0`), while the split keeps that preflight in `base`, below every application's `utilities`. Only `utilities` is scoped: `theme` must keep declaring the Tailwind custom properties the utilities resolve, and each host's own `:root`/`body` rules are already contained by the layer.

`packages/client/embedded-app-styles.ts` owns the layer names, the canonical order, and the scope helper the four build configs share; `apps/web/src/index.css` restates the same order. With the family layer in place the old `CROSS_PLUGIN_CASCADE_PATCH` — `!important` re-assertions of `md:flex`, `xl:flex`, `xl:block` and `2xl:block` inside `[data-appstore-surface]` — is gone: the family sheet now outranks every other embedded sheet inside its own surface, so its own responsive utilities decide.

## Alternatives considered

**Priority without containment (the layer alone).** It repairs the embed and breaks every other surface: a late layer's `.bg-white` beats every earlier layer's `dark:bg-*`, so the application sheets behind the modal would have inherited the same defect.

**Containment without a late layer (the `@scope` wrap alone).** `@scope` adds no specificity, so inside `utilities` the embed's rules still lose to whichever sheet landed later. The layer and the scope are each necessary.

**Removing the duplicated `@source` rows for the cloudrouter sources from `apps/web/src/index.css`.** The shell sheet carries the same utilities, so this removes one compiler from the disagreement — but the runtime-injected sheets still land after the shell's `<link>`, so the collision survives. It also costs the api-key classes a fallback when the plugin sheet is absent.

**Scoping with selector prefixing instead of `@scope`.** Prefixing reaches the portaled overlay roots in one scope and needs no limit, but it requires rewriting compiled selectors with a CSS parser, pseudo-elements and `@keyframes` steps included. `@scope` is one wrapper, is already used in this repository (`ui-sidebar-documentpreview`'s Excel preview), and the two-root form costs only a second copy of the sheet.

**Marking the body without the `to (#root)` limit.** The body-rooted scope would then restyle the whole application behind the mask for as long as the modal is open.

**`!important` on the embed's utilities.** It wins over other layers, but it also wins over the harness's own styles inside the embed and cannot be overridden at the surface that owns a rule.

**Scoping the whole App Store sheet instead of its utilities only.** Tailwind's `theme` layer declares the `:root` custom properties (`--spacing`, `--container-*`) every utility reads; a `:root` selector inside a surface scope matches nothing, so the sheet would lose its spacing and sizing scale unless the host happened to declare the same theme. The api-key sheet can afford that because the shell declares the same Tailwind theme; the App Store surface relies on its own.

## Consequences

The embed renders identically in both themes regardless of which fork bundles are loaded and in which order, and the sheet can no longer affect any surface outside the two scopes. The compiled sheet is emitted twice, which adds about 81 KB minified to a bundle already near 2 MB; gzip shrinks that to a few KB, and the copies are identical text.

The layer order is now a contract carried by `apps/web/src/index.css`. A shell that drops the statement leaves the position of `dsh-sdkwork-apikey-embed` to bundle load order, which is the defect this note removes.

The theme custom properties the sheet declares on `:root` fall outside both scope roots and are inert; the shell sheet declares the same Tailwind theme, and `apps/web/src/index.css` re-derives the `primary-*` and `lobster-*` ramps from the harness tokens.

The App Store family renders four columns in every load order, and the removed patch leaves no `!important` utility overrides in the App Store surface. Splitting the sheet also keeps the family's preflight out of the other applications: another mode's `p-4` element keeps its 16px padding whichever tag lands last, where the whole-sheet late layer reduced it to zero. The other application sheets (course, drive, knowledge, and the three generations hosts) still collide with each other inside their own modes; containing them is the same late layer-and-scope change applied package by package, and is not part of this decision. `ui-sdkwork-token-plan`'s unwrapped, class-based dark variant remains the clearest case.

## Testing

`packages/client/ui-sdkwork-apikey/tests/modal.client.spec.tsx` pins the embed attribute, the readiness value, and the body mark across the open, closed, and unmounted states. The rendering itself was verified in Chromium against the built `lib/client.js` and the built shell stylesheet with the token-plan, appstore, markets, and knowledge sheets injected afterwards: toolbar `#252525`, search field `#1e1e1e`, table header and body dark, drawer `#1e1e1e`, portaled menu `#1e1e1e`, primary button `108x38` unwrapped, and every one of them light in light mode. The same document with the body mark cleared shows the portaled menu losing the sheet and an element inside `#root` never gaining it.

`scripts/client-bundle-css.spec.ts` pins the canonical layer order, the family split (document rules in the shared layer, utilities scoped in the late layer), and the string/comment-safe utilities scanner. `apps/web/tests/embedded-app-css.e2e.ts` injects the family sheet and a competing application sheet in both orders in a real browser and asserts four tracks, the `hidden md:flex` reveal on desktop, `none` below 48rem, no leak outside the surface, and that another application's `p-4` keeps its 16px padding; it also pins the pre-containment grid collision (both sheets in one unwrapped layer → one track) and the whole-sheet late layer's preflight leak (another application's padding → zero). The compiled sheets were measured in Chromium with every sibling sheet injected before and after the App Store sheet: four tracks in all orders, sidebar `flex` on desktop and `none` below 48rem, and the brand colour resolving.
