# Agent Note: Markets 模式是未登录即可浏览的公开表面

Status: implemented

[English](2026-09-06-sdkwork-markets-public-mode.md) | 中文

## 问题

市场上线时挂在了共享 IAM 门后：`markets` 位于 `ui-sdkwork-iam` 的 `AUTHENTICATED_APP_MODES` 中，`MarketsPage` 经 `AuthenticatedSdkworkModePage` 挂载，未登录访客切换到该模式时只会得到登录浮层与"需要登录"提示，而不是页面。该模式没有任何依赖 IAM 会话的能力——tab 外壳不浏览任何账户范围内的内容，添加流程也像其它表面一样派发提示词——门把模式挡住的同时什么也没保护。市场的契约与 Token Plan 先例一致：匿名浏览，只在动作需要会话时登录。

## 决策

`markets` 不在 `AUTHENTICATED_APP_MODES` 中。`MarketsPage` 直接渲染自己的外层外壳（`data-mode`、`data-mode-page`、`data-markets-surface`），不挂载任何 IAM 会话面：页面注入不携带 `authGate`，插件的 `inject` 服务列表中没有 `iam` 条目，`ui-sdkwork-markets` 也不声明任何 ui-sdkwork-iam 依赖（peer/dev、`dsh.client.inject` 或 tsconfig 引用）。`auth.required.*` 未登录文案不再出现在 markets 词典中。模式分发无需改动：`requestAuthenticatedMode` 读取该名单，未登录切换到 Markets 只做切换，其余仍设门的模式保留浮层。未来若出现依赖会话的动作（例如需要账户的目录动作），在自己的动作处接上登录即可，如同 Token Plan 在结账时打开登录——而不是重新把整个页面设门。

## 考虑过的替代方案

**保留门，未登录时渲染页面的预览。** 同一份外观要维护两份渲染，而预览展示的正是门当前挡住的内容——门什么也没保护，还丢掉了匿名浏览契约。

**页面保持设门，改为门控各未来的目录动作。** 未登录时门仍会把今天的页面清空，而在动作内设门让页面的公开契约悬而未决；市场整体是公开的，每个动作在真实账户相关工作落地时自行附加各自的会话要求。

## 后果

未登录访客能看到完整的市场页面；切换到该模式不再弹出登录浮层，markets 包与 ui-sdkwork-iam 之间不存在任何依赖边。覆盖在缝隙两侧都锚定了行为：`ui-sdkwork-iam` 的 `authenticated-mode.client.spec.ts` 锚定名单成员与未登录分发，`ui-sdkwork-markets` 的规格锚定无门的注入与未登录渲染。
