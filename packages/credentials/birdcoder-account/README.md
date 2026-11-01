---
description: "Host provisioning of the BirdCoder relay from the signed-in SDKWork IAM session: mirrors the session token into the relay credential, declares the llm-pi-ai profile, and removes only those writes on sign-out."
kind: "package-reference"
---

# @deepseek-ai/dsh-birdcoder-account

English | [中文](README.zh.md)

## Summary

`dsh-birdcoder-account` turns the desktop shell's mirrored SDKWork IAM session into a ready-to-use BirdCoder relay. BirdCoder accepts the IAM `authToken` as its API key on its OpenAI-compatible `/v1` face, so a signed-in user needs no separate credential. The plugin stores the token under `BIRDCODER_API_KEY` and declares the `birdcoder` profile over `openai-completions` when settings have none. The Models page then shows a configured provider and its models, and dispatch authenticates with the token. A user-stored key always wins. Sign-out removes only the writes this plugin made and restores the previous default model.

## Table of Contents

- [Use this package](#use-this-package)
- [Understand the implementation](#understand-the-implementation)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)

<a id="use-this-package"></a>
## Use this package

The plugin needs the `credentials` service and the `settings` service; it uses `llm` and `agentDefaultModel` when the composition mounts them. It is a no-op when no mirrored session exists, which is the browser-only posture.

The Web/Desktop bundle ships the same `birdcoder` profile and sets `agent-default-model` to `birdcoder` / `deepseek/deepseek-v4-pro` (the DeepSeek entry the relay catalog leads with), so BirdCoder is the picker's first provider group and a fresh session's default before sign-in. The plugin then supplies the signed-in credential. Its own profile declaration and default-model switch remain for compositions that do not ship those rows.

```yaml
- id: birdcoder-account
  name: '@deepseek-ai/dsh-birdcoder-account'
  config:
    # Defaults shown; omit them unless the deployment relocates the files.
    sessionFile: /home/user/.birdcoder/iam/session.json
    stateFile: /home/user/.birdcoder/iam/birdcoder-account.json
    credentialRef: BIRDCODER_API_KEY
    settingsNs: llm-pi-ai
    pollIntervalMs: 2000
```

`sessionFile` defaults to `<DSH_HOME>/iam/session.json`, `stateFile` to `birdcoder-account.json` beside it, `credentialRef` to `BIRDCODER_API_KEY`, and `settingsNs` to the bundled `llm-pi-ai` entry. `pollIntervalMs: 0` disables polling and leaves only the mount-time reconciliation.

### Signed-in behavior

On each reconciliation the plugin reads the session and:

- **Mirrors the token** into `credentialRef` when the reference is unconfigured, or when the value there is the token this plugin wrote for the previous session. A different value is a user's API key and is left untouched.
- **Declares the profile** `{ providers: { birdcoder: { api: 'openai-completions', apiKeyEnv } } }` in `settingsNs` when that section has no BirdCoder profile. The OpenAI-compatible face is the one that resolves a non-`sk-` bearer value as an IAM auth token; BirdCoder's Anthropic face accepts API keys only. A profile that already exists — including the one the bundle ships — is never edited or removed.
- **Selects a relay default** when the current default is the unauthenticated `deepseek-official` route and no other provider resolves a configured credential: it saves the first BirdCoder model, preferring a `deepseek` id. This is the fallback for a composition that does not ship the bundle's BirdCoder default; a default the user already moved to another provider is left alone.

### Sign-out behavior

The marker beside the session records which writes belong to this plugin. When the session disappears, the plugin removes the mirrored credential, removes the provider profile only while it still equals the declared shape, keeps a user-stored key and its profile, and restores the previous default selection when the current one is still the BirdCoder selection it saved. A malformed session file is not a sign-out: the last state is kept so a transient read cannot drop a live credential.

<a id="understand-the-implementation"></a>
## Understand the implementation

The plugin owns no Cordis service. It creates one controller in `apply`, which reconciles the session file on mount and on the poll interval, serializes overlapping reconciliations, and stops on fiber disposal. The controller receives the credential and settings seams as narrow ports, so its regression suite drives it without a Loader. The session and marker readers live in `src/session.ts`; the token is hashed with SHA-256 before the marker records it, so the marker never contains the secret.

Polling is deliberate: the desktop shell writes the session atomically, and a small `stat`-free re-read per interval is cheaper to own than a cross-platform watcher whose teardown must be exact. The interval bounds how long after login the relay becomes available and how long after sign-out it goes away.

<a id="model-experience"></a>
## Model Experience

None, as the package configures relay credentials and provider settings; it adds no prompt section, tool, or session content.

#### KV Cache effect

No prompt bytes change. When the plugin selects the BirdCoder default, the next request targets a different provider route, so provider-side prefix reuse does not carry across that switch.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

- **Desktop-only login source** — the plugin reads the session file the desktop shell mirrors under `<DSH_HOME>/iam`. A browser-only sign-in leaves no host file, so the relay is configured there by storing its API key.
- **The declared profile uses OpenAI Chat Completions** — the login token authenticates on BirdCoder's `/v1` face. A user who wants the Anthropic face stores a relay API key and edits the profile's protocol; the login token does not authenticate there.
- **Model listing needs an API key** — BirdCoder's `GET /v1/models` authenticates an API key, not the login token, so a signed-in user sees the shipped relay seed until a key is stored or models are added by hand.
- **Polling latency** — a login or sign-out reaches the Host on the next interval (two seconds by default), not instantly.
- **Credential detection is reference-based** — the default-model switch checks each configured provider profile's `apiKeyEnv`; a provider that authenticates through provider-native ambient discovery without naming a reference is not detected as authenticated.
- **Without the shipped profile, the declaration is a user-settings write** — a deployment that does not ship the bundle profile and makes the settings document read-only keeps the mirrored credential but gets no provider profile.

<a id="dev-note"></a>
### Dev Note

The [BirdCoder relay routes](../../llm/llm-pi-ai/src/relay.ts) own the endpoint and seed catalog; this package only supplies the credential and profile a signed-in session makes possible.
