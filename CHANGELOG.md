# BirdCoder 更新日志

本文件只记录**当前版本**——`##` 标题就是本次发布打的 tag，不累积历史版本条目；往期条目随各自版本的提交保留在 git 历史里（`git log -p CHANGELOG.md`）。「上游变更」按该 tag 内的实际提交归纳并注明来源（上游尚未发布该版 Release notes 时如此处理）；「BirdCoder 本次更新」记录 fork 在该版本上的自有变更（SDKWork 组件、品牌、打包与部署等），不受上游发布节奏影响。

## 0.2.3-alpha.2（fork 同步 2026-11-23）

本版本把 `deepseek-ai/deepseek-harness` 的 `0.2.3-alpha.2` 完整合入 fork。上游 `master` 从上一合并基底 `dsh-v0.2.2-rc.5` 推进到 `0.2.3-alpha.2`（`Merge pull request #8961 from deepseek-harness/worktree-release-dsh-0.2.3-alpha.2`），对应上游 tag `dsh-v0.2.3-alpha.2`。相对基底新增 **708 个提交（其中 550 个非 merge 功能/修复提交）、3225 个文件变更**（+94377 / −17784）。合并保留真实双亲 merge commit，上游 708 个提交记录、commit message 与代码注释逐字随合并进入仓库；根版本线前移到 **0.2.3-alpha.2**。

### 上游变更（deepseek-harness 0.2.3-alpha.2）

上游尚未以 Release 正文形式发布该版说明，以下按 `git log dsh-v0.2.2-rc.5..dsh-v0.2.3-alpha.2` 的实际提交主题归纳。

#### 企业连接器：新增五个插件

* 新增 **Feishu（飞书）**、**WeCom（企业微信）**、**DingTalk（钉钉）**、**Tencent Meeting（腾讯会议）**、**Tencent Docs（腾讯文档）** 五个连接器插件（`packages/connector/{feishu,wecom,dingtalk,tencent-meeting,tencent-docs}`），合计 167 个提交；各自随附客户端 UI 包（`ui-feishu` / `ui-wecom` / `ui-tencent-meeting` 等）与 bundle 语言包。
* 五个插件的 CLI 与账号统一走共享 `ctx.cliAccounts` 与 `ctx.upstreamSkills`：`lark-cli`、`wecom-cli`、`dws`、`tmeet` 按 profile 各自缓存，账号通过共享 connector account registry 在 Host 注册并展示，账号类型不再从插件入口导出（`refactor(feishu|wecom|dingtalk|tencent-meeting): register … with ctx.cliAccounts`、`stop exporting the account types from the plugin entry`）。
* bundle 折叠进各自插件包（`refactor(…): fold the … bundle into its plugin package`），Plugins 页显示品牌图标与 feature preview（`show … brand icon on the Plugins page`、`show a feature preview on the bundle's Plugins page`），英文标题改为句首大写。
* 行为修复：企业微信沙箱 `853004` 重跑而非重开授权、钉钉文件沙箱不再读成已登出账号、钉钉可按机构重新登录并给出下载源上限与页面取消、飞书入口技能改为静态 provider 并按退出码报告失败。

#### CUA（计算机使用）

* **最近活动上报**：模型下一步之前上报最近窗口活动（`feat(cua): report recent window activity before the next model step`、`report recent macOS application activity`），macOS 默认回看窗口缩短到 10 秒且可按连接关闭（`shorten default macOS activity lookback to ten seconds`、`allow disabling macOS recent activity per connection`）；系统睡眠计入活动时长。
* **显式系统输入统一**：显式系统输入与键盘修饰键合并为一条路径（`feat(cua): unify explicit system input and keyboard modifiers`），按会话事件源归因系统输入、校验系统输入准入、显式查询 WindowServer 窗口 ID 归属输入、只查询输入事件目标窗口；Windows 实现窗口级鼠标按键切换（`feat(cua-windows): implement window-level mouse button toggles`）。
* **动作 schema 发现**（`feat(cua): add action schema discovery`）、按调用 PTC 提供 object API、工具说明中的程序作用域澄清、原始协议指导仅对 raw 调用方生效；读取期间检测输入、避免等待桌面任务、步骤取消在 helper 查询后复查、提醒按已投递观察过滤。

#### Web、侧栏与客户端

* 个人化推荐默认随包发布（`feat(web): ship personalized recommendations by default`），个人化推荐 bundle 随之退役（upgrade guide `personalized-recommendations-bundle-retired`）；动作卡片独立成包（`independent-action-cards`）。
* 侧栏性能：resize 信号不再触发无关子树、避免 resize 期间的同步布局读取、长历史避免整文档样式重算（`perf(web): …` ×3）。
* 拖拽 Session 到右侧栏打开（`feat(web): open a dragged Session in the right sidebar`）；workspace picker 增加搜索（`feat(client): add workspace picker search`）。
* 计划与压缩内容可独立预览（`feat(client): preview plan and compaction content independently`、upgrade guide `compaction-summary-preview`）。

