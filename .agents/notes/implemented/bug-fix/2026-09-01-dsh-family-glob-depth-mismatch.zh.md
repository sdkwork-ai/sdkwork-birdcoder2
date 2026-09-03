# Agent Note：dsh 发布族 glob 把所有深度为 3 的包排除在了可引导镜像之外

Status: implemented

[English](2026-09-01-dsh-family-glob-depth-mismatch.md) | 中文

## 问题

由 `birdcoder-v*` 触发时，`container-release.yml` 的 `container-image` 作业会构建离线 Docker 镜像，其 `npm install /packs/dsh/*.tgz` 会在 registry 侧解析每个被打包 tgz 所声明的依赖。因此发布闭包必须把"依赖出现在该安装集合中"的每一个 harness 包都打进包里——任何缺失的包都会留下一个在沙箱中 404 的 registry 查询并导致构建失败。

本次发布有两个失败的 CI 运行（run 33555133364 linux/arm64、linux/amd64），都只打包了恰好两个 dsh tgz——`@deepseek-ai/dsh` 和 `@deepseek-ai/dsh-web-frontend`——随后 Docker 执行安装时在 `@deepseek-ai/dsh-sdkwork-env-bootstrap@^0.1.2-alpha.3` 上 404。所有 `packages/<group>/<pkg>/package.json` 都不在 `/packs/dsh/` 里。

根因是 `scripts/release/families.ts::DshFamily.versionPatterns`（以及完全相同的 `publishPatterns`）中的深度不匹配。harness 包位于**深度 3**——`packages/<group>/<pkg>/package.json`——但模式
```
packages/!(experimental|client/ui-sdkwork-deploy)/*/package.json
```
只选中**深度 2**，即 `packages/<group>/package.json`。`packages/*/` 什么也匹配不到，因为没有任何 group 目录在该深度含 `package.json`。

这本可以从一次简单的 dry-run 检查中看出——dsh 族选中所有深度为 3 的 harness 包，而工作树 glob `packages/*/package.json` 选中零个——但此前"在 Linux 上没坏过"的假设一直成立。花括号否定子模式 `!(experimental|client/ui-sdkwork-deploy)` 是**多段备选**，在我所运行的 Windows CI 宿主上返回零匹配，这进一步搅乱了判断：本地 glob 干脆返回零匹配（而非"只有深度 2"），我一度误判为 picomatch 仅在 Windows 上的回归。重新读模式并数路径段之后，这只是一个在所有平台上都成立的普通深度 bug；宿主本地 glob 零匹配只是同一个 bug 的近景。

除了深度 bug 之外，否定项只列了 `packages/client/ui-sdkwork-deploy`——该包打包后的清单声明了四个仅限内部使用、不发布到任何 registry 的常规 `@sdkwork/*` 依赖（`@sdkwork/deployments-app-sdk`、`@sdkwork/deployments-pc-console-publishing`、`@sdkwork/drive-app-sdk`、`@sdkwork/sdk-common`）。但 `packages/client/ui-sdkwork-share` 声明了同一组常规 `@sdkwork/*` 依赖，从未进入排除集，在深度 3 的包开始进入打包闭包后它也必须被摘出去。

## 决策

放弃 dsh 族的花括号否定 glob 形式，让 `ReleaseFamily` 携带一个显式的排除钩子。返回零匹配的 glob 是最糟糕的一类 bug——在下游消费者触及缺失成员之前一直沉默——因此新的 `excludedDirectories()`/`isExcluded()` 接缝位于生产发现路径中，返回一个会出现在下一次 CI 日志里的确定性列表，并由一个遍历 `versionMembers`、断言被排除路径不再出现的单元测试强制执行。

形状如下：

