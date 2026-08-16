# Agent Note：设置移入模式栏底部席位

Status: implemented

[English](2026-08-16-settings-rail-seat.md) | 中文

## 问题

设置触发器行位于侧边栏（工作区/会话列）页脚底部。类微信桌面版外壳被要求移动它：移除工作区底部的设置行，把设置齿轮钉到模式栏（最左侧图标轨道）的底部，使其在任何侧边栏状态下都可达。

## 决策

设置外壳（ui-settings-general 的触发器 + 模态面板）从 `sidebar.settings` 席位移到新的 `mode.rail.settings` 席位，模式栏底部新增设置单元：

- **模式栏声明并渲染该席位。** ui-app-modes 声明 `mode.rail.settings`（single，root 作用域；owner share 为空——模式栏不传任何事实，该席位始终为紧凑模式栏形态），并在条目 flex spacer 下方渲染它。席位位于条目 `role="group"` 之外（group 现在是内层包装），因此设置按钮不会被宣布为应用模式。ui-settings-general 把 `SettingsRoot` 注册进该席位以替代 `sidebar.settings`；其 trigger/header/action/close/section/onboarding 子席位不变。
- **触发器恒为模式栏形态。** 侧栏时代的 `wide` 事实消失：`SettingsTriggerOwnerProps`（ui-settings）与外壳自身的 owner share 都去掉 `wide`，触发器按模式栏 44px 图标单元几何渲染，`TriggerContent` 渲染齿轮加视觉隐藏 label——可访问名现在恒从 slot 内容解析（此前折叠侧栏的触发器在轨道态会丢失名字）。
- **侧边栏页脚移除设置席位。** ui-sidebar 删除 `sidebar.settings` 槽声明、children 注册与 `.settingsArea` 样式；页脚只保留 `sidebar.footer.action`（ui-cordis 的动态插件面板）。ui-settings-general 的 type-only 依赖从 ui-sidebar 换成 ui-app-modes。

## 备选方案

| 拒绝的方案 | 一句话理由 |
|---|---|
| 触发器留在侧边栏只改样式 | 请求明确指出目标是模式栏，且侧边栏页脚将失去唯一的非 cordis 占用者 |
| 直接组件导入进 ModeRail | ui-app-modes → ui-settings-general 的硬依赖破坏"外壳声明席位、功能包占据席位"模式与注册期组合 |
| 席位渲染在条目组内 | 设置按钮会被宣布为应用模式，并被 rail 的 group 作用域查询计入 |

## 后果

设置齿轮在每种状态下都钉在模式栏底部——侧边栏展开、折叠为轨道、以及经可见性偏好隐藏侧边栏时。侧边栏页脚现在只渲染 cordis 页脚面板。代价：模式栏账本上多一个槽；触发器失去了带文字的宽形态（齿轮处处为纯图标）；侧边栏折叠动画不再交叉淡化设置控件。

## 测试

`ui-app-modes` 在 apply 中钉住席位声明，rail spec 断言设置席位渲染在条目组之外（组内每模式一个按钮，设置按钮在组外）。`ui-settings-general` 把外壳槽 bench 改名为 `mode.rail.settings`，删除轨道态触发器测试（不再有 `wide`），并钉住视觉隐藏的触发器 label。`ui-sidebar` 删除设置席位 owner 断言与 `sidebar.settings` spec 断言；外壳快照在去掉设置区域后重新生成。组装 app-modes e2e 仍数出七个 rail 按钮（该 boot 图中席位为空，且本就在组外）；真浏览器 settings-chrome e2e 仍能找到全页唯一的「设置」按钮。
