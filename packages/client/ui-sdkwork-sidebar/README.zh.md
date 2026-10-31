---
description: "fork 自有的左侧导航列：保留上游侧栏的全部槽位，并新增 ctx.sdkworkSidebar —— 按 dsh-better-sidebar 的标签页/页面契约建模的页面注册表。"
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-sdkwork-sidebar

[English](README.md) | 中文

## 概述

本包占用布局的 `sidebar` 槽位——整条左侧列——替代上游 `@deepseek-ai/dsh-client-ui-sidebar`。它保留上游的槽位契约并新增页面注册表：插件通过 `ctx.sdkworkSidebar` 贡献一个左侧页面，外壳负责绘制该行；这与随仓引入的 [dsh-better-sidebar](../../../plugins/dsh-better-sidebar) 通过 `ctx.betterSidebar.registerTab` 让插件注册侧栏标签页/页面的方式一致。

列内仍然显示品牌行与版本徽标、新会话入口、快捷入口栈、全局面板行、Workspace/Session 浏览器、底部操作与设置——上游各槽位的占用方仍在同一批洞位上注册，下游无需任何改动。

## 目录

- [使用本包](#use-this-package)
- [理解实现](#understand-the-implementation)
- [进一步探索](#further-exploration)
- [模型体验](#model-experience)
- [已知限制与延期工作](#known-limitations-and-deferred-work)
- [开发备注](#dev-note)

-----

<a id="use-this-package"></a>
## 使用本包

本包就是 Web 组合里的 `ui-sidebar` 行。它的源码只存在于本 fork，上游包保持逐字节不变：`packages/bundle/web-app/cordis.patch.yml` 把该行的 id 重新指向本包，因此上游插件根本不会加载。

### 新增一个左侧页面

```ts ignore-check
import type {} from '@deepseek-ai/dsh-client-ui-sdkwork-sidebar/client'

export const inject = ['sdkworkSidebar', 'layout']

export function apply(ctx: Context): void {
  ctx.effect(() => ctx.sdkworkSidebar.registerPage({
    id: 'my-plugin:reports',
    // A function title is re-resolved on every locale change.
    title: () => ctx.locale.bind('my-plugin')('reports'),
    order: 60,
    icon: ({ size }) => <ReportsIcon size={size} />,
    // Activate the page; open a mode overlay, select a main panel or do
    // anything else the column's caller needs.
    open: () => { ctx.layout.openPanel('reports') },
  }), 'my-plugin: reports page')
}
```

上面示例中的 `title` 为函数式标题，会在每次语言切换时重新解析；`open` 即页面被激活时的导航动作。

注册的页面在快捷入口栈中渲染为一行，位置紧接 `sidebar.actions` 槽位之下、全局面板行之上：宽态显示图标与标题，56px 轨道态只显示图标。销毁函数随调用方的 Cordis fiber 执行，因此 HMR 与卸载都会连同插件一起移除该行。

普通的图标+标题页面用 `ctx.sdkworkSidebar`。`sidebar.actions` 与 `sidebar.panellist` 仍是需要自带绘制逻辑的入口（快捷键胶囊、置顶菜单、实时徽标）的槽位，其契约保持不变。

### 本外壳声明的槽位

`sidebar.brand.mark`、`sidebar.brand.name`、`sidebar.toggle.badge`、`sidebar.actions`、`sidebar.panellist`、`sidebar.panellist.actions`、`sidebar.workspaces`、`sidebar.settings`、`sidebar.footer.action`；以及 macOS 重新打开侧栏控件所用的 `shell.leading`。声明类型来自上游的 `contract/slots.ts`，是导入而非复制。

-----

<a id="understand-the-implementation"></a>
## 理解实现

<details>
<summary>实现内幕——点击展开</summary>

`src/client/service.ts` 是注册表：描述符 Map、缓存的有序快照与监听器集合。`registerPage` 拒绝空 id 与重复 id（配置错误在激活期直接失败），返回销毁函数并重新发布列表；`refreshTitles` 在语言切换时重新解析函数式标题。`src/client/index.ts` 把注册表发布为 `ctx.sdkworkSidebar`，将其快照镜像为 `pages` 钩子源，让面板元数据仓库与 `sidebar.panellist`、`mode.rail.panel` 保持同步，并注册外壳。

外壳（`src/client/SidebarRoot.tsx` 及其同目录 CSS 模块）是上游导航列的 fork 自有副本。复制是刻意选择：折叠交叉淡出、抽屉几何、键盘焦点交接、滚动条静默以及 Windows/macOS 标题栏适配，都是本 fork 必须能在不改上游的前提下演进的行为，而构建期的 React 组件 fork 是唯一允许这种演进的形式。页面列表是唯一的行为新增。

### submodule 只读

`plugins/dsh-better-sidebar` 是固定到发布 tag 的 Git submodule，并由 web-app 组合以 `better-sidebar` 行挂载。本处不编辑它、不打补丁、也不内置其文件的修改副本：缺失的能力先在上游修复，再抬 pin。`tests/better-sidebar-contract.client.spec.ts` 会在 submodule 的受跟踪文件被修改、或本注册表所镜像的上游 `TabDescriptor` 字段（`id`、`title`、`icon`、`order`）消失时失败。`pnpm run build:better-sidebar` 就地构建该 pinned 源，只产出其被 gitignore 的 `lib/` 产物。

</details>

-----

<a id="further-exploration"></a>
## 进一步探索

- [ui-sidebar](../ui-sidebar/README.zh.md) —— 本包复用其槽位与契约的上游外壳。
- [ui-workspace](../ui-workspace/README.zh.md) —— 渲染进 `sidebar.workspaces` 的 Workspace/Session 浏览器。
- [ui-settings](../ui-settings/README.zh.md) —— `sidebar.settings` 处的设置触发行。
- [ui-layout](../ui-layout/README.zh.md) —— 声明 `sidebar` 槽位的框架。
- [dsh-better-sidebar](../../../plugins/dsh-better-sidebar) —— 本注册表所镜像的、随仓引入的页面/标签页模型。

-----

<a id="model-experience"></a>
## 模型体验

无：本包是浏览器侧导航层，不注册任何面向模型的内容。

#### KV Cache 影响

无；本包既不组装也不发送任何 provider 请求。

## 已知限制与延期工作

<a id="known-limitations-and-deferred-work"></a>

- **页面导航到中栏，而不是在列内渲染正文。** dsh-better-sidebar 的页面自带面板正文。本列是导航列：页面的 `open()` 执行导航，因此需要列内正文的页面必须先在这里新增一个正文槽位。
- **快捷入口与页面是两张列表，而非一张。** `sidebar.actions` 入口始终渲染在注册表页面之上，注册表页面之间按 `order` 排序；必须在两个快捷入口之间插入的页面目前做不到。
- **上游漂移只在同步时进入本外壳。** `SidebarRoot.tsx` 及其 CSS 是副本，每次上游同步都必须重新归并；副本自身负责的行为在实现小节列出。
- **挂载的插件会多出一套右侧栏页面。** `dsh-better-sidebar` 在右侧栏提供自己的文件树、Git、变更、任务、侧聊与编辑器，与本 fork 自己的文件树、终端、浏览器、文档预览并存；默认两套都在，只想保留一侧的部署应移除另一侧的 row，而不是改任一包的源码。

<a id="dev-note"></a>
### 开发备注

<details>
<summary>维护者工作上下文——点击展开</summary>

新增页面行为请落在 `SidebarRoot` 的 `PageRow`，而不是描述符上；描述符只保留该行真正读取的字段。上游侧栏外壳变更时，先 diff `packages/client/ui-sidebar/src/client/SidebarRoot.tsx` 与本副本，再只重新施加页面列表插入。

</details>
