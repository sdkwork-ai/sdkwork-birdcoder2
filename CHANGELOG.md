# BirdCoder 更新日志

本文件只记录**当前版本**——`##` 标题就是本次发布打的 tag，不累积历史版本条目；往期条目随各自版本的提交保留在 git 历史里（`git log -p CHANGELOG.md`）。「上游变更」按该 tag 内的实际提交归纳并注明来源（上游尚未发布该版 Release notes 时如此处理）；「BirdCoder 本次更新」记录 fork 在该版本上的自有变更（SDKWork 组件、品牌、打包与部署等），不受上游发布节奏影响。

## 0.2.2-rc.5（fork 同步 2026-11-18）

本版本把 `deepseek-ai/deepseek-harness` 的 `0.2.2-rc.5` 完整合入 fork。上游 `master` 从上一合并基底 `ca33fd6843b`（rc.4 合并点）推进到 `2e39e70496a`（`Merge pull request #8728 from deepseek-harness/worktree-release-dsh-0.2.2-rc.5`），对应上游 tag `dsh-v0.2.2-rc.5`。相对基底新增 **238 个提交（其中 139 个非 merge 功能/修复提交）、960 个文件变更**（+22274 / −2710）。合并保留真实双亲 merge commit，上游 238 个提交记录、commit message 与代码注释逐字随合并进入仓库；版本线前移到 **0.2.2-rc.5**。

### 上游变更（deepseek-harness 0.2.2-rc.5）

上游尚未以 Release 正文形式发布该版说明，以下按 `git log ca33fd6843b..2e39e70496a` 的实际提交主题归纳。

#### 会话、SQLite 与持久化

* 并发 SQLite 提交合并为单组事务（`perf(session): commit concurrent SQLite batches as one group`），每次提交后让出事件循环（`fix(session): yield the event loop after each SQLite commit`），并补齐分组提交与失败隔离的测试（`test(session): cover SQLite group commits and failure isolation`）。
* Session 存储保持 SQLite 主线，连接恢复时序改为通过 synced Config 字段下发，页面注入路径随之调整（见「客户端与连接」）。

#### Forge、代码审阅与 Worktree

* 新增**代码审阅页面**（`feat(forge): add the code review page`）：列出当前登录用户的 change request、读取描述、审阅列表支持搜索、状态以块（blocks）呈现、读取期间以骨架行占位（`feat(forge): draw the review lists as skeleton rows while they are read`、`show the review summary's status as blocks`、`search the review lists under the client search rule`）。页面客户端文件独立成目录（`refactor(forge): keep the code review page's client files in a folder of their own`）。配套文档、主题门禁修复、共享代码与测试落地。
* 审阅列表以紧凑视图呈现，审阅评论可引用进聊天输入（`feat(forge): add a compact review list view and quote review comments into the chat`）；变更视图移除已保存的评论卡片（`fix(forge): remove saved comment cards from the changes view`），页面停止展示时释放审阅会话（`fix(forge): release the review conversation when the page stops showing it`）。
* 仓库菜单始终列出全部仓库（`fix(forge): keep offering every repository in the review page's repository menu`），状态折叠箭头方向修正（`fix(forge): point the status fold's chevron up when it folds`），审阅 tab 顺序与事件图/插件清单随配置刷新（`fix(forge): name the review tab order outside the copy rule and regenerate event graphs and the plugin package list`）。
* worktree 的 Git 目录不再被沙箱策略按布局推断，改由配置与 `registerWritableRoot` 授予（`refactor(sandbox-policy): read no Git layout; grants come from configuration and registerWritableRoot`）；worktree 维护以源 checkout 为界（`fix(sandbox-policy): bound worktree maintenance by the source checkout`），forge worktree 阻断项计入 sandbox grant（`fix(deliverables): … count sandbox grants in the forge worktree blocker`）。

#### 客户端、连接与会话面板

