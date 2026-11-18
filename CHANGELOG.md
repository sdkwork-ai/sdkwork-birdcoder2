# BirdCoder 更新日志

本文件只记录**当前版本**——`##` 标题就是本次发布打的 tag，不累积历史版本条目；往期条目随各自版本的提交保留在 git 历史里（`git log -p CHANGELOG.md`）。「上游变更」按该 tag 内的实际提交归纳并注明来源（上游尚未发布该版 Release notes 时如此处理）；「BirdCoder 本次更新」记录 fork 在该版本上的自有变更（SDKWork 组件、品牌、打包与部署等），不受上游发布节奏影响。

## 0.2.2-rc.4（fork 同步 2026-11-18）

本版本把 `deepseek-ai/deepseek-harness` 的 `0.2.2-rc.4` 完整合入 fork。上游 `master` 从上一合并基底 `39163dd30f7`（rc.3 合并点）推进到 `ca33fd6843b`（`Merge pull request #8667 from deepseek-harness/worktree-sync-release-dsh-0.2.2-0.2.2-rc.4-to-master`），对应上游 tag `dsh-v0.2.2-rc.4`。相对基底新增 **807 个提交、3104 个文件变更**（+88070 / −31776，其中新增 590、删除 95、修改 2374、重命名 41）。合并保留真实双亲 merge commit，上游 807 个提交记录、commit message 与代码注释逐字随合并进入仓库；版本线前移到 **0.2.2-rc.4**，tag `birdcoder-v0.2.2-rc.4` 与之同名。

### 上游变更（deepseek-harness 0.2.2-rc.4）

上游尚未发布该版官方 Release notes（GitHub API 未返回 `dsh-v0.2.2-rc.4` 的 Release 正文），以下按该 tag 区间内的实际提交主题归纳，来源为 `git log 39163dd30f7..ca33fd6843b`（807 个提交，其中非 merge 的功能/修复提交为主题主体）。

#### 会话与持久化

* Session 存储切换到 **SQLite**，打开时自动导入旧 JSONL（`feat(session)!: use SQLite and import legacy JSONL on open`），并把 frame size 做成插件设置（`feat(session): make the SQLite frame size a plugin setting`）；配套性能改进：按配置选择 frame 压缩、并发解码、事件以压缩 frame 存储（`perf(session): select SQLite frame compression by config and decode frames concurrently` / `store SQLite events as compressed frames`）。
* Session controller 的缓冲窗口修正：窗口缓冲期间先消费已到达的较旧页（`fix(session-controller): consume an arrived older page before buffering the window`），并正确处理经符号链接目录请求的具名 Session（`fix(session-controller): adopt a named Session requested through a symlinked directory`）。
* 客户端会话保留策略重做：未渲染时不折叠会话、保留最近访问会话（`#8502`、`feat(client): keep drafts with a connectionless Session hold and fold only the last page on return`）；UI 侧从 Host Config 同步 recent-view 上限（`feat(ui-workspace): sync the recent-view limit from the Host Config`）。断连、缺口修复与最近访问计数在 Session 缓冲时保持一致（`fix(client): keep gap repair, disconnect, and recent-view counting correct while Sessions are buffered`）。
* 等父前缀持久化后创建共享 fork（`feat(session): 等父前缀持久化后创建共享 fork (#8392)`）；SQLite WAL 初始化争用重试（`fix(session): retry contended SQLite WAL initialization`）。

#### 账号、鉴权与凭据

* 新增 DeepSeek 请求鉴权（`feat(deepseek-auth): add DeepSeek request authentication`），deepseek-auth 随发行元数据进入 Python runtime 闭包（`feat(deepseek-auth): ship display metadata and join the Python runtime closure`）。
* 凭据层接管 API Key 的合法性检查（`feat(credentials): own the API key well-formedness check`）；account 包独立承载 DeepSeek 账号登录与仅限 Host 的请求凭据。
* 移除路由失败时的 sdk-server 回退鉴权（`fix(sdk-server): remove the fallback authentication when its route fails`），mcp-client 在路由准入前先应答 OAuth 回调（`fix(mcp-client): answer the OAuth callback before route admission`）。
* 连接鉴权注册表在未被遮蔽的名字下读取（`fix(connection): read the authentication registry under a non-shadowed name`，fork 侧同步修正）。

#### Forge、Worktree 与插件

