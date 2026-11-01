# Agent Note: BirdCoder relay provisioning from the IAM session

Status: implemented

English | [中文](2026-11-02-birdcoder-account-model-provisioning.zh.md)

## Problem

The BirdCoder relay accepts two credentials: an API key issued for `api.birdcoder.com`, or the SDKWork IAM session's `authToken` used as that API key. `llm-pi-ai` understands only the first: a relay profile is a settings document entry naming a credential reference, and the Models page treats a provider as usable only when that reference is stored. A signed-in user therefore faced a configured-but-unusable BirdCoder row and had to paste a key the product had already issued a token for.

The desktop shell mirrors the committed IAM session to `<DSH_HOME>/iam/session.json`, so the Host can read the same complete session the renderer holds. The missing piece was turning that file into the relay's credential and profile, keeping a user's own key authoritative, and undoing the automatic writes on sign-out.

## Decision

A Host plugin, `@deepseek-ai/dsh-birdcoder-account`, reconciles the mirrored session on mount and on a two-second poll:

- **Credential mirror.** The plugin reads the session's `authToken` and stores it under `BIRDCODER_API_KEY` through `ctx.credentials`. It reads the reference first: an unconfigured reference, or a value whose hash equals the marker's recorded hash, is replaced; any other value is a user's key and is never touched.
- **Profile declaration.** When `llm-pi-ai` has no `birdcoder` profile, the plugin writes `{ providers: { birdcoder: { api: 'openai-completions', apiKeyEnv: 'BIRDCODER_API_KEY' } } }` through `ctx.settings.update`. The protocol is the OpenAI-compatible `/v1` face because BirdCoder's auth-token channel resolves a non-`sk-` bearer value there; its Anthropic face accepts API keys only. An existing profile is classified `foreign` and is never edited or removed. The shipped relay catalog then registers the route and advertises its models; inference resolves the mirrored credential through the normal `apiKeyEnv` path, so no adapter change was needed.
- **Default model.** The shipped bundle already names BirdCoder, so this is a fallback for compositions that do not. When the saved default is the unauthenticated `deepseek-official` route and no other provider profile resolves a configured credential reference, the plugin saves the first BirdCoder model, preferring a `deepseek` id. It never moves a default the user placed on another provider.
- **Ownership marker.** `<DSH_HOME>/iam/birdcoder-account.json` records a SHA-256 digest of the last mirrored token, the profile ownership (`none`, `provisioned`, or `foreign`), and the selection switch it made. The marker never stores the token.
- **Sign-out.** An absent session removes the credential only when its hash still matches, removes a `provisioned` profile only while the user layer still deep-equals the declared shape, keeps a user key and its profile, and restores the previous default while the selection is still the one it saved. A malformed session file is not a sign-out; the last state is kept.

The web-app bundle ships the same profile and sets `agent-default-model` to `birdcoder` / `deepseek/deepseek-v4-flash`, so the relay is the picker's first provider group and a fresh session's default before sign-in. The plugin then classifies the profile `foreign` and supplies only the credential; its own declaration and default switch cover compositions that do not ship those rows.

The Models page needed no change: a stored credential is its readiness fact, and the plugin supplies one.

## Alternatives considered

**Change `llm-pi-ai` to consult a BirdCoder account service for a missing key.** Lost: it spreads a product login rule into the generic adapter and leaves the Models page's credential check reporting `unconfigured`, so the page and request path would disagree about readiness.

**Ship the BirdCoder profile in the web-app bundle.** Lost: it advertises relay models to signed-out users, makes the profile a permanent base-layer fact no user can remove, and still needs the same session mirror for the credential.

**Push the token from the renderer through `credentials.set`.** Lost: the selected source is the Host-readable session file, which also serves headless launches; a renderer push would duplicate the secret path and give the browser-only composition a second login authority.

**Watch the session with a file watcher.** Lost for now: the desktop writes atomically, and a small periodic reconcile is cheaper to own than a watcher whose creation, directory appearance, and teardown must be exact on every platform. The poll interval is a configuration boundary rather than an invariant.

## Consequences

On Web and Desktop, BirdCoder leads the model picker and is the deployment default model; a saved user selection still wins. A signed-in user gets BirdCoder models without opening the Models page, and the credential that serves them is the login token the user already has. A user who pasted an API key keeps it; the plugin never turns a user key into the session token. Sign-out returns the composition to the unconfigured BirdCoder state, including the default model, without deleting a user's own edits.

The automatic write is visible in the profile patch and removable from the Models page. Removing the profile while signed in is remembered for that session; the next login re-provisions it. A browser-only sign-in has no Host session file and keeps the API-key path. A deployment that makes `llm-pi-ai` read-only keeps the mirrored credential but no profile. The default-model switch only recognizes providers that name a credential reference; a provider using provider-native ambient discovery is not seen as authenticated.

BirdCoder's `GET /v1/models` authenticates an API key rather than a login token, so a signed-in user sees the shipped relay seed in the picker until a key is stored or models are entered by hand. A user who wants the Anthropic face stores a relay API key and edits the profile's protocol; the login token does not authenticate there.

## Testing

`packages/credentials/birdcoder-account/tests/birdcoder-account.spec.ts` drives the controller with real temp files and fake credential/settings/model seams: sign-in mirrors the token, declares the OpenAI Chat Completions profile, and selects a relay default; a user key is never overwritten; a rotated session refreshes only the plugin's own value; sign-out removes the credential, profile, and default switch; a user key and its profile survive sign-out; a corrupt session keeps the last state; a non-official default and another provider's configured key both suppress the switch; a pre-existing profile is never removed; and repeated polls are idempotent. `tests/settings-integration.spec.ts` writes the profile through the real settings service and resolves it through the real adapter, proving the route is serviceable with its shipped model catalog; `tests/plugin.spec.ts` covers the plugin's service wiring and disposal. `packages/bundle/web-app/tests/birdcoder-default.spec.ts` pins the shipped profile, the BirdCoder default, and the default model's presence on the resolved relay route; the Model settings and model-selection client suites pin BirdCoder-first provider order.
