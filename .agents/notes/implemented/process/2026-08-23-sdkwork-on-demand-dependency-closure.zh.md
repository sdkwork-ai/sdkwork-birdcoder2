# Agent Note: SDKWork 依赖声明跟随真实 import 闭包

Status: implemented

[English](2026-08-23-sdkwork-on-demand-dependency-closure.md) | 中文

## Problem

`tsconfig.base.json` 声明了 361 条 `@sdkwork/*` 路径映射，而本仓库实际 import 的只有一小部分：其中 73 条指向 `sdkwork-cloudrouter`（绝大多数是 `sdkwork-cloudrouter-pc-admin-*` 应用壳包），另有 account、models、payment、partner、messaging、rtc、log、documents、catalog 等整块映射——这些既不是 workspace 成员，也不是本仓库的 import。原因在于 import 覆盖门禁（`scripts/sdkwork-dependencies.ts`）扫描的是 manifest 中每个钉住仓库的 `src` 树，任何应用壳的 import（cloudrouter 的 `src/admin`、`src/console-business`、`src/token-plan`）都会要求补映射；而 `packages/client/tsdown.client.ts` 会把每条非通配映射变成客户端打包的 alias。manifest 本身钉了 32 个仓库，但只有 24 个有 workspace 成员、lockfile 引用和 Dockerfile 拷贝。desktop 应用和 token-plan 因此被误认为依赖了 cloudrouter 的 admin。

## Decision

- **路径声明等于传递 import 闭包。** `tsconfig.base.json` 的 `@sdkwork/*` 段现在只保留覆盖以下 specifier 的键：本地源码、`pnpm-workspace.yaml` 中已加入的兄弟 workspace 成员，以及（迭代到不动点）这些映射解析到的包。361 条减为 79 条。该段由新脚本 `node scripts/analyze-sdkwork-closure.mjs --rewrite` 生成；脚本还会为已加入成员推导缺失映射，并按包名修复过期目标路径。
- **门禁双向校验。** `checkSdkworkImportCoverage` 改为扫描真实闭包而不是每个钉住仓库，未加入的应用壳 import 不再能把映射拖进来；新增 `checkSdkworkPathDeclarations` 拒绝闭包中无人使用的声明键和重复键。`sdkwork-dependencies` 门禁对两个方向的漂移都会失败。
- **manifest 只钉 workspace 实际加入的仓库。** `scripts/sdkwork-sources.manifest.json` 移除了 8 个没有 workspace 成员、lockfile 引用或 Dockerfile 拷贝的仓库（account、audio、cloudrouter、image、models、music、search、video）；发布构建和 CI 检出不再抓取和钉住它们。
- **移除陈旧成员声明。** `pnpm-workspace.yaml` 删除了两个指向不存在目录 `apps/*/packages/sdkwork-*-backend-sdk` 的成员行；真实包在 `sdks/` 下，tsconfig 目标路径已自愈到正确位置。
- **token-plan 保持独立积木。** `packages/client/ui-sdkwork-token-plan` 不从 cloudrouter 导入任何东西；它 import 的七个 `@sdkwork/*` 包（ui-pc-react、sdk-common、membership-service、membership-pc-subscription、order-service、order-pc-checkout、order-pc-recharge）全部以 `optionalDependencies` 精确声明，页面在模式激活时才挂载——与 cloudrouter 组合的积木式架构一致，各自高内聚低耦合。

## Consequences

- 客户端打包的 alias 表随 tsconfig 段一起缩小（alias 由它派生），发布构建不再携带 cloudrouter admin 的解析面。CI 与发布运行器抓取 24 个兄弟仓库而非 32 个。
- 新增 SDKWork 包的流程变为：先加入为 workspace 成员（新仓库还要进 manifest），再执行 `node scripts/analyze-sdkwork-closure.mjs --rewrite`，最后让门禁验证。死声明或重复键会让 `verify-sdkwork-dependencies` 失败。
- 两个陈旧 workspace 成员不再掩盖断掉的路径；生成器按包名自愈移动过的包，映射不会静默指向不存在的目录。

## Alternatives considered

**继续扫描所有钉住仓库、为应用壳的 import 补映射。** 这正是把 cloudrouter 的 admin/console/token-plan 面拖进来的现状；闭包扫描给出同样的保证（所有被编译进 bundle 的源码都有映射），却不会牵入无关应用壳。

**只从 package.json 依赖图推导闭包。** 那会漏掉客户端 bundle 通过路径表编译的 `src` 级 import（根与子路径 specifier 都会漏），门禁会放行在发布运行器上失败的构建。

## Testing

- `pnpm run verify-sdkwork-dependencies` 通过；`scripts/sdkwork-dependencies.spec.ts` 新增四个用例：成员未映射 import、本地源码未映射 import、死声明、重复键。
- tsconfig 重写后 `pnpm run typecheck` 通过（裁剪后的路径能解析闭包扫描到的每个 import）。
