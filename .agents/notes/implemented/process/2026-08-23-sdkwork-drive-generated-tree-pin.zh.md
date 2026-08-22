# Agent Note：SDKWork pin 必须携带完整的生成 SDK 树

Status: implemented

[English](2026-08-23-sdkwork-drive-generated-tree-pin.md) | 中文

## 问题

`Release (dsh)` 在 `build:lib:client` 阶段因钉住的 `sdkwork-drive` checkout 内 `Could not resolve './assets'` 失败。pinned commit 跟踪了 drive SDK 生成目录中的 `src/api/index.ts`（它 re-export `./assets`），却没有 `assets.ts` 及其余 110 个生成文件：一次不完整的 "sync local changes" 提交只加入了部分生成文件，其余仍被 gitignore。本地 checkout 能工作只是因为 sibling 自己的生成器在磁盘上产出了缺失文件。

## 决策

修复 sibling 仓库并移动 pin：缺失的生成文件已提交到 `sdkwork-ai/sdkwork-drive`（`chore: commit generated SDK files omitted from the previous sync`），`scripts/sdkwork-sources.manifest.json` 把 `sdkwork-drive` 钉到该提交。暂存前每个文件都与 sibling 已提交的 `sdkwork-generator-manifest.json` 中的 sha256 校验一致，因此提交的树与生成器自己的输出记录相符。

可达性扫描（从 harness `tsconfig.base.json` 的 `@sdkwork/*` path 目标沿 tracked sibling 文件遍历）现在报告全部 workspace sibling 中指向未跟踪文件的相对导入为零。

## 后果

发布 runner 克隆的每个 pinned sibling 都能解析完整的生成 SDK 源码。当 tracked 的生成 index 引用了 pinned commit 未携带的文件时，重新 pin sibling 就是补救方式。

## 测试

使用重新 pin 的 sibling 做干净树复演，Client tsdown 阶段完成。可达性扫描报告零未跟踪导入目标。
