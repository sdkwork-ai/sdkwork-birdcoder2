# BirdCoder 更新日志

本文件只记录**当前版本**——`##` 标题就是本次发布打的 tag，不累积历史版本条目；往期条目随各自版本的提交保留在 git 历史里（`git log -p CHANGELOG.md`）。「上游变更」按该 tag 内的实际提交归纳并注明来源（上游发布该版 Release notes 时以其正文为准并核对仓库落点）；「BirdCoder 本次更新」记录 fork 在该版本上的自有变更（SDKWork 组件、品牌、打包与部署等），不受上游发布节奏影响。

## 0.2.3-alpha.2（fork 同步 2026-11-23）

本版本把 `deepseek-ai/deepseek-harness` 的 `0.2.3-alpha.2` 完整合入 fork。上游 `master` 从上一合并基底 `dsh-v0.2.2-rc.5` 推进到 `0.2.3-alpha.2`（`Merge pull request #8961 from deepseek-harness/worktree-release-dsh-0.2.3-alpha.2`），对应上游 tag `dsh-v0.2.3-alpha.2`。相对基底新增 **708 个提交（其中 550 个非 merge 功能/修复提交）、3225 个文件变更**（+94377 / −17784）。合并保留真实双亲 merge commit，上游 708 个提交记录、commit message 与代码注释逐字随合并进入仓库；根版本线前移到 **0.2.3-alpha.2**。

### 上游变更（deepseek-harness 0.2.3-alpha.2）

上游已发布该版本线的 Release notes（`dsh-v0.2.3-alpha.1` 功能说明 + `dsh-v0.2.3-alpha.2` 收尾说明）。以下按 Release 正文归纳，并逐项核对仓库内落点（包路径 / 生成物 / 配置项），确认合并后确实可运行而不只是文字同步。

#### 连接器与插件市场

* 新增 **Linear、Notion、腾讯文档、飞书、企业微信、腾讯会议、钉钉** 七个连接器插件（`packages/connector/{linear,notion,tencent-docs,feishu,wecom,tencent-meeting,dingtalk}`），插件页统一管理连接器账号（`packages/client/ui-connector-account`）；账号经共享 registry 在 Host 注册，CLI 与上游技能下载共用 `ctx.cliAccounts` / `ctx.upstreamSkills`（`packages/connector/{cli-account,upstream-skills}`），账号类型不再从插件入口导出。
* 五个企业连接器（飞书 / 企业微信 / 钉钉 / 腾讯会议 / 腾讯文档）合计 167 个提交：bundle 折叠进各自插件包、Plugins 页显示品牌图标与 feature preview；修复企业微信沙箱 `853004` 重跑、钉钉沙箱账号误判登出、钉钉按机构重新登录与下载源上限、飞书入口技能改静态 provider 等。
* MCP 支持 OAuth 授权与凭据自动刷新（`plugins/dsh-mcp-connector` 前移到 0.2.119）；新增**可选的 MCP 工具按需加载**模式，降低模型请求的上下文占用。
* 插件市场可添加 **Git 仓库（含私有仓库）**作为插件来源（`packages/boot/plugin-manager/src/source.ts`、`packages/client/ui-plugin-market`）。

#### 代码审阅

* 新增**代码审阅页**（`packages/experimental/{forge,forge-github,forge-gitlab}`）：集中查看本人相关 GitHub PR、浏览描述与变更、在页内与智能体协作审阅；插件可扩展自定义审阅视图、行注解与工具栏/文件菜单/评论框动作；同时支持评审与合并 GitLab MR。

#### 会话体验

* 新增**会话状态区域**（`packages/client/ui-session-status`）：工作目录、变更请求、子智能体、任务与插件状态集中展示，窄窗口可停靠、拖动调整分区顺序。
* 会话**已读/未读**：完成后标记未读、菜单或快捷键切换，返回最近会话时保留侧栏状态（`ui-session-status/src/client/acknowledge.ts`）。
* **跨 Session 消息**：共享的跨会话发消息能力，消息以发送方 Session 为前缀；Web 侧工具默认关闭，启用后按用户要求向同一运行时的其他普通会话发文本并支持跨工作区。
* 新增实验性 **Timeline** 插件：查看智能体任务树、阻塞事项与进展报告，点击进度条展开任务树，任务与报告语言可选跟随对话（`packages/experimental/timeline`）。
* 普通会话可从列表拖到右侧栏打开并继续对话；分支会话创建需同时提供完整历史与 `parentSource`（`packages/api/session-controller/src/commands.ts`）。
* 压缩摘要可在右侧栏预览（手动或自动生成的上下文压缩）；空白输入框按 ↑ 召回本会话已发送文本，↑/↓ 浏览且不覆盖正在编辑的草稿；文件右键菜单「添加到对话」插入引用而不发送；实验性「持久终端」恢复启停与详情入口（安装后默认关闭）。
* `list_agents` 的返回值增加并发占用、上限与成员列表（成员改从 `agents` 字段读取，guide `list-agents-capacity`）；会话工具提供可选的只读工作区与会话列表；会话存储支持实验性 SQLite 后端（默认仍为 JSONL）。

