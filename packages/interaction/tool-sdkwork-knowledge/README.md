---
description: "Model-facing sdkwork_knowledge_write and sdkwork_content_publish tools: validate an article or media request, relay it to the connected signed-in BirdCoder client, and return the Knowledge Base article or the media publish receipt."
kind: "package-reference"
---

# @deepseek-ai/dsh-tool-sdkwork-knowledge

English | [中文](README.zh.md)

## Summary

`sdkwork_knowledge_write` writes or reads a Knowledge Base article. `sdkwork_content_publish` publishes to a selected media account through two paths: WeChat runs in the signed-in BirdCoder client over the `sdkwork-knowledge/request` relay because its accounts and secrets belong to the Knowledge Base tenant, while Facebook, Twitter / X and Douyin call their official HTTP APIs from this Host process with operator-configured accounts. Toutiao and Xiaohongshu expose no public creator-publishing API here and are reported unavailable. The tool validates each request, reads local image and video files, and returns the article identity or platform receipt.

## Table of Contents

- [Use this package](#use-this-package)
- [Understand the implementation](#understand-the-implementation)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

-----

<a id="use-this-package"></a>
## Use this package

Mount it in an agent's Cordis composition with `tools`, `fs`, and `workingDirectory` available. The Web app preset patch mounts it for the standard, PTC, and Cordis presets.

`sdkwork_knowledge_write` takes one `action`:

- `list_spaces` lists the knowledge bases the signed-in user can write to.
- `list_articles` takes a `spaceId` and lists its documents.
- `read_article` takes a `documentId` and returns the Markdown body.
- `create_article` takes `spaceId`, `title`, and `markdown` and ingests the article as a new document.
- `upsert_concept` takes `spaceId`, `title`, `markdown`, and optionally `conceptId` and `publishConcept`, and creates or updates a wiki concept page.

`sdkwork_content_publish` takes one `action`:

- `capabilities` reports every media platform, whether this deployment can publish to it, and what content each accepts.
- `accounts` takes a `platform` and lists the configured accounts.
- `publish` takes `platform`, `accountIds`, and the platform's content fields: `title`/`author`/`contentHtml`/cover for WeChat, or `text`/`link`/`imagePaths`/`videoPath` for the Host platforms.
- `preview` sends a WeChat preview to `wechatIds` from the first selected account.

A cover image is required for a WeChat article. Pass `coverPath` for a local png, jpeg, gif, or bmp file (at most 5 MiB) and the Host embeds it as a data URI, or pass `coverDataUri` / `coverMediaId` directly; remote cover URLs are rejected because the platform never fetches caller-supplied links.

The Host platforms read their accounts from `SDKWORK_MEDIA_ACCOUNTS_FILE`, else `$DSH_HOME/media-accounts.json`:

```json
{
  "accounts": [
    { "id": "fb-page", "platform": "facebook", "name": "Product Page", "pageId": "123", "accessTokenEnv": "SDKWORK_MEDIA_FACEBOOK_TOKEN" },
    { "id": "x-brand", "platform": "twitter", "name": "@brand", "accessTokenEnv": "SDKWORK_MEDIA_X_TOKEN" },
    { "id": "dy-brand", "platform": "douyin", "name": "抖音号", "openId": "open-123", "accessTokenEnv": "SDKWORK_MEDIA_DOUYIN_TOKEN" }
  ]
}
```

Each account names the environment variable holding its access token; the token never enters a tool argument, a result, or a log. Facebook publishes a feed post, a Page photo, or a Page video; X publishes a text post of at most 280 characters; Douyin uploads a video and creates the post.

Both tools trim blank arguments (`INVALID_ARGS`), require an agent Session (`TOOL_CONTEXT_UNAVAILABLE`), and fail with `NO_CLIENT` when no Browser Client answers the forwarded request, which is the headless case.

The answer is a reported outcome, not a transport error: `ok: false` carries the stopping stage (`validate`, `readCover`, `signedOut`, `unavailable`, `spaces`, `documents`, `ingest`, `concept`, `accounts`, `publish`, `preview`), a stable code, and a human-readable message. The tools never retry by themselves.

<a id="understand-the-implementation"></a>
## Understand the implementation

1. `execute` validates the arguments, and for a WeChat cover it resolves the path through `ctx.fs` in the Session working directory and encodes the bytes.
2. WeChat operations dispatch the scoped `sdkwork-knowledge/request` waterfall through `ctx.waterfall(scopeTarget(agent, agent), …)`; `@deepseek-ai/dsh-api-remotes` forwards it to the Browser Client, where `ui-sdkwork-knowledge` runs the Knowledge Base app client call.
3. Host-platform operations stay in this process: `src/media.ts` loads the account file, resolves the token from its environment variable, and calls the platform's official HTTP API (Graph API, X API v2, Douyin open platform). Local image and video files are read here and sent as multipart.
4. The tool formats the returned article or receipt for the model and returns the structured value.

`src/types.ts` owns the cross-package vocabulary: the request, the article, the account, the capability matrix, the failure stages, and the `Events` declaration the Remote allowlist imports. `src/media.ts` owns the Host adapters. `src/index.ts` owns the tool definitions, argument normalization, capability routing, cover embedding, and the model-facing text.

The Host owns no article state and no durable publish record: no session event, no projection. The media account file is operator configuration read at call time.

<a id="model-experience"></a>
## Model Experience

### sdkwork_knowledge_write

#### What the model sees

The schema asks for the operation, and the space, document, title, Markdown, concept, and visibility the operation needs. The description names the four article actions and states that a write needs a space id and that the tool reuses the signed-in account. Results render one line per space or article, one line naming the written article and its identity, or one failure line naming the stage, code, and detail.

#### Token effect

One tool schema per mounted agent and one short result per call. An article body is included only by `read_article`, which the caller requested.

#### KV Cache effect

The schema and the result vocabulary are static for the mount lifetime; a result extends the conversation without rewriting its prompt prefix.

### sdkwork_content_publish

#### What the model sees

The schema asks for the operation, the platform, the account ids, the platform content fields, the cover, and the mode. The description names the capability check, the account selection requirement, the WeChat cover requirement, the three Host platforms and their official-API content, and the unavailable platforms. Results render the capability matrix, the account list, a receipt with the platform ids and detail, or one failure line.

#### Token effect

One tool schema per mounted agent and one short result per call. The capability matrix is six rows of text; no media bytes enter model messages.

#### KV Cache effect

The schema and the result vocabulary are static for the mount lifetime; a publish result extends the conversation without rewriting its prompt prefix.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

- **Three live Host adapters, no more.** Facebook, Twitter / X and Douyin publish through their official HTTP APIs. Toutiao exposes no public creator-publishing API and Xiaohongshu content APIs need merchant/service-provider qualification, so both stay `account-required`.
- **WeChat external publication is opt-in.** The Knowledge Base deployment enables WeChat publishing with `SDKWORK_KNOWLEDGEBASE_WECHAT_PUBLISH_ENABLED`; without it, the client reports the platform's `Disabled` error and nothing is published.
- **WeChat cover only.** The WeChat publish contract carries a cover image and no other media field; video is outside it. Facebook and Douyin consume local image/video files through this tool.
- **X is text-only here.** The X adapter uses API v2 with a user-context bearer token; media upload needs OAuth 1.0a and is not implemented.
- **Platform tokens are operator configuration.** Accounts live in `SDKWORK_MEDIA_ACCOUNTS_FILE` / `$DSH_HOME/media-accounts.json` and reference their token by environment variable; the tool never accepts a token in an argument.
- **Asynchronous publication.** WeChat returns `accepted`; the article is not live when the tool answers. Douyin owns review of a submitted video.
- **No conversation card.** The tools return text and a structured value only; there is no dedicated tool view for an article or a receipt.
- **Signed-in client required for WeChat.** A headless Session can publish to the three Host platforms but reports `NO_CLIENT` for WeChat, because the Knowledge Base API rejects the public application token for user-owned writes.

<a id="dev-note"></a>
### Dev Note

The platform matrix lives in `src/types.ts` because both paths need it: the Host answers `capabilities` from it, and the client no longer carries a copy. The WeChat accounts still come from the Knowledge Base client; the Host platforms come from the account file. `src/media.ts` is deliberately a small provider-shaped adapter layer, so the same contract can move into the Knowledge Base backend when that deployment owns these platforms.
