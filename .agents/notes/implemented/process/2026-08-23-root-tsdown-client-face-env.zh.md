# Agent Note：根 tsdown Client face 必须读取 process.env

Status: implemented

[English](2026-08-23-root-tsdown-client-face-env.md) | 中文

## 问题

`Release (dsh)` 在 `build:lib:client` 阶段因 `lib/types/index.js` 与 `lib/types/invariant.js` 的 `UNRESOLVED_ENTRY` 失败。包级配置已在 Linux CI 嵌套 workspace 收到空 inline `env` 时从 `process.env` 解析 `DSH_BUILD_FACE`，但仓库根 `tsdown.config.ts` 只读取 `env?.DSH_BUILD_FACE`。把 Client 误判为 Host 会把 host 库 entry 重新套到所有无本地配置的包上。

## 决策

根 `tsdown.config.ts` 改用 `scripts/tsdown-build-face.ts` 的 `readBuildFace`，与包级配置同一解析器。本地开发继续用相对路径 `../sdkwork-*` workspace 成员；CI 仍通过 `setup-sdkwork-siblings` 与 `scripts/sdkwork-sources.manifest.json` 从 git 拉取钉住的 sibling。

## 后果

Client 阶段不再为无本地配置的 host-only 包解析 entry。回归测试覆盖 `readBuildFace` 的 `process.env` 回退。

## 测试

`pnpm exec vitest run scripts/tsdown-build-face.spec.ts`
