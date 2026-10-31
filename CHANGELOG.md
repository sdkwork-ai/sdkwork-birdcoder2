# BirdCoder 更新日志

本文件只记录**当前版本**——`##` 标题就是本次发布打的 tag，不累积历史版本条目；往期条目随各自版本的提交保留在 git 历史里（`git log -p CHANGELOG.md`）。「上游变更」逐字摘自上游该 release 的官方 Release notes（中文部分，英文版见各 Release 页面）；「BirdCoder 本地修改」记录 fork 在该版本上的自有变更（SDKWork 组件、品牌、打包与部署等），不受上游发布节奏影响。

## 0.2.2-alpha.3（上游发布 2026-10-28，本地同步 2026-10-30，fork 发布 2026-10-31）

本版本打在 `birdcoder-v0.2.2-alpha.2`（`d3d3b1a4aa`）之后：除上游同步外，还包含该 tag 之后到 `3368a65bb8` 的全部 fork 自有变更——Pad 应用族、左侧栏页面注册表、插件市场与专家创建流、Automation 直达创建、桌面端不可验证证书信任，以及 `sdkwork-env-bootstrap` 的两处修复；`plugins/dsh-im` 前进到上游可达的 `4ef05eb`（v5.9.0+10），替换掉会让 CI submodule 检出失败的 gitlink `997b9965`。

