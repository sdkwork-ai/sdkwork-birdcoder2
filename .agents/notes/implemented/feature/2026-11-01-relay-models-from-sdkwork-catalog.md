# Agent Note: Relay models come from the SDKWork models catalog

Status: implemented

English | [中文](2026-11-01-relay-models-from-sdkwork-catalog.zh.md)

## Problem

The two relay routes this distribution ships (`sdkwork`, `birdcoder`) seeded a hand-kept list of fifteen mainstream ids borrowed from the installed OpenRouter catalog. That list aged with the build rather than with the market: the picker offered GPT-4o, GPT-4.1, and Claude 4.5 long after every vendor had shipped successors, and it still led with `deepseek/deepseek-v4-flash` after the catalog retired that model. Nothing tied the seed to the catalog that records what each vendor actually serves, so refreshing the picker was a code change nobody scheduled.

## Decision

`packages/llm/llm-pi-ai/src/relay-models.generated.ts` is a projection of the sibling `sdkwork-models` catalog, written by `scripts/generate-sdkwork-relay-models.mjs`. It carries every chat model the catalog calls current — `shelfState: listed`, `routingState: enabled`, and `lifecycle` plus `releaseStage` both `active` or `preview` — minus the legacy member of any replacement chain whose successor is also offered: 86 rows at catalog `2026.11.01.1`, with the id, display name, vendor, context window, output cap, and input modalities the catalog states.

The order is the catalog's own mainstream order (vendor `sortOrder`, then lifecycle, then `rankScore`), except that the DeepSeek block is hoisted to the top. DeepSeek-first is a BirdCoder product decision, not a catalog fact, so it is the only reordering the projection performs; every other vendor keeps the order the SDKWork models app shows.

Two deprecation rules shape the set. The vendor's preferred region decides a model's status: its global row when the vendor publishes one, otherwise the region that does, so a model the global catalog deprecated does not seed even when a regional catalog still lists it as active (two ByteDance rows at this catalog version), while a model that exists only in a regional catalog keeps that region's row. And a row whose `replacementModel` resolves — through the chain, cycle-guarded — to another offered row is dropped: the picker shows the head of each replacement chain (Claude Opus 4.5–5 and Sonnet 5 give way to Opus 5.5 and Sonnet 5.5, Fable 5 to Fable 5.1, Gemini 3.1 Flash Live Preview to Gemini 3.8 Live) instead of every legacy member. A row whose named successor is not offered is kept, so no model disappears without a visible replacement. The generator refuses a projection that would repeat a catalog key, split a vendor across blocks, show a model beside its named successor, or lead with any vendor but DeepSeek.

`relay.ts` materializes each row as a pi-ai model. When the installed OpenRouter catalog describes the same model — under the catalog key, a vendor alias (`xai`→`x-ai`, `zhipu`→`z-ai`, `moonshot`→`moonshotai`, `alibaba`→`qwen`), or OpenRouter's dotted version spelling (`claude-opus-4-5`→`claude-opus-4.5`) — the seed borrows that entry's wire facts and keeps its `compat` block only while the relay speaks the same protocol. A row pi-ai does not describe still seeds: it routes and lists, without reasoning dispatch or compatibility switches.

The seed is still a projection, not the endpoint. The Models page's "Fetch available models" interrogates the relay itself, and a profile's `models` or `modelOverrides` still replaces what the seed offers.

The web-app bundle's default model moves to `deepseek/deepseek-v4-pro`, the DeepSeek entry the seed leads with. The retired `deepseek/deepseek-v4-flash` no longer exists in the catalog, so keeping it would have shipped a default the picker cannot show.

## Alternatives considered

**Fetch the models app API at runtime.** The models service publishes `GET /app/v3/api/ai/models` anonymously, and the Host could call it through `@sdkwork/models-app-sdk`. Lost: that listing carries id, name, modalities, and capacities but no ordering or recency signal — it is alphabetical within a vendor — so "latest first" and DeepSeek-first would have to be recomputed in the Host from data the service does not send. It would also make every picker load depend on a network call the offline desktop start must survive, and the relay catalog is a Host-side static fact today. The catalog projection carries the curated ordering the SDKWork models app itself sorts by; a runtime refresh becomes worth its cost only if the service starts publishing that ordering.

**Keep the hand-kept seed and add the newest ids.** Lost: it repeats the same decay. The next vendor release restores the complaint, and nothing records which catalog version the list was written against.

**Seed only the models the installed OpenRouter catalog describes.** Lost: it would drop exactly the newest rows — DeepSeek V4.1 Flash, Claude Mythos, several OpenAI cyber models — because pi-ai's catalog lags the SDKWork catalog. Those are the models this change exists to offer.

**Generate one row per vendor, the vendor's flagship only.** Lost: vendors ship several concurrent lines (flagship, fast, cyber, multilingual) and users pick between them. A single row per vendor is a narrower product than the catalog describes.

## Consequences

- The picker offers every current catalog chat model instead of fifteen curated ids. The list is long and vendor-heavy; provider grouping and the name search are what keep it navigable.
- A seeded model pi-ai does not describe has no effort selector: `reasoning` is false and no `compat` block travels, so the harness sends the relay's defaults for that model.
- Regeneration is a fork chore after a catalog bump (`node scripts/generate-sdkwork-relay-models.mjs`); `--check` re-projects the catalog in memory and exits non-zero when the committed seed is stale, so a review can prove alignment instead of reading the diff.
- A seed id the deployment does not serve still appears in the picker; selecting it fails at request time like any unavailable model, and "Fetch available models" is the way to see the endpoint's actual set.
- The birdcoder-account fallback that prefers a `deepseek` id now selects `deepseek/deepseek-v4-pro` in compositions that ship no default of their own.

## Testing

`packages/llm/llm-pi-ai/tests/catalog.spec.ts` pins the seed's membership and order (DeepSeek block first; current flagships present; retired, deprecated, hidden, regionally deprecated, and superseded ids absent), one row per catalog key, contiguous vendor blocks, positive capacities and a `Vendor: Model` label on every resolved model, exact resolution order on both the default Anthropic face and the shipped `openai-completions` face, a row pi-ai does not describe still seeding, and — with the installed pi-ai catalog mocked empty — the seed resolving from catalog rows alone. `packages/bundle/web-app/tests/birdcoder-default.spec.ts` pins the shipped default model and resolves it on the relay route, and `apps/web/tests/shipped-composition.e2e.ts` pins the assembled Web default. The focused run:

```sh
pnpm exec vitest run packages/llm/llm-pi-ai/tests packages/client/ui-model-selection/tests packages/bundle/web-app/tests packages/credentials/birdcoder-account/tests
```