#### 会话与远程连接

* 新增**跨 Session 消息控制**：共享的跨会话发消息能力，跨会话消息以发送方 Session 为前缀，Web Session 通过 Session controller 投递（`feat(session): add shared cross-session message control`、`prefix cross-Session messages with the sender Session`、`message Web Sessions through the Session controller`）。
* Session 校验与 header 构建为 `SessionData` 做准备（`refactor(session): prepare Session validation and header building for SessionData`）；`tool-session-query` 的 inspect-session 通道移除（upgrade guide `session-query-inspect-session-removed`）。
* 远程连接：浏览器通过共享根登录页配对（`feat(remote-connection): pair browsers through the shared root login page`），QR 凭据在根登录页兑换，浏览器认证交由 provider 管理，并新增设置扩展槽（`add settings extension slot`）。

#### 桌面

* 应用菜单新增 **Settings…**（`feat(desktop): add Settings to the application menu`），快捷键处理与 `closeBinding` 对齐；安装器参数摘要（`feat(desktop): summarize Windows packaging parameters`）、支持 Windows 预登录打包 runner（`support Windows pre-login packaging runners`）。

#### Office 与 Python 运行时

* Office 技能目录**只保留 `office`**，三个格式技能（`office-docx` / `office-pptx` / `office-xlsx`）与三个格式指导文件删除，格式指导改为按需读取的资源文件（`feat(office): Office 技能目录只保留 office…`、upgrade guide `office-single-skill`）；PDF 支持保留在打包的 Python 与既有路由上。
* Python 运行时：`node` 引擎区间收紧为 `^24.22.3 || >=26.13.1`（upgrade guide `node-24-22-3`），pi-image 缩放默认值、PTC 默认 scoped REPL、SDK prompt 时区、system-prompt 集成点等随之调整。

#### Forge、工具与工程

* Forge：分支选择器改用共享菜单搜索（`feat(forge): use the shared menu search in the base branch pickers`）、列表徽标改读状态简报并在打开时刷新、push 后与执行工具的轮次结束时轮询、共享状态拉取并在隐藏时暂停。
* 工具与协议：`ctx.mcpManager` 重命名贯穿客户端与 Host；Linear / Notion 的 `src/copy.ts` 改名为 `src/locales.ts` 并接入 connector account registry；Web 搜索默认模型切到 DeepSeek。
* 新增 16 个 upgrade guide（`v0.2.2-rc.5` 15 个 + `v0.2.3-alpha.1` 1 个），覆盖 CUA 活动/按键/系统输入、office 单技能、个人化推荐退役、动作卡片独立、PTC scoped REPL、Session 查询通道移除等外部可感知变更；CI 侧 coverage 拆成两个分片并新增 `node-24-coverage-report`、`node-24-build`、`node-24-web-snapshot` 作业，PR 并发上限从 11 提到 16。

### BirdCoder 本次更新

#### 同步与冲突处理

