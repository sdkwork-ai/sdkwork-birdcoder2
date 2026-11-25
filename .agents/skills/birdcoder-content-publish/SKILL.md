---
name: birdcoder-content-publish
description: Use when the user asks to publish, post, 发布, schedule, or save a draft of an article or content to a media platform — check which platforms this deployment can publish to, resolve the target account (asking the user when none is selected), adapt the content to that platform's contract, upload its text, image or video, and publish through sdkwork_content_publish.
---

# Publish content to media

## When to use

Use this skill when the user asks to publish, post, 发布, push, or schedule an article or content to WeChat Official Account (公众号), Facebook, Twitter / X, Douyin (抖音), Toutiao (头条号), or Xiaohongshu (小红书), and when publishing is the last step of another workflow (an article written in the knowledge base, a release note, a campaign post).

Do not use it for:

- writing or editing the article itself — use `birdcoder-knowledge-article`;
- generating the cover image or video — use an image or video generation skill, then return here with the file path;
- a platform this deployment reports as `account-required`; report what it needs instead of approximating a publish;
- posting with an account the user did not select.

## Inputs

- The content: article text, or a knowledge-base document id to read with `sdkwork_knowledge_write action: read_article`.
- The target platform. When the user only says "发布" without one, ask which media before doing anything else.
- The target account: an account id the user names, or the account the user picks from `sdkwork_content_publish action: accounts`.
- For WeChat: an HTML article, a required cover image, and optionally a digest.
- For Facebook: post text, optionally a link, one image path, or one video path.
- For Twitter / X: post text of at most 280 characters.
- For Douyin: a local video path and optional caption text.
- The publication mode: WeChat publish or draft; Facebook, X and Douyin publish immediately.
- A signed-in BirdCoder client for WeChat, and the app's Host process for the other three. Publishing never asks for a platform password or token in the conversation.

## Workflow

1. **Identify the content.** For a knowledge-base article, call `sdkwork_knowledge_write` with `action: read_article` and the document id, and keep the Markdown and title. Otherwise take the text from the user.

2. **Check which platforms can publish.** Call `sdkwork_content_publish` with `action: capabilities` before promising anything.
   - `status: ready` means this deployment has an adapter and at least one configured account.
   - `status: account-required` means the platform is known but has no adapter or account here. Tell the user what it would need and stop. Toutiao and Xiaohongshu are always in this state: they expose no public creator-publishing API for this deployment.
   - The `contentKinds` row states which content the platform accepts. Send a video only to a platform that lists `short-video`.

3. **Resolve the account.** Call `sdkwork_content_publish` with `action: accounts` and the chosen platform.
   - When the user named an account, match it by name or id and use the id verbatim.
   - When the user did not choose, ask which account to publish to, offering the listed account names, and stop until the user answers. Never invent an account id.
   - When the list is empty, report that no account is configured and where; do not proceed.

4. **Adapt the content to the platform contract.**
   - **WeChat Official Account** accepts HTML, not Markdown. Convert headings, paragraphs, emphasis, lists, quotes, and links to their HTML elements. Title at most 64 characters, digest at most 120, body at most 20,000 characters and 2 MiB. A cover image is required (`coverPath`, `coverDataUri` or `coverMediaId`).
   - **Facebook** takes `text` (required), an optional `link`, and at most one `imagePaths` entry or one `videoPath`. The Host uploads the local file through the Graph API.
   - **Twitter / X** takes `text` only, at most 280 characters; media upload is not implemented by this adapter.
   - **Douyin** requires a local `videoPath`; `text` is the caption. The Host uploads the video and creates the post.
   - Never include `<script>`, `<style>`, iframes, or event handlers in any content.

5. **Choose the mode.**
   - WeChat `mode: publish` sends the article to followers; `mode: draft` saves it to the draft box.
   - Facebook, X and Douyin publish immediately; when the user is still reviewing the content, say so instead of publishing.
   - `action: preview` with `wechatIds` sends a WeChat preview to the named recipients from the first selected account.

6. **Publish.** Call `sdkwork_content_publish` with `action: publish`, the `platform`, `accountIds`, and the platform's content fields (`title`/`author`/`contentHtml`/cover for WeChat; `text`/`link`/`imagePaths`/`videoPath` for the Host platforms).

7. **Report and read back.**
   - A receipt with `accepted: true` means the platform accepted the submission. Report its `status`, `remoteIds` and `message`.
   - A WeChat publish completes asynchronously upstream; say that it is not live yet.
   - A reported failure names the stage and code. Fix that stage and retry once; do not repeat the same request blindly.

## Rules

- The governing standards are `AGENT_SKILLS_SPEC.md` for skill form, `MEDIA_RESOURCE_SPEC.md` for media assets, `DRIVE_SPEC.md` for stored files, `IAM_LOGIN_INTEGRATION_SPEC.md` for the session boundary, and `DOCUMENTATION_SPEC.md` for article prose. Do not restate them; follow them.
- **Use the app's existing login.** WeChat publishing reuses the IAM session this app is already signed in to. Never request a password, token, second login, or API key. When signed out, ask the user to sign in through the app's own sign-in surface and retry.
- **Platform tokens are operator configuration, never conversation input.** Facebook, X and Douyin accounts live in the media account file (`SDKWORK_MEDIA_ACCOUNTS_FILE`, else `$DSH_HOME/media-accounts.json`); each account names its token environment variable (`accessTokenEnv`). Do not ask the user to paste a token into the conversation and do not pass one in a tool argument.
- **Never invent a platform, account, or result.** Only a receipt from the tool is evidence of a publish, and only a platform reported as `ready` with a selected account can publish.
- **One platform per publish.** A cross-post is several publishes, each with its own adapted content and its own account.
- **A live publish is a public action.** Keep the user's approval: when the request is ambiguous, prepare the content and say what publishing would do.
- **Do not upload what the platform does not accept.** X takes text only here; Toutiao and Xiaohongshu have no adapter; a WeChat article has no video field.
- **Never claim the article is visible.** Report the platform status you received.

## Verification

- `sdkwork_content_publish` with `action: capabilities` reported the target platform and its `contentKinds`.
- `action: accounts` returned the account id that was published to, and it is one the user selected.
- The publish result carried a `receipt` with `accepted`, `platform`, `status`, `mode`, `accountIds`, and either `remoteIds` or a platform `message`; the account ids match the request.
- WeChat titles are at most 64 characters, digests at most 120, and the HTML is within the platform limits.
- A draft receipt and a live publish receipt are reported differently, and an `account-required` platform is reported as unavailable rather than as a success.

## Output

Report, in the user's language:

- the platform and its display name;
- the account name and id the content was published to;
- the content title or caption, the mode, and the platform status;
- the platform ids or the asynchronous note, and how the user can read the result on the platform;
- the stopping stage, code, and message when the publish failed, and the one thing to change before retrying;
- for a platform reported as `account-required`, what the user must configure and that nothing was published.