* Forge 变更请求在 Session 面板里以紧凑卡片呈现（`feat(forge): draw change requests as compact cards in the Session panel`），文件树中被浏览过的文件以弱化样式显示；命名 worktree 分支、从远端分支创建并显示正在读取的变更（`#8536`）。
* worktree 工具合并：`feat(worktree)!: merge create_worktree into enter_worktree`，并为资源池里已存在的 worktree 增加 `enter_worktree`；首个消息才创建被请求的 worktree（`fix(forge): create a requested worktree for the first message only`）。
* Forge 读取、审阅并绑定 GitLab merge request（`#8317`）；插件管理器以变更结果的 application 状态作为是否需要重启的权威依据（`fix(plugin-manager): make the change result's application status authoritative for restarts`）。
* plugin-manager 的 `invalid-spec` / `already-installed` 文案更新，`list_plugins` / `set_plugin` 支持原地重载提示；tool-cordis 向插件作者暴露运行中的 DSH 版本（`feat(tool-cordis): expose the running DSH version to plugin authors`）。

#### Skills、Subagent、LLM 与工具

* 新增 upstream-skills 连接插件与运行时下载（`upstream-skills` 首次下载时才加载 node-tar：`fix(upstream-skills): load node-tar at the first download`）。
* Subagent 每次调用读取模型选择设置（`feat(subagent): read model-selection setting at each call`），运行中的 subagent 置顶并折叠超过五行的列表；模型选择设置失败被隔离（`fix(subagent): isolate model selection setting failures`），误用抑制与模块图恢复（`fix(subagent): restore misused-promises suppression and module graph`）。
* llm-deepseek 新增 `safetyCheck` 开关、默认请求内容安全检查，并处理拒答而不触发安全复核（`feat(llm-deepseek): add safetyCheck switch` / `always request the content safety check` / `handle refusals without requesting safety review`）。
* 新增 tool-session-list（`feat(tool-session-list): show complete call arguments on tool cards`，`list_workspace` 保持同步执行）；action-cards 从回答中的 action-card 块提供卡片而非工具（`feat(action-cards): offer cards from action-card blocks in answers instead of a tool`）。
* CUA 增加 `toggleMouse` 及 Windows 初始支持（`#8425`）；liveshare 在 Host 的 Electron Node 模式下启动 tunnel worker（`#8634`），并开放一份分享可服务的 viewer 能力（`#8304`）。
* PTC 在工具结果被抑制时加保护、用渲染文本检查工具结果、限制 `String.raw` 并以引用行数组写入文件内容。

#### UI、调度与桌面

* 侧栏/导航：统一 sidebar action 图标与 14px 间距，列表拖到边缘时滚动，指针离开 500ms 后滚动条淡出；新会话间距收紧到六像素（再减两像素），字体大小控件右对齐、文件打开器边框与面板图标对齐、导航分组留白平衡。
* 模型选择：navigation chevrons 与关联的模型/推理强度值共享前景色；ui-model-selection 通用文案更新（fork 侧保留 BirdCoder 排第一的品牌排序）。
* 调度/任务：每周回顾限定为用户自己的日程并推荐任务（`feat(ui-schedule): scope the weekly review to the user's own work` / `recommend a weekly review task`）；jobs 每个分组超过五行折叠、活跃任务优先；agent-team 共享任务按状态排序并折叠。
* 会话面板为长列表提供折叠控件；插件设置出现在 Plugins 页；客户端新增从上下文菜单添加文件引用。
* app-boot 修正：按请求平台的路径规则处理 include 文件名、把盘符 include 路径按 Include 的规则解析、审计被 Loader 拒绝的 entry options 并隔离配置 dump 快照。
* liveshare 相关模块与 working-directory 存储变更事件被忽略（`feat(working-directory): ignore stored working-directory/change events`）。

#### CI 与工程

* CI 增加两位审阅者的两点批准权重、关闭停滞 21 天的 PR、提醒陈旧 PR（`feat(ci): give two more reviewers the two-point approval weight` / `close pull requests after 21 days without activity` / `remind authors of stale pull requests`）。
* 新增 `ci-python.yml` 等上游工作流；发布工作流的 pack/publish 拆分与上游保持同步（fork 侧仍以 `container-release.yml` 为发布路径）。
* 拒绝新的 Cordis root 读取（`feat(infra): reject new Cordis root reads`），preset 在标准模式暴露 Cordis 检查能力。

### BirdCoder 本次更新

#### 同步与冲突处理