* Host 配置改为通过 synced plugin Config 以 page-global 方式下发（`refactor(client): deliver page-global Host configuration through synced plugin Config`），Remote 链使用连接 synced Config（`fix(client): pass the connection synced Config in the built Remote chain …`）；等待注入的插件配置表达式在注入完成前不发布 synced 值（`fix(client-modules): publish no synced values while a pending plugin's config expression awaits an injection`）。账户联系人表单固定在本页全局（`fix(client): keep the account contact form on its page global …`）。
* 每个内容实例独立处理 Workspace 选择（`refactor(ui-conversation): let each content occurrence handle a Workspace pick`），embedded Workspace pick 以单一受检步骤交接（`fix(conversation): hand an embedded Workspace pick over in one checked step`）。
* 侧栏面板行新增行尾内容（trailing content）：按标题之后排布、悬停/聚焦时让位给取消固定操作、窄栏显示在图标右上、不可含交互元素（`feat(sidebar): show trailing content on panel rows`、`fix(ui-sidebar): rest panel trailing content at the row's end and swap it for the unpin action on hover`、`fix(sidebar): lay panel trailing content out after the title like a Session row`）。fork 的 IM 面板快捷入口过滤行为保留。
* 新增 shared title marquee 与 embedded hero 选项（`feat(client): add panel row trailing content, embedded hero options, and a shared title marquee`）；HeroShell 新增 `headline` 覆盖文案（fork 侧仍渲染静态 BirdCoder 鸟标，见「BirdCoder 本次更新」）。
* 连接恢复时序由页面注入改为 synced 字段声明：配置声明浏览器恢复时序、不再向页面注入（`test` 中明确 `injects nothing into served pages`），NaN 恢复系数的校验理由写入文档。fork 侧仍保留自身页面注入与 API 网关 fallback（见冲突处理）。

#### 交付物、工作区与沙箱

* 变更文件路径改为相对该轮开始所在目录解析（`fix(deliverables): resolve changed-file paths against the turn's directory`）：summary 携带 `cwd`，客户端据此解析完整路径与 review tab 的 Sidebar 文件地址。
* workspace-root 校验 LSP root、丢弃未读取的原目录并修复 CI 输入（`fix(workspace-root): validate the LSP root, drop the unread original directory, and repair CI inputs`）；workspace-write 边界指南与 Git 目录 grant 在 Windows 进程中的限制写入 upgrade guide。
* ui-sidebar-files 对持有查询的窗格移动到新 checkout 的搜索修正（`fix(ui-sidebar-files): search the checkout a held query's pane moves to`）。

#### 桌面、CUA 与安装器

* 开发态 Harness 状态移出 `.desktop-build`，改到 `.desktop-dev`，启动时迁移缺失目录并在运行中的 Harness Dev 占用时拒绝迁移（`fix(desktop): keep development Harness state out of .desktop-build`、`refuse to move state that a running Harness Dev owns`）；操作历史按精确文件身份去重、保留被 predecessor 读取会丢弃的段并上报已读段（`deduplicate history segments by exact file identity`、`keep operation history the predecessor read would drop`、`report read segments …`）。
* 安装完成提示在原生拖动/系统菜单期间延迟显示（`fix(desktop): show installer completion during native dragging`、`defer installer completion through system menus / until native move returns`）。追加的 predecessor 被跳过而非收集写入文档。
* CUA：Windows 实现窗口级鼠标按键切换、macOS 支持已批准的鼠标按键按住与独立按键事件（`feat(cua-windows): implement window-level mouse button toggles`、`feat(cua-macos): support approved system mouse button holds / send individual mouse button events to a window`）；修复窗口几何校验与按键接收者检查顺序、光标采样时机、turn 结束鼠标清理等待原生完成与撤销场景（`fix(cua-macos): sample the cursor after validating window geometry`、`check the press recipient before reading AX geometry`、`fix(cua): wait for native cleanup before the next request`）。
* Web：恢复持久化终端插件控制并注册快照（`feat(web): restore persistent terminal plugin controls`、`test(web): register the persistent terminal snapshot`）。

