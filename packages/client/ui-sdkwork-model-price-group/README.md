---
description: "SDKWork model price-group picker: the composer model menu's 模型价格分组 row and its pane, listing the account groups that can serve the selected birdcoder model through the CloudRouter app API and pinning the signed-in user's per-model group."
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-sdkwork-model-price-group

English | [中文](README.zh.md)

## Summary

The composer's model menu lists 模型 and 推理等级. For the BirdCoder relay route this plugin adds 模型价格分组 directly below the 模型 row: the summary shows the account group (price tier) the selected model currently uses, and the pane lists every group that can serve that model plus a "follow the default group" choice. A choice is written to the signed-in user's account through the SDKWork CloudRouter app API, so it survives restarts and applies to every client of that account.

Only the `birdcoder` provider renders the row: other providers have no CloudRouter account-group answer for their models.

## Table of Contents

- [Use this package](#use-this-package)
- [Understand the implementation](#understand-the-implementation)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)

<a id="use-this-package"></a>

## Use this package

The plugin mounts as the web-app `ui-sdkwork-model-price-group` row. Open the composer's model menu while a `birdcoder` model is selected: 模型价格分组 appears directly below the 模型 row, with the current group in the value cell. Open it and pick a group, or pick 跟随默认分组 to clear the per-model rule and inherit the account-level default.

The list comes from the CloudRouter app API (`GET /app/v3/api/ai/routing/model_groups?model=…`), the current rule from `GET /app/v3/api/ai/routing/model_group_defaults`, and a choice is written with `PUT /app/v3/api/ai/routing/model_group_defaults` using a `model` scope. The model id is the relay catalog key the harness uses on the wire (`<vendor>/<modelId>`), which is also the CloudRouter catalog key.

<a id="understand-the-implementation"></a>

## Understand the implementation

- `src/client/index.ts` — registers the dictionaries, constructs the app-api adapter, and contributes the summary to `conversation.input.model.afterModel` (id `model-price-group`) and the pane to `conversation.input.model.pane` (key `model-price-group`). Both receive the same injected face, so the summary and the pane never disagree.
- `src/client/model-price-groups.ts` — the adapter and its snapshot store. It constructs the generated CloudRouter app client from the active `env` origin and the shared IAM token manager, loads groups and the user's rules in parallel, derives the explicit `model` rule at the list head, and writes a one-element list (or an empty list to clear). Loads are generation-guarded: a model switch drops the previous result.
- `src/client/selection.ts` — reads the Session's shared `modelSelection` projection and answers only for the `birdcoder` provider.
- `src/client/ModelPriceGroupRow.tsx` — the menu summary. It shows the pinned group, otherwise the effective default the app-api reports as `selected`, otherwise the neutral "default" caption.
- `src/client/ModelPriceGroupPane.tsx` — the picker. Every row is a `menuitemradio`, so the model menu's arrow-key and focus-return handling applies unchanged; the pane reports a rejected write through the menu host's toast and closes only after a successful save.

The CloudRouter database stores one scope as an ordered list (`ai_user_account_group_route`, `priority` ascending), so one model can carry several groups for failover; this picker's single choice is the head of that list, and clearing it removes the model-scope rows only.

## Build

```sh
pnpm --filter @deepseek-ai/dsh-client-ui-sdkwork-model-price-group bundle
```

<a id="model-experience"></a>

## Model Experience

None, as the picker only reads and writes the user's routing preference through the CloudRouter app API; it registers no prompt section, tool, or session event and never participates in a provider request.

#### KV Cache effect

None; the chosen account group changes which upstream pool serves the model, not the request body or prompt prefix.

<a id="known-limitations-and-deferred-work"></a>

## Known Limitations and Deferred Work

- A signed-in IAM session is required: the app API is the user-scoped surface, and the row reports the rejection to the menu host when the session is missing or expired.
- Only the `birdcoder` provider renders the entry. Relay models reached through another provider keep the account-level default with no in-menu override.
- Choosing a group replaces the model scope's whole ordered list with that one group; a failover list configured elsewhere survives only until this picker writes the model's rule.
- The model id must be present in the CloudRouter catalog. A relay catalog key the router does not know fails the read with `model not found` instead of listing the account-wide groups.
- The picker does not create or edit groups; grouping, pricing plans, and pool membership stay operator-managed in the CloudRouter console.
