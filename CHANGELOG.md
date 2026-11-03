# BirdCoder 更新日志

本文件只记录**当前版本**——`##` 标题就是本次发布打的 tag，不累积历史版本条目；往期条目随各自版本的提交保留在 git 历史里（`git log -p CHANGELOG.md`）。「上游变更」逐字摘自上游该 release 的官方 Release notes（中文部分，英文版见各 Release 页面）；「BirdCoder 本地修改」记录 fork 在该版本上的自有变更（SDKWork 组件、品牌、打包与部署等），不受上游发布节奏影响。

## 0.2.2-alpha.6（fork 发布 2026-11-04）

本版本打在 `birdcoder-v0.2.2-alpha.5`（`0a2ccad05b`）之后，只有两段内容：分层拓扑环境档位的一次性重物化，以及首个上游同步窗口——上游 `master` 从 `ce7073d512`（tag `dsh-v0.2.2-alpha.2`）前进到 `8bd073392e`（tag `dsh-v0.2.2-alpha.3`），共 666 个上游提交，以真实双父提交合并（`--no-ff`）叠加在 main 上，上游作者、提交信息与代码注释原样保留。alpha.5 的发布说明已描述这轮同步，但合并（`7558dfeaa6`）在其 tag 之后才落进 main，所以本版本是第一个真正携带该同步的产物。

### 上游变更（`dsh-v0.2.2-alpha.3`）

以下逐字摘自上游 `dsh-v0.2.2-alpha.3` 的官方 Release notes（中文部分，英文版见该 Release 页面）。

#### 新增功能

* 支持统一右键与键盘菜单，覆盖会话、工作区和侧边栏，并支持开发者扩展 @std4453
* 文件预览支持常驻目录树和文件定位功能。 @yudshj
* 实验性「变更请求与工作树」统一代码审查与工作树入口，支持通过可搜索文件树和逐文件导航查看本地及 PR 差异，将选中代码和评论交给 Agent，并跟踪检查与评审状态。 @LegGasai

#### 体验优化

* 改善手机端侧栏导航与窄屏布局，保持会话标题稳定，并让模型目录输入和插件发现页操作完整可见。 @Stevring @Saafo @EricMoin
* 菜单和浮窗优先保持在可见区域内，跟随浏览器缩放、平移和软键盘变化。 @Stevring
* Trajectory 支持独立折叠子调用，保留父调用和摘要；搜索或跨视图定位时可展开对应子调用。 @kermanx
* 优化对话中思考内容的展示，摘要、展开正文和翻译不再显示模型输出开头的签名前缀。 @LegGasai
* 减少会话状态更新时的重复发布和目录处理开销，并降低长回复流式组装的运行时成本。 @liukx0205 @imccyu
* 改善底部输入框的布局稳定性，减少输入、菜单展开和统计更新时的跳动。 @imccyu

#### 问题修复

* 通过 pi-ai 接入的模型在会话图片超过请求数量上限时，自动省略最早的图片并继续请求，避免持续失败。 @turtle2099
* 修复 OpenCode 路由下自动审核在工具执行前失败的问题，审查请求携带对应会话的身份和用途。 @LegGasai
* 修复 alpha.2 引入的空会话恢复后被当作「未命名」会话持续显示的问题，并恢复按最后提示时间排序。 @imccyu
* 修复包含旧版子代理描述的历史会话无法打开，并导致会话搜索失败的问题。 @turtle2099
* 修复加载更早的已压缩会话历史后，聊天记录停止加载和更新的问题。 @turtle2099
* 聊天中的 Markdown 文件链接容忍无效行号，并支持行范围及行列后缀；无法定位时仍打开原文件，URL 保持为网页链接。 @kermanx
* 文本和 Markdown 文件预览在刷新后保留阅读位置，文件暂时变短时也保留原位置，避免跳回第一页。 @yudshj
* Trajectory 保留失败工具实际返回的文本，列表、详情和复制不再用合成错误信息替换它；原生工具和嵌套 PTC 调用使用相同规则。 @kermanx
* 修复部分历史 `run_code` 记录的代码页缺少 TypeScript 或 Python 语法高亮的问题。 @kermanx
* 打开既有定时任务时显示对应的日期、时间、间隔与星期控件，并按字段给出纠正提示；仅修改名称或指令时保留计时规则，超出控件精度的复杂规则保留原始文本。 @Magolor

