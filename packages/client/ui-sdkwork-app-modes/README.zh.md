---
description: "App-mode surface plugin for the WeChat-desktop-style mode rail: the base mode entries, placeholder pages, the new-session hero's scene switcher, and the sidebar-visibility preference row over the ui-layout frame slots."
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-sdkwork-app-modes

[English](README.md) | 中文

## 概述


应用模式表面插件负责类微信桌面的模式栏外壳、基础模式条目、占位页、新建会话英雄区的场景切换器，以及侧边栏可见性偏好行。框架最左侧的固定轨道（`mode.rail`，由 ui-layout 声明）承载模式栏外壳；当前模式状态位于 layout store，因此框架把模式状态与切换动作以 owner props 交给模式栏，模式栏自身不持有任何状态。外壳按启动器顺序为每个模式 id 渲染一个 keyed 的 `mode.rail.entry` 席位，并把实时选中状态交给每个条目。本包提供基础模式：代码、工作与文档；视频、图片、应用商店、知识库、云盘、资产与 Token Plan 来自独立模式插件。点击非代码条目会切换框架模式：中心列渲染 keyed 的 `mode.page` 槽（entryKey 即模式 id）以替代会话表面，切回代码则恢复会话表面。模式栏在侧边栏的展开与收起两种状态下都保持挂载，因此模式切换从不依赖侧边栏是否展开。模式栏底部还持有设置触发器：`mode.rail.settings` 席位（由本包声明，ui-settings-general 的触发器与模态面板占据）渲染在条目组之外，因此设置按钮不会被宣布为应用模式，且侧边栏收起时仍然可达。

本插件还布置了新建会话英雄区的场景切换器：空白会话标题下方的胶囊组（`conversation.hero.modeSwitch`，由 ui-conversation 声明的席位），提供代码开发、媒体创作与文档生成三个场景。点击胶囊只暂存场景并停留在当前对话界面；当本会话的第一条消息提交后，插件的提交观察者（订阅会话列表中当前会话的 blank 翻转）消费暂存，并经模式栏同一条认证通道（`requestAuthenticatedMode`）把框架切换到该场景的模式页。受门控的场景在未登录时暂存即弹出登录浮层；代码是永不跳转的常驻场景。

暂存的场景同时决定输入卡片下方（`conversation.composer.dock`，id `hero-scene-skills`，英雄卡片同样渲染该位）的 skill 标签条：标签默认全部展开、居中换行排布，每个标签对应该场景的一个内置 skill，全部是仓库 `.agents/skills` 项目根下的 `birdcoder-*` SKILL.md 包（开放 Agent Skills 规范：`name` + `description` frontmatter）。点击标签会落下与 '/' 菜单选中完全相同的 `/name ` 字面量——经会话的公共草稿写入，替换模式保证草稿始终只携带标签条最后暂存的那个 skill；会话进入活跃阶段后标签条随英雄区消失。放在输入卡片下方（而非上方）让输入框顶部的工具区不与标签交互冲突。

工作与文档使用占位页——英雄字形、模式名与“建设中”提示，并附有返回代码工作台的指引。代码模式本身就是工作台，没有页面条目。

本插件还持有侧边栏可见性偏好：通用设置里的一行（`settings.general.item`，id `app-modes-sidebar`），绑定 `ui-sdkwork-app-modes` 设置命名空间，经 `ctx.settingsScope` 传输。关闭开关会持久化该偏好，并立即通过 `ctx.layout.setSidebarVisible` 把侧边栏收起为控制栏；持久化值在 scope 首次就绪时作为启动默认重新应用。收起状态下模式栏仍然可见，因此侧边栏的可恢复最小值永远不会隐藏应用切换器。宿主侧命名空间注册位于本包的 node 半区。

模式字形是本包自包含的两档图标——空闲条目、占位页与空闲场景胶囊使用描边版，模式栏选中条目与选中场景胶囊使用实心版（设计系统图标集没有工作 / 视频 / 文档的词汇）；它们遵循共享图标契约，将来替换为库内图标只影响本包。

## 目录

- [模型体验](#model-experience)
- [已知限制与暂缓事项](#known-limitations-and-deferred-work)
- [开发备注](#dev-note)

## 模型体验

无，因为本包只是人类使用的表面 chrome 与一项设置偏好。切换模式只改变浏览器视图状态；这里没有任何内容到达模型请求。

#### KV Cache effect

无；本包既不组装也不发送 provider 请求。

## 已知限制与暂缓事项

- **占位页** —— 工作与文档渲染建设中的提示；它们的真实表面仍由未来独立模式插件通过同一个 keyed `mode.page` 席位提供。
- **启动默认只应用一次** —— 持久化的侧边栏偏好只在 scope 首次就绪时应用；之后的设置文档变更不会在开关被拨动前重新收起已展开的侧边栏。

### 开发备注

<details>
<summary>维护者的工作上下文——点击展开</summary>

模式栏自身不持有任何状态：当前模式位于 ui-layout store，经 owner props 到达模式栏，因此绝不能在这里复制模式状态。本包声明或占据的 keyed `mode.rail.entry`、`mode.page` 与 `mode.rail.settings` 席位，加上 `conversation.hero.modeSwitch` 的占据，是每个独立模式插件、设置触发器与英雄区切换器依赖的挂载契约——改动席位 key 是跨包变更。

</details>

## 运行时不变量

不发布运行时不变量伴随检查；模式状态保存在布局 store 的声明动作集合中（store 规格测试即写入门），settings 作用域校验并发布持久化分节，rail 的激活入口与 AppFrame 读取走同一 store 通道；store/模式一致性直接由本包的客户端与 Host 行为规格测试覆盖。
