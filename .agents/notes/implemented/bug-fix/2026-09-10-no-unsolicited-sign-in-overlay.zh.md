# Agent Note: 不再出现非用户发起的登录浮层

Status: implemented

[English](2026-09-10-no-unsolicited-sign-in-overlay.md) | 中文

## 问题

代码工作台会用登录对话框回应日常操作。点击新建会话英雄区的媒体创作——目的地是绑定账号的视频模式——会在暂存场景的同一次点击里弹出模态登录浮层，而此时还不存在任何消息。提交第一条消息时又弹一次：英雄区的提交观察者经 `requestAuthenticatedMode` 切换框架，而该函数会打开浮层；目标页在未登录挂载时还会第三次打开它。模式栏只隔一步重复了同一形状：切换到受门控模式时会在页面出现前先弹出浮层。点击胶囊、发送消息、切换模式都不是登录请求，而作为日常操作副作用出现的对话框，读起来就像工作台在索要账号。

## 决策

登录表面只由显式的登录手势开启，仅保留两个：设置菜单的登录 / 注册行（`IamService.openSignIn`，按 `presentation` 设置为模态或账号页）与受门控模式页未登录提示上的登录按钮（`AuthenticatedModeShell`）。其余路径只暂存或跳转，不触碰门控：

- `HeroModeSwitch` 的注入面只有暂存 store；点击胶囊只写 `scene.set`。
- 英雄区的提交观察者用 `ctx.layout.setMode(staged)` 切换框架，`ui-sdkwork-app-modes` 不再声明任何 `iam` 服务边。
- `ModeRail` 原样透传 owner 的 `setMode`。
- `AuthenticatedModeShell` 渲染未登录提示，自身绝不打开浮层；只在 IAM 报告已登录后挂载子节点。

`ui-sdkwork-iam` 删除被移除路径使用的模式门控词汇——`AUTHENTICATED_APP_MODES`、`AuthenticatedAppModeId`、`isAuthenticatedAppMode`、`requestAuthenticatedMode`，以及 `IamService.requestAuthenticatedMode` 委托方法。保留的接缝是 `injectAuthenticatedModePage` 与 `AuthenticatedModeGate`，受门控页面用它们读取登录状态并驱动自己的登录按钮。

本决策反转了[英雄区场景切换器决策](../feature/2026-09-08-sdkwork-hero-scene-switcher-and-document-mode.zh.md)中的暂存时浮层与提交时的认证切换，以及[市场公开模式决策](../architecture/2026-09-06-sdkwork-markets-public-mode.zh.md)中“进入即弹浮层”的后果。两份记录各自的决定仍然有效：英雄区席位、暂存 store、提交跳转、skill 标签条与文档占位页；市场的公开页面契约。

## 曾考虑的替代方案

**保留暂存时的提示，只把它做轻（徽标或胶囊下方的提示行）。** 否决：要求是任何代码表面操作都不打开浮层，而点击胶囊并不等于承诺进入该场景。

**只修提交路径，保留模式栏的提示。** 否决，这是半条规则：模式栏切换、提交引起的隐式框架切换、页面挂载都是导航，晚一步到达的同一个对话框就是同一次打断。只有“仅显式手势”这一条规则，各表面才能陈述、测试才能锚定。

**未登录时对受门控场景不做提交跳转。** 否决：那样暂存不产生任何可见效果，第一条消息落地时场景已被丢弃。框架仍应跳转，由目标页就地说明要求。

**不显示提示，直接匿名挂载受门控页面。** 否决：这些 SDKWork 页面自身的请求需要会话，提示正是阻止它们发起匿名 SDK 流量的那一层。

## 后果

暂存媒体创作或文档生成会让对话停留在代码页面且胶囊高亮；提交第一条消息后框架落在该场景的模式页，需要会话的页面显示未登录提示与登录按钮。从模式栏切换到受门控模式同样如此：由页面说明要求，而不是在其上弹出对话框。因此未登录用户是在受门控表面出现在屏幕上时遇到账号要求，而不是在挑选场景或离开场景时遇到，且任何代码表面交互都不会被对话框打断。`ui-sdkwork-app-modes` 失去 IAM 依赖边，`ui-sdkwork-iam` 失去模式名单词汇与模式栏的分发助手。

## Testing

`hero-mode-switch.client.spec.tsx` 断言切换器的唯一效果就是暂存。`apply.client.spec.ts` 固定插件的服务列表不含 `iam`、模式栏注册不携带注入面、英雄区注入面只含暂存 store，以及未登录的受门控暂存仍会跳转而台架门控的浮层始终未被触碰。`mode-rail.client.spec.tsx` 固定模式栏原样透传 owner 的切换动作。`authenticated-mode-shell.client.spec.tsx` 固定外壳行为：未登录挂载渲染提示且不打开任何东西，点击提示上的按钮才打开浮层，已登录则挂载页面。`ui-sdkwork-markets` 的页面规格继续覆盖无门的公开页面。
