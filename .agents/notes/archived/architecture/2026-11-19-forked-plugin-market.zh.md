# Agent Note：采用 SDKWork 插件市场 fork，并在本仓库构建其 Host 半边

Status: implemented
Archived: 2026-11-24

[English](2026-11-19-forked-plugin-market.md) | 中文

部分取代[插件市场默认随应用安装](../feature/2026-11-02-plugin-market-ships-by-default.zh.md)：组合行挂载、`market` 客户端契约、宿主托管的 `selfManaged: false` 形态，以及市场随 Web 闭包出货的理由，全部继续成立。改变的是这个包从哪里来、由谁构建。

## 问题

插件市场一直以 registry 包 `dshmarket@^1.73.8`（第三方 npm tarball）出货。这回答的是「目录存在」，不是「本 fork 拥有目录的行为」。fork 想要的每一次改动——不同的默认值、仅 SDKWork 适用的安装规则、等不及上游发版的 UI 修复——都得先向上游提 PR、等上游发版，再在这里升版本号。它还把同一个产品表面拆进两条发布节奏：市场可以通过自己的更新通道自更新，而应用钉着另一个版本。

这个包现在有了 SDKWork 自己的上游：`sdkwork-ai/sdkwork-dsh-market`，即 `dsh-market/dsh-market` 的 fork。继续按 registry 发行版消费它已经不成立，因为那个仓库通过上游项目的 npm trusted publishing 注册发布，而这个 fork 不是发布者。

## 决策

### 这个仓库归 fork 所有