#### Web 与客户端

* Web 连接模式新增**远程登录**：独立登录链接或设备配对，并提供标准连接鉴权 API 供插件注册 provider（`packages/client/remote-connection`）。
* 搜索与列表：会话列表与 @ 引用候选加载更快，搜索列表支持模糊与跨语言匹配（输入 `cpt` 命中 `/compact`），新建会话的 workspace picker 可按名称或目录路径搜索。
* 性能：长会话的流式输出、轮次导航与右侧栏拖动更跟手，大型 Markdown 表格/列表在对话与文档预览中的卡顿减少；侧栏 resize 不再触发无关子树重算。
* 设置与模型：模型菜单的智能体团队入口收进二级面板（开关与开销说明）；「模型」设置可自定义内置目录模型的推理档位；`DeepSeek` 提供方更名为 **`DeepSeek API`** 以区别 DeepSeek 账号，模型/搜索/网页抓取统一经 `ctx.deepseekAuth` 取授权。
* 个性化推荐插件默认随包发布并直接显示在回答中（`packages/experimental/personalized-recommendations`，原 `personalized-recommendations` bundle 退役）。

#### CUA（计算机使用）

* **最近活动上报**：模型下一步前上报最近窗口活动，macOS 默认回看缩短到 10 秒且可按连接关闭，系统睡眠计入活动时长。
* **显式系统输入统一**：显式系统输入与键盘修饰键合为一条路径，按会话事件源归因、校验准入、经 WindowServer 窗口 ID 归属输入目标；Windows 实现窗口级鼠标按键切换。
* 动作 schema 发现、按调用提供 PTC object API；新增 `cua-mcp` 让外部以 MCP 服务器形式接入（`packages/experimental/{cua,cua-bundle,cua-mcp,cua-windows,cua-macos}`）。

#### Office、PTC 与 Python

* `/office` 统一提供 Word / PowerPoint / Excel 指引（`packages/skill/skill-office/assets/office/SKILL.md`），删除三个格式技能与格式指导文件，改为按需读取的资源文件；内置 Python 提供 `pypdf`，Office 指引说明如何用它处理已有 PDF。
* Node PTC 默认在调用间保留变量、支持重复声明、用 `inspect` 展示文本/图片/工具结果并截断超限输出；**移除 Python PTC**（`packages/ptc-runtime`），PTC 默认改用 scoped REPL。
* `node` 引擎区间收紧为 `^24.22.3 || >=26.13.1`（upgrade guide `node-24-22-3`）。

#### Cordis、插件与工具协议

* vendor 同步到 **cordis 4.2.0-alpha.1 / schemastery 3.20.0-alpha.1 / loader·group·hmr·timer·logger-console 1.2.x / cosmokit 1.10.0 / include 1.2.x**（`vendor/*/package.json`，随上游 `release(vendor)` 提交）。
* Cordis 检查工具把创造模式的多个工具合并为 `cordis_inspect` 并在标准模式默认启用（`packages/extensions/tool-cordis`）；插件配置由仅后端读取扩展为前端亦可读取，volatile 配置支持实时同步；开启 HMR 时 `--patch` 覆盖文件修改无需重启。
* 工具失败结果统一携带结构化错误名与错误码；模块导出入口规范（移除仅测试导出与旧子路径，类型改从 `/types` 或包根导入）；客户端插件产物结构改为框架挂载时安装样式（CSS Modules 类名格式变化）。
* 系统提示词按来源增量更新、压缩后重建；SDK 提示可逐条指定时区，未指定时用可识别的运行时时区。

#### 修复

