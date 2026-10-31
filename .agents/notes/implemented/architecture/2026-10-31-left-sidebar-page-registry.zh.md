# Agent Note: 左侧栏宿主与其页面注册表

Status: implemented

[English](2026-10-31-left-sidebar-page-registry.md) | 中文

## 问题

左侧导航列是上游的 `ui-sidebar` 外壳。它的条目来自三个互不相干的槽位——`sidebar.actions`（fork 快捷入口）、`sidebar.panellist`（全局面板）与 `sidebar.workspaces`（浏览器）——每个想要一行普通导航入口的 fork 面都必须自己写组件、CSS 模块和槽位注册。而 fork 完全无法在不编辑上游文件的前提下演进这个外壳，这是合并规则禁止的。

生态里同一问题有另一种解法：[dsh-better-sidebar](https://github.com/omdsh-dev/DSH-better-sidebar) 把侧栏做成页面宿主。插件向服务注册一个页面描述符（`{ id, title, icon, order }`），宿主绘制该行与页面正文。该插件自身的承载面是右侧工作台，无法提供这一列；能迁移的只有它的模型。

## 决策

左侧列变成 fork 自有外壳加页面注册表，随仓插件提供该注册表所镜像的模型。

### 外壳归 fork，契约仍属上游

`packages/client/ui-sdkwork-sidebar` 注册布局的 `sidebar` 槽位，`packages/bundle/web-app/cordis.patch.yml` 把既有的 `ui-sidebar` 行 id 重新指向它——与设置外壳相同的替换规则，因此上游插件不会加载，`packages/client/ui-sidebar` 保持逐字节不变。fork 包导入上游的 `contract/slots.ts` 类型并声明完全相同的 `sidebar.*` 子槽位，因此 `ui-workspace`、`ui-settings`、`ui-brand-official`、新会话入口与全部快捷入口仍在同一批洞位注册。下游零改动。

外壳本身（`SidebarRoot.tsx` 与其 CSS 模块）是上游的副本。选择复制而非委托，正是「列归 fork」的代价与意义：折叠交叉淡出、抽屉几何、焦点交接、滚动条静默以及 Windows/macOS 标题栏适配，都是 fork 必须能在不改上游的前提下调整的行为，而 fork 无法导入另一个插件的组件。每次上游同步都重新归并该副本。

### `ctx.sdkworkSidebar` 是页面贡献面

注册表（`src/client/service.ts`）通过 `ctx.provide('sdkworkSidebar', ...)` 发布：`registerPage` 拒绝空 id 与重复 id，返回与 Cordis effect 兼容的销毁函数，在发生变化前保持同一个有序快照引用，并在语言切换时重新解析函数式标题。外壳把每个页面渲染为快捷入口栈中的一行——宽态图标加标题，56px 轨道态仅图标——描述符的 `open()` 执行激活。

`sidebar.actions` 与 `sidebar.panellist` 继续承载需要自带绘制逻辑的入口（快捷键胶囊、置顶菜单、实时徽标）。页面就是普通的图标+标题行；这一划分避免了再重写两个可用槽位。

`ui-sdkwork-demand-hall` 是第一个消费者：它的组件、CSS 模块与 `sidebar.actions` 注册被一次 `registerPage` 调用取代，行位置（order 51）与胶囊几何保持不变，仅把圆角换成共享控件圆角令牌（不再是快捷入口的局部 10px）。

### 随仓插件只读，其模型由测试强制

`plugins/dsh-better-sidebar` 是固定到发布 tag 的 Git submodule，永不编辑；缺失的能力先回上游，再抬 pin。`tests/better-sidebar-contract.client.spec.ts` 强制镜像的两半：submodule 没有受跟踪文件的修改，且上游 `TabDescriptor` 仍声明 `id`、`title`、`icon` 与 `order`。该插件以 web-app 的 `better-sidebar` 行挂载，页面进入右侧栏、与本 fork 自己的标签页集合并存；其 `lib/` 产物由工作区的 `prepare` 构建从 pinned 源生成。

## 考虑过的替代方案

**保留上游外壳，再加一个列表槽位。** 工作量最小，但 fork 依然无法演进该列，且侧栏出现了第四种放行的方式。持续付出合并代价的是这一列的所有权，而非行的数量。

**挂载 dsh-better-sidebar，让它的面板充当左列。** 它的面板是自带 store、portal 与 CSS 的固定定位右侧工作台，不渲染左侧槽位，也不暴露放置开关。用它做左列必须编辑 submodule，而只读规则禁止。

**把页面注册进既有的 `sidebar.panellist`/`sidebar.actions` 槽位。** 页面又会变成槽位组件，服务也就无法接受来自不附带组件的插件的页面——而这正是注册表存在的价值。同时会失去类型化描述符与销毁契约。

**让注册表页面在列内渲染正文。** 那才是上游插件真正的页面模型，也会改变现有入口的行为：`应用商店`、`定时任务`、`插件…`、`模板库` 与 `需求大厅` 今天打开中栏面板，把它们塞进 260px 的列是产品变更而非重构。

## 后果

`packages/client/ui-sidebar` 保留其类型与契约但不再挂载；它的外壳在每次上游同步时都会分叉，必须手工归并。此后每一个左列入口都要在 `ctx.sdkworkSidebar`（普通行）与两个槽位（自带绘制）之间选择；页面始终渲染在快捷入口之后，因为它是第二张列表而非合并列表。随仓插件由 web-app 组合挂载，因此其依赖进入 `pnpm-lock.yaml`、其被 gitignore 的 `lib/` 在安装时由 pinned 源构建，且它的右侧栏页面与本 fork 自己的页面并存——两套标签页，保留或去掉哪一侧是一个产品决定。

## 验证

`pnpm exec vitest run packages/client/ui-sdkwork-sidebar/tests` 覆盖注册表（排序、销毁、重复 id、标题刷新）与外壳（宽/折叠态页面行、相对工作区区域的位置）；`packages/client/ui-sdkwork-demand-hall/tests/apply.client.spec.ts` 覆盖迁移后的消费者，含拆卸。契约 spec 覆盖 submodule 的只读状态与描述符对齐。最终列由重新构建客户端 bundle 并检视运行中的桌面窗口验证：相同入口以相同顺序渲染，需求大厅一行保持不变。
