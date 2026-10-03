---
description: "SDKWork video model configuration: the ui-sdkwork-video-models settings page where official vendor roots and relay stations are configured (base URL, protocol, credential source, and model list per provider), plus the Host half that projects the section into video-models.sdkwork.json for skills to read."
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-sdkwork-video-models

English | [中文](README.zh.md)

## Summary

One settings page — 视频模型 (Video models) — that owns *where video generation may call out to*: the official vendors the sdkwork-models catalog publishes, and any number of relay stations the user points at their own base URL. Every provider row carries its own base URL, protocol, region, credential source, and model list, so the same model reached through a vendor and through a relay are two independent rows that never consult each other. The seeded rows come from the catalog itself: each vendor lands with the API root the catalog publishes and every one of that vendor's video models, disabled and key-less until the user supplies a credential.

The section is also projected into a file — `video-models.sdkwork.json` under the harness home's `sdkwork` directory — because a skill cannot read a settings document. The file is the outside-readable form of exactly this section: rewritten at startup and after every accepted commit, never edited by hand, and never a second authority.

## Table of Contents

- [Surface](#surface)
- [Configuration](#configuration)
  - [The `video-models.sdkwork.json` document](#the-video-models-sdkworkjson-document)
  - [Providers, relays, and credentials](#providers-relays-and-credentials)
  - [Where the presets come from](#where-the-presets-come-from)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)

## Surface

Two contributions, one per layer the feature crosses:

- **The Video models page** — the browser half registers one `settings.section` (id `video-models`, order 21, label from its own dictionary), rendered by the settings shell in the content column with a nav row the shell knows nothing about. The page lists provider cards; each card stages its text fields and models in a local draft and commits them on Save, while the switches that mean exactly one thing (enable a provider, enable a model, ask for audio, set the default, project keys) commit immediately.
- **The section and its projection** — the Host half declares the durable `ui-sdkwork-video-models` section as its own `Config`, so the settings service serves it without any `register` call, and writes the `.sdkwork.` document. The write is atomic (a temporary sibling renamed over the target) and serialized per plugin instance; a failed write is logged and never fails the plugin.

## Configuration

| Field | Meaning |
|---|---|
| `providers` | The provider rows: official vendor roots and relay stations, in page order. |
| `defaultProviderId` | The provider a generation call uses when it names none. Empty means the first enabled row. |
| `writeSecrets` | Whether the projected document carries literal API keys. Off by default. |
| `directory` | Ordinary configuration, not a form field: where the projection is written. Empty follows the harness home (`$DSH_HOME`, then `~/.dsh`) plus `sdkwork`. |

Each provider row is:

| Field | Meaning |
|---|---|
| `id` | Stable local id, unique in the section (`official-google-global`, `relay-1`). |
| `label` | Display name; the id is shown when it is empty. |
| `kind` | `official` (a catalog vendor root) or `relay` (a station fronting one). |
| `vendor` / `region` | sdkwork-models vendor code and region; empty for a relay. |
| `protocol` | The protocol the base URL speaks (`openai_compatible`, `openai_responses`, `anthropic_messages`); empty means vendor-native. |
| `baseUrl` | API root every call is issued against. |
| `apiKey` / `apiKeyEnv` | A pasted literal and the name of an environment variable; `apiKeyEnv` wins at call time. |
| `enabled` | Whether generation may use the row. |
| `models` | Model rows: wire `id`, `displayName`, `catalogKey`, `enabled`, and this modality's defaults (`generationMode`, `resolution`, `aspectRatio`, `durationSeconds`, `outputAudio`). |

### The `video-models.sdkwork.json` document

```json
{
  "schemaVersion": "1.0.0",
  "kind": "sdkwork.video-models",
  "plugin": "ui-sdkwork-video-models",
  "modality": "video",
  "updatedAt": "2026-10-02T00:00:00.000Z",
  "defaultProviderId": "official-google-global",
  "writeSecrets": false,
  "providers": [
    {
      "id": "official-google-global",
      "label": "Google",
      "kind": "official",
      "vendor": "google",
      "protocol": "openai_compatible",
      "region": "global",
      "baseUrl": "https://generativelanguage.googleapis.com/v1beta/openai",
      "enabled": true,
      "credential": { "env": "GOOGLE_API_KEY", "stored": true },
      "models": [
        {
          "id": "veo-3.1-generate-preview",
          "displayName": "Veo 3.1 Generate Preview",
          "catalogKey": "google/veo-3.1-generate-preview",
          "enabled": true,
          "generationMode": "image_to_video",
          "resolution": "1080p",
          "aspectRatio": "16:9",
          "durationSeconds": 8,
          "outputAudio": true
        }
      ]
    }
  ]
}
```

A reader selects a provider by `defaultProviderId` or by `id`, filters on `enabled`, and takes the credential from `credential.env` when it names one. `credential.value` appears only when `writeSecrets` is on **and** a literal key is stored; the settings document stays the one place a key is required to live, which is why the default keeps it out of the file.

A model row states the parameters a call takes when it names none: `generationMode` (`text_to_video`, `image_to_video`, or `reference_to_video`), `resolution`, `aspectRatio`, `durationSeconds`, and `outputAudio`. They mirror the sdkwork-models catalog's per-model video profiles, and an empty string — or a zero duration — means the provider's own default rather than a value a caller must pass.

### Providers, relays, and credentials

The two kinds differ in what they know, not in what they can do. An official row is seeded from the catalog and tells the user which vendors exist and where they answer; a relay row starts empty and exists because the same model is often reachable through a station with its own base URL, key, and naming. Neither is privileged: both carry a base URL, a protocol, and a model list, so a deployment can front every model through a relay without touching the official rows at all.

A credential has two possible sources, and the row keeps both. `apiKeyEnv` names an environment variable and wins at call time; `apiKey` holds a literal the user pasted. The page never receives the stored literal — it is shown as "configured" and an untouched field saves as "keep the stored one" — so a settings round-trip cannot silently erase a key.

### Where the presets come from

`src/model-presets.ts` is generated from the sibling `sdkwork-models` catalog:

```bash
node scripts/generate-sdkwork-model-presets.mjs
```

It reads every vendor's `vendor.json` and model files, takes the canonical `https://<host><pathPrefix>` root per vendor, and emits the vendors with a video capability plus every catalog model whose primary capability is `video`. Regenerate it after a catalog bump; the file records the catalog version and timestamp it was generated from.

## Model Experience

None, as the package configures where media generation calls go and registers no prompt section, tool, or session event.

#### KV Cache effect

None directly: the file and the section are read by generation consumers, which own their own request prefixes.

## Known Limitations and Deferred Work

- A generation call is not issued by this package: the section and its projection are configuration, and the consumer that reads the file or the section owns the request, its retries, and its error surface.
- The projection has no schema validation on read: a hand-edited file is overwritten by the next commit rather than rejected.

### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

**Runtime invariant:** No companion is published. The projected document is a pure function of the live section — the Host re-reads the config references on every commit — so the only fact that could drift is the file's agreement with the section, and the Host spec asserts both the startup projection and the rewrite-on-commit that keep them equal. A hand-edited file is corrected by the next write rather than trusted, so there is no second authority for a companion to own.

The four modality pages (image, video, voice, music) are separate packages on purpose. They share a shape — providers with base URLs and credentials — but not a runtime: each owns its own modality's model parameters, its own preset module, and its own projection file, so one can change without re-releasing the others.

</details>
