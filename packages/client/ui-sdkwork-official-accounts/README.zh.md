---
description: "SDKWork IAM 公众号账号管理插件（浏览器侧）：设置菜单行，以及挂载于根作用域 settings.officialAccounts 座位的90% 视口的弹窗；弹窗内承载面向用户的 IAM 公众号账号模块。"
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-sdkwork-official-accounts

[English](README.md) | 中文

## 概要

SDKWork IAM 公众号账号管理插件（浏览器侧）：在设置菜单弹出面板中注册 **公众号账号** 行（位于中转站 API Key 行上方），并把该行打开的90% 视口的弹窗注册到根作用域的 `settings.officialAccounts` 座位。弹窗承载面向用户的能力模块 `@sdkwork/iam-pc-oauth`，它通过 IAM app API 维护已登录账号自己的公众号配置——不涉及后台管理面，也不涉及租户登录资源。

## 目录

- [实现方式](#how-it-works)
- [构建](#build)
- [开发说明](#dev-note)
- [模型体验](#model-experience)
- [已知限制与后续工作](#known-limitations-and-deferred-work)

<a id="how-it-works"></a>
## 实现方式

- `src/client/index.ts` 注册 `officialAccounts` 语言字典、挂载宿主适配器，并把弹窗贡献到 `settings.officialAccounts` 座位（单座；运行时授权表在 `ui-sdkwork-settings-menu` 的 `mode.rail.settings` children 中）。
- `src/client/officialAccountsHost.ts` 依据共享 `ui-sdkwork-env` 的网关源地址构建 IAM **app** 客户端（`@sdkwork/iam-app-sdk`，dual-token，`pc`），在每次读取前把 `ui-sdkwork-iam` 会话镜像进浏览器全局 token manager，通过 `createSdkworkIamOfficialAccountsClient` 适配 `client.iam.oauth.officialAccounts`，并把得到的控制器交给面板；环境切换时就地重建客户端与控制器。
- `src/client/OfficialAccountsModal.tsx` 是弹窗外壳：它判断网关就绪、会话存在、宿主语言与宿主配色，然后渲染 `@sdkwork/iam-pc-oauth` 的 `SdkworkIamOfficialAccountsPanel`。账号创建/编辑、启用/停用、消息推送配置、删除以及自定义菜单草稿编辑器都是该模块控制器自身的调用。其创建/编辑抽屉在弹窗上层从左侧打开。
- `SdkworkThemeProvider` 提供 SDKWork 设计令牌以及面板 `dark:` 变体所绑定的 `.dark` 类；`SdkworkI18nProvider` 把模块的 zh-CN/en-US 语言目录限定到宿主语言：弹窗位于 Harness（自带主题契约的 CSS Module 应用）中，而不是 SDKWork 应用外壳里。
- 面板的 Tailwind 工具类由本包自己的样式表 `src/client/officialAccountsView.css` 针对 IAM app 级模块与 `@sdkwork/ui-pc-react` 源码根编译；该表只引入 Tailwind 子表，并为面板根写入作用域内的 reset，因此不会重排 Harness 界面。编译后的样式表收敛在 `dsh-sdkwork-official-accounts-embed` 级联层（由 `apps/web/src/index.css` 声明），并作用于嵌入根节点以及面板挂到 `document.body` 的覆盖层；`src/client/embedScope.ts` 保存组件与构建共享的属性名和选择器。

<a id="build"></a>
## 构建

```sh
pnpm --filter @deepseek-ai/dsh-client-ui-sdkwork-official-accounts bundle
```

<a id="dev-note"></a>
## 开发说明

弹窗仅运行于浏览器，并且只对接两个接缝：此处构建的 IAM app 客户端，以及 `@sdkwork/iam-pc-oauth` 提供的控制器/面板端口（作为依赖解析用途加入的 workspace 成员；打包时通过 `tsconfig.base.json` 源码别名内联）。app 级的行按会话的租户与用户隔离，且从不参与登录——`@sdkwork/iam-pc-admin-oauth` 中的后台管理能力 `iam.oauth.resourceAccounts.*` 是另一个表面，这里不使用。

<a id="model-experience"></a>
## 模型体验

无，因为公众号账号弹窗是浏览器侧的 SDKWork 配置界面，其业务 HTTP 请求与 Harness 模型请求相互独立。

#### KV Cache 影响

无；本包不组装也不发送模型请求。

<a id="known-limitations-and-deferred-work"></a>
## 已知限制与后续工作

- 嵌入样式表的级联层位置是与外壳的契约：`apps/web/src/index.css` 必须在 `utilities`、`dsh-sdkwork-embedded-app` 与 `dsh-sdkwork-appstore-embed` 之后声明 `dsh-sdkwork-official-accounts-embed`。丢掉该声明会让位置取决于 bundle 加载顺序，而这正是收敛要消除的冲突。
- 自定义菜单编辑器只保存草稿。推送到微信（以及发布文章）需要 provider 调用链，暂时延后；app API 当前只暴露 list/create/retrieve/update/delete。
- 账号 Logo 为外链地址字段：面板未挂载 Drive 图片上传服务，因此暂不提供应用内上传。
- 弹窗需要已登录的 IAM 会话：登录动作会在弹窗之上打开共享登录界面，会话出现后挂载面板。
