# Agent Note: SDKWork 会话头部项目目录 chip 与 git 分支 pill

Status: implemented

[English](2026-09-06-sdkwork-git-branch-pill-and-workspace-chip.md) | 中文

## 问题

对话会话头部仅通过标题面包屑识别会话；会话背后的项目目录（每个会话都已携带的 cwd）在对话开始后便不可见，而项目的 git 状态 — 当前检出哪个分支、有多少未提交内容 — 必须离开应用才能看到。两份参考设计在标题右侧放置文件夹 chip（项目目录名），旁边是分支 pill，点击展开分支 popover：搜索、检出、创建并检出、提交图谱。

## 决策

两个 fork 表面组合进头部行，二者都由已经存在的事实驱动：

- **`ui-sdkwork-conversation-header` 中的项目目录 chip。** surface 组件通过 `useSessions` 全局 standard prop 读取会话 cwd（与 `ConversationRoot` 读取的是同一个 store），在面包屑与操作条之间渲染非交互 chip — 文件夹图标 + `workspaceTitleOf(cwd)` 基名。没有新的 wire 调用、没有新 store：chip 只是客户端从未丢失的 store 行的投影。会话没有 cwd 时（选取工作区前的空白会话）chip 隐藏，头部永远不会为不存在的事实显示占位符。
- **新 `ui-sdkwork-git` client 插件中的 git 分支 pill。** pill 位于 `conversation.session.header.actions` order `-10`（标题簇右侧、会话日志条之前），显示当前检出分支并展开 popover：分支列表（当前分支在前并带未提交计数行）、搜索过滤、创建并检出，以及 Git 图谱。popover portal 渲染并用共享原语定位（`useAnchoredPosition`、`useDismissOnOutsidePointer`），直接继承外壳的浮动层行为而无需重写几何逻辑。图谱与创建都是产品弹窗而非 popover 视图：图谱打开居中的屏幕自适应 `Modal`（宽高各占视口 70%），带吸顶的 图/描述/日期/作者/提交 列头、引用徽标、刷新按钮，以及客户端由日志行父拓扑计算的 SVG 泳道图（gitk 式：第一父提交沿节点泳道延续，其余父提交取空闲泳道或汇入已承载泳道）；创建并检出打开居中的表单弹窗。因此宿主日志携带父拓扑与引用装饰（%D 对照 `refs/remotes` 分类，HEAD 由 rev-parse 归属）而非 ASCII 图谱文本——拓扑而非字符画才是 wire 事实。

宿主侧是标准能力 seam，完全对照 `sdkwork-app-build`：`packages/host/sdkwork-git` 是 seam 服务，`packages/api/sdkwork-git-controller` 是 Typert Remote。本仓库选择 **simple-git** 作为专业本地 git 库：它驱动已安装的 git CLI（完整协议支持、真实世界的边界行为、无需重写底层实现），并带每次调用的子进程超时。服务每次调用无状态 — 每个请求构建绑定到解析目录的全新 SimpleGit 句柄 — 且每次调用在运行 git 前先校验绝对路径/存在/是目录与仓库归属。失败是闭集五码词汇（`cwd-unreadable`、`not-a-repo`、`branch-name-invalid`、`checkout-failed`、`command-failed`），由 controller 投影到 `git/*` wire 码；请求形状在 controller 内本地声明，因为 typert 生成器在跨包类型 re-export 上会崩溃（再次沿用 `sdkwork-app-build-controller` 的纪律）。

wire 读取廉价且变更严格由用户发起：项目目录每次变化读取一次状态、popover 每次打开读取一次分支列表、图谱每次打开/刷新读取一次日志，检出/创建只来自显式点击。缺失分支的检出在切换前由宿主确认，UI 永远不会看到原始 git 输出。没有 controller 的组合会挂载插件但永不渲染 pill（`remote.sdkworkGit` 缺失 → 不注册），与 `ui-sdkwork-deploy` 隐藏其构建按钮的方式一致。

## 考虑过的替代方案

- **裸 `child_process` git 调用。** 拒绝：simple-git 的选项处理（baseDir、超时、config）、错误类型与解析工具，正好删除了本仓库倾向购买而非手写的子进程管线。
- **isomorphic-git（纯 JS）。** 对已经自带 git 的宿主拒绝：CLI 二进制实现了每种协议与边界行为，纯 JS 重实现会与用户自己的 git 所见产生分歧。
- **为 chip 新增头部 slot。** 拒绝：chip 是会话 store 行的投影，不是插件贡献的内容；直接放在 surface 组件里保持一次 store 读取、零新契约。
- **定时器轮询/刷新状态。** 拒绝：状态读取会派生子进程；刷新只发生在能改变答案的事件上（项目目录变化、操作后关闭 popover）。
- **以 ASCII 图谱文本作为 wire 事实。** 图谱成为产品弹窗后拒绝：客户端需要拓扑与装饰分类来绘制泳道与徽标，宿主日志改为携带父提交与分类装饰而非字符画。

## 后果

- controller 的 wire 词汇（`packages/api/sdkwork-git-controller/src/types.ts`）与 seam 类型结构镜像；seam 类型变更必须在同一次变更中更新 controller 副本。
- 未出生仓库（尚无提交）中 HEAD 无法解析，`status` 失败，pill 隐藏。一等的「尚无提交」状态暂缓。
- popover 仅列出本地分支；远程跟踪分支与感知 stash 的检出暂缓。图谱弹窗渲染最近窗口（至多 200 行）；翻页加载更早历史与提交详情面板暂缓。
- web-app bundle 新增三行（`sdkwork-git`、`sdkwork-git-controller`、`ui-sdkwork-git`）；desktop 外壳经 web-app 基础层继承。