#### 其他变更

* 同步 Cordis Core 至 4.0.0-rc.11、Loader 至 1.0.0-rc.8、Include 至 1.1.1，统一配置访问、条目变更和持久化行为。 @shigma @imccyu
* pi-ai 支持插件按会话和请求用途提供动态请求头；无效请求头在请求发出前报错。 @LegGasai
* 插件可为自己的设置页面提供导航图标，卸载后恢复默认图标。 @Magolor
* 插件安装失败时显示完整诊断与 Host 日志入口，并区分安装失败和安装后启用失败。 @kermanx
* 「Git 工作树」入口已合入「变更请求与工作树」，此前启用独立插件的用户需手动从 profile 的 dsh.profile.bundles 中移除 @deepseek-ai/dsh-experimental-tool-worktree
* 「自动化任务」改为统一的宿主级管理，支持手动创建、直接编辑和通过预填提示在会话中创建，保留编辑草稿并支持冲突复核，可选择复用或新建会话执行任务。 @ZiyaZhang @Magolor
* 新增默认关闭的 `apply_patch` 工具，一次完成多文件新增、编辑、删除和移动，并在 Review 中查看变更。 @sjw1231 @CreatixChu
* TypeScript 与 Python SDK 补齐原生命令和插件管理能力，支持计划审阅、目标续跑与操作审批；插件变更重启后生效。 @LogosVeritas @koalazf99
* macOS Computer Use 改用独立应用申请系统权限，打开对应系统设置并提供应用拖入引导，返回后刷新权限状态。 @CreatixChu
* 文件修改的先读和外部修改防护默认关闭，沙箱限制和 Review 保持不变；需要原防护的 profile 可显式恢复观察策略。 @sjw1231
* 回退 alpha.2 中引入的跨行 `$$` 数学块的不稳定兼容解析。 @yudshj

### BirdCoder 本地修改

#### 环境与构建

* **分层拓扑环境档位重物化**（`ebd9468d26`）：仓库根 `.env.cloud.*` 与 `.env.standalone.*`、`etc/topology/*.env`，以及 `sdkwork-birdcoder2-h5`/`pad`/`mini-program`/`flutter-mobile` 四个应用族的环境面（`.env.*`、`runtime-env.*.json`、`env/sdkwork.*.json`）按 sdkwork-specs 的分层拓扑标准一起重新生成，共 82 个文件；同一环境在各应用族里的取值与 `etc/topology` 一致，standalone 保留为显式变体、cloud 仍是默认。

#### 修复（同步后对齐）

* **宿主 subagent 控制面跟随上游**（`97009706a3`）：上游删除了 `@deepseek-ai/dsh-subagent/internal` 的符号桥，`apiproxy` 的人类消息改走 Service 的 `ctx.subagents.prompt(...)`，附件准入、请求身份与收件箱路由回到同一处实现，wire 内容类型随之从 `ContentBlock[]` 收窄为 `PromptContentPart[]`；`subagentPromptError` 补齐 `RemoteError` 分支，三个线上错误码保持不变；live lineage 移出 core Agent registry 后，归属判定归一到 header `origin === 'subagent'`，`interrupt` 授权收窄为 `{ kind: 'user' }`；桌面 `main.ts` 补上 electron `net` 导入。
* **合并后的工程引用审计**（`de1bc81c39`）：`tsconfig.client.tests.json` 仍指向上游已迁走的 `packages/experimental/client-ui-agent-team`，该陈旧路径以 `TS6053`/`TS5083` 中止整个 composite 构建，改为 `packages/client/ui-agent-team`；`tsconfig.desktop-keyboard-tests.json` 对 `ui-settings-general/types` 改用工程引用，避免拆面后的裸目录引用报 `TS6306`；客户端新的 slot props 一并跟上。
* **apiproxy 测试夹具真正跑起来**（`d6e014d2c3`）：上游 `refactor(session-projection)` 之后 `AgentRegistry` 注入 `sessionProjections`，而 fork 的夹具从未挂载 registry，`ctx.agents` 恒为 undefined，13 个 spec 在 setup 阶段全部中止；逐夹具补挂 `SessionProjectionRegistry`、在测试替身里 await disposer、interrupt 授权断言跟随收窄后的形状，同一切片失败数从 146 降到 34，且这 34 个都不是本次合并引入的。
* **冷启动恢复 spec 跟随上游 seam**（`963b90df26`）：`api-proxy-cold` 按上游 `agent` seam 装配会话投影，不再依赖被移除的内部桥。