* 合并基底 `39163dd30f7` → `ca33fd6843b`（807 个上游提交、3104 个文件变更）。**54 个文件**存在文本冲突，按 fork-first 规则逐个解决：SDKWork 自有组件（`ui-sdkwork-*`、`sdkwork-*` Host/Bundle、官方账号、小程序、Token Plan、终端面板、Profile Lease、gateway fallback 等）与品牌表面（`BirdLogo` / `BirdWordmark` / `LoginPanel` / favicon / 图标 / 标语）保留 fork 版本；上游对其余文件的改动完整采纳。
* 采用上游整体重构、fork 仅作微小调整的文件以 upstream 为准：例如 `packages/client/ui-subagent/tests/conversation-ui.client.spec.tsx` 上游重写 1000+ 行、fork 仅一行调整，取 upstream 版本。
* 关键代码冲突逐项并集：账号协议导入合并 fork 的 `applicationOrigin` 与上游的 `ACCOUNT_TOKEN_HEADER`；app-boot 的 Loader 导入合并 fork 的 chokidar 监视与上游的 `EntryTree`/`EntryValidationError`/`validateOptions` 等入口校验 API；plugin-manager 文案合并 fork 的 sdkwork-drive / plugin-archive 来源与上游的原地重载提示；`ui-workspace` 构造参数把 fork 的 `ctx.layout` 与上游的 `config.recentViewLimit` 一并传给 `UiWorkspaceService`；`tsdown.client.ts` 的 `INLINE_SAFE` 并入上游新增的 `dsh-plugin-market-index/source`。所有并集后重复导入/重复键均清理为单一声明，`package.json` 与各 `tsconfig` 通过 JSON 解析校验。
* 上游整体删除的 `packages/credentials/deepseek-account/`、`packages/session/tool-working-directory/`、`packages/client/ui-settings-plugins/` 与 `packages/client/ui-settings-plugin-inventory/` 等包及配套快照按上游删除接受；fork 已删除的 `ci-windows.yml`、`release-publish.yml`、`release-vendor-publish.yml`、`scripts/release/publish.ts` 与上游品牌 SVG（`favicon.svg`、`wordmark.svg`、`welcome-brand.svg`、`icon*.svg`）维持删除——fork 的 Windows 车道在 `ci.yml` 内，发布走 `container-release.yml`，品牌栅格来自 `apps/web/public/favicon.png`。
* 合并后全仓扫描无冲突标记残留；品牌契约复核通过：`FishLogo` 仅出现在 `ui-primitives` 及其测试，`BirdLogo` 覆盖侧栏/官方品牌/空态等全部 fork 表面，三处登录入口（`WelcomePage` / `SignInDialog` / `SignInOverlay`）均渲染 `LoginPanel`，官方名称槽仍渲染 `BirdWordmark`，启动页仍渲染 `createBootBrand()`，56 个 `ui-sdkwork-*` 组件、9 个 `sdkwork-*` Host/Bundle 包完好，品牌栅格（favicon / icon）未被上游 SVG 覆盖。
* **同步完整性复核**：`upstream/master` 已推进到 `ca33fd6843b`，`git merge-base` 为 `39163dd30f7`，807 个上游提交随真实双亲 merge commit 全部合入；上游新增包（`upstream-skills`、`cli-account`、`account/deepseek-account`、`hmr/plugin-events.ts` 等）均落盘；被删除的文件经核对全部是上游自身移除的包或 fork 历史已有的品牌/CI 删除，无 fork 自定文件误删。

#### fork 侧本版本功能（合并保留）

* **官方账号与小程序**：`ui-sdkwork-official-accounts` 改用共用的 `@sdkwork/iam-pc-official-accounts` 面板；新增域名校验流程与 host 环境投影，展示后台维护的服务器 IP 白名单，host 弹窗支持刷新菜单、发布与回滚，设置弹窗内的小程序页挂载共用的 `@sdkwork/iam-pc-mini-program` 面板。
* **账号计费与模型目录**：`ui-sdkwork-token-plan` 新增账号视图与商务覆盖、团队订阅端口与联合结算；LLM 新增模型目录同步存储；模型选择器按 `codingVisible` 只列现行通用 LLM，sdkwork-models 目录与选择器生成规则一致。
* **桌面与发布**：拒绝附着到陈旧车道 Host 的 dev 启动；打包冒烟的 Office 渲染预算与引擎上限按最慢 runner 调整；容器车道跳过陈旧依赖补装，Intel macOS 车道按硬件放宽时间预算。DNS workspace 支持验证文件与公众号校验；移除 appstore 模板货架与插件云目录，部署锚点不再随根 profile 提交。

#### 版本与依赖

* 根版本前移 **0.2.2-rc.4**（上游 tag `dsh-v0.2.2-rc.4`），dsh 家族清单随上游推进；fork 自有清单与发布 tag `birdcoder-v0.2.2-rc.4` 对齐。
* `pnpm-lock.yaml` 保留 fork 的 workspace 链接与 SDKWork sibling importer 块（本次合并取 fork 侧锁文件，以避免上游版本覆盖本地生态装配）；SDKWork sibling pin（`scripts/sdkwork-sources.manifest.json` 与 `agent.workflow.json` 双记录）沿用本版本既有推进结果。
* 本文件只保留当前版本一节；往期条目随各自版本的提交留在 git 历史里（`git log -p CHANGELOG.md`）。Release notes 就是本节内容。
