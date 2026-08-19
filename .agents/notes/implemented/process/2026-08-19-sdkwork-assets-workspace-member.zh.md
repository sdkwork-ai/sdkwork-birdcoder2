# Agent Note: Join sdkwork-assets as a workspace sibling

Status: implemented

[English](2026-08-19-sdkwork-assets-workspace-member.md) | 中文

## Problem

`@sdkwork/agents-pc-core` 将 `@sdkwork/assets-app-sdk` 声明为 `workspace:*`。agents 兄弟仓库已经从 `../sdkwork-assets` 接入该包，但 BirdCoder 的 `pnpm-workspace.yaml` 没有。`pnpm run` 于是把该规格视为缺失的工作区包，尝试从注册表拉取，并在 `registry.npmjs.org` 连接被销毁时让脚本前的安装检查失败。

## Decision

BirdCoder 将 `../sdkwork-assets/sdks/sdkwork-assets-app-sdk/sdkwork-assets-app-sdk-typescript` 加入仅用于依赖解析的工作区成员，在 `scripts/sdkwork-sources.manifest.json` 中将 `sdkwork-assets` 固定为 `7c2ab7c30fbf44de0dc7e0396d4b252088505095`，并在容器构建中从 `sdkwork-ecosystem` 上下文复制该兄弟仓库。该包仍只作为源码消费：tsdown 的 glob 仍排除兄弟 SDK 族。

## Alternatives considered

**不解析该规格，改为从 npm 注册表获取 `@sdkwork/assets-app-sdk`。** 该包是通过兄弟仓库检出消费的私有源码；名称未发布或到 npmjs.org 的网络被销毁时，注册表解析会失败。

**删除 agents-pc-core 对 assets SDK 的依赖。** assets 客户端位于该包（`assetsAppSdkClient.ts`），是生成 facade 的所属消费者；删除依赖会破坏 agents 组合，而不是修复工作区接入。

**在不加入工作区成员的情况下用本地 path alias 指向。** pnpm 的 `workspace:*` 要求包出现在 `pnpm-workspace.yaml` 中；tsconfig path 不能满足安装时解析。

## Consequences

缺少 `sdkwork-assets` 检出时，会作为不完整的兄弟仓库布局失败，而不是注册表超时。新增或升级该兄弟仓库时，仍需与其他 SDKWork 仓库一样同步 pin、工作区成员、锁文件和 Dockerfile 复制。

## Testing

`pnpm run verify-sdkwork-dependencies` 接受新的 pin 和工作区成员。`pnpm install` 从兄弟仓库检出链接 `@sdkwork/assets-app-sdk`，不再从注册表解析它。
