# Agent Note：client 测试聚合移出构建 solution

Status: implemented

[English](2026-09-07-client-test-aggregate-out-of-build-solution.md) | 中文

## 问题

只要闭包内任一文件有改动，`build:lib:client`（以及每一次 `pnpm run build`）都会重跑 client 测试聚合：`tsc -b tsconfig.client.json` 先构建约 89 个被引用包 project（热缓存约一秒），再对覆盖全部 `packages/client/*` 测试、`*.client.*` spec、css 声明与 tsdown client preset 源码的 noEmit 根工程做类型检查。
在 32 核 Windows 主机上实测，该闭包内任何内容改动后，根工程重查要花 1m20s–2m16s 静默单线程 tsc——测试文件恰恰是日常迭代的主要改动对象——因此连续数分钟没有任何输出的构建看起来像卡死。
对同一 solution 的 watch 调用（`tsc -b tsconfig.client.json --watch`、`dev-web` 的 tsc 阶段）会在每次变更后重复同样的重查。

## 决策

把 client solution 一分为二，references 列表只保留在一处。
`tsconfig.client.json` 变为**构建 solution**：保留同样的约 89 条 project references，并显式置空 `files`（没有 include/files 时根工程会默认扫描整个仓库）；对它执行 `tsc -b` 只为 tsdown Client 阶段生成各引用工程的 `lib/types`，不做其他事，`build:lib:client` 的命令文本保持不变。
新建 `tsconfig.client.tests.json` 作为 **client 测试聚合**：原 include/exclude 原样平移（测试、css 声明、`packages/client/tsdown.client.ts`、`scripts/client-build-environment.ts`、`scripts/*.client.*` spec），并镜像同样的 references；它只从 `typecheck:contracts-ready` 与根 `tsconfig.json` 图（编辑器、`tsc -b tsconfig.json`）运行。
镜像 references 是语义要求而非账本工作：聚合会把解析进引用工程的 import 对照该工程生成的 `lib/types` 声明检查（project-reference 重定向）；没有 references 时，同样的 include 集合会变成把每个包源码平铺进去的平面程序，出现数百个 `Context` 合并与严格性错误（补镜像前已实测复现）。
`scripts/client-tsconfig.spec.ts` 断言构建 solution 保持无 program、两份 references 列表保持相等；`scripts/ts-project.ts` 把 `client` face 映射到 `tsconfig.client.tests.json`，全仓 client 程序（verify-client-packages、optional-dependency-imports）展平的集合与改动前完全相同。
聚合 include/exclude 的消费方随之迁移：`sdkwork-dependencies` 的排除检查改读 `tsconfig.client.tests.json`，oxlint 的归属工程约定把 client 测试文件归属于该配置。

## 备选方案

- **只移出测试并从聚合中删掉 references** — 否决：没有 references 的聚合会失去 project-reference 重定向，变成把每个包源码平铺进去的平面程序；同样的 467 文件 include 集合随即报出数百个 `Context` 合并与严格性错误（补镜像前已实测复现）。
- **在运行时派生构建工程列表**（包装脚本读取 references 并按工程逐个调用 `tsc -b`，只保留一份静态配置）— 否决：它改变文档化的构建命令形态、复杂化 `dev-web` watch 阶段，相比"镜像静态列表 + spec 机械强制相等"并无收益。
- **把 references 复制进 tests 配置但不加防漂移守卫** — 否决：静默漂移会改变聚合重定向到的工程集合；`client-tsconfig.spec` 强制两份列表相等并保持构建 solution 无 program。
- **让聚合留在构建 solution 中** — 否决：测试闭包内任何内容改动（包括测试文件本身）都会让 `build:lib:client` 消耗 1m20s–2m16s 静默单线程 tsc，这正是本 Note 要移除的缺陷。

## 后果

`build:lib:client` 不再承担聚合成本：tsc 阶段热缓存约 1s（仅 references）加 tsdown 阶段，带类型错误的测试文件不会让构建失败（已实测：注入 `TS2322` 后构建仍 0.63s 通过，而 tests 配置报出该错误并以 1 退出）。
Client 测试类型检查在 `pnpm run typecheck` / `typecheck:contracts-ready` 与 CI typecheck gate 中保持完整覆盖；聚合首次运行约 2m18s，热运行约 0.7s（tsc -b 缓存）。
对 `tsconfig.client.json` 的 watch 调用（dev-web、手动 `--watch`）不再每次变更后重查聚合。
新增 Client 包引用现在要同时改 `tsconfig.client.json` 与其镜像 `tsconfig.client.tests.json`；漏改镜像会由 spec 测试暴露，而不是静默漂移。

## 测试

文件集对等：tests 配置解析出的 include 与旧聚合的 467 个文件完全一致（0 缺失、0 多余）。
`tsc -b tsconfig.client.json` 热运行 0.63–0.69s；故意放坏测试文件时 exit 0；`tsc -b tsconfig.client.tests.json` 报出注入的 `TS2322` 并以 1 退出，热运行收敛到 0.75s。
整图 `tsc -b tsconfig.json` 约 6s 完成（host + client + 测试聚合全部命中缓存）。
门禁与 spec 全部通过：`verify-client-packages`、`client-tsconfig.spec`、`sdkwork-dependencies.spec`、`project-reference-faces.spec`、`oxlint-contract.spec`、`verify-client-packages.spec`、`verify-optional-dependency-imports.spec`。
`verify-optional-dependency-imports` 在当前工作区报告 22 处模块级 optional 加载，种子改动前后数量一致（既有本地状态，与本次拆分无关）。