* 会话与模型：切换模型后首个请求超上下文不再卡死（自动恢复与 `/compact` 改用最近回答的模型生成摘要）；恢复旧版会话在单文件运行时（Python wheel）失败；草稿附件在切换会话时丢失；插件管理的重启指引变更为读已生效。
* 桌面与 Windows：安装完成时拖动导致输入卡住、关闭按钮失效；卸载后残留系统登记与清理失败未上报；「在应用中打开」VS Code / Cursor 失败；打开用量/充值页后 `Cmd+W` 无法关窗；诊断历史因文件身份误判或临时打开失败而漏记。
* 其他：macOS 输入框 Home/End 误滚动对话（改为行首/行末）、剪贴板写入被拒时复制按钮失效、`read`/`glob` 处理大文件后持续占用内存、不存在的 @ 路径被当作文件引用、手动输入 @ 路径字符顺序错乱、模型菜单点分组标题/空白处误关、多端口登录 Web 后旧登录状态累积导致页面打不开。

#### 破坏性变更与迁移

* 新增 **15 个 upgrade guide**（`v0.2.2-rc.5` 14 个 + `v0.2.3-alpha.1` 1 个），合并后全部随仓库提供：`archive-worktrees-without-sandbox-policy`、`compaction-summary-preview`、`cua-activity-helper`、`cua-held-inputs`、`cua-system-input`、`independent-action-cards`、`list-agents-capacity`、`office-single-skill`、`personalized-recommendations-bundle-retired`、`pi-image-resize-defaults`、`ptc-default-scoped-repl`、`sdk-prompt-time-zone`、`session-query-inspect-session-removed`、`system-prompt-integrations`、`node-24-22-3`。
* 其中要求外部适配的主要几项：会话 `cwd` 迁移后文件视图与 `workspace-write` 边界随之切换，`working_directory` 与委派 `cwd` 参数移除、工作树改用 `enter_worktree` / `exit_worktree`（`packages/experimental/tool-worktree`）；`fileAddressFor` 返回相对地址的插件需适配；会话状态迁到新包 `dsh-client-ui-session-status`，读取方需在 `inject` 声明；SDK 恢复会话接口支持 `permissionMode` 覆盖。

#### 工程与 CI

* CI：coverage 拆为两个分片并新增 `node-24-coverage-report`、`node-24-build`、`node-24-web-snapshot` 作业，PR 并发上限 11 → 16；Windows/Python 拆为独立工作流（fork 保持单 `ci.yml`，见下），npm 发布工作流删除。

### BirdCoder 本次更新

#### 同步与冲突处理

