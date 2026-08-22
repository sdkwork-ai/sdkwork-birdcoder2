# Agent Note：Web 外壳从源码解析 IAM token manager 与 sdk-common

Status: implemented

[English](2026-08-23-web-shell-sdkwork-source-aliases.md) | 中文

## 问题

`Release (dsh)` 在 `build:web` 阶段因 `[commonjs--resolver] Failed to resolve entry for package "@sdkwork/sdk-common"` 失败。外壳的模块 seed 通过包子路径导入 `@deepseek-ai/dsh-client-ui-sdkwork-iam/sdkwork-global-token-manager`；其 `lib/types` 产物导入 `@sdkwork/sdk-common`，而该包的入口指向只存在于 sibling 自己 checkout 中的 `dist` 构建产物。发布 runner 克隆的 pinned sibling 没有 `dist`，Vite 无法解析入口。

## 决策

`apps/web/vite-source-aliases.ts` 新增两条源码别名：IAM token-manager 子路径映射到 `packages/client/ui-sdkwork-iam/src/sdkwork-global-token-manager.ts`，`@sdkwork/sdk-common` 映射到 pinned sibling 的 `src/index.ts`。两者沿用既有模式（包导出面向 Node 消费者的构建产物；浏览器 bundle 编译 `src`）。

## 后果

Web 构建不再依赖 sibling 的 `dist` 产物：发布 runner 与本地 checkout 一致地编译 pinned 源码。

## 测试

`verify-web-vite-aliases` 通过；完整 `build:official` 复演完成，bundle 携带 token manager 且没有外部 `@sdkwork/sdk-common` 导入。
