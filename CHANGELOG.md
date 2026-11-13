# BirdCoder 更新日志

本文件只记录**当前版本**——`##` 标题就是本次发布打的 tag，不累积历史版本条目；往期条目随各自版本的提交保留在 git 历史里（`git log -p CHANGELOG.md`）。「上游变更」逐字摘自上游该 release 的官方 Release notes（中文部分，英文版见各 Release 页面）；上游尚未发布 Release notes 时，按该 tag 内的实际提交归纳并注明来源。「BirdCoder 本地修改」记录 fork 在该版本上的自有变更（SDKWork 组件、品牌、打包与部署等），不受上游发布节奏影响。

## 0.2.2-rc.3（fork 发布 2026-11-13）

本版本把 `deepseek-ai/deepseek-harness` 的 `0.2.2-rc.3` 完整合入 fork。上游 `master` 停在 `39163dd30f7`（`Merge release/dsh-0.2.2-rc.3 to master`），相对上一合并基底 `e8f7b93a34`（tag `dsh-v0.2.2-rc.2`）新增 **448 个提交、3262 个文件变更**（+93416 / −34804，其中新增 517、修改 2652、删除 45、重命名 48）。合并保留真实双亲 merge commit，上游提交记录、commit message 与代码注释逐字保留；版本线前移到 **0.2.2-rc.3**，tag `birdcoder-v0.2.2-rc.3` 与之同名。

### 上游变更（deepseek-harness 0.2.2-rc.3）

以下逐字摘自上游 [v0.2.2-rc.3](https://github.com/deepseek-ai/deepseek-harness/releases/tag/dsh-v0.2.2-rc.3) 官方 Release notes 中文部分；英文版见该 Release 页面。

#### 新增功能

新增实验性「DeepSeek 会话导入」插件，支持将 DeepSeek App 或网页版的历史会话导入工作区，并继续对话。(@imccyu)

#### 问题修复

修复 Windows 桌面版应用内更新可能失败、无法自动重新打开的问题。(@winewill)

### BirdCoder 本次更新

#### 同步与冲突处理

* 合并基底 `e8f7b93a34` → `39163dd30f7`（448 个上游提交、3262 个文件变更）。76 个文件存在文本冲突，按 fork-first 规则逐个并集解决：SDKWork 自有组件（`dsh-client-ui-sdkwork-*`、`dsh-sdkwork-*`、`dsh-client-sdkwork-office`、`ui-sdkwork-updater`、终端面板、Windows CUA、profile lease、gateway fallback、侧栏行菜单）与品牌表面（`BirdLogo` / `BirdWordmark` / 标语 / 图标）保留 fork 版本，上游对其余文件的改动完整采纳。
* 上游新增文件零遗漏合入；上游删除的 `packages/experimental/ptc-runtime-python/` 整体接受删除。fork 已删除的 `ci-windows.yml`、`release-publish.yml`、`release-vendor-publish.yml` 与 `scripts/release/publish.ts` 维持删除——fork 的 Windows 车道已在 `ci.yml` 内，发布走 `container-release.yml`。
* 合并后全仓校验无冲突标记残留，`docs/module-graph.md`（含中文版）按上游模块图重新生成，10 组中英文档配对重新记录哈希。

#### 合并后接口修复

* **Web 客户端装配**：fork 的 shell 走 Vite source alias，浏览器图里没有 `__$dsh_client_module_manifest`。`packages/client/web/src/seed.ts` 对经 alias 引入的 fork 包改用 `platform()`（而非上游的 `compiledModule()`），其余包沿用上游的静态清单，`getStaticModules()` 返回上游的 `DshClientModuleManifest[]`。
* **样式管线双轨并存**：采纳上游的 module CSS 元数据管线（`styles.set(compiledClientStyle(...))` + renderer 的 `meta.stylesheets`），fork 的全局 CSS 运行时注入（`styleInjectionModule`）继续服务 `ui-theme` 的样式表；构建预设同时保留 fork 的 `css-text-inline` / `css-global-inline` 与上游的 `css-modules-inline`、style-factory 插件。
* **连接与鉴权**：采纳上游 `ConnectionAuthentication`（`ctx.inject(['connection.authentication'])`、路由 `auth: 'required'`、`rpc-host` 的 `admit`），保留 fork 的 426 事件路径、自有路由 404 语义与 `sdkworkApiFallback` 槽；上游移除的 `/connect` 路由随之删除。
* **模型选择菜单**：采纳上游的 pane 对象与 `ModelMenuControls`，同时保留 fork 抽取的 `ModelPicker`、登录引导与 `conversation.input.model.pane` 槽位（新增 `renderPane`）。
* **侧栏槽位**：fork 的 `sidebar.actions` 外层槽位保留，嵌套上游新增的 `sidebar.session.action` 槽位，新建会话胶囊在无注册者时仍作为回退。
* **工作区契约**：槽位表并集 `sidebar.workspaces.rowMenus`（fork）与 `workspace.picker.directoryFlow`（上游）；插件注入加入 `uiSession` / `uiSession.sessionStatus`。
* **桌面工具链**：上游把桌面自更新与上传逻辑抽到 `@deepseek-ai/dsh-desktop-publisher`，CUA macOS 原生产物改由 `@deepseek-ai/dsh-cua-macos/native/bin` 提供；`apps/desktop` 六个打包目标、`codeSplitting: false` 与自更新通道选择保持不变，路径与类型改为引用新包。
* **实验插件**：`packages/experimental/client-ui-forge` 的改动页同时支持上游 `lensParam` 与 fork 的 `ChangesParams`；`tsconfig.client.json` 并入上游新增的 `experimental/deepseek-chat-import`。

#### 版本与依赖

* 全部 **449 个 dsh 家族清单统一到 0.2.2-rc.3**：上游推进了 371 个，fork 自有的 **80 个**清单（含根 `package.json`、`packages/client/runtime`、`native/system/packages/landlock-launcher`、SDKWork 组件包与五个 `apps/sdkwork-birdcoder2-*` 应用）此前仍在 rc.2，本版本一并推进。
* 根依赖里残留的旧名 `@deepseek-ai/dsh-experimental-cua-macos` 删除——上游已把该包改名为 `@deepseek-ai/dsh-cua-macos`（`devDependencies` 中的新名由合并带入）。
* `pnpm install --lockfile-only` 重新生成 `pnpm-lock.yaml`，补回 fork 包的 importer 块与全部 workspace 链接；`pnpm-workspace.yaml` 的 `@michengai/dsh-agency-agents>@deepseek-ai/dsh` override 同步改指 `0.2.2-rc.3`。

#### 部署与发布

* 发布流程（`feat(deploy): add project app source picker and standalone publish entry`）新增项目应用来源选择器与独立发布入口：发布构建产物时可直接挑选项目内的应用目录，且无需先创建会话即可进入发布弹窗。
* 版本号为 **0.2.2-rc.3**，tag `birdcoder-v0.2.2-rc.3` 指向本次构建的提交，由 `container-release.yml` 一次打包六个桌面目标、两套容器镜像与部署包，发布一个包含 31 个精确资产的 GitHub Release（`assemble-github-release.ts` 拒绝缺失或多余资产）。
* 本文件只保留当前版本一节；往期条目随各自版本的提交留在 git 历史里（`git log -p CHANGELOG.md`）。Release notes 就是本节内容。
