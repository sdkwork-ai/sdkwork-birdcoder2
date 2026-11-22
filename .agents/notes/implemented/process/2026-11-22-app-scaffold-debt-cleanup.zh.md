# Agent Note: 脚手架应用根目录清除脚手架之前的模板债务

Status: implemented

[English](2026-11-22-app-scaffold-debt-cleanup.md) | 中文

## 问题

BirdCoder2 的应用根目录已按 SDKWork 标准布局脚手架重新生成，但已提交的树里仍带着脚手架之前的模板产物。这些症状并非表面问题；大多数直接让某个根目录无法通过类型检查或无法构建：

- 派生的 `.env.<profile>` 文件仍携带一个 `app_id` 为**表面键**（`sdkwork-birdcoder2-h5`）、权限范围是四条 IAM 读取声明的令牌。规范物化器现在从根目录的 deploy application 锚点派生公开应用令牌，并授予 `iam:self`，因此 `materialize-client-env --check` 在第一个脚手架根目录上就失败。
- 浏览器运行时文档位于 `config/browser/runtime-env.<profile>.example.json`，而 `build-browser-client.mjs` 要求 `etc/browser/runtime-env.<profile>.json` 并通过 `etc/sdkwork.deployment.config.json` 的 `profiles[<profileId>].source` 接线。规范浏览器构建在“app deployment config does not declare browser source”处停止。
- H5 与 pad 根目录都没有编写 `src/vite-env.d.ts`，而且 `.gitignore` 本就会忽略所有 `apps/**/src/**/*.d.ts`——只有 `apps/web` 被豁免。因此 `tsc` 把 `import.meta.env` 和 `.css` 副作用导入报为未知，浏览器构建运行器的类型检查步骤在 Vite 运行前就失败。
- 每个 PC 包 tsconfig 都 extends `../../../tsconfig.base.json`（少了一层），包级类型检查与 vitest 转换器都无法解析该配置。PC 根目录还声明了 `types: ["vite/client"]`（被根 `typeRoots` 变得不可解析），没有 vitest 配置（`vitest` 于是回退到构建配置并抛错），并且完全没有声明渲染器依赖，尽管 `src/` 与 `vite.config.ts` 都导入了它们。
- 宿主包仍命名为 `sdkwork-birdcoder2-pc-desktop`；客户端宿主门禁将其报告为规范名 `-pc-tauri` 的已退役迁移别名。
- 生成的包 README 仍带着模板渲染器的缺陷：`Surface: `[object Object]``、“the family is scaffolded only: no package is registered as a workspace member”（不实——这些包族已列举在 `pnpm-workspace.yaml` 中）、对已实现的 H5 core/shell 声称“empty public contract”、H5 包族表缺少 `hosts`/`agent-chat` 两行，以及 mini-program 核心包名位置出现字面量 `` `undefined` ``。
- `apps/README.md` 未索引 `apps/desktop-publisher`；5 个 pad 脚本与 1 个 desktop publisher 脚本是未分类的可执行文件；About 插件的测试 tsconfig 别名指向*生成传输层*而非组合 SDK 门面；另有两个 Rust 依赖声明（以及 `async-trait`）是冗余负担。

## 决策

按当前标准修复这些根目录，而不是钉住旧模板：

- 用规范物化器重新生成每个派生 `.env.<profile>`，使公开应用令牌命名部署锚点并授予 `iam:self`。
- 将浏览器运行时文档移至 `etc/browser/runtime-env.<profile>.json`，运行 `align-browser-runtime-env.mjs` 写入 `profiles[<profileId>].source` 映射与 `materialization` 段，并在两个浏览器 Vite 配置中从已物化的 `public/runtime-env.json` 生成构建文档。`index.html` 保留其静态 `/runtime-env.js` 标签，而插件现在在 `generateBundle` 时输出该资源，不再只在 dev 中提供。
- 在 H5、pad、PC 根目录编写 `src/vite-env.d.ts`，并取消忽略 `apps/*/src/vite-env.d.ts`，使该声明可以被提交。
- 将所有应用包 tsconfig 对齐为非组合检查器形态（四层 base、不生成声明），补上缺失的 PC `vitest.config.ts` 与渲染器依赖，并移除无法解析的 `types` 简写。
- 将宿主包及其引用重命名为 `@sdkwork/birdcoder2-pc-tauri`。
- 修正 README 事实（surface id、接线状态、已实现契约、缺失的 H5 包族行、mini-program 核心包名），索引 `desktop-publisher`，分类启动器，把 About 测试工程指向组合 SDK 门面，并删除无用的 Rust 依赖与误提交的零字节 `AppAuthPages.tsx`。
- 在兄弟仓库 `sdkwork-iam` 中，把凭据入口 Vite 插件的可选字段改为条件展开，而不是声明为 `string | undefined`；严格消费者会以 `exactOptionalPropertyTypes` 编译该源码。

## 备选方案

**保留 `config/browser`，并让 `build-browser-client.mjs` 读取它。** 对齐器与浏览器运行时环境标准已经拥有这套矩阵；再接受第二个位置会为同一份部署期文档制造两个权威。

**把 `vite.config.ts` 排除出应用类型检查工程。** 构建运行器在 Vite 之前对整套工程做类型检查，而凭据入口与运行时环境插件正是在 Vite 配置中接线；排除它会让损坏的构建配置绕过本该捕获它的门禁。

**保留 About 测试对生成传输层的别名。** SDK 消费者门禁的存在正是要求消费者把组合门面当作自己的表面；别名指向传输层会绕过该边界，并掩盖门面不再导出消费者所需内容的情况。

**保留旧令牌取值与 `pc-desktop` 名称。** 两者正是规范物化器与宿主包门禁现在能检出的漂移；保留它们会让检查持续失败。

## 后果

两个浏览器根目录现在都能端到端通过类型检查、测试与构建（`dist/standalone/dev/`），pad 根目录通过其完整 `check` 聚合，15 个操作的 BirdCoder2 App API 契约在 OpenAPI 权威、Rust 路由清单与生成的 SDK 传输层之间一致。生成的 `pc-tauri` 包已通过 lockfile 链接，应用根目录的包族不再报告迁移债务。本次变更伴随一处跨仓库编辑：`sdkwork-iam` 凭据入口插件的严格模式类型修复。本地 `.env` 重新生成与 `etc/browser` 文档移动改动了 70 个已跟踪文件，因此评审应把令牌行与路径移动视为生成内容。

## 验证

`pnpm --dir apps/sdkwork-birdcoder2-h5 {typecheck,test,build:dev}` 与 `apps/sdkwork-birdcoder2-pc` 的同名命令均通过；`pnpm --dir apps/sdkwork-birdcoder2-pad check` 通过。`ui-sdkwork-about` 的测试与 `typecheck:tests` 通过，`check-app-sdk-consumer-imports.mjs --repo .` 报告零违规。`verify-generated-sdk-typescript`、`verify-sdkwork-dependencies`、`verify-application-entrypoints`、`topology:validate`、`check-apps-directory-index`、`materialize-client-env --check`、`check-browser-build-scripts`、`check-browser-runtime-env-standard`、`check-client-host-packages`、`check-operations-conformance` 与 `check-route-path-collisions` 全部通过。一个本地审计脚本比较 OpenAPI 权威、Rust `APP_API_ROUTES` 清单与 SDK 输出路径：两侧各 15 个操作，方法、路径、tag、权限与双令牌鉴权一致。六个 relay/service crate 的 `cargo test` 通过（20 个测试）；完整工作区构建在本机 MSVC 工具链的 `aws-lc-sys` 处停止，这属于环境问题，与本次变更无关。
