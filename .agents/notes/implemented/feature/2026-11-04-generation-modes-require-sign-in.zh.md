# Agent Note: 生成模式在可用前声明登录要求

Status: implemented

[English](2026-11-04-generation-modes-require-sign-in.md) | 中文

## Problem

`image` 与 `video` 模式页把登录要求延后到传输层。未登录时挂载完整的 Agents 生成（creative）页面——输入框、预设、模型选择、会话列表——第一笔用户主动请求被 SDK 拦截器链挂起，直到出现会话。于是该模式看起来不登录也能用：它先邀请用户输入提示词，然后才用登录要求回应，用户关闭浮层时则得到一个拒绝。该模式的会话列表属于账号范围内的服务端状态，没有匿名形态，因此延后策略承诺了一种它无法兑现的浏览体验。

## Decision

生成需要会话来承载其创建的作品，因此两个生成页面在挂载页面之前先声明该要求。

- **主动的模式页门禁。** `ImageGenerationsPage` 与 `VideoGenerationsPage` 通过 `AuthenticatedSdkworkModePage` 渲染，不再携带延后策略：未登录时页面渲染自己的提示（`auth.required.title`、`auth.required.detail`、`auth.required.action`），嵌入的 creative 页面不挂载；只有提示自己的“登录”按钮会打开 IAM 浮层。文案随各包字典发布——“登录后使用图片生成” / “Sign in to use image generation” 与 “登录后使用视频生成” / “Sign in to use video generation”。
- **保留传输层那一半。** `creativeHost.createCreativeInterceptors` 继续装配 `createSignInRequestInterceptor`：页面挂载期间会话失效时，下一笔用户主动请求会在门口等待登录，而不是匿名发出。
- **删除延后策略。** `signInPolicy="deferred"` 已无消费者，因此 `AuthenticatedModeShell` 与 `AuthenticatedSdkworkModePage` 始终要求会话，`SdkworkModeSignInPolicy` 导出被移除。所有受门控的模式页——云盘、知识库、资产、课程、聊天、联系人、图片、视频——现在以同一种方式声明同一要求。
- **删除过期文案。** video 页遗留的 `page.*` 输入框字典来自它已不再渲染的旧界面；那段文案现在由嵌入的 Agents creative 页面持有。

## Alternatives considered

**保留可浏览页面，只门禁“生成”动作。** 不予采纳：产品要求是登录前不可使用生成，而一个已挂载、首次提交却被浮层拒绝的输入框看起来像坏掉的“生成”按钮——首次请求还会是一笔挂在拦截器里的匿名请求。

**把延后策略保留为未使用的选项。** 不予采纳：此改动后没有任何页面声明它，无消费者的选项是第二种只有 shell 自己的测试才会维持的行为。

**改为门禁模式栏条目（隐藏或禁用图标）。** 不予采纳：模式栏是模式的入口地图，其他私有模式保留席位并在页面上声明要求；隐藏条目会让未登录用户的图片与视频入口消失，而云盘与资产仍然可见。

## Consequences

未登录时两个模式就地显示登录提示，替代 creative 工作台；点击“登录”打开所有入口共用的同一登录表面。登录后页面照旧挂载：会话列表加载、生成请求发送，页面中途会话过期时下一笔请求仍在传输层门禁处等待。模式不再匿名拉取自己的账号会话列表，模式栏布局、模式 id 与 Code 默认模式均不变。

## Testing

`packages/client/ui-sdkwork-generations-image/tests/generations-page.client.spec.tsx` 与 video 的同名规格断言：未登录时提示替代页面、creative 应用不挂载、提示按钮是打开浮层的唯一入口，登录后页面挂载。`packages/client/ui-sdkwork-iam/tests/authenticated-mode-shell.client.spec.tsx` 保留 shell 的提示/挂载契约。`apps/web/tests/app-modes.e2e.ts` 断言匿名组装夹具下两个模式都渲染提示且不发起任何 fetch。