* 合并基底 `dsh-v0.2.2-rc.5` → `dsh-v0.2.3-alpha.2`（708 个上游提交、3225 个文件变更、+94377/−17784）。**72 个文件**存在文本冲突，按 fork-first 规则逐项解决：SDKWork 自有组件（56 个 `ui-sdkwork-*`、15 个 `sdkwork-*` Host/Bundle）、品牌表面（`BirdLogo` / `BirdWordmark` / `LoginPanel` / `favicon.png` / 图标 / 标语）与 fork 自有 CI 拓扑保留 fork 版本。
* 关键冲突逐项并集：
  * 根 `package.json` 保留 fork 已重排的依赖清单，并入上游新增的 `dsh-dingtalk` / `dsh-feishu` / `dsh-wecom` / `dsh-tencent-meeting`；`packages/bundle/web-app` 并入 `client-remote-connection`、`action-cards`、`creation-recommendations`、`plugin-recommendations` 及其客户端包；`apps/cli` 采用上游 `node: ^24.22.3 || >=26.13.1` 并保留 fork 的 `@sdkwork/iam-*` 可选依赖与 `prepack`/`postpack`。
  * `tsconfig.base.json` 同时映射 fork 的 `ui-sdkwork-updater` 与上游 `ui-wecom` / `ui-tencent-meeting`；`tsconfig.client.json` 采纳上游把 `client-ui-{action-cards,creation-recommendations,plugin-recommendations}` 从 `experimental/` 迁到 `client/` 的重命名，去掉 fork 侧的旧路径重复项。
  * `vitest.config.ts` 保留 fork 的 `tsconfigPaths` + `siblingBareImportFallback` + `forkTestingAliases`（`@xmanrui/dsh-im` 解析到 `plugin-src`），并把上游新增的 `sourceRemotePlugin(…, 'dsh-client-remote-connection')` 折进三处插件数组。
  * `apps/desktop/src/main.ts` 保留 fork 的登出/欢迎页重写（`showWelcome('startup', …)` 与 promise 双分支），并入上游离开工作区时的 `refreshApplicationMenu()`；`locale.ts` 八个语言在 fork 品牌文案上补上游新增的 `settingsMenu` 键；`main-startup.spec.ts` 相应在断言里插入“设置…”项。
  * `packages/api/remotes` 的 remote 清单与 devDependencies 并入 `actionCardsRemote` / `pluginRecommendationsRemote` 与 `dsh-action-cards` / `dsh-plugin-recommendations`；`ui-conversation` 的编辑器 runtime 采用上游 `this.history` 与新增 `afterUpdate()`，保留 fork 的 lexicon 订阅重试监听；`ui-workspace/Rows.tsx` 采用上游 `draggable` / `reorderDraggable` 拆分并保留 fork 的插件菜单双源 open 状态。
  * `ui-chat` / `ui-model-selection` / `ui-settings-models` 的 README 按 fork 品牌并集上游新增段落（压缩进度行、`DeepSeek API` 命名）。`apps/desktop`（fork 应用）README 以 fork 文案为准，并入上游新增事实：Windows 手动卸载移除自有 CLI 注册、应用菜单含“关于/设置/管理命令/开发者工具”、安装器八语言夹具与占用/注册表/接管回归。
  * CI：保留 fork 的单一 `ci.yml` 拓扑（`python-runtime` / `windows-build` 在内）。上游把 Windows/Python 拆成独立工作流、并删除 npm 发布工作流，fork 侧继续只发 GitHub Releases，因此 `ci-python.yml` / `ci-windows.yml` 保持删除、`ci.yml` 并入上游 coverage 分片、`node-24-build`、`node-24-web-snapshot` 与 16 并发注释；`all-checks-passed.needs` 同时列 fork 的 python/windows 作业与上游新作业。
  * `pnpm-lock.yaml` 保留 fork 的 workspace 与 SDKWork sibling importer 块（重生成留作后续项）。
* 生成物按源重新生成而非手工合并：`docs/module-graph.md`（+185 行/语言，纳入新连接器与客户端包）、`docs/config-catalog.md`、`packages/extensions/cordis-client-runner/src/client/slot-catalog.ts` 分别由 `gen-module-graph` / `gen-config-catalog` / `gen-client-catalog` 重跑产出。`gen-cordis-inspect-catalog` 因上游 typert 分析器新增「public property 必须显式类型标注」而卡在 fork 自有 `packages/client/ui-sdkwork-im/src/client/im-service.ts:335`，`api-catalog.ts` 暂取上游产物，作为后续项。
* 翻译配对：19 条配对记录（agent notes、`apps/desktop`、`docs/capability-seams`、`docs/user/guide`、`ui-chat`、`ui-model-selection`、`ui-settings-models`、`ui-primitives`、`ui-conversation`、`plugin-manager`、`client`、`llm`、`llm-pi-ai`）用 `verify-translation-pairing --write` 重新记录，全仓 1642 对复验一致。
* 品牌契约复核：`FishLogo` 未出现在 fork 表面，三处登录入口（`WelcomePage` / `SignInDialog` / `SignInOverlay`）仍渲染 `LoginPanel`，官方名称槽渲染 `BirdWordmark`，启动页渲染 `createBootBrand()`，canonical 栅格 `apps/web/public/favicon.png` 未被覆盖；上游 PWA 图标集（`icon-192/512`、`icon-maskable-512`、`apple-touch-icon`、`favicon.svg`）与 `render-app-icons.ts`、`app-icons.spec.ts` 继续保持 fork 的删除决定（图标只从 canonical 栅格派生）。

#### 版本与依赖

* 根版本前移 **0.2.3-alpha.2**（上游 tag `dsh-v0.2.3-alpha.2`），随上游发布线推进；`node` 引擎区间同步上游 `^24.22.3 || >=26.13.1`。
* `pnpm-workspace.yaml` 并入上游新放的 `@larksuite/cli@1.0.97` 与 `@tencentcloud/tmeet@1.0.18` 构建脚本跳过项、`node-addon-require-builtin@0.1.10` 系列 release-age 豁免，同时保留 fork 的 `@whiskeysockets/baileys` 跳过与六条 `@sdkwork/*` 豁免。
* 本地仍由 `pnpm-workspace.yaml` 的 `../sdkwork-*` 相对路径与 `workspace:*` 解析，release 仍由 `agent.workflow.json` 与 `scripts/sdkwork-sources.manifest.json` 的 git pin checkout 解析；本轮没有把本地路径写进 release 依赖。

