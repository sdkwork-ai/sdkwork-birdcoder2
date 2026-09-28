# Agent Note: Contain a plugin-injected Tailwind sheet in its own layer and scope

Status: implemented

English | [中文](2026-09-28-plugin-tailwind-embed-cascade-containment.zh.md)

## Problem

Every fork client bundle that styles with Tailwind compiles its own `@layer utilities` from its own `@source` roots and injects it as a `<style data-plugin-css>` tag when the bundle loads: `ui-sdkwork-apikey`, `ui-sdkwork-token-plan`, `ui-sdkwork-appstore`, `ui-sdkwork-markets`, `ui-sdkwork-knowledge`, `ui-sdkwork-course`, `ui-sdkwork-drive`, `ui-sdkwork-generations-assets`, `ui-sdkwork-generations-image`, and `ui-sdkwork-generations-video`. The sheets share class names but not variant sets — all ten define `.bg-white`, `ui-sdkwork-token-plan` and the three application sheets stop there, while only the api-key sheet also defines `bg-slate-50`, `sm:w-72` and the `dark:bg-*` twins of the console view's palette.

Inside one cascade layer document order decides, so the last-injected sheet owned every class name it happened to define. In the API-key management modal on a dark host that produced a white toolbar card, a white search field, a white table body, a white create drawer, a wrapped primary-button label (another sheet's `.w-full` beat `sm:w-auto`), and a light error banner — while the table header and footer stayed correctly dark, because `bg-slate-50` appears in no other sheet. The symptom therefore looked like a broken `dark:` variant rather than a cross-bundle collision, and it moved with bundle load order rather than with the modal.

## Decision

The api-key embed's compiled Tailwind sheet is contained on two axes, and both are owned by `packages/client/ui-sdkwork-apikey`.

**Layer.** `tsdown.config.ts` wraps the compiled sheet in `@layer dsh-sdkwork-apikey-embed`. `apps/web/src/index.css` opens with `@layer properties, theme, base, components, utilities, dsh-sdkwork-embedded-app, dsh-sdkwork-apikey-embed;`, and layer position comes from a layer's first declaration — so the embed's rules outrank `utilities` and the fork's shared `dsh-sdkwork-embedded-app` layer no matter which bundle loads last.

**Scope.** Inside that layer the sheet is emitted under two `@scope` roots: `[data-apikeys-embed]` for the modal's own subtree, and `body[data-apikeys-embed-portal] to (#root)` for the overlays the console view portals to `document.body` (the group cell popover, the group picker, and the quick-import menu). The second root is the *body*, not the overlay, because a plain selector cannot match its own scope root; the `to (#root)` limit keeps it off the application the modal covers. `ApiKeysModal.tsx` writes `data-apikeys-embed` on the embed root and sets `data-apikeys-embed-portal` on the body for the modal's open lifetime.

`src/client/embedScope.ts` is the single home for the attribute, scope, limit, and layer names, imported by both the component and the build config, so the two sides cannot drift.

## Alternatives considered

**Priority without containment (the layer alone).** It repairs the embed and breaks every other surface: a late layer's `.bg-white` beats every earlier layer's `dark:bg-*`, so the application sheets behind the modal would have inherited the same defect.

**Containment without a late layer (the `@scope` wrap alone).** `@scope` adds no specificity, so inside `utilities` the embed's rules still lose to whichever sheet landed later. The layer and the scope are each necessary.

**Removing the duplicated `@source` rows for the cloudrouter sources from `apps/web/src/index.css`.** The shell sheet carries the same utilities, so this removes one compiler from the disagreement — but the runtime-injected sheets still land after the shell's `<link>`, so the collision survives. It also costs the api-key classes a fallback when the plugin sheet is absent.

**Scoping with selector prefixing instead of `@scope`.** Prefixing reaches the portaled overlay roots in one scope and needs no limit, but it requires rewriting compiled selectors with a CSS parser, pseudo-elements and `@keyframes` steps included. `@scope` is one wrapper, is already used in this repository (`ui-sidebar-documentpreview`'s Excel preview), and the two-root form costs only a second copy of the sheet.

**Marking the body without the `to (#root)` limit.** The body-rooted scope would then restyle the whole application behind the mask for as long as the modal is open.

**`!important` on the embed's utilities.** It wins over other layers, but it also wins over the harness's own styles inside the embed and cannot be overridden at the surface that owns a rule.

## Consequences

The embed renders identically in both themes regardless of which fork bundles are loaded and in which order, and the sheet can no longer affect any surface outside the two scopes. The compiled sheet is emitted twice, which adds about 81 KB minified to a bundle already near 2 MB; gzip shrinks that to a few KB, and the copies are identical text.

The layer order is now a contract carried by `apps/web/src/index.css`. A shell that drops the statement leaves the position of `dsh-sdkwork-apikey-embed` to bundle load order, which is the defect this note removes.

The theme custom properties the sheet declares on `:root` fall outside both scope roots and are inert; the shell sheet declares the same Tailwind theme, and `apps/web/src/index.css` re-derives the `primary-*` and `lobster-*` ramps from the harness tokens.

The collision remains between the other nine sheets, `ui-sdkwork-token-plan`'s unwrapped and class-based dark variant being the clearest case; containing them is the same change applied package by package, and is not part of this decision.

## Testing

`packages/client/ui-sdkwork-apikey/tests/modal.client.spec.tsx` pins the embed attribute, the readiness value, and the body mark across the open, closed, and unmounted states. The rendering itself was verified in Chromium against the built `lib/client.js` and the built shell stylesheet with the token-plan, appstore, markets, and knowledge sheets injected afterwards: toolbar `#252525`, search field `#1e1e1e`, table header and body dark, drawer `#1e1e1e`, portaled menu `#1e1e1e`, primary button `108x38` unwrapped, and every one of them light in light mode. The same document with the body mark cleared shows the portaled menu losing the sheet and an element inside `#root` never gaining it.
