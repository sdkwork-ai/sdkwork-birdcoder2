# Agent Note：upstream 同步（b2e3b2a012，2026-09-10）——rightbar 框架收敛

Status: implemented

[English](2026-09-10-upstream-sync-b2e3b2a012.md) | 中文

## 问题

upstream 在 2026-09-04 的合并基点（d347e70390）之后前进了约 1141 个提交，并围绕新接缝重建了客户端外壳：带全局面板的 keyed `main` 槽位、由新的 `ui-sidebar-right`/`ui-dockkit` 对拥有的 `rightbar` 列，以及替代各插件自建侧列的右栏标签注册表（`ctx.sidebarRightTabs` + `ctx.sidebarRight.openResource/openTab`）。fork 恰好在同一批接缝上构建了产品特性——固定模式栏（`mode.rail`）、keyed 模式页、由 `ui-chat` 工具详情和 `ui-sdkwork-explorer` 占据的会话级 `details` 列——而 upstream 同时还创建了自己的 `apps/desktop` Electron 应用，并把原生包家族改名（`landlock-run` → `system`）。任何一侧整体覆盖的同步都会毁掉 fork 的产品，或把 upstream 的契约分叉出去。

## 决策

- **upstream 外壳架构胜出，fork 特性在其上重新表达。** 合并后的 `AppFrame` 渲染四条轨道——56px 固定模式栏、侧栏、中列、rightbar。store 记录扣除模式栏后的宽度，使每个断点判定与求解跑在同一个宽度上；rightbar 的占用方仍上报原始帧宽以覆盖全屏。中列按 fork 的生效模式（`panelMode ?? mode`）分发：`code` 渲染 upstream 的 keyed 主面板（默认会话），其余模式渲染 `shell.app-header` 加 keyed `mode.page`。`ILayout` 同时承载两套词汇（upstream 的 `selectPanel`/`beginNavigation`/rightbar 上报，fork 的 `setMode`/`openPanel`/`closePanel`/`setSidebarVisible`）。
- **explorer 成为右栏标签类型。** `ui-sdkwork-explorer` 注册一个 `sidebar.right.pane.tab` 页面类型；其 DOM 总线手势（`sdkwork:explorer:open-file/-diff/-url`）不变，现在通过 `ctx.sidebarRight.openTab('sdkwork-explorer')` 展示并聚焦所在列。内部标签条、打开模式策略、设置持久化、差异分支全部未动。
- **apps/desktop 仍是 fork 的应用。** upstream 在同一路径独立创建了 `apps/desktop` + `apps/desktop-host`；fork 已发布的 Electron 外壳保留该目录，upstream 的桌面实现文件被移除（缺少 upstream 的 `package.json`/`tsconfig` 即成孤儿），符合改名台账中"fork 应用拥有自己的名字"的规则。
- **跟进原生改名。** `native/landlock-run` → `native/system`、`@deepseek-ai/node-addon-system*` 包名、`node-addon-system.yml`/`-release.yml` workflow（带 fork 的 `branches: [main]`），flock 绑定改用 `@deepseek-ai/node-addon-system/flock` 取代惰性 `fs-ext` 导入；`fs-ext` 退出依赖树。
- **发布流保持 fork 所有。** 仅打包（不发布注册表）、`birdcoder-v*` 标签、标签触发 `container-release.yml`；`release-publish.yml` 与 `scripts/release/publish.ts` 保持删除，发布脚本把版本/发布成员二分收敛到 upstream 的 `members()`。
- **CI 收敛并保留 fork 加固。** 两个 workflow 从 upstream 重构后的 job 重建，带 `main` 分支名、每个安装 job 的 `setup-sdkwork-siblings`（含 upstream 新增的 bench/consumers/windows 泳道），并保留 ci-master 对 push 的取消豁免（`${{ github.event_name != 'push' }}`），合并永不取消进行中的演练。
- **笔记归档在合并时重封存。** upstream 归档了约 1350 篇 implemented 笔记（fork 内容 + `Archived:` 横幅干净合并）；manifest 从合并后的字节重新生成，归档配对记录重新登记——这是对追加封存规则的一次性例外；对合并把 fork 编辑折入已封存文件的笔记（`gui-layering`、`documentation-site-tag-release`、`workspace-version-coherence-gate` 一组），恢复 upstream 的封存内容。

## 后果

- 被移除接缝的 fork 消费方已适配：`ui-workspace` 导航继续通过 `layout.setMode` 回到 code 面，其 `rowMenus` 洞保留；`ui-sidebar` 在 upstream 全局面板行旁保留 `sidebar.actions` 快捷入口席位与 BirdCoder 品牌标志回退；工具行的差异搭乘式 `openFile` 握手被按行锚定的 `openResource` 取代（explorer 的差异分支在侧栏打开纯文件之前先认领）。
- 本次同步无法重新生成 `THIRD_PARTY_NOTICES.md`：活跃的 `sdkwork-knowledgebase` sibling（2026-09-09 更新）在 `browser-bundled-externals` 的无产物解析阶段触发 rolldown 终结器 panic（`SymbolRef … is not in any chunk`），与本次合并无关（rolldown 1.1.x 与 1.2.7 均触发；sibling 新增的 `groupKnowledgebaseLaunchHandoff` 源码在依赖图中）。在 sibling/rolldown 问题解决前，已提交的 notices 相对合并后的依赖集是陈旧的。
- `verify-archived-agent-notes` 以本次 merge commit 作为新的封存原点；后续同步不得再期待合并前的封存。