* 合并基底 `dsh-v0.2.2-rc.5` → `dsh-v0.2.3-alpha.2`（708 个上游提交、3225 个文件变更、+94377/−17784）。**72 个文件**存在文本冲突，按 fork-first 规则逐项解决：SDKWork 自有组件（56 个 `ui-sdkwork-*`、15 个 `sdkwork-*` Host/Bundle）、品牌表面（`BirdLogo` / `BirdWordmark` / `LoginPanel` / `favicon.png` / 图标 / 标语）与 fork 自有 CI 拓扑保留 fork 版本。
* 关键冲突逐项并集：
  * 根 `package.json` 保留 fork 已重排的依赖清单，并入上游新增的 `dsh-dingtalk` / `dsh-feishu` / `dsh-wecom` / `dsh-tencent-meeting`；`packages/bundle/web-app` 并入 `client-remote-connection`、`action-cards`、`creation-recommendations`、`plugin-recommendations` 及其客户端包；`apps/cli` 采用上游 `node: ^24.22.3 || >=26.13.1` 并保留 fork 的 `@sdkwork/iam-*` 可选依赖与 `prepack`/`postpack`。
  * `tsconfig.base.json` 同时映射 fork 的 `ui-sdkwork-updater` 与上游 `ui-wecom` / `ui-tencent-meeting`；`tsconfig.client.json` 采纳上游把 `client-ui-{action-cards,creation-recommendations,plugin-recommendations}` 从 `experimental/` 迁到 `client/` 的重命名，去掉 fork 侧的旧路径重复项，并把同一 `references` 列表等值镜像到 `tsconfig.client.tests.json`。
  * `vitest.config.ts` 保留 fork 的 `tsconfigPaths` + `siblingBareImportFallback` + `forkTestingAliases`（`@xmanrui/dsh-im` 解析到 `plugin-src`），并把上游新增的 `sourceRemotePlugin(…, 'dsh-client-remote-connection')` 折进三处插件数组。
  * `apps/desktop/src/main.ts` 保留 fork 的登出/欢迎页重写（`showWelcome('startup', …)` 与 promise 双分支），并入上游离开工作区时的 `refreshApplicationMenu()`；`locale.ts` 八个语言在 fork 品牌文案上补上游新增的 `settingsMenu` 键；`main-startup.spec.ts` 相应在断言里插入“设置…”项。
  * `packages/api/remotes` 的 remote 清单与 devDependencies 并入 `actionCardsRemote` / `pluginRecommendationsRemote` 与 `dsh-action-cards` / `dsh-plugin-recommendations`；`ui-conversation` 的编辑器 runtime 采用上游 `this.history` 与新增 `afterUpdate()`，保留 fork 的 lexicon 订阅重试监听；`ui-workspace/Rows.tsx` 采用上游 `draggable` / `reorderDraggable` 拆分并保留 fork 的插件菜单双源 open 状态。
  * `ui-chat` / `ui-model-selection` / `ui-settings-models` 的 README 按 fork 品牌并集上游新增段落（压缩进度行、`DeepSeek API` 命名）。`apps/desktop`（fork 应用）README 以 fork 文案为准，并入上游新增事实：Windows 手动卸载移除自有 CLI 注册、应用菜单含“关于/设置/管理命令/开发者工具”、安装器八语言夹具与占用/注册表/接管回归。
  * CI：保留 fork 的单一 `ci.yml` 拓扑（`python-runtime` / `windows-build` 在内）。上游把 Windows/Python 拆成独立工作流、并删除 npm 发布工作流，fork 侧继续只发 GitHub Releases，因此 `ci-python.yml` / `ci-windows.yml` 保持删除、`ci.yml` 并入上游 coverage 分片、`node-24-build`、`node-24-web-snapshot` 与 16 并发注释；`all-checks-passed.needs` 同时列 fork 的 python/windows 作业与上游新作业。
  * `pnpm-lock.yaml` 合并提交先保留 fork 的 workspace 与 SDKWork sibling importer 形状，随后用 pnpm 重生成（`6de7066dc6`），补齐上游新增连接器与客户端包的 importer / `link:` 条目。
* 生成物按源重新生成而非手工合并：`docs/module-graph.md`（+185 行/语言，纳入新连接器与客户端包）、`docs/config-catalog.md`、`packages/extensions/cordis-client-runner/src/client/slot-catalog.ts` 分别由 `gen-module-graph` / `gen-config-catalog` / `gen-client-catalog` 重跑产出。`gen-cordis-inspect-catalog` 因上游 typert 分析器新增「public property 必须显式类型标注」而卡在 fork 自有 `packages/client/ui-sdkwork-im/src/client/im-service.ts:335`，`api-catalog.ts` 暂取上游产物，作为后续项。
* 翻译配对：19 条配对记录（agent notes、`apps/desktop`、`docs/capability-seams`、`docs/user/guide`、`ui-chat`、`ui-model-selection`、`ui-settings-models`、`ui-primitives`、`ui-conversation`、`plugin-manager`、`client`、`llm`、`llm-pi-ai`）用 `verify-translation-pairing --write` 重新记录，全仓 1642 对复验一致；代码块内的注释保持与英文侧逐字一致（规范不允许翻译代码块）。
* 品牌契约复核：`FishLogo` 未出现在 fork 表面，三处登录入口（`WelcomePage` / `SignInDialog` / `SignInOverlay`）仍渲染 `LoginPanel`，官方名称槽渲染 `BirdWordmark`，启动页渲染 `createBootBrand()`，canonical 栅格 `apps/web/public/favicon.png` 未被覆盖；上游 PWA 图标集（`icon-192/512`、`icon-maskable-512`、`apple-touch-icon`、`favicon.svg`）与 `render-app-icons.ts`、`app-icons.spec.ts` 继续保持 fork 的删除决定（图标只从 canonical 栅格派生）。

#### 合并校验（本轮复核）

