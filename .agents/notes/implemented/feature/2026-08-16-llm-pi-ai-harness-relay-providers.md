# Agent Note: Harness-shipped relay providers in dsh-llm-pi-ai

Status: implemented

English | [中文](2026-08-16-llm-pi-ai-harness-relay-providers.zh.md)

## Problem

The product needed `sdkwork` and `birdcoder` — OpenAI-compatible relay services like OpenRouter, at `https://api.sdkwork.com/v1` and `https://api.birdcoder.com/v1` — available as providers on the Models settings page, with the same out-of-the-box experience as a catalog provider like `openrouter`: offered in the "add provider" dropdown before any configuration, activated by storing an API key, and usable for all mainstream models. Neither route exists in the installed pi-ai catalog, and a route pi-ai does not ship is normally declared per-deployment in `settings.yaml`, which would make sdkwork/birdcoder invisible until a user writes a profile by hand. BirdCoder's gateway is built for Claude Code first: it serves Anthropic Messages by default, with OpenAI Responses (Codex) and Chat Completions on the same host.

## Decision

Ship both relays as harness-side catalog members inside `packages/llm/llm-pi-ai` — no new package, no `LlmRuntime`/Service-Definition change, no UI change (the configurable-provider directory and the Models page render them like any catalog route):

- **A harness relay catalog.** `relay.ts` adds `HARNESS_RELAYS`: `sdkwork` (`https://api.sdkwork.com/v1`, `api: openai-completions`) and `birdcoder` (`https://api.birdcoder.com/v1`, `api: anthropic-messages` by default), both displayName `SDKWork`/`BirdCoder`, sharing a seed of the SDKWork models catalog ([the catalog projection](2026-11-01-relay-models-from-sdkwork-catalog.md)): every chat model the catalog publishes, DeepSeek first, stamped to the route's default protocol and its endpoint. A seed model borrows the installed openrouter catalog entry's facts (name, capacities, modalities, reasoning dispatch) when pi-ai describes the same model, so the seed stays accurate without duplicating catalog data; a borrowed `compat` block travels only while that entry speaks the same protocol. `catalog.ts` includes the relay entries in `catalogProvider()`, `catalogProviderIds()` (sorted), and `catalogModels()`, so `directoryEntries`, `resolveRouteModels`, and `buildProvider`'s catalog-reuse path work unchanged. `harnessApiKeyAuth` lives in `relay.ts` beside the provider construction both consumers share.
- **Protocol faces.** A relay entry names its OpenAI-compatible `/v1` base and its Anthropic `/anthropic` base. The OpenAI faces append `/chat/completions` or `/responses` to `/v1`; Anthropic's SDK appends `/v1/messages`, so BirdCoder's default Messages face is `https://api.birdcoder.com/anthropic`. A relay profile that names `api: openai-responses` (Codex) or `api: openai-completions` resolves to that protocol's face without restating `baseURL`; an explicit profile `baseURL` still wins, and a protocol-less profile keeps the seed's face.
- **Profile resolution.** `resolveProfiles` falls back to the harness entry's displayName, so a configured card shows `SDKWork`/`BirdCoder` while the dormant dropdown keeps route ids like every catalog route. The directory's `defaultBaseURL` is the default protocol's face, so the card shows the endpoint its requests actually use.
- **Discovery interrogates the relay endpoint.** The seed is the SDKWork catalog projection, not the endpoint's own listing, so `discoverModels` excludes harness routes from the installed-catalog short-circuit and asks `GET {baseURL}/models` instead, falling back to the shipped endpoint when the draft names none (or clears one). The Models page "fetch models" action therefore pulls the relay's complete model list.
- **Key convention.** The Models page stores keys under the derived references `SDKWORK_API_KEY` / `BIRDCODER_API_KEY` (`deriveKeyRef`); headless deployments write `sdkwork: { apiKeyEnv: SDKWORK_API_KEY }` in settings.

## Alternatives considered

| Rejected | One-line reason |
|---|---|
| Declare both routes in the base bundle's `cordis.patch.yml` | Makes them active-by-default composition facts of one bundle instead of catalog citizens; headless/raw deployments mounting `llm-pi-ai` would not get them, and the dormant dropdown (the "like openrouter" experience) would not offer them |
| A dedicated `llm-sdkwork` package | Duplicates the whole pi-ai adapter; both relays are plain gateways the generic adapter already serves |
| Wire-pull discovery only after the user types a baseURL | Harness routes already ship their endpoint; asking the user to retype it for "fetch models" contradicts the catalog-route posture |

## Consequences

The Models page's provider dropdown gains `sdkwork` and `birdcoder` in every composition mounting `llm-pi-ai` (the web/desktop bundles mount it dormant). BirdCoder's default protocol is Anthropic Messages; moving it to Codex Responses or Chat Completions is a profile `api` edit, and the endpoint follows. The seed module is generated from the SDKWork models catalog (`relay-models.generated.ts`), and the materialization and endpoint facts live in `relay.ts`; a relay whose dialect or endpoint differs is overridden per profile as usual. The base bundle's dormant comment and `agent-default-model` stay unchanged — sdkwork/birdcoder are dormant until configured, and the default agent model remains `deepseek-official`.

## Testing

`catalog.spec.ts` pins catalog membership and seed stamping, the dormant directory entry (`declared: false`, its `defaultBaseURL` being the default protocol's face), an end-to-end Anthropic Messages stream through a mock server, the protocol-face override (`openai-responses` and `openai-completions` resolve to `/v1` without a restated endpoint), both stream methods delegating to the relay provider, empty-profile resolution with displayName fallback, and the seed's membership and order (DeepSeek first, catalog order after) with the installed pi-ai catalog mocked empty. `discovery.spec.ts` pins endpoint interrogation for a harness route (never the seed short-circuit) and the shipped-endpoint fallback for absent/cleared draft baseURLs. `models-settings.e2e.ts` asserts both options in the add-provider dropdown; the models-settings and onboarding goldens carry them in their option lists.
