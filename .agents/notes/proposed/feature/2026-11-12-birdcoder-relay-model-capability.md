# Agent Note: BirdCoder relay models from the signed-in account

Status: proposed

English | [中文](2026-11-12-birdcoder-relay-model-capability.zh.md)

## Problem

BirdCoder's model capability is meant to need no API key: the login session's SDKWork IAM `authToken` is the relay's credential, and the relay's `GET /v1/models` (the OpenAI-compatible Cloud Router open API) answers with the models the account can route to. Three gaps break that promise.

1. The desktop shell encrypts `<DSH_HOME>/iam/session.json` with the operating system secret store, and the Host runs in a child process that cannot use it. `@deepseek-ai/dsh-birdcoder-account` therefore read no `authToken`: a signed-in user's BirdCoder row stayed unconfigured, the picker marked every relay model "Sign in", and Models showed the `llm-pi-ai` missing-credential error.
2. The Models page has one readiness fact — a stored credential reference — so even when the account supply works, the row presents the login token as a saved API key the user never typed, and offers no way to tell "signed in" from "key stored".
3. Model discovery runs through the route's credential and reports a bare 401. Before sign-in, the "fetch available models" action has nothing to authenticate with and does not offer the login the picker offers.

## Proposal

**Account supply (shipped).** The desktop shell writes the relay credential into `<DSH_HOME>/iam/relay-session.json` — a plaintext sibling carrying only `authToken`, never the access or refresh token — whenever it commits the durable session, removes it on sign-out, and refreshes it at startup for sessions written by older builds. The account plugin reads that projection first and falls back to a plaintext durable session, so headless writers keep working. The plugin stores the token under `BIRDCODER_API_KEY` through `ctx.credentials`; a user-stored value still wins and is never replaced.

**Credential source in the Models page (next).** A route whose credential the account plugin owns presents an account state instead of the write-only key field: the card names the signed-in account, states that requests use the login session, and keeps a deliberate "use an API key instead" path that writes a user key and ends the account supply for that route. The readiness fact becomes "a credential resolves", which is what dispatch already asks, rather than "a value is stored". Deleting the mask must not silently recreate it on the next poll: the user-layer profile records that the user chose the key path, and the plugin stops re-provisioning that route until sign-out.

**Discovery (next).** "Fetch available models" resolves the same credential dispatch would: the typed key in the draft, else the route's resolved credential (account token or stored key). With neither, it raises the mounted sign-in surface — the picker's existing gate — and retries once the Host republishes the catalog, instead of showing a 401. The returned list continues to flow through `llm/discoverModels`, so the endpoint stays the authority over the shipped seed.

**Open API definition (shipped in cloudrouter).** `GET /v1/models` and `GET /v1/models/{model}` document both credential channels: a gateway API key with an `sk-`/`sp-` prefix, or an SDKWork IAM login auth token with the optional `Access-Token` dual-token companion. The response's `displayName` and `vendorDisplayName` extension fields are part of the contract, and the concrete catalog router accepts the login channel with the same classifier as chat so every composition, not only the production invocation pipeline, answers the same way.

**Browser-only sign-in (deferred).** A browser page has no shell file. Giving it the same account supply means pushing the committed session token through `credentials.set` from the client IAM service, which needs the ownership marker moved to a Host-side record so sign-out still removes only that write. That is deliberately not part of this change: the desktop is the product's signing surface, and a browser-only user keeps the API-key path.

## Related

The account-supply decision and its rationale live in [BirdCoder relay provisioning from the IAM session](../../implemented/feature/2026-11-02-birdcoder-account-model-provisioning.md); this note extends it rather than restating it.

## Alternatives considered

**Only project the session through the shell.** Lost for the browser case, and the projection alone does not answer the Models page's question: whether the resolved credential came from the account or from the user.

**Write the full session in plaintext and drop the OS secret store.** Lost: the refresh token is long-lived and local processes could read it; the derived projection exposes exactly the bearer the Host stores in its own plaintext credential file anyway.

**Have the Host ask the shell over IPC for the decrypted session.** Lost: it adds a second process channel, a Host-side service, and lifecycle coordination for a credential the shell can project in one atomic write beside the file it already owns.

**Add a dedicated `GET /v1/models/available`.** Lost: the OpenAI-compatible listing is already the contract the product calls, the client already resolves it, and a second path would duplicate the catalog and its group scoping for no new information.

**Mark the credential source in the credential record instead of the profile.** Lost: the credential seam stores secrets for every provider and has no product-owner vocabulary; the profile is where an account-owned route and the user's override are already distinguishable.

## Acceptance criteria

- A fresh desktop sign-in, with no key typed, leaves the BirdCoder row configured and the picker lists its models as routable (no "Sign in" group), within one poll interval.
- "Fetch available models" on that route returns the endpoint's list and the selection sheet opens; it never reports 401 while a session is available.
- A user-stored API key wins over the account token and survives sign-out; sign-out removes the mirrored token, the provisioned profile, and the relay projection, and restores the previous default.
- No plaintext file contains the refresh or access token; `relay-session.json` contains only `authToken`, `savedAt`, and its version.
- A session carried over from a build without the projection reaches the Host on the next launch without a new login.
- The cloudrouter contract names both credential channels and the model metadata, and the concrete catalog router authenticates a login token in a Rust test.

## Risks

- **Plaintext bearer on disk.** The projection and the Host credential file both hold the relay token in plaintext; the OS secret store protects only the durable session. Mitigation: owner-only file modes, no refresh token in the projection, and removal with the session.
- **Account-owned credential surprises.** A user who edits the mask could still be re-provisioned until the profile records their choice; the sign-out path must keep the user key and its profile.
- **Deployment mismatch.** A gateway that accepts API keys only still rejects the login token; the shipped seed keeps the picker usable, and the limitation stays documented.