#### 依赖与版本

* submodule 均停在各自跟踪分支的最新 pin，本版本未再前进：`plugins/dsh-im` `d2f2703d`（main）、`plugins/dsh-better-sidebar` `bd6cfa5`（dev）、`plugins/dsh-skill-market` `4cda930`（v2.0.7）、`plugins/dsh-mcp-connector` `80f6182`（v0.2.93）；四条 gitlink 与远端分支头逐一核对一致。
* SDKWork 依赖继续按 sdkwork-specs 的双记录 pin 管理：`scripts/sdkwork-sources.manifest.json`（36 行 pnpm 兄弟仓 + 2 行 Cargo-only）与 `agent.workflow.json` 的记录一致；本地工作区走 `../sdkwork-*` 相对路径，发布与 CI 车道按同一份 pin 克隆 git 仓库。本版本未前进 pin。
* 版本推进到 `0.2.2-alpha.6`：449 个清单改写，448 个 released manifest 通过 `verify-version-sync`；锁文件不记录工作区版本，本次未改 `pnpm-lock.yaml`。

#### 上游同步

* **合并方式**：`git fetch upstream && git merge upstream/master --no-ff`，真实双父提交 `7558dfeaa6`，不做 squash；`8bd073392e` 是本次同步的上限。
* **冲突 419 个，逐文件裁决**：368 个是纯 `version` 字段冲突（fork 保持自己的发布版本，上游为 `0.2.2-alpha.3`），保留 fork 版本号但不丢弃同文件内的上游改动；其余 51 个按「fork 表面保 fork、上游核心取上游、双方都改则合两者行为并以上游结构为基线」处理。
* **fork 表面保持**：`ui-sidebar` 的 `BirdLogo` 品牌标记、`sidebar.actions` 快捷入口席位与模式栏「更多」菜单文案、`ui-conversation` 会话头部把 body 拆成 `conversation.session.header.surface` 兜底的 fork 结构、`ui-settings-web-search` 与 `ui-sidebar` README 的 fork 段落，均按 `.sdkwork/upstream-sync-anchor.json` 保留。
* **上游结构性改名被采纳**：`packages/experimental/{agent-team,tool-agent-team,client-ui-agent-team,agent-team-profile}` → `packages/team/*`、`packages/client/ui-agent-team`，包名去掉 `experimental-` 前缀；exa 与 perplexity 搜索行等上游下线面随上游删除。合并后清掉四个上游随包删除、而合并留在工作区的清单（`agent-team-profile`、`agent-team`、旧 team spec、已下线的 exa/perplexity 清单），工作区里不再有缺源码的 manifest。
* **发布记账门禁放宽为「允许领先」**（`1271d8aed8`）：`verify` 的版本记账检查现在接受 fork 根版本**领先于**最新上游 tag（fork 在上游两次发布之间出包），落后仍然报错——那才是它要拦的情况；上游锚点同时记下本轮上限 `8bd073392e`、合并提交 `7558dfeaa6` 与四条「只差发布版本号」的清单对账记录。
