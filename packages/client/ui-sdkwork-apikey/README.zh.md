---
description: "SDKWork Cloud Router API Key 管理插件（浏览器侧）：挂载于根作用域 settings.apiKeys 座位的宽版 API Key 管理弹窗。"
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-sdkwork-apikey

[English](README.md) | 中文

## 概述


SDKWork Cloud Router API Key 管理插件（浏览器侧）：将宽版 **API Key 管理** 弹窗注册到设置菜单弹出面板的功能行，挂载于根作用域的 `settings.apiKeys` 座位。因密钥表格列数较多、需要比设置面板更宽的空间，这里是独立的 80vw 弹窗，而非 `settings.section` 页面。

## 目录

- [工作方式](#how-it-works)
- [构建](#build)
- [开发备注](#dev-note)
- [已知限制与待办](#known-limitations-and-deferred-work)

<a id="how-it-works"></a>
## 工作方式

- `src/client/index.ts` 注册 `apikey` 语言字典、挂载 `ApiKeyHost` 适配器，并将弹窗贡献到 `settings.apiKeys` 座位（单座；运行时授权表在 `ui-sdkwork-settings-menu` 的 `mode.rail.settings` children 中）。
- `src/client/apikeyHost.ts` 基于共享的 `ui-sdkwork-env` + `ui-sdkwork-iam` 服务（全局令牌管理器）构建 cloudrouter app/models 生成客户端，并通过 api-keys 服务的可注入接缝（`configureApiKeyServiceClients`）绑定，环境/IAM 每次变化都会重新绑定。
- `src/client/ApiKeysModal.tsx` 在宽版弹窗中承载兄弟仓库控制台的 `ApiKeysView`。视图使用 react-i18next；全局 i18next 单例在模块加载时以 vendored 控制台目录（`consoleApiKeysMessages.ts`，en + zh）初始化，并跟随宿主语言（`zh → zh-CN`，`en → en-US`）。
- 国际化与明暗主题自适应遵循 `sdkwork-specs`（`I18N_SPEC.md`、`THEME_DARKMODE_SPEC.md`）：弹窗消费随宿主主题翻转的 `--dsw-alias-*` 令牌；兄弟仓库控制台视图的 Tailwind 工具类（含全部 `dark:` 变体）由本包自己的样式表（`src/client/apiKeysView.css`）编译。
- 该编译产物被「容器化」。每个使用 Tailwind 的 fork 客户端产物都会按各自的源码根注入一份自己的 `@layer utilities`，而同一层内由文档顺序决定胜负——最后加载的产物因此占据了同名类，导致深色宿主下工具栏、表格与抽屉仍是白底、主按钮文案换行，而仅本样式表定义的类（`bg-slate-50`、`sm:w-72`）却表现正常。构建会把编译结果包进 `dsh-sdkwork-apikey-embed` 级联层（由 `apps/web/src/index.css` 声明在最后），并限定作用域为嵌入根节点以及视图 portal 到 `document.body` 的浮层；属性名与选择器由组件与构建共享，见 `src/client/embedScope.ts`。

<a id="build"></a>
## 构建

```sh
pnpm --filter @deepseek-ai/dsh-client-ui-sdkwork-apikey bundle
```

<a id="dev-note"></a>
## 开发备注

本弹窗仅存在于浏览器侧：api-keys 服务的主机半部在其独立包中，本包只通过生成的 cloudrouter 客户端与可注入的 `configureApiKeyServiceClients` 接缝消费它，因此 Web 产物不携带主机侧凭据代码。

<a id="known-limitations-and-deferred-work"></a>
## 已知限制与待办

- 嵌入内容的级联层位置是与宿主之间的契约：`apps/web/src/index.css` 必须把 `dsh-sdkwork-apikey-embed` 声明在 `utilities` 与 `dsh-sdkwork-embedded-app` 之后。若宿主删掉该声明，层的位置就退回到产物加载顺序，也就是容器化本要消除的冲突。
- 另外九个自行编译 Tailwind 工具类的 fork 产物之间仍存在同样的机制性冲突；`ui-sdkwork-token-plan`（未加包裹、基于 class 的 `dark` 变体）是最明显的一例。把它们也容器化是把本次改动按包逐个施加，不在本次范围内。
- 控制台视图自己的 `@theme` 自定义属性位于 `:root`，在两个作用域根之外，因此在嵌入内容中无效；Tailwind 主题与 `primary-*` / `lobster-*` 色阶由宿主样式表提供。
