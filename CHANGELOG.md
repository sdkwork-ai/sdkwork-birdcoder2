# BirdCoder 更新日志

本文件只记录**当前版本**——`##` 标题就是本次发布打的 tag，不累积历史版本条目；往期条目随各自版本的提交保留在 git 历史里（`git log -p CHANGELOG.md`）。「上游变更」按该 tag 内的实际提交归纳并注明来源（上游发布该版 Release notes 时以其正文为准并核对仓库落点）；「BirdCoder 本次更新」记录 fork 在该版本上的自有变更（SDKWork 组件、品牌、打包与部署等），不受上游发布节奏影响。

## 0.2.3-alpha.3（fork 同步 2026-11-28）

本版本把 `deepseek-ai/deepseek-harness` `master` 的 **0.2.3-alpha.3 发布工作线**完整合入 fork。上游从上一合并基底 `dsh-v0.2.3-alpha.2`（`4b399c39a6`）推进到 `841f76d3c5`（`Merge pull request #9462 ... worktree-release-dsh-0.2.3-alpha.3`），相对基底新增 **1150 个提交（其中 934 个非 merge 功能/修复提交）、6033 个文件变更**（+249458 / −32204）。合并保留真实双亲 merge commit（`dbc0e79e07`，双亲 `e137551bfb` + `841f76d3c5`），上游 1150 个提交记录、commit message 与代码注释逐字随合并进入仓库（`git rev-list HEAD..upstream/master = 0`）。合入后另有一次 `fix(merge)` 修复三方并集在 6 个 JSON 清单里的分隔符与重复键问题（`854f8c4952`）。

### 上游变更（deepseek-harness 0.2.3-alpha.3）

以下按该工作线内的实际提交归纳，并逐项核对仓库落点；上游尚未为 tip 打独立 release tag（当前 `git describe` 为 `dsh-v0.2.3-alpha.2-1150-g841f76d3c5`），故按提交正文归纳而非 Release notes 正文。

#### 会话、Sidechat 与 SQLite 存储

* **Sidechat / 会话来源分类**：side conversation 记录 `parentSession` 来源，消费者按 origin 分类（`feat(session): record a side conversation's source as parentSession`）；侧边会话在 UI 中隐藏并按来源区分（`feat(sidechat): record side origin and hide side conversations`）；`/side` 在最近完成的 Turn 处分叉，与普通 fork 一致（`feat(sidechat): fork /side at the latest completed Turn`）。
* **SQLite 会话事件改为行式存储**（`feat(session)!: store SQLite events as rows with derived tables`，破坏性变更）：配套提供派生表；`feat(session): archive idle SQLite Sessions and add on-demand store compaction` 增加空闲会话归档与按需压缩。
* **收件箱认领恢复**（`feat(agent-loop): recover inbox claims before step start`）：步骤开始前恢复未完成的 inbox 认领，避免并发丢任务。
* **待办提醒**：提醒智能体核对过期任务列表（`feat(todo): remind agents to reconcile stale task lists`）。

#### 客户端插件加载与 /client 子路径

* **动态插件加载**：三个 Client 包改为立即动态插件加载（`feat(client): load three Client packages as immediately dynamic plugins`），构建期 `<request>/client` 交由模块表处理（`feat(client): leave <request>/client to the module table at build time`），并发布动态 bundle 的依赖样式资源（`feat(client): publish dependency stylesheet assets from dynamic bundles`）、加载包内 chunk 依赖（`feat(client): load package-local chunk dependencies`）。
* **`/client` 子路径导出**：三个 Client 包暴露 `/client` 子路径（`feat(client): expose the /client subpath of three Client packages`）；脚本侧在包根复用 `./client` 类型时强制要求 `/client`（`feat(scripts): require /client where the package root reuses ./client types`）。
* **SlotMap 合并**：脚本在两种 `ui-slots` 模块名下都能读取 SlotMap 合并结果（`feat(scripts): read SlotMap merges under both ui-slots module names`）。

#### 审阅（Forge）与工作树

* 审阅页支持从活动行打开单个提交的变更、默认以会话自身 HEAD 对比其它分支、按分支/worktree 展示其它分支并保留本地改动行（`feat(forge)` 系列）；本地改动视图支持 stage/unstage/restore 文件（`#9166`）并显示相关会话的 checkout。
* 子智能体默认模型可在 Plugins 页选择（`feat(subagent): choose a default Subagent model on the Plugins page`）。

#### MCP、连接器与多模态