`plugins/dsh-market` 是指向 `sdkwork-ai/sdkwork-dsh-market` 的 Git 子模块，与其他 fork 自有的插件同一形态。[AGENTS.md](../../../../AGENTS.md#third-party-plugin-submodules-are-read-only-merge-stable-contract) 与 `plugins/README.md` 记录了这个例外：市场的源码与产品改动落在那个仓库，本 checkout 用 gitlink 钉住。npm 包名（`dshmarket`）与加载器行 id（`dsh-market`）保持不变，因此组合行、包自带的 `dsh.bundle.patch`，以及 `ui-sdkwork-markets` 里的每一处引用都照旧工作。

### 组合改为链接 fork，而不是拉取

`packages/bundle/web-app/package.json` 声明 `"dshmarket": "workspace:*"`；`plugins/*` 本来就是 workspace 通配符，所以 `pnpm install` 会把子模块链接进来，并在它旁边安装插件自己的运行时依赖（`js-yaml`、`undici`）。桌面组合 patch 在 Web 组合之上，依赖与那一行都照旧继承。

### fork 提交浏览器半边；本仓库构建 Host 半边

上游的构建把插件分成两半：`client/client.js` 是提交进仓库的产物，而 `lib/`（`tsc` 从 `src/` 产出的 Host 半边）被 gitignore，只在 `prepack` 时生成。因此一个 gitlink 只会带来浏览器半边，加载器没有任何可 import 的东西。

`scripts/build-dsh-market.mjs` 用与助手、better-sidebar 构建相同的方式补上这个缺口：`postinstall` 带 `--optional` 运行它，`pnpm run build:artifacts` 把它当成一道独立的 gate，`.dsh-build/dsh-market-build.json` 里的内容寻址戳记让输入、产物与构建模式都没变时重跑成为空操作。它通过 fork 钉住的 TypeScript 版本（原生编译器）用插件自己的 `tsconfig.json` 编译 `lib/`，并且先删掉 `lib/`，避免被删掉的源码留下加载器仍会 import 的陈旧模块。

编译有两种都写进戳记的模式，因为它做类型检查所依赖的框架声明本身也是构建产物。**checked** 是常规路径：Host 编译器已经产出 `vendor/cordis` 与 `vendor/schemastery` 的声明，插件针对本次构建真正运行的源码做类型检查；`pnpm run build:artifacts` 把这道 gate 排在 `host-src` 之后以保证这一点。**emit-only** 覆盖全新 checkout：`postinstall` 在任何 Host 编译之前运行，这两个包还没有 `lib/types`，构建回落到 `tsc --noCheck` 直接产出 `lib/`，让第一次启动就能 import。戳记记录了模式，所以下一次构建产物会用 checked 版本替换 emit-only 产物，而不是把它当成最新。

浏览器半边刻意不在这里重建。客户端改动在 fork 里做、在 fork 里构建并提交，由 gitlink 升级带过来。`pnpm pack`（桌面打包对每个 `plugins/*` manifest 做的事）会触发 fork 自己的 `prepack`，所以打出的 tarball 里的 `lib/` 仍然与打包时的源码一致。

### 插件的框架依赖边解析到本 checkout

`pnpm-workspace.yaml` 里 `dshmarket>` 作用域的 overrides 把它的 `@deepseek-ai/*` 依赖边指向本次构建实际运行的源码：`cordis` 与 `schemastery` 链接到 `vendor/`，其余解析到 workspace 的 `0.2.2-rc.5` 包。`schemastery` 是 Host 半边唯一的框架 import（市场的 Config schema），用 registry 副本就等于在宿主旁边多出一个 schema 构造器。

两个上游 devDependency 指向的包本 checkout 已不再提供——`@deepseek-ai/dsh-invariants` 与 `@deepseek-ai/dsh-client-ui-settings-plugins`。插件的 `src/` 都没有 import 它们，只有它自己的测试夹具会写到这些名字。同一段 override 把它们移除，避免把已发布的 `0.1.0` 线——一整套并行的 harness 闭包及测试工具——拉进锁文件。插件自己的测试套件不在本仓库运行。

`dshmarket@1.73.8` 同时从 `minimumReleaseAgeExclude` 中移除：钉住的对象不再是 registry 发行版，那条发布年龄豁免不再适用于任何东西。

## 考虑过的替代方案

**继续用 registry 发行版并向上游贡献。** 这样保留 npm 钉法及其供应链审查，但 fork 必须拥有的行为仍受上游发版节奏支配，而且完全无法表达仅 SDKWork 适用的规则。

**把 fork 作为 Git 依赖消费（`github:sdkwork-ai/sdkwork-dsh-market#<sha>`）。** pnpm 会在安装时拉取 fork 并运行它的 `prepare`，于是每次安装都需要网络，还要为一次本 checkout 本来就会做的构建批准构建脚本；产物也游离在 workspace 的依赖与 override 图之外。

**把 `lib/` 提交进 fork。** 其他 fork 自有插件就是这样出货的，也能省掉这里的构建步骤。这个插件没有走这条路，因为它的上游不提交 `lib/`，并且用可复现重建比对来约束已提交的浏览器半边：只提交一半产物会让每次上游合并都跟 `.gitignore` 和 CI diff gate 打架，而且构建产物将不受本仓库内容寻址新鲜度检查的约束。

**不进 workspace，用 `link:` 链接。** 插件的运行时依赖（`js-yaml`、`undici`）无处解析，框架 peer 也会回落到已发布的副本，而不是本 checkout 的源码。

## 后果

- 市场的源码与产品改动落在 `sdkwork-ai/sdkwork-dsh-market`；在这里出货它 = 升 gitlink + `pnpm install` + 验收 spec。
- 全新 checkout 只跑 `pnpm install` 就能得到可加载的 `lib/`（emit-only），第一次 `pnpm run build:artifacts` 会以 checked 重做。从不初始化子模块的 lane 会安静跳过构建；要打包这个插件的 lane 会撞上产物 gate 和 fork 的 `prepack`，而不是出货一个加载不进来的 import。
- Host 编译器产出 vendored 声明之后，Host 半边会针对本 checkout 的 `cordis` 与 `schemastery` 源码做类型检查；emit-only 构建用这项检查换取可加载的产物，构建产物路径会把它补回来。
- 锁文件增加了插件自己的运行时闭包（`js-yaml`、`undici`）与它的开发工具链，但没有并行的 `@deepseek-ai` harness 闭包。
- fork 的浏览器半边无法只靠本 checkout 复现：客户端改动需要先在 fork 里构建，再升级钉点。若提交的客户端不再以契约版本 1 发布 `market` 控制，验收 spec 仍然会失败。

## 验证

- `packages/bundle/web-app/tests/built-in-plugin-market.spec.ts` 通过：组合行、链接 manifest 的 `dsh.client` Web 半边与 `dsh.bundle.patch`、该行解析到的那两个入口产物，以及契约版本 1、带 `render` 的 `market` 控制服务。
- `pnpm run build:dsh-market` 从 fork 的 `src/` 编译出 `lib/`、写入戳记，第二次运行是空操作；`pnpm install` 之后 `git -C plugins/dsh-market status --porcelain` 保持为空，说明提交的浏览器半边与它自己的源码构建一致。
- 把 `vendor/cordis/lib` 与 `vendor/schemastery/lib` 移走（模拟全新 checkout）后，构建仍能产出 `lib/` 并把戳记写成 `emit-only`；恢复它们后，下一次运行仅因戳记模式不同就会以 checked 重做。
- 从 `packages/bundle/web-app` 加载 `dshmarket` 会解析到被链接的包，它的 `@deepseek-ai/schemastery` / `@deepseek-ai/cordis` 依赖边解析到 `vendor/`，证明 overrides 作用到了运行时解析。
- 真实 Web 名册（`packages/test-support/client-runtime`，由 `@deepseek-ai/dsh-base` + `@deepseek-ai/dsh-web-app` 组合）的浏览器行里有 `dshmarket` 及其三条 `dsh.client.inject` 边；`assembly-bundle-roster.client.spec.ts` 现在会在该行离开名册时失败。
- 真实组合：用临时 `$DSH_HOME` 从源码启动 `dsh web`（除组合进 Web 插件包外没有额外安装市场），`/dsh-market/status` 由构建出的 Host 半边回答 `{"version":"1.73.22", …, "selfManaged":false}`，外壳文档预加载 `dshmarket/client.js`，提交的浏览器半边因此进入页面加载图。
- `pnpm --dir plugins/dsh-market pack` 成功，tarball 含 `package/lib/index.js`、`package/client/client.js` 与 locale 文件，即桌面打包循环消费的那套产物。