#### MCP、连接器、LLM 与工具

* `ctx.mcpManager` 重命名贯穿客户端/Host 与快照（`refactor: follow the ctx.mcpManager rename`），MCP client host 纳入快照组合，OAuth world 与 manager profile 由 `dsh-mcp-testkit` 提供。
* Linear / Notion 连接器：将 `src/copy.ts` 重命名为 `src/locales.ts`，账号通过共享 connector account registry 展示并在 Host 注册（`refactor(linear/notion): rename …`、`show the account through the connector account registry`、`register the account on the Host`）；快照与版本随 master 提示/工具文本刷新。
* Web 搜索默认模型切到 DeepSeek（`Merge PR #8707 … feat/web-search-deepseek-model-default`）。工具可达性与首次披露提议写入 agent-notes。
* 重复提醒排除嵌套调用（`fix(guard): exclude nested calls from repeat reminders`）。

#### 工程、版本与文档

* 根版本与 master-only 包对齐到 `0.2.2-rc.5`（`chore(release): align master-only packages to 0.2.2-rc.5`），发布提交 `release(dsh): 0.2.2-rc.5`；bundle 的 English 标题改为句首大写、Plugins 页增加 feature preview。
* 大量 snapshot/文档/upgrade guide 刷新（mcp-tool-loading、linear、notion、终端、liveshare 等），module graph 随 sandbox-policy 与 workspace-changes 边重生成，README 字数上限按栈同步后复位。

### BirdCoder 本次更新

#### 同步与冲突处理

* 合并基底 `ca33fd6843b` → `2e39e70496a`（238 个上游提交、960 个文件变更）。**30 个文件**存在文本冲突，按 fork-first 规则逐项解决：SDKWork 自有组件（`ui-sdkwork-*`、`sdkwork-*` Host/Bundle、`ui-sdkwork-iam` 登录步骤等）与品牌表面（`BirdLogo` / `BirdWordmark` / `LoginPanel` / favicon / 图标 / 标语）保留 fork 版本。
* 关键冲突逐项并集：
  * 根 `package.json` 与 `apps/desktop-host/package.json` 保留 fork 已重排的依赖清单与 `@sdkwork/*` 可选依赖，并入上游新增的 `dsh-mcp-manager` / `dsh-linear` / `dsh-notion` 与 `dsh-api-workspace-files`；`connection` 清单并入上游 `dsh-client-config` 与 fork 的 `dsh-host-apiproxy` / `dsh-tools`。
  * `connection` 的 `types.ts` 拆分采纳上游 `ConnectionConfig` 位置与 volatile `Config`，同时保留 fork 的 `sdkwork-gateway-slot` 激活、`ConnectionFetchHandler`、SDKWork API 网关 fallback 与 `__DSH_CONNECTION_RECOVERY__` 页面注入（上游已移除该注入，fork 侧 5 个文件仍依赖）；client/host tsconfig 同时列出 fork 的 `rpc-schema.ts` / `sdkwork-gateway-slot.ts` 与上游 `types.ts`。
  * `tsdown.client.ts` 保留 fork 的 embedded-app-styles 导出与自有 `INLINE_SAFE` 超集，并入上游新增的 `dsh-api-session-controller/client/directories` 模式；`client-bundle-purity.spec.ts` 同时保留 fork 的 `plugin-manager/source` 断言与上游两条新断言。
  * `ui-deliverables` 采纳上游 `ChangesSummary.cwd` 字段（类型、路由与测试同步），同时保留 fork 的 `204` 空响应「普通缺失而非失败请求」行为；`EmptyHero.tsx` 采纳上游 `headline` 覆盖文案，但保留 fork 的静态 `BirdLogo`，不引入上游已移除的 fish hover-morph 死状态。
  * 上游整体重构的 `client-ui-forge/ChangesTab.tsx`（拆分为 `ChangesTab` 包装 + `ChangesView`，`ReviewPage.tsx` 已按上游导入 `ChangesView`）按上游为准；fork 对该文件的微小文案/图标调整让位于上游结构。
  * README 与 i18n 配对文件按 fork 品牌与 SDKWork 文档为准，prose 冲突并集双方段落（侧栏 trailing content 与 IM 快捷入口过滤、交付物 cwd 与普通缺失说明）。
