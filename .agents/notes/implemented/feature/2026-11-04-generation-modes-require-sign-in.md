# Agent Note: Generation modes state their sign-in requirement before use

Status: implemented

English | [中文](2026-11-04-generation-modes-require-sign-in.zh.md)

## Problem

The `image` and `video` mode pages deferred their sign-in requirement to the transport. Signed out, the complete Agents creative (生成) surface mounted — composer, presets, model choice, session list — and the first user-initiated request was held inside the SDK interceptor chain until a session existed. The mode therefore looked usable without an account: it invited a prompt and only then answered with a login demand, or with a rejection when the overlay was dismissed. Its account-scoped server state — the creative session list — has no anonymous form at all, so the deferred policy promised browsing the mode could not deliver.

## Decision

Generation needs a session for the work it creates, so both generation pages state that requirement before the surface mounts.

- **Eager mode-page gate.** `ImageGenerationsPage` and `VideoGenerationsPage` render through `AuthenticatedSdkworkModePage` without a deferred policy: signed out, the page renders its own notice (`auth.required.title`, `auth.required.detail`, `auth.required.action`) and the embedded creative surface does not mount; the notice's own Sign in button is the only thing that opens the IAM overlay. The copy ships in each package's dictionary — "登录后使用图片生成" / "Sign in to use image generation" and "登录后使用视频生成" / "Sign in to use video generation".
- **Transport half retained.** `creativeHost.createCreativeInterceptors` keeps `createSignInRequestInterceptor`, so a session that ends while the page stays mounted holds the next user-initiated request at the door instead of dispatching it anonymously.
- **Deferred policy deleted.** `signInPolicy="deferred"` had no consumer left, so `AuthenticatedModeShell` and `AuthenticatedSdkworkModePage` always require a session and the `SdkworkModeSignInPolicy` export is gone. Every gated mode page — Drive, Knowledge, Assets, Course, Chat, Contacts, Image, Video — now states the same requirement in the same way.
- **Stale copy removed.** The video page's `page.*` composer dictionary was left over from the surface it no longer renders; the embedded Agents creative page owns that copy now.

## Alternatives considered

**Keep the page browsable and gate only the generate action.** Lost: the product requirement is that generation is unavailable before sign-in, and a mounted composer whose first submission is refused by an overlay reads as a broken Generate button — the first request would also have been an anonymous one held at the interceptor.

**Keep the deferred policy as an unused option.** Lost: no page declares it after this change, and an option with no consumer is a second behavior that only the shell's own spec would keep alive.

**Gate the rail entry instead (hide or disable the icon).** Lost: the rail is the mode map, and the other private modes keep their seat and state the requirement on the page; hiding the entry would make Image and Video disappear for signed-out users while Drive and Assets stayed visible.

## Consequences

Signed out, both modes show the sign-in notice in place of the creative workbench, and Sign in raises the same login surface every other entry uses. Signed in, the surface mounts exactly as before: the session list loads, generation dispatches, and a session that expires mid-page still parks the next request at the transport gate. The modes never fetch their account-scoped session list anonymously, and the rail layout, mode ids, and Code default are unchanged.

## Testing

`packages/client/ui-sdkwork-generations-image/tests/generations-page.client.spec.tsx` and its video sibling assert that the notice replaces the surface while signed out, that the creative app stays unmounted, that the notice's button is the only overlay entry, and that the surface mounts while signed in. `packages/client/ui-sdkwork-iam/tests/authenticated-mode-shell.client.spec.tsx` keeps the shell's notice/mount contract. `apps/web/tests/app-modes.e2e.ts` asserts that both modes render the notice and issue no fetch on the anonymous assembled fixture.