- `ReleaseFamily.excludedDirectories()`——返回 `readonly string[]` 的方法。默认 `[]`；子类覆写。每项要么是**精确的**仓库相对包目录（`packages/client/ui-sdkwork-deploy`），要么是**前缀**（`packages/experimental`）——当它不含结尾的 `package.json` 时，排除其下每一层嵌套包。基类 `isExcluded(member)` 同时检查精确与前缀两种形式。
- `ReleaseFamily.discoverMembers(...)` 对族的模式做 glob（为深度 3 正确性展开为 `packages/*/*/package.json`），然后丢弃目录出现在 `excludedDirectories()` 中、或清单经 `isExcluded()` 返回 true 的每个成员。精确集合短路前缀循环：`discoverMembers` 一次性把 `excludedDirectories` 构建成 `Set`，仅对非精确命中调用 `isExcluded`。
- `DshFamily` 覆写 `excludedDirectories`，返回 `DSH_EXCLUDED_DIRECTORIES = ['packages/experimental', 'packages/client/ui-sdkwork-deploy', 'packages/client/ui-sdkwork-share']`。`packages/experimental` 是私有的，经独立序列发布；两个 ui-sdkwork-* 包声明了不发布到任何 registry 的常规 `@sdkwork/*` 依赖。
- `DshFamily.versionPatterns` 与 `publishPatterns` 变为 `['packages/*/*/package.json', 'apps/*/package.json']` 与 `['packages/*/*/package.json', 'apps/cli/package.json', 'apps/web/package.json']`——均为无歧义的长式写法。

两个 ui-sdkwork-* 包仍在本仓库内构建与测试；只是不再进入可引导镜像的闭包。它们继续通过单独的渠道发布到 npm。

## 考虑过的替代方案

**修补花括号否定形式而非替换。** 否决。`packages/!(experimental|client/ui-sdkwork-deploy)/*/package.json` 是深度 2，要修深度得改成 `packages/!(experimental)/*/*/package.json`。改出来的模式难读、在 Windows picomatch 上失败（本机运行时返回 0 匹配），并且当新的 SDKWork-only 包在任意深度添加同级包时会静默丢成员。显式的 `excludedDirectories()` 列表可读、可测、在 CI 日志中可见。

**使用 `versionPatterns: ['packages/*/*/package.json']` 并依赖 `bundle/web-app/releasable.ts` 式的动态发现。** 否决。本仓库的发布族契约由 `scripts/release/families.spec.ts` 的测试塑形，它遍历 `versionMembers(root)` 并断言目录级事实。纯动态列表让这些断言无法复现。

**在 `package.json` 元数据中按成员携带列表并在读取时拒绝。** 否决。发现期 `private: true` 式的跳过隐含在清单里、与 npm 发布策略重复，且只在成员恰好被读取时才暴露。族上的方法把意图保存在测试与 CI 日志里。

**只在发现期排除携带 `@sdkwork/*` 的清单。** 作为唯一机制否决。`experimental` 组被排除有单独的原因（私有预发布序列），所以它的排除应属于名字列表，而非内容谓词。

## 后果

- `dsh` 族在当前检出树上选中 268 个版本成员，此前是 3 个（`{apps/cli, apps/web, apps/desktop}`）。本地运行 `releaseFamily('dsh').versionMembers(root)` 确认。Docker 镜像在 CI 中把这 267 个发布成员（`@deepseek-ai/dsh-desktop` 为私有）作为 `/packs/dsh/*.tgz` 打包。
- `scripts/release/families.spec.ts` 继续通过。新的 `families.spec.ts` 用例 `excludes private experimental packages from the dsh release` 与 `versions the private desktop app without adding it to the npm publish set` 仍覆盖修复后的发现路径。
- `DshFamily` 现在对自身深度诚实：`packages/*/*/package.json` 匹配 `packages/<group>/<pkg>/package.json`，`apps/*/package.json` 匹配 `apps/<pkg>/package.json`——两侧都无歧义。
- 两个 ui-sdkwork-* 包不再进入可引导镜像。它们发布的 npm tgz（来自使用自身发现的 npm publish 工作流）不受影响；本改动只触及离线容器构建。

## 测试

- `vitest run scripts/release/` 绿：44/44 通过，含完整 `families.spec.ts` 套件。
- `node --input-type=module` 一次性验证：`releaseFamily('dsh').versionMembers(root).length === 268`、`publishMembers(root).length === 267`；断言 `packages/experimental/` 不在、`@deepseek-ai/dsh-client-ui-sdkwork-{deploy,share}` 不在、`@deepseek-ai/dsh-sdkwork-env-bootstrap` 在（此前 404）、`dsh-desktop` 在版本集而不在发布集、`verifyVersions` 通过（单一版本）。
- container-image CI 作业仍需在 linux/amd64 与 linux/arm64 上重跑以端到端确认修复。
