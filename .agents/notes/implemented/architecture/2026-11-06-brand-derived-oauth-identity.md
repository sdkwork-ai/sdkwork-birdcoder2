# Agent Note: Derive a brand's desktop login identity from its URL scheme

Status: implemented

English | [中文](2026-11-06-brand-derived-oauth-identity.zh.md)

## Problem

The desktop browser login presents an OAuth public client and returns through a deep link, and the IAM platform registers one client per brand with that brand's callback. The shipped defaults in `packages/host/sdkwork-oem/src/config.ts` spell one brand's pair (`birdcoder` and `birdcoder://auth/callback`), so every other brand had to patch those constants or ship an OEM profile naming its own pair. A profile that named another brand's client together with this brand's callback produced a login the authorization server rejected: the hosted page could not start the authorization (`OAuth redirect_uri is not registered for this client`), and because the rejected pair does not match the SDKWork callback shape the page cannot hand the error back either. The application then waits for the flow deadline and reports a generic failure that names the wrong step. A derived brand merging the upstream sources also re-inherits the upstream's constants, so the fix had to be repeated after every sync.

## Decision

The OEM resolver derives the login identity from the brand the launch runs as. The Desktop shell exports `desktop.protocol` from the brand manifest as `DSH_BRAND_PROTOCOL` on every launch — packaged, development app, CLI launcher, or a bare import — and `resolveOemConfig` resolves a profile that names neither `sdkwork.iamClientId` nor `sdkwork.iamRedirectUri` to `<scheme>` and `<scheme>://auth/callback`. A profile that names a different client or callback fails the launch, before any window presents a login.

The constants `DEFAULT_IAM_CLIENT_ID` and `DEFAULT_IAM_REDIRECT_URI` remain the shipped brand's pair and decide a launch that reports no scheme. They are no longer the source of a derived brand's identity, so a merge from the upstream sources does not change that brand's login, and the brand's own constants are not a merge conflict waiting to happen.

One brand therefore needs no profile to log in, no per-brand patch to a shared package, and no shared home: two brands resolve two clients and two callbacks from their own manifests, and a profile left in the wrong home fails loudly instead of failing after the redirect.

## Alternatives considered

**Patch the constants per brand.** This is what a derived repository did. It works for one brand and re-inherits the upstream pair on every merge, so the login breaks on the sync that follows a defaults change.

**Require an OEM profile per brand.** A profile is still the way to override every other origin, but requiring one for the login identity makes a correct build depend on deployment data that lives outside the repository, and a missing or stale profile fails only at login time.

**Accept any registered client and callback pair.** The authorization server does accept a client whose redirect is another brand's scheme, but that shell never receives the callback, so the flow can only time out. Equality with the running scheme is the contract that keeps one brand per install.

## Consequences

`packages/host/sdkwork-oem` owns the derivation and the rejection; the Desktop shell owns reporting the scheme. A test asserts both: a synthetic second brand resolves its own pair with no profile, and the first brand's pair in that home fails. `packages/client/ui-primitives` keeps the shipped pair as the page's fallback for a page with no OEM projection, which cannot run the browser hand-off anyway.

A brand added to a derived repository now needs only its manifest to log in, provided its tenant registers that client and callback. The [OEM profile reference](../../../../packages/host/sdkwork-oem/README.md) states the derivation, and the [brand manifest reference](../../../../brands/README.md) states that `desktop.protocol` supplies it.
