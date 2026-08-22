# Agent Note：Client 聚合工程必须登记每个 clientBundle 包

Status: implemented

[English](2026-08-23-client-aggregate-registration-mobile-simulator.md) | 中文

## 问题

`Release (dsh)` 在 `build:lib:client` 阶段因 `lib/types/index.js` 与 `lib/types/invariant.js` 的 `UNRESOLVED_ENTRY` 失败。`packages/client/ui-sdkwork-mobile-simulator` 声明了消费 `lib/types` 的 `clientBundle` tsdown 配置，但该包不在 `tsconfig.client.json` 的 project references 中，Client tsc 阶段从不生成它的 `lib/types`，Client tsdown 阶段因此无法解析 entry。该包随 SDKWork sync 合并进入仓库时漏掉了聚合登记。

## 决策

把 `./packages/client/ui-sdkwork-mobile-simulator` 登记进 `tsconfig.client.json` 的 references，与其他 `ui-sdkwork-*` 包并列。聚合 references 是唯一的登记册：带 tsdown 配置的 client 包必须出现在其中，否则 Client 阶段的构建找不到它的 tsc 产物。

## 后果

Client tsc 阶段现在会为模拟器包生成 `lib/types`，Client tsdown 阶段能解析它的 Node 半。对照全部 `packages/client/*` tsdown 配置检查，没有其他包缺失登记。

## 测试

干净树复演：`tsc -b tsconfig.host.json`、Host tsdown 阶段、`tsc -b tsconfig.client.json`、Client tsdown 阶段全部完成。