* 祖先关系：`git merge-base --is-ancestor upstream/master HEAD` 为真，`git rev-list --count HEAD..upstream/master` 为 **0**；`git ls-remote upstream refs/heads/master` = `4b399c39a6`（= `refs/tags/dsh-v0.2.3-alpha.2`）。
* 保真审计（`upstream-merge-fidelity-audit.mjs a316fd4781`）：上游单边改动 **2968 个文件全部与上游一致**（`DROPPED=0`、`fork divergence=0`）；fork 合并前已删除的 188 个路径中 **0 个仍存在于上游**；上游有而 HEAD 无的 35 个路径**全部是 fork 既有删除**（CI 四件套、whale/`favicon*.svg`/PWA 图标集、`render-app-icons.ts`、`app-icons.spec.ts`、`website/public/*.svg`、`scripts/release/publish.*`、agent locale json、postmortem 0003）；冲突标记 0、unmerged 0。
* 行级保真（`merge-line-fidelity.mjs a316fd4781`）：两侧都改的 257 个文件中，fork 新增行缺失候选 37 个文件（代码 86 行）、上游新增行缺失候选 34 个文件（代码 330 行），逐条核对后**全部为可解释差异**——`*.i18n.yaml` 哈希重录、`slot-catalog.ts` / `docs/config-catalog*` / `docs/module-graph*` 重新生成后的行号位移、`package.json` 依赖块重排、README/断言重写为 fork 品牌措辞、`pnpm-lock.yaml` 重生成、`apps/web/tests/pwa-manifest.e2e.ts` 保持 fork 的 favicon 断言；未发现被丢弃的上游修复或 fork 能力。
* 能力落点抽查（对应上文各节）：`packages/connector/*` 7 个连接器 + `cli-account` + `upstream-skills`；`packages/experimental/{timeline,forge,forge-github,forge-gitlab,cua,cua-mcp,cua-windows,cua-macos,personalized-recommendations,tool-worktree}`；`packages/client/{remote-connection,ui-session-status,ui-connector-account,ui-plugin-market,ui-action-cards,ui-creation-recommendations,ui-plugin-recommendations}`；`packages/skill/skill-office/assets/office/SKILL.md`（单技能，格式技能已无）；`vendor/*` 版本与上游 `release(vendor)` 一致。
* 类型门禁：`build:lib:host` 与 `tsc -b tsconfig.client.tests.json` 均通过（pre-push 全绿），客户端测试面引用列表与 `tsconfig.client.json` 等值。

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

* **模型调用失败诊断**（`7f45a280fc`、`e40b6de8d3`）：`llm-pi-ai` 在 provider 调用失败时上报精确的请求体，便于定位网关改写与凭据问题；对应断言补了对缺失日志调用的保护。
* **子模块前移到远端默认分支 HEAD**：`plugins/dsh-mcp-connector` 0.2.119 → 0.2.120（OAuth 回调兼容修复），`plugins/dsh-better-sidebar` 0.32.1 → 0.33.0（0.2.3 的 admit 注入 `connection.authentication`）；其余六个子模块已在最新指针。
* **品牌清单驱动构建与安装产品名**：`apps/web/scripts/build-brand.ts` 从 `brands/<key>.json` 取 `displayName` 注入 HTML `<title>` 与 PWA `manifest.webmanifest`，显式 `DSH_BRAND` / `DSH_CLIENT_TITLE` 可覆盖且失败即报错；桌面安装器的八份 locale 用 `{product}` 占位符由 `renderInstallerStrings()` 填入 `desktop.productName`，原生 window-frame 报告标题从构建期生成的 `installer-product.h` 读取（缺省回落到签入的 `installer-product-name.h`）。`LocaleRuntime.setBrand` 同时覆盖 fork 名、上游名与误拼写的 `Birdcoder`，并新增 `readOemCompanyName()` 投影；`agent.app.config.json` 统一为 `BirdCoder`。
* **设置菜单「我的域名」**：`ui-sdkwork-deploy` 增加域名中心对话框与验证逻辑，从设置入口直接管理域名；`llm-pi-ai` 在重命名 catalog id 下沿用 relay 模型事实并补测试；关于面板的安装身份与抽屉表面同步刷新。

