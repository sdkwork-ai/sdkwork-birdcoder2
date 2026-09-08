# 桌面打包启动与闭包修复

[English](2026-09-05-desktop-packaging-fixes.md) | 中文

三个打包缺陷阻塞了 0.1.3-alpha.1 桌面发布；本次变更全部修复，使桌面 shell 正常启动且 `check:pack-deps` 通过。

## sdkwork-api-gateway 内联 `/src/*` 导入

`packages/host/sdkwork-api-gateway/tsdown.config.ts` 为 `@deepseek-ai/dsh-client-connection/src/` 添加了 `alwaysBundle` 模式。该包的 node 半数通过 `/src/*` 说明符引用 `connection` 辅助函数；`connection` 逐字导出 `./src/*`，外部化的 `@deepseek-ai/dsh-client-connection/src/...ts` 导入会进入发布的 chunk，在运行时解析到 TypeScript 源码。Node 的 ESM 加载器在 Loader 导入该包时以 `ERR_UNKNOWN_FILE_EXTENSION` 拒绝，导致桌面宿主启动失败，报 `failed to import loader entry sdkwork-api-gateway`。类型检查通过 tsconfig `paths` 解析同一说明符，因此源平面检查无法发现该断裂。内联辅助函数还让该 fork 宿主包自包含：复制的辅助函数在同一轮中从同一源码树编译，不会偏离 `connection` 自己的副本。

## session-persistence-jsonl 延迟加载 `fs-ext`

`packages/session/session-persistence-jsonl/src/lease.ts` 将模块作用域的 `fs-ext` 导入移入唯一调用 `flock(2)` 的 POSIX 锁路径 `flockAsync` 体内。Windows 使用命名内核信号量（`./win32.ts`），永远不会调用它。静态导入仍会让每个平台和运行时在加载该插件时链接 `fs_ext.node`，而安装的 binding 是针对构建包时的 Node.js ABI（Node 22 上为 127）编译的，不是针对最终加载它的任何东西的 ABI。Electron 携带自己的 ABI（Electron 35 上为 133）。不匹配会导致不可恢复的 `ERR_DLOPEN_FAILED`，中止整个 Loader 条目组，因此静态导入让 `session-persistence-jsonl` 在从不需要 POSIX 锁的平台上单独杀死桌面启动。在首次使用时解析 `fs-ext` 将原生依赖严格保留在需要它的分支内；模块注册表缓存解析结果，因此每次调用没有额外开销。

## 桌面打包依赖闭包同步

`apps/desktop/package.json` 缺少桌面宿主在运行时链接的六个工作区依赖：`@deepseek-ai/dsh-client-file-upload`、`@deepseek-ai/dsh-sdkwork-api-gateway`、`@deepseek-ai/dsh-session-format`、`@deepseek-ai/dsh-session-format-catalog`、`@deepseek-ai/dsh-session-format-v0-to-v1`、`@deepseek-ai/dsh-session-format-v1-to-v2`。`scripts/sync-pack-deps.mjs --write` 按字母顺序合并，对应的 `pnpm-lock.yaml` 行解析为 `workspace:^`。`check:pack-deps` 现在报告 "closure complete"。

## connection tsdown 条目输出到正确文件名

`packages/client/connection/tsdown.config.ts` 将 desktop 条目从 `lib/types/desktop.js` 切换到 `src/client/desktop-bridge.ts`，并采用对象条目形式（`{ index, desktop }`）使 tsdown 输出 `lib/index.js` 和 `lib/desktop.js`（而不是 `lib/src/client/desktop-bridge.js`，`package.json` files 字段会默默丢弃它）。原本同时存在两个缺陷：

1. **CI 构建竞态**。原始 `lib/types/desktop.js` 条目是 `desktop-bridge.ts` 的 tsc 产物。在并行 CI 构建下，tsdown 有时会在 tsc 产出该文件之前就去读取它，表现为 `ENOENT` / "Cannot resolve entry module"。`desktop-bridge.ts` 仅有 `import type` 语句，在运行时不再依赖任何已编译的包，因此 tsdown 直接编译源码可消除对 tsc 顺序的依赖。
2. **Smoke 失败**。绕过竞态后，字符串条目形式（`['src/client/desktop-bridge.ts']`）让 tsdown 在 `lib/` 下保留了完整的 `src/client/` 段；打包后的应用于是发布了 `lib/src/client/desktop-bridge.js` 而没有 `lib/desktop.js`，打包启动探针在加载 `@deepseek-ai/dsh-client-connection/lib/index.js` 时因 `ERR_MODULE_NOT_FOUND` 失败。将每个条目键钉到期望的 basename 可恢复宿主所预期的文件名。

## typert lookup/host-context configure 接受重复注册

`packages/typert/registry/src/service.ts` 将 `configure()`（lookup 解析器）和 `configureHost()`（host-context 解析器）从遇到重复键时抛出改为返回 no-op disposer。打包启动探针（`apps/desktop/scripts/packaged-boot-probe.cjs`）在同一个 Electron 进程内调用 `bootDesktopHost` 两次：干净安装启动，然后是已有机器重启。第一棵树的 `fiber.dispose()` 异步运行所有 `ctx.effect()` 清理；如果第二棵树在第一棵树清理运行之前构造了 `SessionController`（它构造 `ApiSessionAgentController`，后者在其构造函数中注册 `agent`、`session` 和 `agent` host-context 解析器），重复拒绝会抛出 `typert: lookup "agent" resolver is already configured` 并中止第二次启动。让两个 `configure` 调用幂等可让第二次注册解析到已有条目——每次注册的是同一个逻辑解析器，这保留了原始所有权且不会掩盖真实的配置错误（不同键仍然拒绝）。
