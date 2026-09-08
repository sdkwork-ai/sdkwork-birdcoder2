# Agent Note: 修复被删除的 New Chat 与 Pull Request 侧边栏插件

Status: implemented

[English](2026-09-07-restore-new-chat-and-pull-request-plugins.md) | 中文

## 问题

一次后续工作区改动删除了 `ui-sdkwork-new-chat` 与 `ui-sdkwork-git-pullrequest` 两个包(源码、测试、README)以及它们的接线行——引领 `sidebar.actions` 席位的两个快捷入口消失了,而引用它们的自动化与市场插件仍在:`ui-sdkwork-automation` 的注册注释仍写着“位于 Pull Request 之后、市场入口之前”,frame 的 `AppModeId` 也不再携带 `pull-request`,Pull Request 功能失去了模式、入口、页面与头部标题。

## 决策

按当前约定(演进的自动化包作为结构模板)重建两个包,并在同类模式包使用的所有位置恢复接线行:

- `ui-sdkwork-new-chat` 以 `sdkwork-new-chat` id、order 10 注册 `sidebar.actions`,复用外壳共享的 New Session 动作(与 fallback 胶囊同一流程)。
- `ui-sdkwork-git-pullrequest` 以 `sdkwork-git-pullrequest` id、order 20 注册 `sidebar.actions`(经 `ctx.layout.setMode('pull-request')` 切换),并以 `pull-request` key 注册 `mode.page` 占位页。
- `pull-request` 重新加入 ui-layout 的 `AppModeId` 联合、共享应用头部对非 code 模式的穷举标题表(及其 zh/en 词典)与 `AppFrame` 中保持侧边栏挂载的模式集合(页面渲染在侧边栏旁,该席位即返回路径);app-frame 规格中侧边栏集合测试扩展到三个模式。
- 接线行恢复到 `tsconfig.base.json` paths、`tsconfig.client.json` references(同时补上缺失的 `ui-sdkwork-automation` 行)、`packages/bundle/web-app` 依赖与 `cordis.patch.yml` 插件,以及 `apps/desktop` 依赖。

模式保持不设门:两个包都不携带 IAM 依赖,与自动化先例一致。

## 考虑过的替代方案

**保持只有自动化的席位并放弃 New Chat 插件。** 新对话入口是席位的领头能力,也是产品设计对侧边栏胶囊触发器的替代;fallback 胶囊不是可替代的入口。

**只补回模式与页面而不补侧边栏入口。** 快捷入口是设计上进入这些界面的唯一导航(无轨道入口),没有入口的模式将无法从 UI 到达。

## 后果

侧边栏快捷入口栈按顺序渲染新对话、Pull Request、自动化与市场;切到 Pull Request 时侧边栏保持挂载在占位页旁,头部标题可解析。覆盖:重建包的 apply/action/page 规格、ui-layout 的 app-frame 规格(三个保持侧栏的模式)以及不变的自动化/市场规格。快照锚点:侧边栏快照不受影响,因为席位渲染占位者自己的样式,fallback 胶囊场景仍匹配。