* **关于面板：安装身份**（`feat(about): add installation identity about surface and installation app api`、`add deploy anchor, surface profile and installation facts surfaces`）：About 表面新增部署锚点、profile 与安装事实（安装身份、安装位置、应用 id），由安装侧 API 提供；`dsh-desktop` 的 About 命令测试按 `IpcMainInvokeEvent` 补类型。
* **欢迎窗登录收敛**（`feat(welcome): gate the continue action on a signed-in workspace`、`add welcome links and OAuth session end handling`）：继续动作要求已登录工作区，欢迎页新增链接与 OAuth 会话结束处理；落地页 locale 载荷与渲染夹具随之对齐。
* **IAM 离屏登录提示**（`feat(iam): surface a sign-in notice when browser login finishes off-surface`）：浏览器侧完成登录而模态已关闭时，`SignInOverlay` 给出可恢复的提示，而不是静默失败。
* **模型前端配置**（`feat(models): drive the relay catalog from the operator's front-end surface`）：`birdcoder-account` 从 app-api（或外壳投影的 `$DSH_HOME/iam/frontend-model-config.json`）读取运营端「模型前端配置」，经 `llm/model-exposure-policy` 决定中转目录暴露哪些模型；Desktop 用双令牌拉取并投影该文档，access 令牌不进 Host 子进程；`llm-pi-ai` 的 `relay-catalog-policy` 应用策略并在撤回时回落到构建期种子。
* **macOS 模式栏拖动条**（`fix(layout): let the mode rail carry the darwin window drag strip`）：模式栏轨道在 darwin 上预留顶部步进并挂出 `data-window-drag` 条带，补齐红绿灯下方原本无法拖动窗口的空白。
* **脚手架动作改名**（`refactor(row-menus): rename template actions to scaffold`、`refactor(deploy): read the template center from the app scaffold SDK namespace`）：模板发布/安装动作统一为 scaffold 语义，部署侧改读 `@sdkwork/*-app-sdk` 的 scaffold 命名空间。
* **安装修复命令**（`feat(scripts): add admin:repair:installation reconciliation command`）：`scripts/bootstrap/installation-repair.ts` + `repair-installation.mjs` 对齐本地安装记录与应用锚点，附 128 行规格。
* **预览客户端按面分目录**（`refactor(preview): group preview clients and row menus into per-surface directories`）：audio/image/video/pdf/docx/xlsx/pptx 预览与行菜单各自成目录；`xlsx` 表头填充改用活动主题 token（`fix(xlsx-preview): use the active header fill token in the sheet grid`）。
* **打包与配置**：`fix(pack): treat git dirty marker as build-time provenance`、`fix(build): tolerate vanished files and out-of-tree links when stamping`、重新生成部署 profile 的 env 文件、`mcp-connector` 前移到 0.2.119。

#### 发布准备（本版本打包前）

