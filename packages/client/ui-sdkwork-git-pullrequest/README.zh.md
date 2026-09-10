---
description: "SDKWork Git Pull Request 独立模块:侧边栏新建会话按钮区域的 Pull Request 快捷入口与其中栏占位页。"
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-sdkwork-git-pullrequest

[English](README.md) | 中文

## 概述

Pull Request 作为独立模块:位于侧边栏新建会话按钮区域(`sidebar.actions`,由 ui-sidebar 声明)的快捷入口,以及以 `pull-request` 模式 id 键入 frame `mode.page` 槽位的占位页。宽栏渲染分支图标与文案,收起轨道渲染纯图标控件;切换模式经由 layout 服务的 `setMode`——与模式轨道驱动的是同一存储通道。侧边栏列保持挂载在页面旁,快捷入口席位因此仍是返回路径。图标、文案与页面都在本包内,真正的 Git 审阅界面可以落在本模块,而不触碰侧边栏外壳、轨道或 frame。

## 目录

- [Model Experience](#model-experience)
- [已知限制与暂缓事项](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

## Model Experience

无;本包是纯人工界面部件,切换模式只改变浏览器查看状态,没有任何内容进入模型请求。

#### KV Cache effect

无;本包既不组装也不发送 provider 请求。

## 已知限制与暂缓事项

- **占位页** — Pull Request 界面是同一 `mode.page` 键位上的建设提示;Git 审阅功能是本模块的后续工作。

## 开发备注

<details>
<summary>维护者工作上下文——点击展开</summary>

模式 id 已加入 ui-layout 的 frame `AppModeId` 词表,共享应用头部从自己的映射表解析模式标题,frame 也在该模式下保持侧边栏挂载——保持入口、页面与这些表的模式 id 及 locale 命名空间(`pullRequest`)完全一致,否则会漂移。

</details>

## Runtime invariants

未发布 runtime invariant 伴生物;入口是席位 owner share 的纯函数,键控页面遵循 frame 的模式分发,由本包客户端行为规格直接覆盖。
