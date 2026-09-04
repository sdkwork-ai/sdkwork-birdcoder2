# 桌面打包启动与闭包修复

[English](2026-09-05-desktop-packaging-fixes.md) | 中文

三个打包缺陷阻塞了 0.1.3-alpha.1 桌面发布；本次变更全部修复，使桌面 shell 正常启动且 `check:pack-deps` 通过。

## sdkwork-api-gateway 内联 `/src/*` 导入

`packages/host/sdkwork-api-gateway/tsdown.config.ts` 为 `@deepseek-ai/dsh-client-connection/src/` 添加了 `alwaysBundle` 模式。该包的 node 半数通过 `/src/*` 说明符引用 `connection` 辅助函数；`connection` 逐字导出 `./src/*`，外部化的 `@deepseek-ai/dsh-client-connection/src/...ts` 导入会进入发布的 chunk，在运行时解析到 TypeScript 源码。Node 的 ESM 加载器在 Loader 导入该包时以 `ERR_UNKNOWN_FILE_EXTENSION` 拒绝，导致桌面宿主启动失败，报 `failed to import loader entry sdkwork-api-gateway`。类型检查通过 tsconfig `paths` 解析同一说明符，因此源平面检查无法发现该断裂。内联辅助函数还让该 fork 宿主包自包含：复制的辅助函数在同一轮中从同一源码树编译，不会偏离 `connection` 自己的副本。

## session-persistence-jsonl 延迟加载 `fs-ext`

`packages/session/session-persistence-jsonl/src/lease.ts` 将模块作用域的 `fs-ext` 导入移入唯一调用 `flock(2)` 的 POSIX 锁路径 `flockAsync` 体内。Windows 使用命名内核信号量（`./win32.ts`），永远不会调用它。静态导入仍会让每个平台和运行时在加载该插件时链接 `fs_ext.node`，而安装的 binding 是针对构建包时的 Node.js ABI（Node 22 上为 127）编译的，不是针对最终加载它的任何东西的 ABI。Electron 携带自己的 ABI（Electron 35 上为 133）。不匹配会导致不可恢复的 `ERR_DLOPEN_FAILED`，中止整个 Loader 条目组，因此静态导入让 `session-persistence-jsonl` 在从不需要 POSIX 锁的平台上单独杀死桌面启动。在首次使用时解析 `fs-ext` 将原生依赖严格保留在需要它的分支内；模块注册表缓存解析结果，因此每次调用没有额外开销。

## 桌面打包依赖闭包同步

`apps/desktop/package.json` 缺少桌面宿主在运行时链接的六个工作区依赖：`@deepseek-ai/dsh-client-file-upload`、`@deepseek-ai/dsh-sdkwork-api-gateway`、`@deepseek-ai/dsh-session-format`、`@deepseek-ai/dsh-session-format-catalog`、`@deepseek-ai/dsh-session-format-v0-to-v1`、`@deepseek-ai/dsh-session-format-v1-to-v2`。`scripts/sync-pack-deps.mjs --write` 按字母顺序合并，对应的 `pnpm-lock.yaml` 行解析为 `workspace:^`。`check:pack-deps` 现在报告 "closure complete"。
