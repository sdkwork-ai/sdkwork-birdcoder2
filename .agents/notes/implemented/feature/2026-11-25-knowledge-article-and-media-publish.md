# Agent Note: Knowledge articles and media publishing from the conversation

Status: implemented

English | [中文](2026-11-25-knowledge-article-and-media-publish.zh.md)

## Problem

The Knowledge Base app is integrated as a mode, but the conversation could not use it: the model had no way to write an article into a knowledge space, and no way to publish content to a media account. The publishing capability that exists in the SDKWork Knowledge Base app API needs the generated app client bound to the signed-in IAM session plus the official accounts configured on that tenant, both of which live in the browser client. A Host process cannot call it, and the public application token is rejected for user-owned writes. The request also names media beyond WeChat — 头条号, 抖音, 小红书, Facebook, Twitter — so the model needs an honest capability check rather than a workflow that pretends to publish where no adapter exists.

## Decision

Two Host tools relay to the client, a client executor runs the Knowledge Base app client, and two builtin skills teach the workflow.

- `@deepseek-ai/dsh-tool-sdkwork-knowledge` registers `sdkwork_knowledge_write` and `sdkwork_content_publish`. It validates the arguments, resolves and embeds a local cover image through `ctx.fs` in the Session working directory, dispatches the scoped `sdkwork-knowledge/request` waterfall, and returns the article identity or the platform receipt. It owns no credential and no network call.
- `sdkwork_knowledge_write` covers `list_spaces`, `list_articles`, `read_article`, `create_article` (ingest Markdown as a document), and `upsert_concept` (create or update a wiki concept page). The space listing reuses the Knowledge Base application's own selection projection, so the spaces the model writes to are the spaces the app offers the signed-in user.
- `sdkwork_content_publish` covers `capabilities`, `accounts`, `publish`, and `preview`. WeChat publishes through the Knowledge Base client. Facebook, Twitter / X and Douyin publish from the Host process through their official HTTP APIs, with accounts read from `SDKWORK_MEDIA_ACCOUNTS_FILE` (else `$DSH_HOME/media-accounts.json`) and each account naming its token's environment variable. Facebook posts text/link, one photo or one video; X posts text up to 280 characters; Douyin uploads a local video and creates the post. Toutiao has no public creator-publishing API and Xiaohongshu content APIs need merchant/service-provider qualification, so both are reported as `account-required` instead of being approximated.
- Publishing maps onto the Knowledge Base WeChat contract: HTML body, a title of at most 64 characters, a digest of at most 120, a required cover of png/jpeg/gif/bmp up to 5 MiB, and 1 to 20 accounts per operation. A cover path is read by the Host and sent as a `data:image/...` URI, which the service uploads as a permanent material per account; a media id passes through. Remote cover URLs are rejected because the platform never fetches caller-supplied links.
- `mode: draft` maps to the contract's `sendNotification: false` (draft box only); `mode: publish` submits `freepublish`. `preview` sends to named WeChat recipients from the first selected account.
- The skills `birdcoder-knowledge-article` and `birdcoder-content-publish` ship in the builtin skill catalog, mirrored at `.agents/skills/` and named by both scene projections. The publishing skill requires an explicit account selection and asks the user when none was chosen, checks the capability matrix before promising a platform, and states that an accepted publish completes asynchronously upstream. Both skills reuse the app's existing login and forbid inventing a space, account, or result.
- The `sdkwork-knowledge/request` allowlist row in `@deepseek-ai/dsh-api-remotes` is the only Host-side registration the bridge needs.

## Related

- The relay shape follows [deploy from the conversation](2026-11-24-deploy-from-conversation.md); this note is the knowledge-base and media counterpart.
- The knowledge mode, its host adapter and the `ctx.knowledgeBases` catalog stay owned by `@deepseek-ai/dsh-client-ui-sdkwork-knowledge`.
- The skills follow [portable skill packages](../architecture/2026-11-24-portable-skill-packages.md); both are single-file product skills with no checkout dependency.

## Alternatives considered

- **Call the Knowledge Base app API from the Host with an operator credential.** Rejected: the API scopes writes to the signed-in user's tenant and rejects the public application token, and the generated client derives its dual-token manager from the browser IAM session. A Host path would need a second credential contract the product does not have.
- **Implement every adapter in the Knowledge Base backend.** Rejected for this change: the deployment's backend is a remote cloud service, its repository has no warm build cache here, and the five named platforms have no backend account store; the app's Host process can call the three official HTTP APIs without that deployment chain. The adapter layer is provider-shaped (`src/media.ts`) so it can move into `sdkwork-knowledgebase` once that backend owns these platforms and the deployment can carry them.
- **Implement adapters for Toutiao and Xiaohongshu too.** Rejected: Toutiao has no public creator-publishing API and Xiaohongshu content APIs require merchant/service-provider qualification. An unverified publish would report success for content that never reached the platform. The capability matrix names the gap.
- **Keep the platform matrix in the Knowledge Base client.** Rejected: the Host now needs it to answer `capabilities` and to route the three adapters, and a client package may not value-import a Host feature package. The matrix moved to `src/types.ts`; the client answers only WeChat account reads and publishes.
- **Write the article as an object-upload document version.** Rejected: the document-version path needs an object-store reference and a second upload contract; the ingest endpoint takes Markdown directly and is the same path the Knowledge Base PC editor uses.

## Consequences

The WeChat path requires a connected, signed-in Browser Client; a CLI or headless Session reports `NO_CLIENT` for it. The three Host adapters run without a client but require operator-configured accounts and the platform's own app review: a missing token is `MISSING_CREDENTIAL`, and a platform rejection is reported with its code and message, never as success. An ingested document is immutable through this tool: a correction is a new document, or a wiki concept updated in place through `upsert_concept`. WeChat external publication stays opt-in at the deployment (`SDKWORK_KNOWLEDGEBASE_WECHAT_PUBLISH_ENABLED`), so a tenant without the switch receives the platform's `Disabled` error and nothing is published. An accepted WeChat publish is an asynchronous submission: the tool cannot read the upstream `publish_id`, so it reports the accepted status rather than a live article URL. Toutiao and Xiaohongshu remain unavailable instead of being approximated. In exchange, the agent can write a knowledge-base article, publish or draft it to a selected official account, and post to Facebook, X or Douyin in the same conversation, with every platform's real state reported.

## Verification

- `pnpm exec vitest run packages/interaction/tool-sdkwork-knowledge packages/client/ui-sdkwork-knowledge/tests/knowledge-conversation.client.spec.ts` covers the relay, argument normalization, cover embedding and validation, the space/account projections, ingest polling, the capability matrix, publish/draft/preview mapping, the three Host adapters against mock platform servers, credential resolution and the failure codes.
- `pnpm exec vitest run packages/skill/sdkwork-builtin-skills scripts/verify-builtin-scene-skills.spec.ts scripts/verify-skill-portability.spec.ts` covers the packaged skill set and both skill gates.
- `pnpm run verify-builtin-scene-skills` proves both new skills ship and both projections name them.
- `pnpm run verify-skill-portability` proves the product copies carry no checkout dependency.
- `pnpm exec tsc -b packages/interaction/tool-sdkwork-knowledge packages/api/remotes/tsconfig.host.json packages/api/remotes/tsconfig.client.json` proves the relay type face.
