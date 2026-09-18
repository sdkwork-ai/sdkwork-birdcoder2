---
description: "App-mode surface plugin for the WeChat-desktop-style mode rail: the base mode entries, placeholder pages, the new-session hero's scene switcher, and the sidebar-visibility preference row over the ui-layout frame slots."
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-sdkwork-app-modes

[English](README.md) | 中文

## 概述


应用模式表面插件负责类微信桌面的模式栏外壳、基础模式条目、占位页、新建会话英雄区的场景切换器，以及侧边栏可见性偏好行。框架最左侧的固定轨道（`mode.rail`，由 ui-layout 声明）承载模式栏外壳；当前模式状态位于 layout store，因此框架把模式状态与切换动作以 owner props 交给模式栏，模式栏自身不持有任何状态。外壳按启动器顺序为每个模式 id 渲染一个 keyed 的 `mode.rail.entry` 席位，并把实时选中状态交给每个条目。本包提供基础模式：代码、工作与文档；视频、图片、应用商店、知识库、云盘、资产与 Token Plan 来自独立模式插件。点击非代码条目会切换框架模式：中心列渲染 keyed 的 `mode.page` 槽（entryKey 即模式 id）以替代会话表面，切回代码则恢复会话表面。页面需要登录会话的模式由该页自行说明要求；模式栏本身不打开任何登录表面。模式栏在侧边栏的展开与收起两种状态下都保持挂载，因此模式切换从不依赖侧边栏是否展开。模式栏底部还持有设置触发器：`mode.rail.settings` 席位（由本包声明，ui-settings-general 的触发器与模态面板占据）渲染在条目组之外，因此设置按钮不会被宣布为应用模式，且侧边栏收起时仍然可达。

本插件还布置了新建会话英雄区的场景切换器：空白会话标题下方的胶囊组（`conversation.hero.modeSwitch`，由 ui-conversation 声明的席位），提供代码开发、媒体创作与文档生成三个场景。点击胶囊只暂存场景并停留在当前对话界面；当本会话的第一条消息提交后，插件的提交观察者（订阅会话列表中当前会话的 blank 翻转）消费暂存，并经 layout store 把框架切换到该场景的模式页。代码表面绝不弹出登录浮层——暂存与提交跳转都不要求账号——目标页需要会话的场景在那一页上显示未登录提示。代码是永不跳转的常驻场景。

暂存的场景同时决定输入卡片下方（`conversation.composer.dock`，id `hero-scene-skills`，英雄卡片同样渲染该位）的 skill 标签条：标签默认全部展开、居中换行排布，每个标签对应该场景的一个内置 skill。点击标签会落下与 '/' 菜单选中完全相同的 `/name ` 字面量——经会话的公共草稿写入，替换模式保证草稿始终只携带标签条最后暂存的那个 skill。同一条标签条挂在两个座位上，因为「卡片下方」这个位置存在两种状态：`conversation.composer.dock`（session 作用域，id `hero-scene-skills`）覆盖所有**有会话**的状态（含空白会话的 hero）；`conversation.hero.dock`（root 作用域，id `hero-scene-skills-cold`）覆盖冷启动——此时既没有会话也没有工作区，会话作用域的座位根本无法渲染；由于还没有草稿可写，该变体的标签以 disabled 状态渲染，作为当前暂存场景的预览。外壳每状态下只挂载两者之一，标签条不会重复。标签条仅限新建会话：只在 blank 阶段渲染，对话一开始即消失，进行中的会话绝不显示场景标签。放在输入卡片下方（而非上方）让输入框顶部的工具区不与标签交互冲突。

标签条的成员并不只是场景表——它是一套由用户在「技能管理」页自行掌握的**加减双向模型**。场景表仍然是构建期的产品决策，提供默认座位；在此之上，标签条应用从 `skillPreferences` 服务读到的两份偏好列表：`hiddenSceneTags` 中的名字被移除（用户关掉了某个场景表座位），`pinnedSceneTags` 中的名字被追加（某个技能本无场景表座位，但被用户开启）。同时出现在两份列表中的名字按隐藏处理——hide 胜 pin，且这一优先级由服务侧的 `hidden` 集合一次性裁决，而不是让每个消费方各自重算。追加的 pin 标签以 `/<skill>` 取自技能自身名字，因此标签条无需为它并非随之构建的技能准备本地化别名。这层叠加是对场景表的集合运算，而非替代：pin 的技能不会暂存任何场景，hide 的技能也仍可完整地从 '/' 菜单使用。成员也不再限于 `birdcoder-*` 包：token 匹配接受开放 Agent Skills 文法下的任意公开技能名（`/\/[a-z0-9]+(?:-[a-z0-9]+)* ?/`），因此被 pin 的 `dsh-*`、预设或用户级技能渲染结果与场景座位完全一致。整个场景的标签都被隐藏时，标签条不渲染任何内容，而不是渲染一个空行；未组合技能管理的部署则直接显示场景表自带的座位——这里的注入是可选的，本 fiber 永远不会因它而等待。

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
- **被 pin 的技能只是推荐标签** —— `pinnedSceneTags` 中的名字获得一个标签条座位，但不会暂存场景，因此点击它只落下 `/name` 字面量、不切换框架的模式。暂存是场景切换器的契约，始终以场景 id 为键。
- **目录已不再提供的 pin 仍会渲染** —— 标签条仅凭偏好列表追加 pin，不拿它去校验已获取的目录，因此被移除的技能留下的 pin 会显示为一枚死标签，直到用户在「技能管理」页清掉它。该页只列出宿主确实提供的名字，陈旧条目正是在那里可见、可删。

### 开发备注

<details>
<summary>维护者的工作上下文——点击展开</summary>

模式栏自身不持有任何状态：当前模式位于 ui-layout store，经 owner props 到达模式栏，因此绝不能在这里复制模式状态。本包声明或占据的 keyed `mode.rail.entry`、`mode.page` 与 `mode.rail.settings` 席位，加上 `conversation.hero.modeSwitch` 的占据，是每个独立模式插件、设置触发器与英雄区切换器依赖的挂载契约——改动席位 key 是跨包变更。

</details>

## 运行时不变量

不发布运行时不变量伴随检查；模式状态保存在布局 store 的声明动作集合中（store 规格测试即写入门），settings 作用域校验并发布持久化分节，rail 的激活入口与 AppFrame 读取走同一 store 通道；store/模式一致性直接由本包的客户端与 Host 行为规格测试覆盖。

标签条的偏好叠加层形态相同，外加一条规则。`scene-prefs-store` 把两份标签列表作为声明状态持有，只暴露一个 `sync` 动作，数据来自可选 `ctx.inject(['skillPreferences'], …)` 内读到的 `skillPreferences` 快照——正是这个可选注入让本插件在缺少技能管理插件时仍可组合，而 store 把列表保存为普通数组，使状态保持 JSON 兼容。store 不拥有的唯一一条规则是优先级：「hide 胜 pin」由服务侧的 `hidden` 集合一次性裁决、逐标签消费，任何消费方都不再重算。两份列表内容相同的发布会成为空操作，这也正是阻止 `skillPreferences` 通知风暴反复重渲染标签条的原因。两侧都由 `scene-skill-tags.client.spec.tsx` 与 `scene-prefs-store` 覆盖断言，而不是靠运行时不变量伴随检查——原因同上：伴随检查能捕获的唯一消费者可见故障是优先级分歧，而优先级只有一处计算。