* 合并后全仓扫描无冲突标记残留；品牌契约复核通过：`FishLogo` 仅出现在 `ui-primitives` 源码与测试，三处登录入口（`WelcomePage` / `SignInDialog` / `SignInOverlay`）均渲染 `LoginPanel`，官方名称槽渲染 `BirdWordmark`，启动页渲染 `createBootBrand()`，56 个 `ui-sdkwork-*` 组件、15 个 `sdkwork-*` Host/Bundle 包完好，canonical 栅格 `apps/web/public/favicon.png` 未被覆盖。
* **同步完整性复核**：`upstream/master` 已推进到 `2e39e70496a`，`git merge-base` 为 `ca33fd6843b`，238 个上游提交随真实双亲 merge commit 全部合入；4 个删除文件（各 `*config.ts`）与 1 个重命名（`working-directory/tests/admission.spec.ts` → `sandbox/sandbox-policy/tests/admission.spec.ts`）经核对均为上游自身改动，无 fork 自定文件误删。

#### 版本与依赖

* 根版本前移 **0.2.2-rc.5**（上游 tag `dsh-v0.2.2-rc.5`），随上游发布线推进。
* SDKWork 生态 pin 对齐：`sdkwork-cloudrouter`（`462ce56a` → `10f614e2`）与 `sdkwork-deployments`（`cc5fa213` → `53daa38f`）前移到各自已推送的 `main`，并新增 `sdkwork-shop`（`a4a2e686`）与 `sdkwork-inventory`（`f8b294e8`）两条 pin。云端路由的新控制台包与部署控制台引用 `@sdkwork/{shop,inventory,deployments}-backend-sdk`，这三个包此前既未 join 成 workspace 成员、也没有 `tsconfig.base.json` 映射，`verify-sdkwork-dependencies` 会在打包第一步失败（`imported by the dependency closure but tsconfig.base.json maps no @sdkwork package root`）。三者现按其余 20 个 backend SDK 的同款形制 join 成员 + 建映射，`Dockerfile` / `Dockerfile.debug` 同步补上 `sdkwork-ecosystem` 复制行。本地仍走 `../sdkwork-*` 相对路径，release 走 pin 的 git checkout，同源可复现。
* `plugins/sdkwork-dsh-agents` 子模块由 `2d317ce`（1.2.26）前移到 `a2911f0`（1.2.34 镜像同步），并把新版新增的 `@deepseek-ai/dsh-error@0.2.2-rc.3` 依赖补进 lockfile；不同步时 `pnpm install --frozen-lockfile` 直接报 `ERR_PNPM_OUTDATED_LOCKFILE`。
* `pnpm-lock.yaml` 保留 fork 的 workspace 链接与 SDKWork sibling importer 块（本地开发走 `pnpm-workspace.yaml` 的 `../sdkwork-*` 相对路径 + `workspace:*`，CI/release 走 `agent.workflow.json` 声明、`scripts/sdkwork-sources.manifest.json` pin 的 git 仓库依赖 checkout，两者同源）。

#### 合并后的 fork 变更（2026-11-19）

合入 rc.5 之后 fork 侧在同一版本线上继续推进的自有能力（`ff72ca4f20..9d00779d7a`，13 个提交；依赖与 pin 的调整已记入上节）。上游代码与提交记录不受影响。

