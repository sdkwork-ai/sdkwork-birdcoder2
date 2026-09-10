---
description: "SDKWork Cloud Router API Key 管理插件（浏览器侧）：挂载于根作用域 settings.apiKeys 座位的宽版 API Key 管理弹窗。"
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-sdkwork-apikey

[English](README.md) | 中文

## 概述


SDKWork Cloud Router API Key 管理插件（浏览器侧）：将宽版 **API Key 管理** 弹窗注册到设置菜单弹出面板的功能行，挂载于根作用域的 `settings.apiKeys` 座位。因密钥表格列数较多、需要比设置面板更宽的空间，这里是独立的 80vw 弹窗，而非 `settings.section` 页面。

## 目录

- [工作方式](#工作方式)
- [构建](#构建)
- [开发备注](#开发备注)

## 工作方式

- `src/client/index.ts` 注册 `apikey` 语言字典、挂载 `ApiKeyHost` 适配器，并将弹窗贡献到 `settings.apiKeys` 座位（单座；运行时授权表在 `ui-sdkwork-settings-menu` 的 `mode.rail.settings` children 中）。
- `src/client/apikeyHost.ts` 基于共享的 `ui-sdkwork-env` + `ui-sdkwork-iam` 服务（全局令牌管理器）构建 cloudrouter app/models 生成客户端，并通过 api-keys 服务的可注入接缝（`configureApiKeyServiceClients`）绑定，环境/IAM 每次变化都会重新绑定。
- `src/client/ApiKeysModal.tsx` 在宽版弹窗中承载兄弟仓库控制台的 `ApiKeysView`。视图使用 react-i18next；全局 i18next 单例在模块加载时以 vendored 控制台目录（`consoleApiKeysMessages.ts`，en + zh）初始化，并跟随宿主语言（`zh → zh-CN`，`en → en-US`）。
- 国际化与明暗主题自适应遵循 `sdkwork-specs`（`I18N_SPEC.md`、`THEME_DARKMODE_SPEC.md`）：弹窗消费随宿主主题翻转的 `--dsw-alias-*` 令牌；兄弟组件的 Tailwind 工具类（含全部 `dark:` 变体）由宿主样式表通过 `apps/web/src/index.css` 的 `@source` 行生成。

## 构建

```sh
pnpm --filter @deepseek-ai/dsh-client-ui-sdkwork-apikey bundle
```

## 开发备注

本弹窗仅存在于浏览器侧：api-keys 服务的主机半部在其独立包中，本包只通过生成的 cloudrouter 客户端与可注入的 `configureApiKeyServiceClients` 接缝消费它，因此 Web 产物不携带主机侧凭据代码。
