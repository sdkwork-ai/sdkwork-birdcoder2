# Agent Note: 侧边栏动作席位与自动化/市场页面渲染在侧边栏右侧

Status: implemented

[English](2026-09-07-sdkwork-sidebar-actions-and-mode-pages.md) | 中文

## 问题

frame 的侧边栏列原本只在 code 模式可见(`sidebarVisible = panels.mode === 'code'`),且侧边栏的 New Session 控件是一颗硬编码胶囊,没有扩展点。本 fork 的产品设计要把该按钮区域替换为一组快捷入口,并在中栏渲染自动化与市场页面的同时保留侧边栏——这两个页面的快捷入口就在那一列里,切过去时隐藏它会让模式轨道的 Code 入口成为唯一回路;而页面本身也仍是占位(自动化)或接线未完成(市场页的演进表面:四个分类 tab 外加把组合好的 prompt 派发到新会话的 add flows)。

## 决策

`ui-sidebar` 把硬编码胶囊换成 `sidebar.actions` 列表席位:外壳向每个入口下发与原先胶囊相同的注入 `startSession` 动作以及 `wide` 标志,并且只把内置胶囊作为空列表 fallback 渲染——没有占位者的组合仍保留原控件,上游合并也无法悄悄删掉这一入口。自动化与市场插件注册进该席位(`automation` order 30、`markets` order 40),并经由 `ctx.layout.setMode` 切换 frame——与模式轨道驱动的同一存储通道。

`ui-layout` 新增 `automation` 与 `markets` 两个模式 id,`AppFrame` 只在这两个非 code 模式下保持侧边栏列挂载(`codeMode` 仍单独门控 details 列——模式页面独占中栏、不带侧面板);其余所有非 code 模式的隐藏侧边栏行为保持不变。`ui-sdkwork-common-app-header` 解析新模式的标题(并补上此前缺失的 `course` 行)。自动化页面(`ui-sdkwork-automation`)是定时任务/运行记录表面:顶部页签栏、首次任务空状态与惰性添加入口(`aria-disabled` 并附建设原因——任务能力尚未落地),以及十二张静态模板卡片。市场页面(`ui-sdkwork-markets`)承载四个分类 tab(插件、专家、技能、连接器)、随分类联动的搜索框、非插件 tab 上的我的目录入口(在其账号动作落地前保持惰性),以及插件 tab 上的添加入口——创建插件与添加插件市场两条流程从字典文案组合 prompt,运行共享的新会话流程,并把 prompt 送进新会话(受派发超时约束)。页面保持公开——`markets` 仍不在 `ui-sdkwork-iam` 的门控集合中(见[市场公开笔记](2026-09-06-sdkwork-markets-public-mode.zh.md))。

## 考虑过的替代方案

**把入口放进模式轨道。** 轨道是常驻的图标列,但设计指明的入口区域是侧边栏的按钮区域;为侧边栏需求去扩展轨道外壳契约并不值得。

**保持侧边栏仅 code 模式可见,靠模式轨道的 Code 入口返回。** 快捷入口会仍是单向开关,两个页面会是无出路的满幅表面——正是设计否定的流程。把 sidebar 可见集合扩大到所有模式同样不对:生成式与商店表面是自带几何的满幅内嵌 SDK 表面。

**把添加入口接到猜测的动作上。** 任务 seam 与目录都不存在,任何接线都是虚构行为;惰性渲染让入口保持可见又不伪造能力,而市场的两条插件流程复用真实共享的会话通道。

## 后果

切到自动化或市场后,会话侧边栏、快捷入口栈与侧边栏拖拽手柄都保留;页面渲染在列的右侧,席位保持回路。测试锚定集合与外观:`ui-sidebar` 的 fallback 胶囊(空席位)与 `ui-layout` 的 app-frame 规格(两个模式的 sidebar 挂载、轨道与手柄),加各包的页面/动作/apply 规格。快照锚点:`sidebar-snapshot.client.spec.tsx`(无注册者时 fallback 胶囊让外壳快照保持稳定)、`automation-page.client.spec.tsx`(页签、空状态、惰性添加、十二张卡片)、`markets-page.client.spec.tsx`(四个 tab、工具、add flows)。