* **输入框历史（新包 `ui-sdkwork-input-history`）**：记录 Host 已接受的普通消息到浏览器本地存储，输入框裸 ↑/↓ 回溯——↑ 走向更旧一条、↓ 走向更新并在越过最新一条后恢复被中断的草稿，新一轮回溯只在草稿的询问边界开始（`feat(client): add the composer input history section and share the input contract`）。设置页「输入历史」可选范围（本会话 / 本项目 / 本浏览器全部会话）、保留窗口（默认 30 天）并可清空缓存；关闭开关即停止记录与回溯，账本保留至清空或过期。历史按浏览器配置存放，不跨账号或机器同步。输入契约与召回后的光标行为写入 README 与 agent-note（`docs(client): describe the caret behaviour inside a recalled input-history entry`）。
* **设置菜单 shell store**：新增对话框可见性、当前分区与待揭示 provider 路由的共享 store，让轨道之外的表面——会话失败行的「去配置」手势——能在自己的分区打开设置对话框；悬停菜单的展开状态仍是组件内查看状态（`feat(client): add the settings menu store and its slot wiring`）。
* **缺失凭据修复接到会话失败行**：失败行给出缺失凭据的修复入口，`ui-settings` 模型分区按 `focusProvider` 定位并高亮对应 provider 行，普通导航清掉该定位；chat 视图测试补上动作归属的收窄（`feat(client): surface missing-credential fixes on the chat failure row`、`test(client): narrow the turn-error action owner through the slot cast`、`test(client): cover the missing-credential action flow in the chat view`）。
* **欢迎页登录交棒新 workspace boot**：`ui-sdkwork-iam` 只在 overlay 条目渲染、store 动作绑定完成后接管模态动作，冷启动换票或回调失败因此有表面可呈现——用户看到失败原因与恢复动作，而不是匿名工作区；登录完成以新的 workspace boot 启动（`feat(desktop): hand the welcome sign-in to a fresh workspace boot`）。
* **插件市场 fork 落地**：`plugins/dsh-market`（`dsh-market` 的 SDKWork fork）作为 pin 住的子模块接入，host 半侧由 `scripts/build-dsh-market.mjs` 从子模块 `src/` 编译出被 gitignore 的 `lib/`；判鲜按内容哈希而非 mtime，`postinstall` 与 `build:artifacts` 新增 `dsh-market` 闸门并排在 `host-src` 之后（其 `tsc` 要对本仓 `vendor/cordis`、`vendor/schemastery` 的输出做类型检查）。浏览器半侧 `client/client.js` 仍由子模块提交，本仓不重新生成（`feat(birdcoder2): fork the plugin market and finalize the composer input history section`）。
* **HMR 恢复 `pluginEvents` 流**：客户端在一个 client entry 里重新同步 Host 插件图与 synced 配置，插件启停与配置变更不刷新页面即生效，代码重建替换受影响插件；独立的 transport / events 模块及其 fallback 规格移除（`fix(client-hmr): finish the pluginEvents stream restoration`），`tsconfig.client.tests.json` 直接引用 hmr 的 client project（`fix(birdcoder2): reference the hmr client project from the client-tests face`），two-face 包改为单侧解析后重跑各自规格（`docs(fork-sync): resolve two-face packages from one side and rerun their specs`）。
* **翻译配对门禁覆盖子模块**：`.gitmodules` 的 `path` 被解析进排除范围（`parseGitmodulePaths` / `isSubmodulePath`），子模块工作树内的双语文档在其所在仓库翻译，本仓不再要求 sidecar；新增包 README 与 agent-note 补规格（`fix(birdcoder2): guard the gitmodule path capture against a missing group`）。
* **桌面运行时冒烟**：Office 转换的两条冒烟路由从 `fetch` 换成 `node:http`——undici 在响应头 300 s 未到时就抛裸 `TypeError: fetch failed`，使 `OFFICE_CALL_TIMEOUT_MS` 与引擎自身的 `timeoutMs: 600000` 都轮不到决定；`node:http` 无默认超时，只由该客户端预算兜底，慢 runner 于是「慢但成功」，失败时也报得出路由与预算（`fix(desktop): outwait the Office engine instead of fetch's 300 s header ceiling`）。

本文件只保留当前版本一节；往期条目随各自版本的提交留在 git 历史里（`git log -p CHANGELOG.md`）。Release notes 就是本节内容。
