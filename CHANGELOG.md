# BirdCoder 更新日志

本文件只记录**当前版本**——`##` 标题就是本次发布打的 tag，不累积历史版本条目；往期条目随各自版本的提交保留在 git 历史里（`git log -p CHANGELOG.md`）。「上游变更」逐字摘自上游该 release 的官方 Release notes（中文部分，英文版见各 Release 页面）；「BirdCoder 本地修改」记录 fork 在该版本上的自有变更（SDKWork 组件、品牌、打包与部署等），不受上游发布节奏影响。

## 0.2.2-alpha.2（上游发布 2026-10-28，本地同步 2026-10-30）

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
- **合并后校验**（`scripts/sync-upstream.sh verify` 全部通过）：19458 个 fork 从未触碰的文件与上游逐字节一致；品牌契约（BirdLogo 消费者 8 处、BirdWordmark 官方位 1 处、桌面窗口图标 1 处、桌面文案无上游产品名）通过；sdkwork 路径 2263 → 2263 未收缩；上游本轮删除的文件无一被 fork 误删。

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

#### 📦 待办（合并后处理，不在本轮修）

- 合并后尚未重跑 `pnpm install`：lockfile 已按两侧合并，但 fork 的 SDKWork pin 与上游新增依赖需一次安装核对。
- `sidebar.workspaces.session.menu.item` 现由上游 `contextMenu.content` 声明，fork 的行内菜单仍按名字渲染该 slot，需跑通 e2e 后确认不存在双渲染或未声明告警。
- `apps/web/tests/menu-material.e2e.ts` 同时保留 fork 的项目行材质断言与上游的像素对比断言，需一次 e2e 运行确认时序互不影响。
- `app-frame.client.spec.tsx` 的布局金样本沿用 fork 的轨道数值；上游新增 `drawer` / `centeredSidebar` 后，窄宽度档位需按合并后的求解结果重新推导。
- `README.md` / `README.zh.md` 的标题配对为合并前既有差异，`doc-sync` 仍会报错，需补齐中文侧后重录。
