# BirdCoder 更新日志

本文件只记录**当前版本**——`##` 标题就是本次发布打的 tag，不累积历史版本条目；往期条目随各自版本的提交保留在 git 历史里（`git log -p CHANGELOG.md`）。「上游变更」逐字摘自上游该 release 的官方 Release notes（中文部分，英文版见各 Release 页面）；「BirdCoder 本地修改」记录 fork 在该版本上的自有变更（SDKWork 组件、品牌、打包与部署等），不受上游发布节奏影响。

## 0.2.1-rc.3（上游发布 2026-10-23，本地重打包 2026-10-24）

Fork 同步：merge `db24657749`（2026-10-24），上游 474 个提交（24 位作者）、差量 3122 文件（+63062 / −4319，其中新增 1785 个文件、删除 3 个文件），窗口内含 `0.2.1-rc.3` release 提交与 vendored cordis/loader 全家升级。上游 Release：[v0.2.1-rc.3](https://github.com/deepseek-ai/deepseek-harness/releases/tag/dsh-v0.2.1-rc.3)。本次是真实双亲合并提交（`git merge --no-ff`，非 squash / rebase / cherry-pick），上游提交的作者、日期与 commit message 原样进入历史；合并基线为上次同步的上游 tip `f313e7911b`，本窗口上游 tip 为 `22ddee3792`。合并共 **31 个冲突**，全部逐个裁决（未使用 `--ours .` / `--theirs .` / `-X ours` / `-X theirs` 等整树策略）；上游本窗口删除 3 个文件（`packages/boot/official-bundles/src/catalog.generated.ts` 随包迁移到 `packages/util/` 后重新生成、`ui-entry-customization` 的 `EntryPickerRow.tsx` 与 `pin-styles.client.spec.ts` 随上游重构移除），fork 侧合并结果相对第一父 **0 额外删除**，无误删。

### 上游变更

#### 🎨 体验优化

- 新增左侧栏、会话视图和右侧栏的「更多」菜单，方便浏览和创建插件。 @Yifffan, @imccyu
- 修复切换会话后，点击「新会话」找不回未发送草稿的问题。 @imccyu

#### 🧹 其他变更

- DeepSeek API Key 适配器的模型列表更新方式与账号登录模式保持一致。 @LegGasai

### BirdCoder 本地修改

本次同步按 fork 的「分批合并」流程执行：全窗口拆为 4 批（`--no-ff` 真双亲合并），每批跑七项机械校验后落锚。以下为本窗口（第 4 批收尾）的冲突裁决与 fork 面保留摘要。

#### 🔀 合并裁决与 fork 面保留

- **桌面六目标发布面**：`desktop-build-paths.mjs` / `.d.mts` / `package-target.ts` / `desktop-build-paths.spec.ts` 保持 fork 的六目标（mac/win/linux × arm64/x64）契约与 `DSH_DESKTOP_BUILD_ROOT` 短根覆盖，同时采纳上游新增的 `DSH_DESKTOP_PACKAGE_CACHE_DIR` 缓存重定向（`downloads` 与新增 `pnpmStore` 可整体搬出 targets 树）与 `environment` 参数签名；`electron-builder-config.mjs` 采纳上游 8 语言 `CFBundleLocalizations`（en/ja/zh 之外新增 es/fr/de/ru/pt），`apps/desktop/src/locale.ts` 融合上游 `dictionaries` 8 语言分派与 fork 的 brand 管道（BirdCoder 文案、`birdcoder` CLI 命令）；`installer-packaging.spec.ts` 取 fork 的 `config.productName` 卸载名断言 + 上游的 `readInstallerLocales()` 动态语言清单。
- **workspace 行菜单 seam**：上游把行内菜单重构成 `ProjectRowItemProps` 类型 + 按资源逐项问权的 `ProjectRowAccess`（`session/create`、`workspace/rename`、`workspace/delete`、`workspace/insertBefore`，未分组桶问全局、真实 Workspace 问自身资源）。fork 的插件菜单 seam（`menu` 参数、`contextPoint` 右键通道、`menuNode` 渲染、`onFork`/`onArchive`/`onPin`/`onUnpin`）全部保留，并叠加上游的 access 门禁与 `useSessionAccess` / `useRemoteAccess` / `useWorkspaceAccess` 注入；`SessionNodeItem` 解构取两侧并集。
- **会话头 seat 架构**：fork 的 `ConversationSessionHeader`（外壳订阅）+ `ConversationSessionHeaderBody`（seat fallback 纯展示）拆分保留，上游新增的 tab 溢出逻辑（`tabRow` ResizeObserver 宽度预算、`visibleTabs`/`moreTabs` 分配、`ViewsMoreMenu`）并入 body；`skeleton.client.spec.tsx` 同时保留 fork 的两条 seat 回归测试与上游的两条溢出测试。
- **品牌面**：`EmptyHero` 保持 fork 静态 `BirdLogo`（上游对鱼形动画的 pointer 事件升级不适用）；七项校验确认 `FishLogo` 无新增调用点、`BirdLogo`/`BirdWordmark` 消费面与桌面窗口图标照旧、桌面文案 0 处上游名称。
- **INLINE_SAFE 内联白名单**：按上游 `official-bundles` 包从 `packages/boot/` 迁至 `packages/util/`，fork 版正则（含 `host-apiproxy`、`client-sdkwork-office`）补入 `official-bundles`，保持字母序。
- **侧边栏**：`SidebarRoot.tsx` 保留 fork 的 `sidebar.actions` seat 包装，并把上游 `canStartSession` 权限门禁加进 fallback（seat 占用者也无法复活 Host 会拒绝的创建入口）；`ui-sidebar` README 双语取上游对「更多」菜单的新语义（entries 增 `active`、pin 列表改内存态、默认菜单只提供插件浏览与创建），并保留 fork 的 IM 面板快捷入口过滤段。
- **vendored 面**：`vendor/README.md` 第 19 条跟随上游 rc.11 状态（按 API 分类已随上游自带，fork 不再维护该检测补丁），第 20 条（`hmr/config-update-failed` 声明）保留——该 fork 补丁与 `packages/boot/app-boot` 的降级广播仍存在；`scripts/compile-referenced-projects.ts` 的 Host 堆上限跟随上游 8192 MB（覆盖 fork 6144 MB 的更大图需求）。
- **构建配套**：`tsconfig.client.json` / `tsconfig.host.json` / `tsconfig.client.tests.json` 镜像上游新增的 `client-ui-action-cards`、`client-ui-creation-recommendations`、`client-ui-plugin-recommendations` 三个 client 引用与 `util/official-bundles` 迁移；`.github/workflows/ci-windows.yml` 维持 fork 删除（deletedByFork 豁免清单）；5 个 `.i18n.yaml` sidecar 与 5 个文档 sidecar 由 `verify-translation-pairing --write` 按合并后正文重算。

#### 📦 版本收敛

- fork 自有成员版本家族随上游对齐到 `0.2.1-rc.3`（上游经 merge 自动带入 root `package.json` 与 lockfile）；`pnpm-lock.yaml` 由 git 自动合并 + `pnpm install --no-frozen-lockfile` 语义校验通过。

#### ✅ 校验

- 七项机械校验（祖先包含 / 无冲突残留 / 删除审计 / 品牌面 / sdkwork 面 / 版本与 CHANGELOG / kept-deleted 清单）在 merge commit `db24657749` 上全绿；sdkwork 路径 2223 个合并前后一致。

#### 🔧 发布日修复（2026-10-24）

- **合并后行为修复**：`client-bundle-css` 的 `?inline` 双重编码（整页令牌表丢失，恢复 8 张 ui-theme 内联表）；`input-bar` 的 lexicon 订阅在交互编辑器更新时按 `HISTORY_MERGE_TAG` 放行重试；`package-target` 恢复上游 `executePreparation` 失败拦截与 win32 pack/prepare-runtime 重叠；安装器多语言文案品牌化（es/fr/de/ru/pt 的 15 处名称）与 `author` 对象形（macOS/Linux 包 `companyName`）；shimmer 装饰在 React 19 下的 detached ref 断言适配；删除 resurrected `release:publish` 脚本行并修正 CI workflow 自检断言。
- **依赖管理**：`pnpm-lock.yaml` 按 `scripts/sdkwork-sources.manifest.json` 的 pin 重新校准——移除 pin 已删除的 `sdkwork-appstore-pc-admin-demands` importer 与 `@sdkwork/company-backend-sdk` 陈旧条目（CI `--frozen-lockfile` 曾因此必红）；`sdkwork-appstore`/`sdkwork-company`/`sdkwork-documents` 三个 sibling 的 pin 前进到各自远端 main 最新（与本地相对路径检出一致，manifest 与 `agent.workflow.json` 双记录同步）。
- **npm 安装布局预算**：`verify-npm-install-layout.ts` 的 `MAX_RESOLUTION_WORK_UNITS` 从 1,095,500 提高到 1,382,850——368×3006 的解析布局合 1,106,208 个工作单元、超出旧预算，CI 的 Dependency layout 门因此必红；spec 同步更新（77 项测试全绿），`release-gitdependency-local.mjs` 的 git 依赖排练命令保持可复制。
- **submodule**：`plugins/dsh-im` 从 `4b9a10c`（v5.4.0）前进到 `3bd60c9`（v5.6.0，19 个提交：会话损坏恢复、Telegram 投递失败日志、i18n 补齐等；依赖 mailparser/nodemailer/undici 小版本前进）。

#### 🔧 打包门禁修复（2026-10-25）

- **Client bundle 入口缺失**：`tsconfig.host.json` 补回 4 个 SDKWork 模型设置包（image/music/video/voice-models）的 host face 引用。提交 `94dbea5d48` 为修 TS6306 把 `tsconfig.client.json` 里的目录引用改成显式 `tsconfig.client.json` 行后，host face 失去传递编译入口，`lib/types/index.js` 不再发射，tsdown Client pass 死于 `[UNRESOLVED_ENTRY]`；四个包的 host loader 入口（`src/index.ts`，持久的 settings-section 注册与投影写入）现由 host 解决方案编译，为 clientBundle 的 node 半提供入口。
- **投影重复注册**：`host-apiproxy` 的 imageLimits 投影注册补 `summary: false`，与 session-controller 的 `SessionProjectionSummaryExcluded` 标记对齐；缺少它时同一 key 的第二次注册会使整个插件失败。
- **npm tarball 入口文件**：`connection`（`lib/index.js`/`lib/client.browser.js`/`lib/client.node.js`）与 `runtime`（`lib/index.js`/`lib/client.js`）的 `files` 数组补上发射入口，`desktop-host` 重排为入口优先，保证 `release:pack` 产出的 tarball 带上可执行入口。
- **上游测试命名豁免**：`verify-generated-sdk-typescript.ts` 为两个上游拥有的 client 测试（`ui-primitives` 的 `quote-text.spec.ts` 与 `tooltip-placement.spec.ts`）加窄范围豁免——上游没有 host/client 面拆分，其裸 `*.spec.ts` 命名在上游树里是正确的；fork 既不打补丁也不改名上游文件（改名会在合并保真审计里读成误删），且 `ui-primitives` 只编译 `src/`、`tests/` 不进任何聚合，该命名规则对这两个文件是误报。unsigned lane 的 `build --profile local` 经 `_sdkwork:build` 跑该校验，此前本地打包正因此红。
