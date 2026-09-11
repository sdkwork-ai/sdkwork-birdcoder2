# BirdCoder 更新日志

BirdCoder fork 自 [deepseek-ai/deepseek-harness](https://github.com/deepseek-ai/deepseek-harness)，并按上游 release 持续同步。本日志与上游 release 一一对应：每个 `##` 版本对应上游一个 release（tag `dsh-v<版本>`）。「上游变更」逐字摘自该 release 的官方 Release notes（中文部分，英文版见各 Release 页面）；「BirdCoder 本地修改」记录 fork 在该版本上的自有变更（SDKWork 组件、品牌、打包与部署等），不受上游发布节奏影响。

## 0.1.5-rc.2（上游发布 2026-09-10）

Fork 同步：merge c291e7961a（2026-09-11），134 个上游提交（0.1.5-rc.2 release、Desktop 后端控制器与启动恢复页重构、原生 mock 客户端测试层、composer 命令菜单、会话历史读取器弃用策略、V41 图片 token 估算器、macOS 公证并行化、Windows 未签名打包、Blacksmith CI failover 分支）。上游 Release：[v0.1.5-rc.2](https://github.com/deepseek-ai/deepseek-harness/releases/tag/dsh-v0.1.5-rc.2)。本条目「上游变更」为该 release 官方 notes 中文部分全文。

### 上游变更

#### 体验优化

- 优化反馈提交体验：点赞和点踩均通过弹窗确认后提交，提交失败时保留已填写内容并给出提示。@yixiangihsiang
- 优化交付文件卡片的排版和对话间距，更新代码文件图标，让文件更易辨认、界面更紧凑。@yixiangihsiang

### BirdCoder 本地修改

- **合并方式**：按 fork 契约采用真实双亲合并提交（非 squash），134 个上游提交及其 commit message、作者信息全部保留在历史中；25 个冲突文件按 fork-first 裁决——纯 fork 文件与品牌面保留 fork，upstream 独有改动采纳 upstream，双方都改的文件合并双方行为。
- **BirdCoder 品牌保留**：桌面窗口图标 `resolveWindowIcon(app.getAppPath())`、`app-icon.ts`、`generate-icons.mjs` 全部保留；`electron-builder.config.mjs` 继续以 BirdCoder 品牌配置（`productName: 'BirdCoder'`、`birdcoder-${version}-...` artifactName、三端 `brandIcon` 与 NSIS 图标、图标缺失即打包失败）；上游鱼形 `favicon.svg` 与 `apps/web/public/favicon.svg` 按品牌契约维持删除。
- **桌面设置气泡桥并存**：fork 的 app-window 桥（`pluginsOpen` / `updatesCheckPrompt` / `appQuit`，供 `ui-sdkwork-settings-menu` 使用）与上游新的 shell startup API（locale / backend 状态与重试 / 停用插件 / 重启 / 重置配置）同时存在，`preload-app.ts` 按 `dsh-app://shell` 与 `dsh-app://app` 分派；`main.ts` 在未打包运行时把派生的开发项目路径写回 `DSH_DESKTOP_DEV_PROJECT_DIR`，使插件管理入口在开发态如实显示为不可用。
- **Windows/Linux 不渲染原生菜单**：保留 fork 的 darwin-only 菜单策略（macOS 保留系统菜单栏，Windows/Linux 交由设置气泡承载桌面菜单项），叠加在上游新的 backend 恢复/启动页逻辑之上。
- **Workspace 打开路径能力保留**：`WorkspaceController` 的 `rpc` 注入与 `openPath` / `openTerminal` Host 调用继续保留（上游未改动该处），并叠加上游 connection 插件新增的 `transport?.rpc` 选择；桌面 IPC rpc 分支优先级不变。
- **桌面打包采纳上游新架构**：`resources/dsh` 运行时、`dsh/node_modules` 资源映射、`afterPack`/`afterSign` 运行时校验、`DSH_DESKTOP_UNSIGNED` 未签名 Windows 打包与 `installer.nsh` 全部并入；fork 旧 seed 管线（`prepare-seed.ts`、`seed-store.ts`、`macos-seed-store.ts` 及其测试）随上游架构删除。
- **依赖图保留 fork 解析**：`pnpm-lock.yaml` 以 fork 为准（React 19、Monaco、msgpackr 等），并补入上游新增的 `@electron/osx-sign` 补丁记录；`patchedDependencies` 四项目前为 electron-updater / osx-sign / node-pty / yao-pkg。
- **双语配对记录重算**：`apps/desktop`、`docs/architecture`、`app-boot`、`client`、`ui-conversation` 五对 README 的 `.i18n.yaml` 按合并后正文重新记录；顺带修正 `app-boot/README.zh.md` 中一条被粘连到下一行的 bullet，使中英结构对齐。
- **遗留项**：`ui-sdkwork-updater` 的 `'desktop'` settings 命名空间迁移仍待办（沿用 rc.1 遗留项）；`verify-translation-pairing` 对 `docs/runbooks` 与若干 `ui-sdkwork-*` 包仍报存量漂移，与本次合并无关。

## 0.1.5-rc.1（上游发布 2026-09-10）

Fork 同步：merge aa8262ec09（2026-09-10），26 个上游提交（0.1.5-rc.1 release、V41 Flash 模型目录、Sidebar 预览修复、README 双语校对、BibTeX 引用）。上游 Release：[v0.1.5-rc.1](https://github.com/deepseek-ai/deepseek-harness/releases/tag/dsh-v0.1.5-rc.1)。本条目「上游变更」为该 release 官方 notes 全文（汇总自 v0.1.2-rc.1 以来的用户与开发者相关变更，与 alpha.1/alpha.2 条目存在官方口径内的重叠）。

### 上游变更

作为 `0.1.5` 系列的首个候选版本，本版本汇总了自 `v0.1.2-rc.1` 以来的主要用户和开发者相关变更。

#### 新增功能

- DeepSeek 模型适配器新增 `DeepSeek-V41-Flash`（`deepseek-flash`）支持文本、图片及会话历史中的系统提示词更新。新会话默认使用该模型，配置文件显式指定模型时以配置值为准。 @LegGasai
- Web 支持上传任意类型的通用文件：文件与图片可在同一预览区混排，后台上传支持进度、取消与会话切换续显，模型可通过已保存路径使用现有文件工具按需读取。 @CreatixChu
- 可继续对话的子代理支持消息排队、编辑、删除、单条或全部 Steer 与停止操作；排队消息发送期间显示"发送中"，并暂不可编辑、删除或 Steer。 @Dudu-0223, @LegGasai
- 支持动态修改系统提示词且不破坏 KV Cache，模型需显式声明支持。 @tianyicui
- Web 右侧 Sidebar 支持多标签、分栏、全屏以及 Markdown、代码、HTML、PDF 和图片预览，包括子代理和未激活会话的文件；模型可显式交付文件，并可在 Sidebar 中预览、用默认应用打开或在文件管理器中定位。原 Detail 面板已移除。 @imccyu, @Yifffan, @yixiangihsiang, @CreatixChu, @yudshj
- 模型探测新增对自定义模型提供商 `models` 对象和 Anthropic 原生模型列表的支持，并支持回填模型名称、上下文窗口及最大输出 token 的回填。 @LegGasai
- 所有出站网络请求都会遵循启动环境中的 `HTTP_PROXY`、`HTTPS_PROXY`、`ALL_PROXY` 与 `NO_PROXY` 配置。 @LegGasai
- Web 顶栏新增"在应用中打开"，可用已安装的编辑器、IDE、终端或文件管理器等打开 Workspace。 @yixiangihsiang
- 反馈可独立提交，无需继续对话；`/feedback` 命令支持提交明细反馈内容，提交时附带相关会话内容。 @tianyicui, @Chinesezjc, @CreatixChu

#### 体验优化

- Web 可直接显示顶层及 PTC 嵌套 `read_image` 的图片结果，以及模型回复中引用的 POSIX 绝对路径本地图片，包括工作区外截图；加载失败时显示替代文字或原路径。 @Chinesezjc, @kermanx
- Skill 选择器支持模糊搜索；优化聊天气泡中的的 Skill 和命令引用。 @LegGasai
- 调整会话内可点击链接的颜色、hover/focus 样式和分类图标，优化 Markdown 链接、文件引用、网页来源、产物链接与 Workflow 成员链接的辨识度。 @yixiangihsiang
- Windows 上的本地非终端子进程不再弹出控制台窗口。 @turtle1999
- Agent Team 的 `send_message` 统一采用 steer 语义，并在跨 Agent 和冷恢复投递中保留发送者归属与顺序。 @Dudu-0223
- 改善长会话打开、恢复和持续对话时的卡顿，降低内存占用。 @imccyu, @tianyicui, @Dudu-0223
- 引用较长会话时，模型可按需读取预览中未展示的内容。 @tianyicui
- 改善设置面板的标签、开关状态样式，改善浅色和深色主题下的显示效果，改善本地化与可访问性 @LegGasai, @turtle2099
- PTC 模式下支持展开查看命令及其输出。 @tianyicui
- 改善 Web 输入框的菜单层级、提示文字和间距；会话统计改为两个可展开的摘要，分别查看轮次与速度、精确 Token 用量与缓存命中。 @Yifffan
- 内置斜杠命令说明支持中文，并随界面语言即时更新；切换语言时保留已打开菜单和查询内容。 @Kaige-Gao

#### 问题修复

- 用户在 Web 中暂停目标会立即终止当前模型轮次，且模型不能自行恢复；恢复必须由用户触发，尚未激活的目标也显示恢复入口。 @mektpoy
- 修复 DeepSeek 流式工具调用的续传分片用空值覆盖调用 ID 或名称的问题，避免工具以空名称失败并写入无法重新打开的会话记录。 @LegGasai
- 修复 Python SDK 单文件 runtime 将 Bash 中以 `node` 开头的命令错误重写为 dsh runtime 的问题。 @imccyu
- 修复从会话搜索结果进入会话后仍停留在搜索界面的问题；目标会话会在所属 Workspace 中展开并滚动到可见位置。 @Dudu-0223
- 修复 Windows 盘符根目录 Workspace 的路径分隔符、标题与绝对路径校验，确保盘符根目录可以正常使用。 @turtle1999
- 修复 Web 断线后无法自动恢复的问题。 @LegGasai
- 修复发送消息或调整窗口后，聊天不再自动滚动到底部的问题。 @tianyicui
- 修复 Windows 上 Python SDK 运行时可能出现的启动崩溃。 @tianyicui
- 修复会话运行中发送按钮与 Enter 的行为不一致：两者均遵循"繁忙时的发送行为"设置，并明确提示排队或插话发送。 @lsdsjy
- 拒绝不含正文或附件的空消息及空白队列编辑，保留仅发送图片或文件的能力。 @turtle1999
- 修复查找项目根目录遇到权限或 I/O 错误时误用上级项目指令的问题，相关错误会直接报告。 @turtle1999
- 修复折叠的思考摘要直接显示 Markdown 加粗标记的问题，展开内容保持完整。 @turtle1999
- 修复模型目录变化后失效的 pi-ai 配置导致整个模型设置入口消失的问题；错误项保留诊断和修复入口 @LegGasai
- 在发现模型或创建自定义 provider 前校验并规范化 Base URL，并直接提示无效地址。 @turtle2099
- 修复 Windows Web 界面的原生文件夹选择器可能在其他窗口后方打开的问题。 @Elevator14B
- 修复在 Composer 中输入空白字符后占位提示仍然显示的问题。 @CreatixChu
- 修复工具筛选后的子代理仍收到不可用文件和 Web 工具指导的问题。 @koalazf99
- 拒绝 MCP 工具发现中的重复分页游标，避免启动或同步持续等待，并保留上一组可用工具。 @grllll

#### 其他变更

- **会话数据格式升级至 V3：** 受支持的旧日志通过版本迁移生成新版日志并保留原文件，升级后的会话不支持降级读取。自定义日志读取器需适配 V3，跨版本迁移细节见 session-format-v2-to-v3/README.md。 @tianyicui, @Magolor, @imccyu
- **Session 生命周期变更：** Session persistence API 改为由生命周期持有的 `SessionHandle`；`agentLoop.create()` 改为异步，新增session锁，同一session至多被一个进程持有。 @turtle1999, @imccyu
- **默认工具调整：** SDK、Headless 和 ACP 默认使用 read、write、edit 编辑文件；Web `minimal` 与 Python `sdk-minimal` 默认仅提供持久 shell，`str_replace_editor` 需显式启用，持久 Bash 输出统一报告退出或超时状态。 @koalazf99
- 改善 Windows 和部分 Linux 环境下普通子进程的清理，减少任务停止后的后台进程残留；普通 subprocess handle 不再暴露 pid，终端 handle 不受影响。 @pku-xht
- 统一未观察文件写入与编辑失败的 `FS_NOT_OBSERVED` 诊断，保留文件路径、结构化错误码和原始原因。 @turtle1999
- Python SDK 新增 macOS x64 runtime wheel，可在 Intel 架构的 Mac 上安装并运行随包 runtime。 @koalazf99
- 升级 pi-ai 版本至 0.85.1 @tianyicui
- 可选子代理插件的内置运行时升级至 Codex 0.153.4 和 Claude Code 2.1.263；显式模型配置保持不变，未配置模型时 Codex 使用上游默认值。 @koalazf99
- 自定义 persona 配置拆分为前缀和后缀，旧配置及相关常量需要适配。 @tianyicui
- **插件 Agent API 调整：** 移除 `ctx.agent`，调用方需显式传递 Agent；同时修正可继续对话的子代理归属，避免它们被当作根会话参与定时调度。 @kermanx
- **Inbox API 调整：** `Inbox` 改为类型接口，不再导出可构造的运行时类；插件通过 `agent.inbox` 读写待处理消息，`hasPending` 与 `claim` 不再属于公共接口。 @kermanx
- **Web 插件面板 API 调整：** 插件可通过 `sidebar.panellist` 与 `main` 注册全局面板；原 `conversation` Slot 迁移为 `main` 的 `conversation` key @imccyu
- 实验性 Agent Teams 包现可从 npm 安装；用户需显式添加 profile，不默认启用 @imccyu

### BirdCoder 本地修改

- **apps/ 对齐 upstream 0.1.5-rc.1 架构**（chore 54561513cf）：上游在本版本重写了应用层，fork 补齐此前合并中被保旧的全部架构更新——`apps/desktop` 采纳"隔离 pnpm 运行时"新桌面架构（host-process/host-protocol IPC、project-manager、update-coordinator、TS 化打包/上传/签名脚本、electron-builder.config.mjs），删除旧 in-process 壳（tray、desktop-settings、console-host、run-desktop 等）；`apps/web` 采纳上游 vite/tsconfig/package 基线；`apps/cli` 采纳上游 bin.ts/README。回归验证全绿：三 app `tsc -b` 通过、desktop 18 文件 83 用例通过、web 构建成功。
- **BirdCoder 品牌保留**：desktop `build/icon.{ico,icns,png}` 鸟图标保留，`electron-builder.config.mjs` productName/artifactName 设为 BirdCoder；web 端 `favicon.png`（鸟）、`index.html`（zh-CN/BirdCoder 标题）、manifest 品牌行保留，上游鱼形 `favicon.svg` 按品牌契约排除。
- **desktop 应用图标修复**：上游重写窗口创建时丢掉了窗口 `icon` 参数与 `generate-icons` 脚本，`build/icon.png` 也不再随包分发，未打包窗口（`dev:desktop`）因此回落到 Electron 默认图标。现恢复图标生成管线（以规范位图 `apps/web/public/favicon.png` 生成三端图标）、`apps/desktop/src/app-icon.ts` 窗口图标接线、electron-builder 三端与 NSIS 显式图标路径及"图标缺失即打包失败"检查，并补充 `apps/desktop/tests/app-icon.spec.ts` 回归用例。
- **sdkwork 接线重叠加**：`apps/cli` bin.ts 恢复 launch-env + bootstrap-token 引导；`apps/web` vite.config 恢复 env-bootstrap 构建环境、tailwind 管线与 WEB_SOURCE_ALIASES（rail tooltip、IAM token manager、sdk-common 钉源）；fork e2e 用例（ui-sdkwork-iam、app-modes、settings-menu）与 `vite-source-aliases.ts` 保留；pnpm-lock 按新依赖集重解析。
- **遗留项**：`ui-sdkwork-updater` 的 `'desktop'` settings 命名空间注册待迁移到新 `DESKTOP_IPC` 面（上游新桌面由 update-coordinator 自管更新行为）。

## 0.1.5-alpha.2（上游发布 2026-09-09）

Fork 同步：merge b2e3b2a012（2026-09-10），一并带入 0.1.3-alpha.2 与 0.1.5-alpha.1，共 1141 个上游提交。上游 Release：[v0.1.5-alpha.2](https://github.com/deepseek-ai/deepseek-harness/releases/tag/dsh-v0.1.5-alpha.2)

### 上游变更

#### 新增功能

- 右侧 Sidebar 新增常见文档类型预览，支持 Markdown、代码高亮、HTML、PDF 、图片 @imccyu, @Yifffan, @yixiangihsiang, @CreatixChu, @yudshj
- 支持模型显式在会话中交付文件，并支持在右侧 Sidebar 预览、用默认应用打开、在文件管理器中定位 @yudshj, @CreatixChu
- `/feedback` 命令新增支持提交明细反馈内容 @CreatixChu

#### 问题修复

- 修复模型目录变化后失效的 pi-ai 配置导致整个模型设置入口消失的问题；错误项保留诊断和修复入口 @LegGasai
- 在发现模型或创建自定义 provider 前校验并规范化 Base URL，并直接提示无效地址。 @turtle2099
- 修复 Windows Web 界面的原生文件夹选择器可能在其他窗口后方打开的问题。 @Elevator14B
- 修复在 Composer 中输入空白字符后占位提示仍然显示的问题。 @CreatixChu
- 修复工具筛选后的子代理仍收到不可用文件和 Web 工具指导的问题。 @koalazf99
- 拒绝 MCP 工具发现中的重复分页游标，避免启动或同步持续等待，并保留上一组可用工具。 @grllll
- 修复 npm 安装需要依赖 `fs-ext` 本地编译的问题 @imccyu

#### 体验优化

- 改善设置界面的本地化与可访问性：设置入口补充本地化无障碍名称，中文显示对话模式与内置模型说明 @turtle2099

#### 其他变更

- Session 数据格式当前为 V3 版本，跨版本迁移细节见 [session-format-v2-to-v3/README.md](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.1.5-alpha.2/packages/session/session-format-v2-to-v3/README.zh.md) @tianyicui
- **Web 插件面板 API 调整：** 插件可通过 `sidebar.panellist` 与 `main` 注册全局面板；原 `conversation` Slot 迁移为 `main` 的 `conversation` key @imccyu
- **极简模式默认工具调整：** Web `minimal` 与 Python `sdk-minimal` 默认仅提供持久 shell，`str_replace_editor` 改为显式启用；持久 Bash 输出统一报告退出或超时状态 @koalazf99
- 实验性 Agent Teams 包现可从 npm 安装；用户需显式添加 profile，不默认启用 @imccyu

### BirdCoder 本地修改

- 本次合并延续 fork-first 冲突规则：SDKWork 专有包全量保留，上游专有文件全量采纳，双侧修改的文件合并双方行为；`package.json` 版本行采纳上游（根版本随上游 0.1.5-alpha.2），CI 分支名与发布产物保持 fork 事实（`main`、`birdcoder-v*`、桌面应用）。
- 合并前核验 BirdCoder 品牌契约：`FishLogo` 仅存于 `ui-primitives`（上游组件本体与测试），全部 fork 渲染面渲染 `BirdLogo`；`website/` 继续链接 `favicon.png`；RailTooltip 四点接线（`PLATFORM_MODULES` 行、`seed.ts` 静态导入、`vite-source-aliases.ts`、包 `exports`）计数全部正确。
- 合并后的本地收尾：清理残留的 `css-modules.d.ts` 声明文件，补齐 `ui-sdkwork-*` README 前言，对齐桌面 agent preset 描述，扩充应用入口白名单（fork 桌面启动器）。
- 本地部署调整：k8s 与 topology 环境新增本地多品牌 allowed-origins；第三方 notices 扫描改为 sibling 感知。
- 注：上游在 0.1.5-alpha.2 中撤回了 Mermaid/Graphviz/SVG/HTML 代码围栏预览，本版本不含该功能。

## 0.1.5-alpha.1（上游发布 2026-09-08）

Fork 同步：随 0.1.5-alpha.2 一并带入（merge b2e3b2a012，2026-09-10）。上游 Release：[v0.1.5-alpha.1](https://github.com/deepseek-ai/deepseek-harness/releases/tag/dsh-v0.1.5-alpha.1)

### 上游变更

#### 新增功能

- 支持动态修改系统提示词且不破坏 KV Cache，模型需显式声明支持 @tianyicui
- 新增实验性右侧 Sidebar，支持多标签、分栏与全屏；聊天文件链接和产出文件支持 Sidebar 打开，并移除原 Detail 面板 @imccyu

#### 体验优化

- 改善 Web 输入框的菜单层级、提示文字和间距；会话统计改为两个可展开的摘要，分别查看轮次与速度、精确 Token 用量与缓存命中。 @Yifffan
- 内置斜杠命令说明支持中文，并随界面语言即时更新；切换语言时保留已打开菜单和查询内容。 @Kaige-Gao
- 可选子代理插件的内置运行时升级至 Codex 0.153.4 和 Claude Code 2.1.263；显式模型配置保持不变，未配置模型时 Codex 使用上游默认值。 @koalazf99

#### 问题修复

- 修复会话运行中发送按钮与 Enter 的行为不一致：两者均遵循“繁忙时的发送行为”设置，并明确提示排队或插话发送。 @lsdsjy
- 修复模型可自行恢复用户已暂停目标的问题；暂停后须由用户恢复，尚未激活的目标也会显示恢复入口。 @mektpoy
- 修复聊天中本地图片路径无法显示的问题，支持模型回复引用的 POSIX 绝对路径图片，包括工作区外截图；加载失败时显示替代文字或原路径。 @kermanx
- 拒绝不含正文或附件的空消息及空白队列编辑，保留仅发送图片或文件的能力。 @turtle1999
- 修复查找项目根目录遇到权限或 I/O 错误时误用上级项目指令的问题，相关错误会直接报告。 @turtle1999
- 修复折叠的思考摘要直接显示 Markdown 加粗标记的问题，展开内容保持完整。 @turtle1999
- 修复 macOS 和 Linux 依赖 `fs-ext` 需要本地编译的问题 @imccyu

#### 其他变更

- **会话格式升级至 V3：** 恢复受支持的历史会话时生成新版日志并保留原文件，系统提示词纳入消息历史，旧 PTC 事件与 `code` 预设引用自动迁移。自定义日志读取器需适配新格式；升级后的会话不支持降级读取。 @tianyicui
- **插件 Agent API 调整：** 移除 `ctx.agent`，调用方需显式传递 Agent；同时修正可继续对话的子代理归属，避免它们被当作根会话参与定时调度。 @kermanx
- **Inbox API 调整：** `Inbox` 改为类型接口，不再导出可构造的运行时类；插件通过 `agent.inbox` 读写待处理消息，`hasPending` 与 `claim` 不再属于公共接口。 @kermanx

## 0.1.3-alpha.2（上游发布 2026-09-07）

Fork 同步：随 0.1.5-alpha.2 一并带入（merge b2e3b2a012，2026-09-10）。上游 Release：[v0.1.3-alpha.2](https://github.com/deepseek-ai/deepseek-harness/releases/tag/dsh-v0.1.3-alpha.2)

### 上游变更

#### 新增功能

- 升级 pi-ai 到 0.85.1，支持新模型。 — @tianyicui
- Web 顶栏新增“在应用中打开”，可用已安装的编辑器、IDE、终端或文件管理器等打开 Workspace。 — @yixiangihsiang
- 可继续对话的子代理支持消息排队、编辑、删除、单条或全部 Steer，以及停止操作。 — @Dudu-0223
- PTC 模式下支持展开查看命令及其输出。 — @tianyicui

#### 问题修复

- 修复 Web 断线后无法自动恢复的问题。 — @LegGasai
- 修复发送消息或调整窗口后，聊天不再自动滚动到底部的问题。 — @tianyicui
- 修复 Windows 上 Python SDK 运行时可能出现的启动崩溃。 — @tianyicui
- 改善 Windows 和部分 Linux 环境下的进程清理，减少任务停止后的后台进程残留。 — @pku-xht

#### 体验优化

- 改善长会话打开、恢复和持续对话时的卡顿，降低内存占用。 — @imccyu, @tianyicui, @Dudu-0223
- 引用较长会话时，模型可按需读取预览中未展示的内容。 — @tianyicui
- 排队消息新增“发送中”提示，发送完成前暂不可编辑、删除或 Steer。 — @LegGasai
- 统一设置面板中标签、开关和插件状态的样式，改善浅色和深色主题下的显示效果。 — @LegGasai
- 反馈可独立提交，无需继续对话；提交时会附带相关会话内容，普通聊天不会触发这类上报。 — @tianyicui, @Chinesezjc

#### 其他变更

- **默认工具调整:** SDK、Headless 和 ACP 默认使用 read、write、edit 编辑文件；Web minimal 和 sdk-minimal 保持不变。 — @koalazf99
- 自定义 persona 配置拆分为前缀和后缀，旧配置及相关常量需要适配。 — @tianyicui
- 普通 subprocess handle 移除 pid；终端 handle 不受影响。 — @pku-xht

## 0.1.3-alpha.1（上游发布 2026-09-04）

Fork 同步：merge d347e70390（2026-09-05）。上游 Release：[v0.1.3-alpha.1](https://github.com/deepseek-ai/deepseek-harness/releases/tag/dsh-v0.1.3-alpha.1)

### 上游变更

#### 新增功能

- Web 支持上传任意类型的通用文件：文件与图片可在同一预览区混排，后台上传支持进度、取消与会话切换续显，模型可通过已保存路径使用现有文件工具按需读取。 @CreatixChu
- 所有出站网络请求都会遵循启动环境中的 `HTTP_PROXY`、`HTTPS_PROXY`、`ALL_PROXY` 与 `NO_PROXY` 配置。 @LegGasai
- Python SDK 新增 macOS x64 runtime wheel，可在 Intel 架构的 Mac 上安装并运行随包 runtime。 @koalazf99
- `read_image` 的顶层与 PTC 嵌套工具调用会在 Web 工具卡中直接渲染图片，不再展示原始附件对象。 @Chinesezjc
- 模型探测新增对自定义模型提供商 `models` 对象和 Anthropic 原生模型列表的支持，并支持回填模型名称、上下文窗口及最大输出 token 的回填。 @LegGasai

#### 问题修复

- 在 Web 中手动暂停目标会立即终止当前模型轮次，避免运行中的模型继续执行或在同一轮恢复目标。 @mektpoy
- 修复 DeepSeek 流式工具调用的续传分片用空值覆盖调用 ID 或名称的问题，避免工具以空名称失败并写入无法重新打开的会话记录。 @LegGasai
- 修复 Python SDK 单文件 runtime 将 Bash 中以 `node` 开头的命令错误重写为 dsh runtime 的问题。 @imccyu
- 修复从会话搜索结果进入会话后仍停留在搜索界面的问题；目标会话会在所属 Workspace 中展开并滚动到可见位置。 @Dudu-0223
- 修复 Windows 盘符根目录 Workspace 的路径分隔符、标题与绝对路径校验，确保盘符根目录可以正常使用。 @turtle1999
- 修复 Session 缓存读取问题。 @imccyu

#### 体验优化

- Skill 选择器支持模糊搜索；优化聊天气泡中的的 Skill 和命令引用。 @LegGasai
- 统一会话内可点击链接的颜色、hover/focus 样式和分类图标，优化 Markdown 链接、文件引用、网页来源、产物链接与 Workflow 成员链接的辨识度。 @yixiangihsiang
- 统一未观察文件写入与编辑失败的 `FS_NOT_OBSERVED` 诊断，保留文件路径、结构化错误码和原始原因。 @turtle1999
- Windows 上的本地非终端子进程不再弹出控制台窗口。 @turtle1999
- Agent Team 的 `send_message` 统一采用 steer 语义，并在跨 Agent 和冷恢复投递中保留发送者归属与顺序。 @Dudu-0223

#### 其他变更

- **破坏性变更：**Session persistence API 改为由生命周期持有的 `SessionHandle`；`agentLoop.create()` 改为异步，新增session锁，同一session至多被一个进程持有。 @turtle1999
- Session format 升级至 v2：旧 v0/v1 日志通过不可变的相邻 generation 迁移到当前格式，Assistant 流按 attempt 聚合进持久化 settlement，同时 Web 保持实时增量显示。 @tianyicui
- 已知的性能缺陷：本版本存在一项已知的性能回退，可能影响部分历史session加载的响应速度；我们将在下一个版本中修复。

### BirdCoder 本地修改

- **打包闭包修复**：`check:pack-deps` 报告 apps/desktop 缺少 6 个工作区依赖，通过 `sync-pack-deps --write` 同步到 `package.json`（`dsh-client-file-upload`、`dsh-sdkwork-api-gateway`、`dsh-session-format` 及其目录），闭包校验恢复通过。
- **桌面宿主启动修复**：`sdkwork-api-gateway` 的 tsdown 配置新增 `alwaysBundle` 模式内联 `@deepseek-ai/dsh-client-connection/src/` 导入，避免 Node.js ESM 加载器因 `.ts` 源文件扩展名拒绝加载导致桌面宿主启动失败（`ERR_UNKNOWN_FILE_EXTENSION`）。
- **Electron ABI 兼容性修复**：`session-persistence-jsonl` 将 `fs-ext` 的静态导入改为 POSIX 锁路径内的延迟加载，避免 Electron 因 Node ABI 不匹配（127 vs 133）导致 `ERR_DLOPEN_FAILED` 崩溃。
- **WebWorker 打包修复**：`webworker-packer` 的 tsdown 配置同样新增 `alwaysBundle` 模式内联实验性运行时的 `/src` 导入，防止运行时扩展名错误。
- **connection 包 tsdown 路径修正**：`client/connection/tsdown.config.ts` 从字符串条目切换到对象条目形式（`{ index, desktop }`）并改用源码入口 `src/client/desktop-bridge.ts`，使 tsdown 输出 `lib/index.js` 和 `lib/desktop.js`。原来的条目形式在 CI 并行构建下有 tsc 竞态（`lib/types/desktop.js` 未产出就被 tsdown 编译），且字符串条目会让 tsdown 在 lib/ 下保留 `src/client/` 段（产出 `lib/src/client/desktop-bridge.js`）——package.json files 字段会丢弃该产物，从而导致打包启动探针因 `ERR_MODULE_NOT_FOUND` 失败。
- **typert lookup/host-context 注册幂等化**：`typert/registry` 的 `configure()` 与 `configureHost()` 在遇到已注册的重复键时从抛出改为返回 no-op disposer。桌面启动烟雾探针在同一 Electron 进程内 boot 两次（干净安装 + 已有机器重启）。当第一棵树的 `fiber.dispose()` 异步清理未跑完，第二棵树就构造 `SessionController`（它注册 `agent`/`session` 解析器），会触发 `typert: lookup "agent" resolver is already configured` 并中止第二次启动。幂等化后第二次注册复用已有条目，真实冲突键（不同 key）仍正常拒绝。

## 0.1.2-rc.1（上游发布 2026-09-03）

Fork 同步：merge 71928b6624（2026-09-04），一并带入 0.1.2-alpha.2 至 0.1.2-alpha.5。上游 Release：[v0.1.2-rc.1](https://github.com/deepseek-ai/deepseek-harness/releases/tag/dsh-v0.1.2-rc.1)

### 上游变更

作为 0.1.2 系列的首个候选版本，本版本汇总了自 v0.1.1-rc.2 以来的主要用户和开发者相关变更。

> oh-my-dsh 开源社区推出了帮助插件作者随着 DSH 版本升级插件代码的 skill： https://github.com/oh-my-dsh/dsh-plugin-upgrade-skill. 欢迎 DSH 插件作者试用并参与开源共建。oh-my-dsh 与 DeepSeek AI 没有隶属关系，相关项目非 DeepSeek 官方出品。

#### 新增功能

- 会话流默认在每个已完成回答前折叠过程内容，并默认折叠的「System prompt」 @07akioni, @lsdsjy
- 会话流正文宽度可自适应或拖拽调整 @yixiangihsiang
- 回答末尾显示 token 用量和耗时，可展开查看精确用量与详细统计 @hypatiamay, @ZiyaZhang, @Yifffan
- 会话视图提供覆盖完整历史的回合导航，可预览并跳转尚未载入的轮次 @LegGasai
- 统一界面次级文字层级，会话流支持字号调节，Markdown 表格随正文字号缩放 @yixiangihsiang
- 插件支持在模型设置页添加提供方登录配置 @LegGasai
- 界面支持第三方语言，并统一权限分类和标签的本地化表达 @tianyicui, @LegGasai, @imccyu, @ZiyaZhang
- 子代理模型选择支持 Agent 在授权范围内自主选择，也支持调用方指定提供方、模型、推理力度和最大输出长度，以及为 Claude Code、Codex 配置模型 @Dudu-0223, @pku-xht
- Python SDK runtime 新增 Windows x64 发行包 @tianyicui
- ACP 补齐标准会话控制、模型设置、MCP、权限和取消能力 @tianyicui, @pku-xht
- DeepSeek 官方适配器默认随请求提供已启用插件的包名和版本，可在配置中关闭 @tianyicui
- DeepSeek 官方适配器新增可选的 Session 日志增量上传，默认关闭 @tianyicui
- 新增实验性 Inspector 工具 @imccyu
- 新增实验性 Web Preview @imccyu
- 界面显示连接状态，容忍短暂服务端卡顿，并支持连接中断后的自动重试或立即重连 @imccyu
- 会话标题区域支持在不同视口宽度下查看活动的定时计划 @pku-xht
- 父 Agent 与可持续子 Agent 可通过 `send_message` 双向传递后续消息，取代单向 `report` 工具 @Dudu-0223

#### 体验优化

- 减少页面启动和会话初始化中的代码加载、数据传输与解析开销 @lsdsjy, @imccyu, @Kingwl, @kermanx
- 改善会话记录占用的磁盘空间 @Magolor
- 优化 `/` 与 `@` 菜单的图标、目录加载和文件搜索，支持通过鼠标在目录层级间导航 @Yifffan, @LegGasai
- 会话运行中存在草稿时主按钮切换为「发送」，消息排队发送 @lsdsjy
- 输入框中的文件和会话引用在相邻文字编辑后仍保持有效 @LegGasai
- 切换会话后仍保留未提交的提问卡片草稿 @LegGasai
- 会话流中的流式回复代码块在生成期间持续显示语法高亮 @07akioni
- 会话流中的提问历史显示为可读的问答卡片，并标明取消或中断后的未提交状态 @LegGasai
- 图片发送后立即显示，压缩和上传在后台继续 @CreatixChu
- 上下文压缩会计入图片占用 @CreatixChu
- 轨迹视图支持展示用户、助手和工具结果中的图片 @CreatixChu
- 在本地文件系统模式下，模型可定位上传图片，并通过 `read_image` 读取没有扩展名的附件路径 @CreatixChu
- 调整图片压缩策略，压缩更快、上传体积更小，并改善超长截图的清晰度 @CreatixChu
- 会话日志截断尾部自动修复时输出警告并注明受影响会话 @turtle1999
- 插件列表按会话插件和全局插件分组，可切换 Agent Preset 查看组合、搜索其他预设 @LegGasai
- 改善会话与输入界面的菜单显示、滚动条、工具文件链接与 diff 统计 @Yifffan
- 减少 macOS 和 Linux 加载会话时不必要的文件系统检查 @LegGasai
- 提升长会话和密集实时消息的处理效率，降低内存占用以及流式回复、代码高亮、布局和导航预览的渲染开销 @Dudu-0223, @imccyu, @07akioni
- `web_search` 失败时报告实际端点和错误明细 @CreatixChu
- 调整首页标志的动画效果 @Yifffan
- 自定义模型发现复用 Profile 请求头；模型目录支持搜索和筛选 @LegGasai

#### 问题修复

- 修复 macOS 和 Linux 上持久 PowerShell 启动过早、输出不完整的问题 @tianyicui
- 修复 Linux 持久 Bash 在管道内部读取时提前返回空输出的问题 @LegGasai
- 修复 Bash 命令派生大量子进程时 macOS 宿主卡顿的问题 @LegGasai
- 修复 Windows 目录选择器截断含「开」等特定编码字符路径的问题 @tianyicui
- 修复会话视图中持久 Bash 与 PowerShell 结果无法展开的问题 @LegGasai
- 修复 Profile 配置的 Agent Preset 目录在启动时丢失的问题 @LegGasai
- 无法加载的 Agent Preset 会提前标记，并在切换失败时说明原因 @LegGasai
- Minimal preset 不再显示不适用的 `/goal` 命令 @Magolor
- 文件编辑工具接受当前操作未使用字段的 `null` 占位值 @lsdsjy
- PTC Mode 的 SDK 功能只能通过 `run_code` 调用，不再被模型当作普通工具直接调用 @CreatixChu
- 网关定期发送 WebSocket 心跳，避免空闲连接中断 @lsdsjy
- 修复新建空会话挤掉 Workspace 折叠列表已有会话的问题 @lsdsjy
- 修复系统提示词 workflow 分区顺序 @LegGasai
- 优化 NPM 包中的 peer dependency 依赖以改善包管理解析成本 @imccyu
- 修复 Node.js 24.0–24.11.1 上启动可能失败且 HMR 失效的问题 @imccyu
- 关闭设置窗口后，键盘焦点会返回设置入口 @LegGasai
- 会话运行中追加或排队发送的图片可正确回显并可靠投递；持续子代理的后续消息也支持图片 @CreatixChu
- 命令菜单打开时，`Tab` 可补全当前高亮的斜杠命令 @mektpoy

#### 其他变更

- 更新 [安全说明](SAFETY.zh.md)：DeepSeek Harness 尚未接受安全审计，沙箱、审批与权限控制不能保证隔离 @turtle1999
- 调整模型提示词顺序，使 Shell 使用指南稳定出现在其他工具指南之前 @LegGasai
- Remote 网关统一远程调用 API 与异常分发，旧版 APIProxy 已迁移并移除 @imccyu
- 会话视图工程大幅拆分，请面向诉求分层导入合适模块 @imccyu
- 网络访问 Web 界面时启用链接中的一次性 token 认证鉴权 @tianyicui
- 应用统一通过 `dsh` Profile 启动，包括 Python SDK、ACP 模式等 @tianyicui
- pi-ai 模型支持更新，并增加 vLLM 思考预算等配置 @tianyicui
- Headless 运行期间向 stderr 流式输出进度，stdout 只输出最终结果 @lsdsjy
- Code Mode 统一更名为 PTC mode，现有会话记录仍可读取 @tianyicui
- 默认启用公网 WebFetch（内置 SSRF 防护，公网请求不再逐次审批） @Dudu-0223
- 移除可选的 SQLite Session 持久化后端；已有内容不会删除，请使用旧版本导出 @tianyicui
- Python SDK、Headless、ACP 与自定义 Profile 默认提供 `web_fetch` @koalazf99
- Web PTC Mode 默认不再向模型提供通用 `workflow` 工具 @koalazf99
- `Session.events` 被按需读取 API `seq`、`eventAt()` 和 `snapshotEvents()` 取代 @kermanx
- `SessionSeq` 与 `SessionLogOffset` 使用强类型区分，本改造保持向前兼容 @tianyicui, @imccyu

### BirdCoder 本地修改

- **版本对齐**：合并后 28 个 fork 侧包（`ui-sdkwork-*`、`sdkwork-desktop-app`、`sdkwork-desktop-carrier`、`sdkwork-env-bootstrap`、`client/runtime`、`host/apiproxy`、`sdkwork-app-build`、`apps/desktop` 等）版本统一到 0.1.2-rc.1。
- **恢复合并中丢失的 fork 事实**：`packages/client/connection` 恢复 `./desktop` 导出与通配 `files` 模式（桌面宿主按 `@deepseek-ai/dsh-client-connection/desktop` 加载）；`apps/web` 恢复五个环境构建/开发脚本（`build:test`、`build:staging`、`build:production`、`dev:test`、`dev:staging`）；`apps/cli` 恢复发布 `config` 目录；`packages/client/ui-settings-general` 恢复注入 `dsh-client-ui-sdkwork-app-modes`。
- **构建注册**：为名称与目录不一致的三个 fork 包（`dsh-api-sdkwork-app-build-controller`、`dsh-client-ui-sdkwork-deploy`、`dsh-client-ui-sdkwork-share`）补充 `tsconfig.base.json` 别名并重新生成客户端 slot 目录。
- **容器冒烟修复**：Web 界面挂载在一次 token 认证之后，未认证的 `GET /` 返回 401；容器 HEALTHCHECK 改为存活探针（任一 HTTP 状态 < 500 即健康），并将启动等待预算从 15 分钟提升到 30 分钟（entrypoint 超时）与 40 分钟（HEALTHCHECK start-period、CI 冒烟循环与 Compose `--wait` 超时），以覆盖 Web 首次冷启动时长。
- **桌面打包闭包修复**：`check:pack-deps` 报告 `@deepseek-ai/dsh-http-proxy` 未进入桌面打包闭包，已在 `apps/desktop` 补齐该依赖并同步 lockfile，闭包校验恢复通过。
- **容器镜像 npm 解析修复**：node:22 自带 npm 10 的 arborist 在解析 peer 密集的根级 tarball 集合时崩溃（`Cannot read properties of null (reading 'edgesOut')`），构建阶段升级到 npm 11（与本地验证版本一致）后同一集合可正常安装并完成 launcher 冒烟。

## 0.1.2-alpha.5（上游发布 2026-09-02）

Fork 同步：随 0.1.2-rc.1 一并带入（merge 71928b6624，2026-09-04）。上游 Release：[v0.1.2-alpha.5](https://github.com/deepseek-ai/deepseek-harness/releases/tag/dsh-v0.1.2-alpha.5)

### 上游变更

#### 问题修复

- 修复从 `0.1.1-rc.2` 或 `0.1.2-alpha.3` 升级时，应用可能启动失败或者会话列表标题丢失的问题 @imccyu

## 0.1.2-alpha.4（上游发布 2026-09-01）

Fork 同步：随 0.1.2-rc.1 一并带入（merge 71928b6624，2026-09-04）。上游 Release：[v0.1.2-alpha.4](https://github.com/deepseek-ai/deepseek-harness/releases/tag/dsh-v0.1.2-alpha.4)

### 上游变更

#### 新增功能

- 父 Agent 与可持续子 Agent 可通过 `send_message` 双向传递后续消息，取代单向 `report` 工具 @Dudu-0223

#### 体验优化

- 自定义模型发现复用 Profile 请求头；模型目录支持搜索和筛选 @LegGasai
- 界面优化圆角、描边、轮次导航、投影效果 @yixiangihsiang, @LegGasai
- 改善超长会话在流式回复、界面布局、导航预览场景的渲染开销 @imccyu

#### 其他变更

- Python SDK、Headless、ACP 与自定义 Profile 默认提供 `web_fetch` @koalazf99
- Web PTC Mode 默认不再向模型提供通用 `workflow` 工具 @koalazf99
- `Session.events` 被按需读取 API `seq`、`eventAt()` 和 `snapshotEvents()` 取代 @kermanx
- `SessionSeq` / `SessionLogOffset` 强类型区分，请开发者关注兼容性 @tianyicui

## 0.1.2-alpha.3（上游发布 2026-08-31）

Fork 同步：随 0.1.2-rc.1 一并带入（merge 71928b6624，2026-09-04）。上游 Release：[v0.1.2-alpha.3](https://github.com/deepseek-ai/deepseek-harness/releases/tag/dsh-v0.1.2-alpha.3)

### 上游变更

#### 体验优化

- 长会话右侧导航支持预览和跳转尚未载入的全部分页轮次 @LegGasai
- 改善长会话渲染的内存开销和代码高亮流畅度 @imccyu, @07akioni
- 优化权限标签多语言表达 @ZiyaZhang

#### 问题修复

- 会话运行中追加或排队发送的图片可正确回显并可靠投递；持续子代理的后续消息也支持图片 @CreatixChu
- `read_image` 可根据文件内容识别并读取没有扩展名的图片附件路径 @CreatixChu
- 命令菜单打开时，`Tab` 可补全当前高亮的斜杠命令 @mektpoy
- 修复后端卡顿可能造成网络连接被误判为断开的问题 @imccyu
- 修复会话标题中的定时计划列表在窄视口下偏移或越界的问题 @pku-xht

#### 其他变更

- 移除可选的 SQLite Session 持久化后端；已有内容不会删除，请使用旧版本导出 @tianyicui

## 0.1.2-alpha.2（上游发布 2026-08-30）

Fork 同步：随 0.1.2-rc.1 一并带入（merge 71928b6624，2026-09-04）。上游 Release：[v0.1.2-alpha.2](https://github.com/deepseek-ai/deepseek-harness/releases/tag/dsh-v0.1.2-alpha.2)

### 上游变更

#### 新增功能

- 界面新增显示连接异常状态，支持自动重试和立即重连 @imccyu
- 会话标题区域支持查看活动的定时计划 @pku-xht

#### 体验优化

- 插件列表按会话插件和全局插件分组，可切换 Agent Preset 查看组合、搜索其他预设 @LegGasai
- 改善会话与输入界面的菜单显示、滚动条、工具文件链接与 diff 统计 @Yifffan
- 减少 macOS 和 Linux 加载会话时不必要的文件系统检查 @LegGasai
- 提升长会话历史和密集实时消息的处理效率 @Dudu-0223
- 回答末尾显示 token 用量和耗时，点击可查看详细统计 @Yifffan
- `web_search` 失败时报告实际端点和错误明细 @CreatixChu
- 权限分类使用本地化内容显示 @imccyu
- 调整首页标志的动画效果 @Yifffan

#### 问题修复

- 修复使用鼠标在 `@` 菜单中下钻目录时面包屑丢失或路径消失的问题 @LegGasai
- 优化 NPM 包中的 peer dependency 依赖以改善包管理解析成本 @imccyu
- 修复 Node.js 24.0–24.11.1 上启动可能失败且 HMR 失效的问题 @imccyu
- 关闭设置窗口后，键盘焦点会返回设置入口 @LegGasai

#### 其他变更

- 恢复 0.1.2-alpha.1 中移除的 `SessionEvent.ignorable` @tianyicui
- Remote 网关提供统一的 RemoteError 调用异常封装 @imccyu

## 0.1.2-alpha.1（上游发布 2026-08-27）

Fork 同步：merge cd5ef81481（2026-08-29）。上游 Release：[v0.1.2-alpha.1](https://github.com/deepseek-ai/deepseek-harness/releases/tag/dsh-v0.1.2-alpha.1)

### 上游变更

#### 新增功能

- 会话流默认在每个已完成回答前折叠过程内容，并默认折叠的「System prompt」 @07akioni, @lsdsjy
- 会话流正文宽度可自适应或拖拽调整 @yixiangihsiang
- 会话流每个已完成回答后可展开查看精确 token 用量 @hypatiamay, @ZiyaZhang
- 会话视图提供紧凑的回合导航 @LegGasai
- 统一界面次级文字层级，会话流支持字号调节，Markdown 表格随正文字号缩放 @yixiangihsiang
- 插件支持在模型设置页添加提供方登录配置 @LegGasai
- 支持注册第三方语言，并补全多语言文本 @tianyicui, @LegGasai, @imccyu
- 开启子代理模型选择后，Agent 可在授权范围内选择提供方、模型和推理力度 @Dudu-0223
- 启动子代理时可指定提供方、模型、推理力度和最大输出长度 @pku-xht
- Claude Code、Codex 子代理支持配置模型 @pku-xht
- Python SDK runtime 新增 Windows x64 发行包 @tianyicui
- ACP 补齐标准会话控制、模型设置、MCP、权限和取消能力 @tianyicui, @pku-xht
- DeepSeek 官方适配器默认随请求提供已启用插件的包名和版本，可在配置中关闭 @tianyicui
- DeepSeek 官方适配器新增可选的 Session 日志增量上传，默认关闭 @tianyicui

#### 体验优化

- 改善页面启动流程，减少代码加载次数和数据量开销 @lsdsjy
- 改善会话初始化流程，减少数据传输解析开销，统一会话自有状态加载 @imccyu, @Kingwl, @kermanx
- 改善会话记录占用的磁盘空间 @Magolor
- 优化输入交互中的 `/` 与 `@` 菜单图标、目录加载、文件搜索 @Yifffan, @LegGasai
- 会话运行中存在草稿时主按钮切换为「发送」，消息排队发送 @lsdsjy
- 输入框中的文件和会话引用在相邻文字编辑后仍保持有效 @LegGasai
- 切换会话后仍保留未提交的提问卡片草稿 @LegGasai
- 会话流中的流式回复代码块在生成期间持续显示语法高亮 @07akioni
- 会话流中的提问历史显示为可读的问答卡片，并标明取消或中断后的未提交状态 @LegGasai
- 图片发送后立即显示，压缩和上传在后台继续 @CreatixChu
- 上下文压缩会计入图片占用 @CreatixChu
- 轨迹视图支持展示用户、助手和工具结果中的图片 @CreatixChu
- 在本地文件系统模式下，模型可直接找到已上传图片的可读取位置 @CreatixChu
- 调整图片压缩策略，压缩更快、上传体积更小，并改善超长截图的清晰度 @CreatixChu
- 会话日志截断尾部自动修复时输出警告并注明受影响会话 @turtle1999

#### 问题修复

- 修复 macOS 和 Linux 上持久 PowerShell 启动过早、输出不完整的问题 @tianyicui
- 修复 Linux 持久 Bash 在管道内部读取时提前返回空输出的问题 @LegGasai
- 修复 Bash 命令派生大量子进程时 macOS 宿主卡顿的问题 @LegGasai
- 修复 Windows 目录选择器截断含「开」等特定编码字符路径的问题 @tianyicui
- 修复会话视图中持久 Bash 与 PowerShell 结果无法展开的问题 @LegGasai
- 修复 Profile 配置的 Agent Preset 目录在启动时丢失的问题 @LegGasai
- 无法加载的 Agent Preset 会提前标记，并在切换失败时说明原因 @LegGasai
- Minimal preset 不再显示不适用的 `/goal` 命令 @Magolor
- 文件编辑工具接受当前操作未使用字段的 `null` 占位值 @lsdsjy
- PTC Mode 的 SDK 功能只能通过 `run_code` 调用，不再被模型当作普通工具直接调用 @CreatixChu
- 网关定期发送 WebSocket 心跳，避免空闲连接中断 @lsdsjy
- 修复新建空会话挤掉 Workspace 折叠列表已有会话的问题 @lsdsjy
- 修复系统提示词 workflow 分区顺序 @LegGasai

#### 其他变更

- 更新 [安全说明](SAFETY.zh.md)：DeepSeek Harness 尚未接受安全审计，沙箱、审批与权限控制不能保证隔离 @turtle1999
- 调整模型提示词顺序，使 Shell 使用指南稳定出现在其他工具指南之前 @LegGasai
- 旧版调用接口 APIProxy 已迁移并移除，请统一使用 `@Remote` 网关 @imccyu
- 会话视图工程大幅拆分，请面向诉求分层导入合适模块 @imccyu
- 网络访问 Web 界面时启用链接中的一次性 token 认证鉴权 @tianyicui
- 应用统一通过 `dsh` Profile 启动，包括 Python SDK、ACP 模式等 @tianyicui
- pi-ai 模型支持更新，并增加 vLLM 思考预算等配置 @tianyicui
- Headless 运行期间向 stderr 流式输出进度，stdout 只输出最终结果 @lsdsjy
- Code Mode 统一更名为 PTC mode，现有会话记录仍可读取 @tianyicui
- 默认启用公网 WebFetch（内置 SSRF 防护，公网请求不再逐次审批） @Dudu-0223

### BirdCoder 本地修改

- **版本对齐**：合并后停留在 0.1.1-rc.2 的 24 个 fork 侧包（`ui-sdkwork-*`、`sdkwork-desktop-app`、`sdkwork-desktop-carrier`、`sdkwork-env-bootstrap`、`client/runtime`、`host/apiproxy`、`apps/desktop`）对齐到 0.1.2-alpha.1，`release:verify` 恢复通过。
- **ui-sdkwork-\* 与 dsh-client-runtime 解耦**：客户端插件不再通过 `client.inject` / peerDependencies 依赖 `dsh-client-runtime`，快照 store 引擎改用 `@deepseek-ai/dsh-client-store`，`tsdown.client.ts` 移除对应的临时豁免（`RUNTIME_STORE_EXEMPTION`）；`dsh-client-runtime` 仅保留在 devDependencies 供测试夹具使用。
- **发布产物文件清单**：修复 `check-workspace-constraints` 对 bundle 包 `cordis.patch.yml` 的重复期望（`dsh.bundle.patch` 已派生该条目）；`apps/cli` 的 `config` 目录纳入发布策略；`dsh-client-connection` 的 `files` 按规范顺序排列；`dsh-client-ui-sdkwork-iam` 补上 `./sdkwork-global-token-manager` 子路径所需的 `lib/types/**/*.js` 发布项。
- **sibling 钉版重钉**：`scripts/sdkwork-sources.manifest.json` 的 24 个仓库钉定 commit 全部更新到各自远端 tip，消除 CI 按 pin 克隆旧源码与 lockfile 不一致导致的打包漂移。

## 0.1.1-rc.2（上游发布 2026-08-21）

Fork 同步：2026-08-23，SDKWork 生态完整接入（fork 首个完整功能版本）。上游 Release：[v0.1.1-rc.2](https://github.com/deepseek-ai/deepseek-harness/releases/tag/dsh-v0.1.1-rc.2)

### 上游变更

#### 体验优化

- DeepSeek 适配器支持优先通过 Files API 上传图像，并可复用已上传文件 @CreatixChu
- 优化图像预处理流程：根据模型要求自动缩放并转换为合适格式 @CreatixChu

### BirdCoder 本地修改

本次发布在上一版本基础上完成了 SDKWork 生态的完整接入，并修复了打包、发布与运行时的一系列问题。所有桌面端产物（Windows / macOS / Linux，x64 / arm64）与容器化部署包（amd64 / arm64）均在同一版本下构建、验证并发布。

#### 新增：SDKWork 生态插件（18 个客户端插件）

##### 账号与认证

- **SDKWork IAM 集成**（`ui-sdkwork-iam`）：通过 sdkwork-iam 认证栈提供登录 / 注册（全新页面与 Modal 弹窗两种形态）与退出登录，挂载为账号应用模式、设置菜单账号缝与框架浮层 Modal 宿主。

##### 应用与服务

- **SDKWork 应用商店**（`ui-sdkwork-appstore`）：应用商店应用模式，拥有 `appstore` 侧栏入口，挂载 SDKWork 应用商店 PC 表面，支持应用浏览与安装流程。
- **令牌套餐**（`ui-sdkwork-token-plan`）：`token-plan` 应用模式，提供套餐订阅、充值等令牌管理能力，并集成 Membership / Order / UI 等 SDKWork 前端表面。

##### 内容与协作

- **知识库**（`ui-sdkwork-knowledge`）：`knowledge` 应用模式，集成 SDKWork 知识库宿主，支持知识条目、文档导出（含 PDF）等能力。
- **课程**（`ui-sdkwork-course`）：`course` 应用模式，集成 SDKWork 课程 PC 表面。
- **云盘**（`ui-sdkwork-drive`）：`drive` 应用模式，集成 SDKWork 云盘 PC 表面，提供文件管理、分享与下载能力。

##### AI 创作

- **图片生成**（`ui-sdkwork-generations-image`）：`image` 应用模式，接入 SDKWork Agents 图片生成页面。
- **视频生成**（`ui-sdkwork-generations-video`）：`video` 应用模式，接入 SDKWork Agents 视频生成页面。
- **创作资产**（`ui-sdkwork-generations-assets`）：`assets` 应用模式，接入 SDKWork Agents 资产页面。
- **资产应用模式**（`ui-sdkwork-assets`）：独立的资产模式栏条目与中心列页面。

##### 平台与体验

- **部署环境**（`ui-sdkwork-env`）：SDKWork 部署环境插件，提供共享的设置作用域（活动环境 + 每环境 profile），以 `ctx.env` 服务暴露给各集成插件。
- **设置菜单**（`ui-sdkwork-settings-menu`）：模式栏设置齿轮上的设置菜单及设置弹窗外壳。
- **桌面更新**（`ui-sdkwork-updater`）：Electron 壳层的桌面更新发现 UI，更新横幅 + 设置偏好行。
- **窗口控制**（`ui-sdkwork-window-controls`）：无边框 Electron 外壳的自绘窗口控件（最小化 / 最大化-还原 / 关闭，纯 HTML/CSS 实现）。
- **用户反馈**（`ui-sdkwork-feedback`）：设置菜单的反馈弹窗，通过 appstore 反馈收集端提交用户反馈。
- **移动端模拟器**（`ui-sdkwork-mobile-simulator`）：基于浏览器的移动端模拟器，在真实设备边框内渲染网页内容（iPhone、三星、华为、小米、OPPO、Pixel、OnePlus 等）。
- **通用应用头部**（`ui-sdkwork-common-app-header`）：非代码应用模式的通用顶栏。
- **应用模式外壳**（`ui-sdkwork-app-modes`）：类微信桌面的模式栏外壳、基础模式条目与侧边栏可见性偏好。

#### 运行时修复

- 修复安装后插件加载崩溃：客户端插件 bundle 中 SDKWork 源码（`@sdkwork/*`）及所依赖的 npm 包的裸导入在发布环境无法解析，被降级为运行时外部引用，导致 `missed the module table` 错误。现已通过 pnpm 虚拟存储扁平链接作为兜底解析路径，使发布产物与本地构建的解析结果完全一致（CI 与本地 0 警告、0 外部引用）。
- 修复 `@sdkwork/ui-pc-react`、`@sdkwork/appstore-pc-*` 等模块在运行时无法从加载器模块表解析的问题。
- 修复启动后界面空白：令牌套餐（token-plan）样式入口 `tokenPlan.css` 的 Tailwind 导入（`tailwindcss/theme.css`、`tailwindcss/utilities.css`）在打包时被通用 CSS 内联插件抢先拦截、未经过 Tailwind 编译，导致渲染器请求 `app://dsh/tailwindcss/theme.css` 返回 404。现已调整编译插件优先级，Tailwind 主题与工具类在构建期完整内联。
- 非 SDKWork 插件不再依赖 `@sdkwork/utils`（约定：非 sdkwork 插件不得使用 sdkwork-utils），相关 `id` 生成统一替换为 `crypto.randomUUID`（浏览器上下文带兜底实现）。
- 补齐知识库 PDF 导出所需的 `jspdf` 依赖；批准 `core-js` 构建脚本（pnpm 11 严格策略）。

#### 打包与发布流程修复

- **客户端构建（release.yml）**：
  - 修复 Client 阶段 `UNRESOLVED_ENTRY`：`ui-sdkwork-mobile-simulator` 补登记进客户端聚合工程。
  - 修复发布环境（无 sibling node_modules）下 Tailwind 编译无法解析 `tailwindcss` 的问题（CSS/JS 双解析器 + `tailwindcss-animate` 依赖补齐）。
  - 修复 `sdkwork-drive` 仓库缺失 111 个生成文件导致构建失败的问题（已补交并重新钉定版本）。
  - 修复 Web 构建中 `@sdkwork/sdk-common` 入口解析失败的问题（Vite 源码别名）。
  - 修复 Landlock 打包缺原生二进制的问题（安装 musl 工具链并执行原生构建）。
  - 修复打包产物安装验证中 esbuild 平台包版本错配与 `@sdkwork` 依赖 404 的问题。
- **桌面发布（container-release.yml）**：
  - 修复桌面打包依赖闭包缺失（`sync-pack-deps` 全量同步）。
  - 修复打包冒烟测试断言与运行时注入不一致的问题。
  - 修复容器镜像构建中跨平台 Landlock 包导致的 `EBADPLATFORM`。
  - 修复 Landlock 中间产物混入 Release 资产下载的问题。
  - 修复 git 依赖方式本地打包（`release:gitdependencylocal`）产物复制遗漏 `win-unpacked` 目录、可能用旧树验证新构建的问题（先清空再递归复制，保证验证与交付对象始终是本次构建）。
- **发布机制**：移除 npm 发布工作流与相关脚本、文档，统一以 GitHub Release 发布打包产物（桌面安装包、容器镜像、部署包）；文档站点发布改为通用 tag 校验。
- **调试支持**：`release:gitdependencylocal` 新增 `--inspect [port]` 参数（默认 9229，默认不开启）：打包的桌面主进程在首次启动时自动带 `--inspect=<port>` 重启一次，之后可连接 `127.0.0.1:9229` 用 VS Code / DevTools 断点调试主进程；不带参数打包时产物不含任何调试代码。

#### 工程与稳定性

- 打包全流程可在 CI 稳定复现：本地使用相对路径工作区，线上按钉定清单从 Git 拉取同一版本源码。
- 锁文件与依赖闭包保持单一事实源，后续每次打 tag 均可自动完成打包与 GitHub Release 发布。

## 0.1.1-rc.1（上游发布 2026-08-21）

Fork 同步：随 fork 初始全量同步进入（2026-08-21，上游 528c682e06）。上游 Release：[v0.1.1-rc.1](https://github.com/deepseek-ai/deepseek-harness/releases/tag/dsh-v0.1.1-rc.1)

### 上游变更

#### 新增功能

- DeepSeek 适配器新增多模态视觉理解模型 `DeepSeek-V4-Flash-Vision-Exp` @LegGasai

#### 问题修复

- 修复在输入框的 `@` 引用前增删改文本时，潜在的布局问题 @LegGasai
- 修复 Bubblewrap 沙箱内的受限进程可经 `/proc/<pid>/root` 绕过限制的问题 @Kingwl

#### 体验优化

- 优化会话 Markdown 表格自适应表现、缓存命中率在 99.x% 时的精度显示、子代理会话标题切换交互 @07akioni, @pku-xht, @yixiangihsiang
- `ask_user_question` 回答内容支持多行输入、自动换行、`Shift+Enter` 换行 @LegGasai

## 0.1.0-rc.8（上游发布 2026-08-19）

Fork 同步：随 fork 初始全量同步进入（2026-08-21，上游 528c682e06）。上游 Release：[v0.1.0-rc.8](https://github.com/deepseek-ai/deepseek-harness/releases/tag/dsh-v0.1.0-rc.8)

### 上游变更

#### 新增功能

- 增强多模态支持度，DeepSeek 模型适配器支持配置启用原生图片请求，`/goal`、`/plan` 等命令可接收图文输入，`@` 菜单支持引用文件和会话
- Claude Code 与 Codex 子代理均可作为 Profile Bundle 按需安装，同时支持非交互权限模式和多个命名实例
- Windows PTY 终端支持持久 PowerShell 会话， 并在极简模式预设中默认支持

#### 问题修复

- 修复图片尺寸过大或历史图片累计载荷过高导致模型请求失败的问题
- 修正取消流式生成后已展示的回复前缀未带入后续提问和分叉会话
- 修复部分自定义 OpenAI 兼容网关因请求格式差异无法调用，以及推理内容回传可能缺失问题

#### 体验优化

- 优化布局和信息呈现，涉及HOME 目录以 `~` 缩写表示、输入框窄屏布局、反馈界面等
- 优化界面操作，涉及侧栏搜索焦点响应、工作流面板操作、模型选择器选中操作、打开本地文件失败支持重试等
- 优化工具调用，`web_search` 支持并发查询、子代理 `reportDelivery` 会及时反馈并唤醒父任务
- 优化安装与启动，改善下载依赖体积、本地运行 `dsh web` 时会自动打开浏览器
- 改善大历史会话执行分叉操作上的性能耗时

#### 其他变更

- 改善 SQLite 后端的读写与分叉性能并降低存储体积，数据结构不兼容
- 明确品牌使用规范：“DeepSeek Harness”是注册商标，详见 [品牌使用规范](BRAND_GUIDELINES.zh.md)

#### SDK

- Python SDK 依赖配置覆盖 4 个内置 Agent 预设，并包含 `rg` / glob 搜索和 MCP stdio 工具所需依赖

## 0.1.0-rc.7（上游发布 2026-08-17）

Fork 同步：随 fork 初始全量同步进入（2026-08-21，上游 528c682e06）。上游 Release：[v0.1.0-rc.7](https://github.com/deepseek-ai/deepseek-harness/releases/tag/dsh-v0.1.0-rc.7)

### 上游变更

#### 新增功能

- 各插件可自行注册设置卡片
- Codex 与 Claude Code 子代理任务接入 Job Panel
- MCP/ACP 支持持久化图片附件，PTC Mode 可转发嵌套图片

#### 问题修复

- 修复极简模式下持久 Bash 调用卡顿
- 修复大历史消息分页栈溢出
- 修复 max-tokens 截断导致会话无法继续
- 修复 Safari 输入框光标与文本错位
- 升级 node-pty 1.2 beta，改善 PTY 平台兼容性

#### 体验优化

- 优化 Cordis 动态插件面板
- DeepSeek 模型新增 `low` 推理强度，默认仍为 `high`
- 英文内置预设 `Code mode` 更名为 `PTC mode`
- 提问卡片支持折叠并保留草稿