Fork 同步：merge `8d41ff804f`（2026-10-30），上游 351 个提交、差量 1461 文件（合并后 +72629 / −24091，其中上游删除 9 个文件、新增 365 个文件），窗口为 `f3803c9697`（dsh-v0.2.2-alpha.2）→ `ce7073d512`，含 `dsh-v0.2.1-rc.5` release 及其回合 master 的合并。上游 Release：[v0.2.1-rc.5](https://github.com/deepseek-ai/deepseek-harness/releases/tag/dsh-v0.2.1-rc.5)。本次为真实双亲合并提交（`git merge --no-ff`，非 squash / rebase / cherry-pick），上游提交的作者、日期、commit message 与代码注释原样进入历史；32 个冲突文件逐个人工裁决。合并后校验：19458 个 fork 从未触碰的文件与上游逐字节一致，品牌契约与 2263 个 sdkwork 路径全部保留。

### 上游变更

#### 新增功能

* 新增 `apply_patch` 补丁工具完整链路：纯解析器、按序预检与执行、补丁路径围栏、守卫式删除与移动 RPC、应用结果与中断操作的 diff 展示，并在 LF 归一化文本上打补丁；默认关闭，Web 标准预设与 `dsh-base` 的 tool-fs 行可显式开启。
* 侧栏文件树按分栏保留，文件菜单可在侧栏或浮窗中打开并移动已有标签；工作区与目录新增右键上下文菜单。
* 计划、目标与权限新增原生斜杠命令，原生命令统一走 `run` 通道并返回 `RunResult`；会话菜单按已配置快捷键展示结构化条目。
* 独立任务（standalone tasks）接入现有 WebUI。
* Trajectory 新增独立子调用折叠、代码高亮与失败输出展示。
* 新增可扩展资源操作与共享弹窗生命周期；插件可准备 pi-ai 请求头。
* Computer Use helper 拥有独立权限身份，可按需安装经过公证的产物，并复用已验证的打包产物。

#### 体验优化

* 优化对话中思考内容的展示效果。 @LegGasai
* 手机端侧栏复用设备检测打开抽屉、共享栏宽并稳定头部布局；修复手机端插件发现页工具栏溢出与模型目录输入框挤压。
* 侧栏标签仅在已显示时闪烁并减弱光晕，修正柔光反馈、停靠展开与铺满焦点交接。
* 文件预览刷新后保留阅读位置；`run_code` 恢复语法高亮；窄面板中的折叠控件保持可用。
* DevTools 菜单项本地化并成组排在退出之前，快捷键与其它入口隔离。
* 性能：Loader 条目每轮只索引一次、流式期间缓存助手块可见性、以活动容器游标遍历 JSON。

#### 问题修复

* 保留请求头覆盖并给出安全的失败诊断；限制 client-modules flush 枚举失败的影响范围。
* 完整读取仓库的 Git 跟踪文件列表，并拒绝在保留产物选择中穿越仓库路径。
* 保留畸形的启动回复与原始诊断；仅在失败安装的回答确证之后才做出声明。
* Git 检查遵循会话权限；校验命令生命周期并归一化严格输入。
* 通过 rc.11 的 `Impl.ctx` 读取 provider fiber。

#### 其他变更

* Cordis Core 由 `4.0.0-rc.7` 升级到 `4.0.0-rc.11`：Core 拥有原始 `Fiber.config`、`internal/config`、`internal/commit` 与可等待的 `internal/update`。直接依赖旧 `Fiber.update()` 丢弃重启 Promise 行为的插件需复核。
* Loader 生命周期切片同步到 rc.11：条目更新等待 context patch、Fiber 更新与禁用条目释放；Group 与 Include 返回子更新工作，写入器改用 `internal/commit` 并保留 schema 绑定简化。
* 文档新增自动化事件触发 RFC、轨迹与工作区子系统说明及对应升级指南。

### BirdCoder 本地修改

#### 🔀 同步面

- **同步锚点**：本轮窗口 `f3803c9697..ce7073d512`（351 提交 / 1461 文件），merge `8d41ff804f`，上游 tag `dsh-v0.2.2-alpha.2`，下一轮从 `ce7073d512` 增量继续。回滚点：分支 `backup/pre-upstream-sync-20261030` 与 tag `backup/pre-sync`，均指向同步前 HEAD `0899c855dc`。
- **冲突规模**：32 个冲突文件（30 个双改 + 2 个删除/修改），逐文件裁决；未使用 `--ours .` / `--theirs .` / `-X ours` / `-X theirs`，未用删除文件的方式消解冲突。
- **上游复核**（2026-10-30 22:20）：`git ls-remote` 与 GitHub API 均确认 `deepseek-harness` 的 `master` 仍停在 `ce7073d512`（2026-10-29T16:13Z），`git merge-base --is-ancestor upstream/master main` 通过、`main..upstream/master` 为 0 提交 ⇒ 本轮无新增上游提交，无需再开合并窗口，下一轮仍自 `ce7073d512` 增量继续。
- **合并后校验**（`scripts/sync-upstream.sh verify` 全部通过）：19458 个 fork 从未触碰的文件与上游逐字节一致；品牌契约（BirdLogo 消费者 8 处、BirdWordmark 官方位 1 处、桌面窗口图标 1 处、桌面文案无上游产品名）通过；sdkwork 路径 2263 → 2263 未收缩；上游本轮删除的文件无一被 fork 误删。
- **保真复核**（`node .workbuddy/tools/upstream-merge-fidelity-audit.mjs 8d41ff804f`，2026-10-30 22:45）：上游单改的 1319 个文件 **全部**对齐上游、丢弃 0、fork 侧分歧 0；上游删除 9 个文件而 fork 仍保留上游在售文件的条数为 0；冲突标记 0 处、未合并索引 0 条；32 个冲突路径的 remerge-diff 逐条可核。

#### 🛡️ 保留的 fork 面

- **品牌**：`ui-sidebar` 继续使用 `BirdLogo`；桌面菜单、会话头部与测试期望保持 BirdCoder / `birdcoder 命令`；上游 `FishLogo` 与图标/wordmark SVG 仍为 fork 删除项。
- **插件 rowMenus seam**：`ui-workspace` 保留 `menu`/`actions` 右键通道、内置 fallback `Menu`、`sidebar.workspaces.rowMenus` 渲染位与 `onFork`/`onPin`/`onUnpin`/`onArchive` 的 browser→row 线程；同时并入上游 contextMenus 的新增注入（`contextMenuTarget`、`workspaceActionRequest`、`openWorkspaceMenu`、`useContextMenu`）。
- **布局**：`AppFrame` 保留模式轨道（`MODE_RAIL_WIDTH`、`mode.rail`、`mode.page`、`codeMode` 标题），并在其上叠加 rc 的抽屉能力：`SIDEBAR_DRAWER_BREAKPOINT` 抽屉、折叠屏居中侧栏、抽屉遮罩与 `inert` 传播、`solvable` 宽度求解。
- **会话头部**：保留 fork 的 HeaderBody/Shell 拆分（store 订阅留在 shell、body 只做溢出计算），并把上游新增的面包屑右键上下文菜单接通（新增 `useContextMenu` 下传）。
- **CI/发布**：`release.yml`、`release-vendor.yml` 保留 fork 命名并吸收上游 `build:official --serial`；npm 发布链（`release-publish.yml`、`release-vendor-publish.yml`、`scripts/release/publish.ts`、`publish.spec.ts`）按 anchor 的 `deletedByFork` 维持删除。
- **文档**：`vendor/README.md` 采纳上游的 `V<id>` 稳定编号清单（不重编号、不复用 ID），并把 fork 独有的两处 hmr 补丁登记为 `V26`（去掉 `hmr: Hmr` 增强）与 `V27`（保留 `hmr/config-update-failed` 声明），下一号 `V28`。

#### 🔧 采纳的上游面

- **上下文菜单服务**：`ui-context-menu` 通过 `ctx.slots.provideRoot` 向每个 Slot 作用域注入 `useContextMenu`；会话菜单迁到 `contextMenu.content`（key `session`）注册，会话行与面包屑改用 `getTriggerProps`。
- **apply_patch 工具族**：解析、执行、路径围栏与 UI 展示全量进入 fork。
- **Cordis rc.11 切片**：`app-boot` 移除 `internal/update` 观察者（Core 不再丢弃重启 Promise）；loader/include/hmr 生命周期按上游实现。
- **CUA helper**：产物选择、保留尝试复用与按需安装进入 fork 的打包面。
- **构建**：`tsdown.client.ts` 的 `INLINE_SAFE` 增加 `util-time` 与 `dsh-commands/builtin`。
- **锁文件**：`pnpm-lock.yaml` 保留两侧各自新增的条目（`rrweb-cssom` 与 `rrule`），未做单边覆盖。

#### 🗑️ 删除审计

- 上游本轮删除 9 个文件（如 `apps/desktop/scripts/windows-build-workspace.*`、`ui-schedule/src/client/task-timing.ts` 及其测试、`ui-workspace/src/client/session-actions/{ForkSession,SessionId}.tsx`、`scripts/windows-build-workspace.spec.ts`），fork 全部跟随删除，且无额外误删；`verify` 的删除审计对 `backup/pre-sync` 比对 9 条，全部为上游同步删除。
- `release-publish.yml` 与 `scripts/release/publish.ts` 的删除来自 anchor 的既有决定（fork 不再向 npm 发布），不是本轮误删。

#### 🧩 同步后 fork 自有变更（2026-10-30，merge 之后）

- **`695c1aa8ec` fix(workspace)**：内置会话菜单改走上游的 context-menu 容器。上游把 `sidebar.workspaces.session.menu.item` 从 browser 的 children 移到 `contextMenu.content` 注册，对 owner children 之外的 key 调 `renderSlot` 会抛 `SlotOwnershipError`；内置 fallback 菜单改由 `openSessionMenu` 打开，会话行右键转发同一 target，fork 的 `rowMenus` 插件渲染通道不变。
- **`d2f2fb0524` test(client)**：fork 自有 spec 跟随上游槽位与菜单契约——手工构造 props 的组件 fixture 补 `useContextMenu: contextMenuHook()`，WorkspaceBrowser 补三个新注入 seam（`openWorkspaceMenu`、`settleWorkspaceAction`、`openSessionMenu`）；`app-build` 的 submenu helper 显式标注 `MenuItem[]`（`MenuEntry` 现含分隔符与标签）；`apps/desktop/src/ipc.ts` 新增 `@deepseek-ai/dsh-client-ui-file-actions/types` 类型导入，`tsconfig.desktop-keyboard-tests.json` 相应增加该 project 引用；lockfile 中冲突裁决遗留的两个 importer 的 react 版本归一到与其余客户端包一致。
- **`993b0e9ee3` feat(automation)**：Automation 面板迁到 Host 的 target-based Schedule 契约——任务以投递 **target**（既有 Session / 首次投递新建 / 每次投递新建）取代归属 Session，状态改为 `active`/`paused`/`ended`，单个 `edit` 请求取代 `update` + `delete`，规则并集新增 host 生成的 `rrule` 记录；`task-record.ts` 统一派生关联 Session、involved 判断与目标标签，目录读取带回的 revision 作为 `expectedUpdatedAt` 传入，task detail 用单个 `patch` 提交（标题/提示/时间），`schedule/input-invalid` 的 details 映射为本地化恢复文案，已结束或 host 生成 RRULE 的任务按只读处理（编辑器无法表达），筛选与搜索跟随真实状态与 target Session。
- **左侧栏改为 fork 自有宿主 + 页面注册表**：新增 `@deepseek-ai/dsh-client-ui-sdkwork-sidebar`，`packages/bundle/web-app/cordis.patch.yml` 把 `ui-sidebar` 行重新指向它（与设置外壳同一替换规则，上游 `ui-sidebar` 源码不动、不加载），沿用上游全部 `sidebar.*` 槽位，因此工作区浏览器、品牌、快捷入口与设置入口零改动；新增 `ctx.sdkworkSidebar.registerPage`（`{ id, title, icon, order, open }`），镜像 dsh-better-sidebar 的 `TabDescriptor` 页面模型，`ui-sdkwork-demand-hall` 已把 `sidebar.actions` 组件改为一次 `registerPage` 调用且行位置与外观不变。
- **Pad（平板）应用族骨架 `apps/sdkwork-birdcoder2-pad` 落地**：admin-core / admin-shell / commons / console-core / console-shell / core / shell / tauri 宿主与 tablet 布局、导航、路由、窗口分级齐备，`standalone` 与 `cloud` 双 profile × demo/development/test/staging/production 环境样例（含 `.tablet-android` 变体）进入版本库；工作区新增对应成员并同步锁文件。
- **Automation 面板改为经 Schedule Remote 直达创建任务**：新增任务与模板卡片不再向新会话派发 `schedule_create` 再等模型转写（桌面端该会话在客户端铸造 scope 前就出现在列表里，plugin 记 `[automation] prompt dispatch skipped: session … has no face`，草稿无声消失），改为直接调用 Host 发布的 `schedule/create` Remote 方法。
- **桌面端不可验证证书（自签名）信任开关**：新增 `apps/desktop/src/tls-trust.ts`——`--insecure-tls` 单次启动参数、`DSH_DESKTOP_INSECURE_TLS` 环境变量、打包清单 `dshDesktopInsecureTls` 字段三路输入统一裁决，同时关掉 Chromium 校验（`--ignore-certificate-errors`）并把 `NODE_TLS_REJECT_UNAUTHORIZED=0` 注入 Node 侧进程与 dsh Host 的子进程；配套 `tls-trust.spec.ts` 与 `packaged-tls-trust.spec.ts`。
- **`sdkwork-env-bootstrap` 两处修复**：`1acd03ceef` 按 claims 而非 issuer 复用网关签发的引导令牌；`de308e520c` 在存在操作员凭据时自行开通生产令牌。
- **第三方插件 submodule 前进到最新并修掉不可达 pin**：`plugins/dsh-im` v5.7.0（`e278ac7`）→ `4ef05eb`（v5.9.0+10，含飞书目标轮次、邮件 IMAP 重连、NAS/Docker 局域网管理访问与设置/更新权限修复）；`plugins/dsh-better-sidebar` v0.28.2（`b0e0fab`）→ `bd6cfa5`（dev，含侧聊归档 #949、设置行注册 #951、面板高度 100dvh #1014、卡片开关 #1009 等）；其中 `997b9965` 在上游已不可达（`upload-pack: not our ref`），此前所有带 `submodules: recursive` 的 CI 检出都会在 `git submodule update` 处失败。
- **`plugins/dsh-better-sidebar` 以只读 submodule 引入并默认挂载**：pin 到 dev `bd6cfa5`（本版本前进后的最新提交，见上一条），作为页面模型参照由 `tests/better-sidebar-contract.client.spec.ts` 守护（submodule 受跟踪文件零修改 + 上游描述符字段仍在），工作区安装时由其 `prepare` 从 pinned 源构建 `lib/`；web-app 组合以 `better-sidebar` 行默认挂载它——文件树 / Git / 变更 / 任务 / 侧聊 / 编辑器进入右侧栏，`/sidebar/*` 路由由其 host 半边提供，与本 fork 自有右侧栏页面并存（只需移除其中一侧的 row 即可只留一套）。只读规则写入根 `AGENTS.md`。
- **发布车道（`scripts/sdkwork-sources.manifest.json` 按 pin 克隆的兄弟仓）下 `ui-sdkwork-markets` 客户端 bundle 的两处解析修复**：两处失败只出现在发布车道，本地相对路径工作区永远复现不出一半——①`tsc` 把 `src/client/*.ts` 的相对样式表导入原样复制进 `lib/types/client/*.js`，而产物目录比源深一级，因此从编译产物解析时落到仓库内部的 `sdkwork-appstore/`（`ENOENT`）而不是父目录的兄弟仓；bundle 改为按「签出相对后缀」把两张嵌入样式表重新挂回兄弟仓根——`ui-sdkwork-appstore` 的 bundle 本来就有这个重挂，markets 的双表版本漏了。②`@sdkwork/agents-pc-agents/create` 策展入口在 pinned 兄弟仓里根本不存在（只在本地工作区以未跟踪文件形式存在），发布车道恒定报 `Matched alias not found`；改为由 fork 自有的 `ui-sdkwork-markets/src/client/agentsCreateSurface.ts` 复述同一策展面（基础信息对话框、编辑器、两个知识选择适配器，四个模块均来自 pinned 兄弟仓），`tsconfig.base.json` 的别名指向它，宿主适配器 `expertsHost.tsx` 与其 13 条单测零改动。
- **插件市场（dsh-market）接入插件页并成为首个视图与默认落地**：`ui-sdkwork-markets` 的插件子 tab 改为 `[插件市场 · 云端目录] | [官方插件 · 已安装]`，打头且默认选中的「插件市场」渲染社区插件市场 `dshmarket`（npm 包，仓库 <https://github.com/dsh-market/dsh-market>）通过 `market` 客户端服务发布的整个面板（`render({ surface: 'plugins' })`，契约版本 1），不在其外再画页面框架；该 chip 激活时保留页头「添加」下拉（创建插件 / 添加插件市场）、仅收起本页搜索框（市场页面自带搜索）；服务按可选依赖消费（`ctx.inject(['market'], …)`），未安装时该 chip 仍显示安装入口（走与本地插件视图相同的安装流水线，含进度/日志/取消），已安装但浏览器半边未加载时提示刷新页面，已停用时把人送到「已安装」的开关处，宿主不管理插件时给出原因而不提供写入。`dshmarket` 以普通 profile 插件包安装（`dsh plugin --profile desktop add dshmarket` 会自动选进 `dsh.profile.bundles`），桌面应用 profile 已装好（`/dsh-market/status` 返回 `version` 与 `installed`），后续更新由市场自己的更新入口完成，本包不锁定版本；Agent Note 见 `.agents/notes/implemented/feature/2026-10-31-plugin-market-subtab.md`。
- **「我的专家」新建远程专家接入 SDKWork Agents 的创建流程**：`ui-sdkwork-markets` 新增 `expertsHost.tsx` 宿主适配器，把 Agents / Memory / Voice / Skills / Knowledgebase / Drive 六个生成客户端绑定到活动网关与 IAM 会话（未登录时请求在登录闸口等待），随环境变化重建并向创建入口上报网关就绪状态；「创建专家」菜单的「新建远程专家」改为打开 `@sdkwork/agents-pc-agents` 的基础信息对话框（名称、头像、类型、简介），成功后以整页替换进入智能体编辑器（系统提示词、模型、记忆、能力、预览调试），编辑器的返回控件回到花名册；本地运行与个人虚拟机两个类型保持原有的引导提示词派发。能力包新增 `./create` 策展子路径导出（基础信息对话框 + 编辑器 + 知识选择适配器绑定），宿主不再经由根 barrel 引入（barrel 顶层实例化的 chat/home 面与 Monaco loader 无法被 tree-shake）；`pnpm-workspace.yaml` 加入六个兄弟成员（agents-pc-agents、agents-pc-chat、models-pc-picker、memory-pc-commons、drive-upload-image-core、drive-pc-upload-image）并补齐 tiptap/emoji-picker-react/Monaco catalog 行；`ui-sdkwork-markets` 的 `tests/**` 移出客户端测试聚合，由包内 `tsconfig.tests.json` 作为该 SDKWork 源闭包的漂移守卫（含单一 React 类型身份与标准套件扩充的合并），并暴露并修复四处潜在类型漂移（`bundleReference` 漏拷 `availability`/`official`、终端标签缺 `commandLine` 行级文案、workspaces 会话流入口经收窄面取用、测试桩的 sessions/workspaces 桩形状落后于 runtime 契约）；`probe-experts-render.mjs` 产物探针同步现代化——仓库根改由 `import.meta.url` 推导（原硬编码机器盘符）、模块表补齐新外部依赖（react-dom、primitives、slots、iam client 桩、is-prop-valid 桩）、槽位注入兼容生成器回调并按 `mode.page` 精确捕获、jsdom 域的 `Event`/`CustomEvent` 进入全局拷贝，退出断言只保留路由契约与崩溃边界（装饰按钮断言随嵌入面 UI 代际退役）。

#### 📦 待办（合并后处理，不在本轮修）

- 插件市场的「插件市场」子 tab 属于 `ui-sdkwork-markets` 的客户端 bundle：已安装的桌面应用（`D:\\programs\\birdcoder` 的 app.asar）仍是旧构建，重新打包安装后该 tab 才会出现；在此之前市场本身已可在刷新页面后从设置（Plugin Market 分区）或已安装插件里的 `dshmarket` 卡片进入。
- 合并后尚未重跑 `pnpm install`：lockfile 已按两侧合并，但 fork 的 SDKWork pin 与上游新增依赖需一次安装核对（`d2f2fb0524` 已把两个 importer 的 react 版本归一）。
- `sidebar.workspaces.session.menu.item` 越权渲染问题已由 `695c1aa8ec` 修掉，仍需跑通 e2e 后确认不存在双渲染或未声明告警。
- `apps/web/tests/menu-material.e2e.ts` 同时保留 fork 的项目行材质断言与上游的像素对比断言，需一次 e2e 运行确认时序互不影响。
- `app-frame.client.spec.tsx` 的布局金样本沿用 fork 的轨道数值；上游新增 `drawer` / `centeredSidebar` 后，窄宽度档位需按合并后的求解结果重新推导。
- `README.md` / `README.zh.md` 的标题配对为合并前既有差异，`doc-sync` 仍会报错，需补齐中文侧后重录。
