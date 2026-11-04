# Agent Note: Model selection before sign-in

Status: implemented

English | [中文](2026-11-04-model-selection-sign-in-preview.zh.md)

## Problem

A signed-out BirdCoder workspace had no selectable models. `llm-pi-ai` advertises a relay route's seed catalog only once its credential resolves, so the shipped `birdcoder` profile produced no provider group, the composer model seat showed its "Select model" placeholder, and there was no surface from which the user could ask for the account that would make those models usable. The startup welcome window — where an unauthenticated launch signs in — was unreachable from a running workspace.

## Decision

A route the adapter ships a catalog for, but no credential reaches yet, becomes a **sign-in preview**: its models are shown, and choosing one asks for the product sign-in before the selection is submitted.

- **Adapter seam.** `LlmAdapter.documentedModels(provider)` answers with the models the adapter's shipped catalog documents for a route regardless of credentials; `LlmRuntime.documentedModels` validates and detaches it like `listModels`. `llm-pi-ai` overrides it for the harness relay routes (`sdkwork`, `birdcoder`) only: pi-ai's installed catalog describes many providers a deployment never offers, and listing every one of them signed out would drown the picker. `listModels` keeps returning nothing for a route that cannot serve a request, so routing and `modelAvailable` stay honest.
- **Catalog projection.** `buildModelCatalog` falls back to `documentedModels` only when `listModels` answered empty, marks the group `requiresSignIn`, and leaves it out of `routableProviders`: the catalog advertises what the user may pick next without claiming the Host can dispatch there yet. The group carries the same model metadata (names, reasoning efforts) as a configured route.
- **Selection gate.** `ui-model-selection` lists the preview group with a localized "Sign in" tag; choosing one calls the mounted `ctx.iam.requestSignIn()` and then re-reads the per-session directory until the Host stops marking the route, and only then submits the selection. A dismissed sign-in leaves the current model unchanged and reports it. The same short wait also covers a sign-in surface that stores a provider credential instead of a session. Both entries — the `/model` popup and the composer seat — use the gate, and a composition without the IAM service keeps the Host's own refusal.
- **Desktop surface.** `ui-sdkwork-iam.requestSignIn()` opens the desktop shell's welcome page — `window.dshDesktop.auth.openSignIn()`, implemented by `apps/desktop` — over the running workspace. The page reports the gesture it ended with: `login` raises the in-app IAM login surface (password, phone code, email code, QR), `credential` reports the API-key write, and `dismissed` (or closing the page) answers "no". The workspace document is not reloaded, so the pending selection survives the login; the previous `enterWorkspace` path remains the startup and sign-out behavior. A plain browser page opens the in-app surface directly. The in-app surface is also the sign-in entry for everything else: the welcome's one-shot sign-in request raises it instead of starting the hosted OAuth browser flow, and the dual-token session it commits is mirrored into `<DSH_HOME>/iam/session.json` through the desktop bridge, so a restored session skips the surface entirely.

## Alternatives considered

**Advertise preview models through `listModels` and mark availability elsewhere.** Lost: `listModels` is also the Host's availability check for `selectModel` and prompt admission, so preview rows would be selectable against a route that cannot dispatch, and the client would need a second readiness fact to compensate.

**Hard-code the relay seed in the client.** Lost: the seed is generated from the SDKWork catalog and already lives in `llm-pi-ai`; a client copy would drift on every catalog bump.

**Reuse the startup `enterWorkspace` path for a sign-in demanded mid-session.** Lost: it navigates the workspace again, so the page reloads and the pending model selection, menu state, and drafts are lost.

**Open only the in-page IAM modal on desktop.** Lost: the product's sign-in page is the welcome window a signed-out launch shows, and the request asks for that page.

**Hand the desktop sign-in to the hosted OAuth browser flow.** Lost: that flow needs the tenant application registered as an OAuth relying party with the deep-link redirect URI, and the deployed tenant answers its authorize endpoint with `invalid_client` (OAuth client not registered or enabled), so the browser shows an API error instead of a login page. The in-app IAM surface carries the same account methods and commits the same durable dual-token session without that registration.

## Consequences

A signed-out BirdCoder workspace now names its default model, lists the relay models, and turns a pick into a sign-in request; a completed sign-in applies the pick without a reload. Signing in is opt-in: dismiss the page and the previous model stays. The Models page still shows readiness honestly — the route reports no available models until a credential resolves — and a user-stored key removes the preview state entirely, so the picker behaves as before.

The gate waits at most fifteen seconds for the Host to republish the catalog after a login and three seconds when the gesture ended without a session; the credential arrives through the desktop mirror's two-second reconciliation plus the adapter's catalog reload. A browser-only sign-in does not provision the relay credential (the Host has no mirrored session there), so the pick reports that the model is still unavailable and points at the provider credential; the API-key path in the welcome page covers that deployment.

## Testing

`packages/llm/llm/tests/service.spec.ts` covers the documented-models seam including its absence and detaching. `packages/llm/llm-pi-ai/tests/catalog.spec.ts` proves a relay route documents its seed while `listModels` stays empty, and that an installed non-relay route documents nothing. `packages/api/session-controller/tests/session-models.host.spec.ts` pins the `requiresSignIn` group and its exclusion from `routableProviders`. `packages/client/ui-model-selection/tests` covers the gate helper, the composer seat's sign-in flow and cancellation, and both entries' shared state through the IAM seam. `packages/client/ui-sdkwork-iam/tests/iam-deeplink-login-e2e.client.spec.ts` drives the welcome-page gesture through the real desktop bridge and deep-link callback. `apps/desktop/tests/welcome-startup.spec.ts` opens the sign-in page over a running workspace and proves the document is not reloaded.
