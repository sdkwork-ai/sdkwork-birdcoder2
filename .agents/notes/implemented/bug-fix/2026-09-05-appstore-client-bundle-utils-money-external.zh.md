# Agent Note: Appstore client bundle maps @sdkwork/utils/money to sibling source

Status: implemented

[English](2026-09-05-appstore-client-bundle-utils-money-external.md) | 中文

## Problem

`pnpm build` 在 `verify-sdkwork-dependencies` 阶段失败：

```
packages/client/ui-sdkwork-appstore/lib/client.js: client bundle leaves require("@sdkwork/utils/money") external — map the package to sibling source in tsconfig.bundle.json so tsdown inlines it
```

appstore 的 client bundle 会编译来自固定 `sdkwork-appstore` checkout 的兄弟源码，其中 `sdkwork-appstore-pc-commons/src/formatPrice.ts` 和 `sdkwork-appstore-pc-product/src/lib/utils.ts` 引入了 `@sdkwork/utils/money`。`packages/client/tsdown.client.ts` 从 `tsconfig.base.json` 的 `@sdkwork/*` 键推导 bundle 别名，但只取精确的包根键：TypeScript paths 中不带通配符的键只匹配完全相同的说明符，因此 `@sdkwork/utils` 包根的映射覆盖不到 `money` 子路径。该子路径没有别名，从兄弟目录树内也无法通过 node_modules 解析到，rolldown 将该 import 输出为 external，而 loader 模块表在运行时无法应答 `@sdkwork/*` 说明符——`checkClientBundleSdkworkExternals` 在任何 bundle 出厂之前把这种漂移变成构建错误。

## Decision

`packages/client/ui-sdkwork-appstore/tsconfig.bundle.json` 将 `@sdkwork/utils/money` 映射到固定的兄弟源文件 `../../../../sdkwork-utils/packages/sdkwork-utils-typescript/src/money.ts`，即 `@sdkwork/utils` 包 `exports` 表中 `./money` 指向的同一文件。appstore 的 tsdown 配置把该 tsconfig 传给每一个构建 pass（`tsconfig: 'tsconfig.bundle.json'`），因此运行时 bundle 内联该源码、产出的类型也解析到它，在开发机和发布 runner 上行为一致——发布 runner 克隆固定的兄弟仓库时不带 `node_modules`。该行与同一文件中已有的 `@sdkwork/sdk-common/*` 行并列，后者为该包处理同一类修复。

## Alternatives considered

**把别名提升到共享预设 `tsdown.client.ts` 的显式子路径列表**（即 `@sdkwork/ui-pc-react/theme` 那几行）。该列表服务于整个 client workspace 中被引入的子路径；当前只有 appstore bundle 内联了引入 `utils/money` 的源码。包内局部映射与其同文件先例放在一起，等出现第二个受影响的 bundle 再提升。

**添加 `@sdkwork/utils/*` 到 `src/*` 的通配符映射。** 被否决的理由与预设中已记录的相同：包的 `./x` 导出未必位于 `src/x`，通配符会劫持本已由包 `exports` 表正确指向的子路径解析。

**把 `@sdkwork/utils` 声明为依赖，让 node 解析找到 workspace 链接。** 从兄弟 checkout 内的文件发起的解析永远到不了 harness 的 `node_modules`——目录逐级上溯始终留在兄弟目录树内——而发布 runner 克隆固定的兄弟仓库时根本不带 `node_modules`。即便解析到编译后的 lib 构建产物，bundle 内联的也是构建输出而非固定源码，破坏别名所维护的 source-pin 模型。

## Consequences

该映射按子路径手工维护：兄弟源码一旦开始引入新的 `@sdkwork/utils/*` 子路径（该 checkout 已在 bundle 闭包尚未触及的文件中引入 `utils/id`），就会再次触发 `checkClientBundleSdkworkExternals`，直到补上同样的一行映射。该 gate 在任何 bundle pass 之前运行，并指明需要映射的确切说明符。修复后，重建的 appstore bundle 不再输出任何 `@sdkwork/*` require，`verify-sdkwork-dependencies` 通过。