* **版本线收敛到 `0.2.3-alpha.2`**（`chore(release): bump the workspace to 0.2.3-alpha.2`）：上游这次的版本推进只覆盖它自己的成员，fork 自有 82 个 `packages/*/*` 与 `apps/*` 清单仍停在 `0.2.2-rc.5`，而打包的 `DshFamily.verifyVersions` 要求整族同版本，`0.2.2-rc.5` 的 `ui-sdkwork-*`、`sdkwork-*`、`birdcoder-account`、`*-pc/h5/pad/mini-program/flutter-mobile` 等全部随之同步。`pnpm-workspace.yaml` 里两族 scoped `overrides`（`@michengai/dsh-agency-agents>@deepseek-ai/*` 28 条、`dshmarket>@deepseek-ai/*` 3 条）也必须一起改：这个 pin 只有在等于本仓成员版本时才会 link 到工作区源码，落后就会静默改拉已发布 tarball，把第二套 harness 闭包（连同它那个被 allowlist 拒绝的 `dsh-subprocess-local` 构建脚本）拖进 lockfile——lockfile 因此减少约 9.2k 行。
* **模型价格分组前置到模型行下方**（`feat(model-menu): place model price group directly under the model row`）：`ui-model-selection` 新增会话级列表插槽 `conversation.input.model.afterModel`，`ModelPicker` 增加 `renderAfterModel` 座位并在 `ModelSelect` 侧从插槽注册表投影；`ui-sdkwork-model-price-group` 的「模型价格分组」摘要从 `options` 迁到 `afterModel`，紧贴它所作用的「模型」行，详情面板（key `model-price-group`）与「仅 `birdcoder` 提供方渲染」不变。`slot-catalog.ts` 随之重生成，并补 `model-price-groups-transport.client.spec.ts` 记录 CloudRouter app API 的请求形状。
* **子模块指针前移**（`chore(plugins): advance the submodule pins to their current upstream heads`）：`dsh-mcp-connector` 78a2976 → 7d719af（安装连接布局修复与 Registry 连接器数量文档）、`dsh-im` fc2ceab → 0694642（入站转发卡片读取正文）、`dsh-better-sidebar` aa2a058 → 14219fa（Git 详情关闭按钮常驻 Tabs 行、空白会话可从右栏展开底部工作台、原生搜索头部对齐）。三者包版本未变，因此不牵动任何消费者 pin 与 lockfile。
* **发布依赖 pin 与 CI 断言**：`sdkwork-deployments` 的 pin 从 `53daa38` 前移到 `74159b66`（`react-router-dom` 回到 `^7.15.0`，与 lockfile 记录一致，此前打包在 `pnpm install --frozen-lockfile` 阶段全线失败）；`windows-build` 恢复丢失的「Verify Desktop updater dependency versions」步骤，`scripts/ci-workflow.spec.ts` 六项断言按合并后的 `ci.yml` 重算（Linux 池 16 并发上限、`windows-coverage` 保持非阻断、`build:official` 去掉已移除的 `--serial`、分片覆盖率缓存键、`refs/heads/main` 推送）。
* **`@deepseek-ai/dsh` 补齐 `docs` 与 `src` 载荷**（`fix(release): ship the documentation and source the packed manifest promises`）：上游在 `DshFamily.validatePayload` 新增了「已安装入口必须带文档、升级指南索引与源码」的校验，而 fork 的 `apps/cli` 只发 `lib/*.js` / `config` / `lib/types/*.d.ts`，打包在 `pack-local-packages` 阶段报 `@deepseek-ai/dsh packed no documentation`。`files` 补上 `docs`（由既有 `prepack` 的 `stage-dsh-docs` 生成，含 `upgrade-guide/README.md` 索引）与 `src`，`config` 这个 fork 独有条目保留。
* **win-arm64 运行时载荷恢复可信**（`fix(runtime): verify the win-arm64 interpreter and prune pnpm by target platform`）：`scripts/primary-runtime/lock.json` 里 `win-arm64` 的 Node 归档 sha256 与 nodejs.org `SHASUMS256.txt` 不符（其余五个目标全对），打包在 `prepare:runtime` 报 `checksum mismatch for node-v24.22.3-win-arm64.zip`；同时 `preparePrimaryRuntime` 的平台判定写成 `target === 'win-x64' ? 'win32' : …`，`win-arm64` 会落到 `darwin` 分支，按 darwin 裁剪 pnpm 自带原生包，把 Windows 侧的 `@reflink/reflink-win32-arm64-msvc` 误删。两处都改为随目标前缀判定，本地 `preparePrimaryRuntime({ target: 'win-arm64' })` 与裁剪结果已复验。
* **容器镜像构建阶段补 `curl` / `ca-certificates` / `tar`**（`fix(docker): give the lark-cli postinstall its build-time tools`）：新并入的 `@deepseek-ai/dsh-feishu` 依赖 `@larksuite/cli`，它的 postinstall（`scripts/install.js`）用 `curl` 下载、`tar` 解包平台二进制；`node:22-bookworm-slim` 构建阶段只装了 `g++ make python3 git`，镜像 lane 因此在最后一步 `npm install` 打包 tarball 时先后报 `Failed to install lark-cli: spawnSync curl ENOENT` 与 `curl: (77) error setting certificate file: /etc/ssl/certs/ca-certificates.crt`（Node 走自带 CA 库，npm 才一直不需要系统证书）。这些只是构建期工具，运行镜像（`runtime` 阶段）的包清单不变；两条镜像 lane 共用 `repo/Dockerfile`，amd64 与 arm64 一起修。

#### 后续项（本轮未做，均不影响发布完整性）

* `gen-cordis-inspect-catalog` 需先给 `packages/client/ui-sdkwork-im/src/client/im-service.ts:335` 的公有属性补显式类型标注（上游 typert 新规则），再重跑生成 `packages/extensions/tool-cordis/src/api-catalog.ts`；当前该文件为上游产物。
* `packages/experimental/client-ui-{action-cards,creation-recommendations,plugin-recommendations}` 三个目录只残留重命名前的未跟踪构建产物（`lib/`、`node_modules/`），不参与 workspace 与类型检查，可在下次清理构建目录时一并删除。

本文件只保留当前版本一节；往期条目随各自版本的提交留在 git 历史里（`git log -p CHANGELOG.md`）。Release notes 就是本节内容。
