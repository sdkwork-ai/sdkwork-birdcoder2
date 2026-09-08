---
description: "SDKWork Automation 独立模块:侧边栏新建会话按钮区域的自动化快捷入口,以及带定时任务与运行记录两个视图的中栏页面。"
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-sdkwork-automation

[English](README.md) | 中文

## 概述

自动化作为独立模块:位于侧边栏新建会话按钮区域(`sidebar.actions`,由 ui-sidebar 声明)的快捷入口,以及以 `automation` 模式 id 键入 frame `mode.page` 槽位的页面。宽栏渲染时钟图标与文案,收起轨道渲染纯图标控件;切换模式经由 layout 服务的 `setMode`——与模式轨道驱动的是同一存储通道。页面通过顶部页签承载定时任务与运行记录两个视图:定时任务视图持有首次任务空状态、添加入口以及静态模板目录(十二条预设自动化灵感),运行记录视图持有自己的空状态。frame 在页面旁保留侧边栏列——本模式的快捷入口就在那里;图标、文案与页面都在本包内,真正的定时/触发式任务能力可以落在本模块,而不触碰侧边栏外壳、轨道或 frame。

## 目录

- [模型体验](#model-experience)
- [已知限制与后续工作](#known-limitations-and-deferred-work)
- [开发备注](#dev-note)

## 模型体验

无;本包是纯人工界面部件,切换模式与浏览模板只改变浏览器查看状态,没有任何内容进入模型请求。

#### KV Cache 影响

无;本包既不组装也不发送 provider 请求。

## 已知限制与后续工作

- **任务能力尚未落地** — 任务创建与运行记录还没有背后的 seam,添加入口以惰性方式渲染(`aria-disabled` 并附建设原因),运行记录视图显示空状态;定时/触发式任务功能是本模块的后续工作。
- **静态模板目录** — 十二张模板卡片是本包内的纯展示文案;把模板接入真实任务创建是后续工作。

### 开发备注

<details>
<summary>维护者工作上下文——点击展开</summary>

模式 id 已加入 ui-layout 的 frame `AppModeId` 词表,共享应用头部从自己的映射表解析模式标题——保持入口、页面与该表的模式 id 及 locale 命名空间(`automation`)完全一致,否则会漂移。本模式下的侧边栏列由 frame 的 sidebar 可见模式集合(ui-layout 的 `AppFrame`)保持挂载,而非本包。

</details>

## 运行时不变量

未发布 runtime invariant 伴生物;入口是席位 owner share 的纯函数,键控页面遵循 frame 的模式分发,由本包客户端行为规格直接覆盖。