* Connectors 标签把自定义 MCP server 行按连接器行样式绘制，并在动作插槽提供「Add MCP server」（`feat(client-ui-connectors)` 两条）；`mcp-manager` 把受管 server 声明为 servers 字典旁的独立行。
* **帧转发预览**：新增 frame forwarding 共享纹理接口与传输（`feat(desktop): add shared texture interface and transport`）、视频帧转发（`feat(frame-forwarding): video-frame forwarding support`，`#8440`）、实验性 Office 预览 bundle（`#8441`）。
* **CUA**：PTC 模式推荐联动 Settings Agent 预设，Windows 权限面板告警与引导重做，应用同意按权限属性匹配；沙箱接受更弱的 `sandbox_permissions` 请求作为 no-op。

#### 桌面与发布

* 桌面设置迁移到 v1、未解锁频道锁定 stable 并发送 feed 头；桌面发布器把目标频道与打包频道解耦（`feat(desktop-publisher)`）。
* CLI 源码启动内存耗尽时留下 heap 诊断（`feat(cli): leave heap diagnostics`）；DeepSeek 推理请求头标记子代理与直接父会话（`feat(llm)`，`#9298`）。
* `/client` 类型面与 vendor、脚本检查工具随上述结构同步（`feat(scripts)` 系列）。

### BirdCoder 本次更新（fork 自有）

本版本 fork 侧在合并前提交了一整批 SDKWork 一方能力（`e137551bfb` 及其前序 6 个提交），并在合并中按 fork-first 全部保留：

* **MCP Connector 一方化**（`feat(sdkwork): migrate MCP connector ...`）：`plugins/dsh-mcp-connector` 迁移为 `plugins/sdkwork-mcp-connector`，接入 SDKWork 云连接器目录（`sdkwork-catalog` / `fetchSdkworkCatalogEntries`），host 注入服务、面板页与消息协议一并随包发布；上游侧的 MCP 增强（受管 server 独立行、Connectors 动作插槽）在合并后并存。
* **一方 SkillHub 安装能力**：新增 `packages/host/sdkwork-skillhub`（安装器、路由、共享契约、双语 README 与测试），把云端技能安装收进 fork 自有 host 包。
* **专家与技能目录页**：`ui-sdkwork-markets` 新增 `ExpertsCatalogPage`、`SkillsCatalogPage`、`expertUsage`、`skillsInstaller`，专家市场改为一方目录；`MarketsPage` 的搜索改由页头统一持有（header-owned search），插件面板、连接器主题与安装 toast 对齐；旧的 `ExpertMarketSurface` / `expertMarketPanel` 探针随之退役。
* **桌面多开发实例**：`feat(desktop): add per-lane development instances ...` 为各开发通道提供独立实例，并打磨市场页与移动端连接体验。
* **类型与门禁维护**：`tsconfig.base.json` / `tsconfig.host.json` / `tsconfig.client.ts` 与 workspace、lockfile 随新包同步；`client-runtime` 包清单与装配名册测试对齐。

### 合并保真与注意事项

* 保真审计（`upstream-merge-fidelity-audit.mjs HEAD`）：上游单边改动文件 5444 个，`DROPPED = 0`；上游文件缺失 35 项均为 fork 既有有意偏离（CI 四件套、whale 图标与 SVG、PWA 图标集、`render-app-icons.ts`、`app-icons.spec.ts`、`website/public/{favicon.svg,wordmark.svg}`、`scripts/release/publish.*`、agent locale JSON、postmortem 0003）；冲突标记 0、unmerged 0。
* BirdCoder 品牌在合并后复核：`Brand.tsx` 仍渲染 `BirdLogo` / `BirdWordmark`，官方名称槽未回退上游 `BrandWordmark`；`EmptyHero` 保留静态鸟标；`WelcomePage` 与 `SignInDialog` 仍渲染共享 `LoginPanel`；启动页 `createBootBrand()` 保持在位——图标、标语与登录面全部采用当前仓库版本。
* SDKWork 自有包、connector、skillhub、专家/技能市场、desktop carrier/app、fork tsconfig 引用与打包/CI 配置均取 fork 行为，上游新增功能在其旁并集；生成物与 lockfile 取 fork 侧内容。
* 三方并集在 6 个 JSON 清单（根 `package.json`、`apps/desktop-host/package.json`、`packages/bundle/web-app/package.json`、`packages/api/gateway/tsconfig.client.json`、`packages/test-support/client-runtime/package.json`、`.oxlintrc.json`）产生过缺分隔符与重复键，已由 `fix(merge)` 修复并通过 JSON 解析校验；后续编译/测试面的潜在问题按约定在合并完成后单独处理。

本文件只保留当前版本一节；往期条目随各自版本的提交留在 git 历史里（`git log -p CHANGELOG.md`）。Release notes 就是本节内容。