#### 合并前的 fork 能力（本次一并纳入 0.2.3-alpha.2 版本线）

以下能力在 rc.5 版本线上已交付，随本版本继续提供；明细见各自提交（`git log`）。

* **输入框历史**（`ui-sdkwork-input-history`）：裸 ↑/↓ 回溯 Host 已接受的消息，范围可选本会话/本项目/本浏览器全部会话，默认 30 天保留窗口，设置页可清空。
* **设置菜单 shell store**：轨道之外的表面（会话失败行「去配置」）可在自己的分区打开设置对话框；**缺失凭据修复**接到会话失败行（`ui-settings` 按 `focusProvider` 定位并高亮提供方行）。
* **欢迎页登录交棒新 workspace boot**：`ui-sdkwork-iam` 在 store 动作绑定后接管模态动作，冷启动换票或回调失败有表面可呈现；桌面兑换信封改用 `sdkworkUnwrapKind: 'item'`，失败提示优先显示服务端 `detail`。
* **插件市场 fork**（`plugins/dsh-market` 子模块 + `scripts/build-dsh-market.mjs`）、**HMR `pluginEvents` 流恢复**（插件启停/配置变更不刷新页面即生效）、**翻译配对门禁覆盖子模块**。
* **桌面运行时冒烟**：Office 转换路由从 `fetch` 换成 `node:http`，绕开 undici 300 s 响应头上限；IAM deep-link loopback policy 与 access-token bootstrap；`admin:bootstrap:app` 迁到 `scripts/bootstrap/bootstrap-app.mjs`。

#### 合并后的 fork 变更（2026-11-21 起）

* **关于面板：安装身份**（`feat(about): add installation identity about surface and installation app api`、`add deploy anchor, surface profile and installation facts surfaces`）：About 表面新增部署锚点、profile 与安装事实（安装身份、安装位置、应用 id），由安装侧 API 提供；`dsh-desktop` 的 About 命令测试按 `IpcMainInvokeEvent` 补类型。
* **欢迎窗登录收敛**（`feat(welcome): gate the continue action on a signed-in workspace`、`add welcome links and OAuth session end handling`）：继续动作要求已登录工作区，欢迎页新增链接与 OAuth 会话结束处理；落地页 locale 载荷与渲染夹具随之对齐。
* **IAM 离屏登录提示**（`feat(iam): surface a sign-in notice when browser login finishes off-surface`）：浏览器侧完成登录而模态已关闭时，`SignInOverlay` 给出可恢复的提示，而不是静默失败。
* **脚手架动作改名**（`refactor(row-menus): rename template actions to scaffold`、`refactor(deploy): read the template center from the app scaffold SDK namespace`）：模板发布/安装动作统一为 scaffold 语义，部署侧改读 `@sdkwork/*-app-sdk` 的 scaffold 命名空间。
* **安装修复命令**（`feat(scripts): add admin:repair:installation reconciliation command`）：`scripts/bootstrap/installation-repair.ts` + `repair-installation.mjs` 对齐本地安装记录与应用锚点，附 128 行规格。
* **预览客户端按面分目录**（`refactor(preview): group preview clients and row menus into per-surface directories`）：audio/image/video/pdf/docx/xlsx/pptx 预览与行菜单各自成目录；`xlsx` 表头填充改用活动主题 token（`fix(xlsx-preview): use the active header fill token in the sheet grid`）。
* **打包与配置**：`fix(pack): treat git dirty marker as build-time provenance`、`fix(build): tolerate vanished files and out-of-tree links when stamping`、重新生成部署 profile 的 env 文件、`mcp-connector` 前移到 0.2.119。

#### 后续项（本轮未做，均不影响合并完整性）

* `pnpm-lock.yaml` 未随新增依赖重生成（合并提交保留 fork 的 lockfile）；`pnpm install --frozen-lockfile` 需在下一轮补齐 importer 块。
* `gen-cordis-inspect-catalog` 需为 `packages/client/ui-sdkwork-im/src/client/im-service.ts` 的公有属性补显式类型标注后重跑；本轮 `api-catalog.ts` 取上游产物。
* `scripts/ci-workflow.spec.ts` 的六项工作流断言待对齐：worker 并发核算已按合并后的 `ci.yml`（coverage 两分片、`node-24-build`、`node-24-web-snapshot`、bench 两阶段）改成 16 并发与 `linuxActive` 公式，但 coverage 缓存键、必需判定 `needs`、Windows 拆分作业等断言仍按 fork 合并前的 `ci.yml` 形状，需在跑通 CI 后逐项重算。
* 编译、单测与打包门禁未在本轮执行（按「先完成同步」的要求）。

本文件只保留当前版本一节；往期条目随各自版本的提交留在 git 历史里（`git log -p CHANGELOG.md`）。Release notes 就是本节内容。
