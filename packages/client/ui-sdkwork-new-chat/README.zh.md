---
description: "SDKWork New Chat 独立模块:引领侧边栏新建会话按钮区域的新对话入口,复用外壳共享的 New Session 动作。"
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-sdkwork-new-chat

[English](README.md) | 中文

## Summary

新对话入口作为独立模块:引领侧边栏新建会话按钮区域(`sidebar.actions`,由 ui-sidebar 声明)的新对话行。宽栏渲染带文案的图标行,收起轨道渲染纯图标控件;点击通过外壳共享的 New Session 动作启动会话——与内置胶囊驱动的是同一条 Workspace UI 流程,因此插件入口与原控件保持同一能力。没有任何占位者时,侧边栏外壳以自带胶囊作为空列表 fallback。

## Table of Contents

- [Model Experience](#model-experience)
- [已知限制与暂缓事项](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

## Model Experience

无;本包是纯人工界面部件,启动会话只改变浏览器查看状态,没有任何内容进入模型请求。

#### KV Cache effect

无;本包既不组装也不发送 provider 请求。

## 已知限制与暂缓事项

- **可见范围跟随侧边栏** —— 入口只在侧边栏渲染处出现(code 栏目与其收起轨道),不是常驻轨道控件。
- **每包自有样式** —— 行几何是本包自己的样式表副本,快捷入口的统一视觉调整需要逐一修改各占位者的样式,与轨道入口的既有规则一致。

### Dev Note

<details>
<summary>维护者工作上下文——点击展开</summary>

侧边栏外壳拥有该席位,并向每个入口下发共享的 `startSession` 动作与 wide 标志;本包只拥有自己的行样式与文案。与内置胶囊的能力一致性是结构性的——两者调用同一个注入动作——因此保持入口注册在 `sidebar.actions` 上,不要在这里重新接线 Workspace UI 服务。

</details>

## Runtime invariants

未发布 runtime invariant 伴生物;入口是席位 owner share 的纯函数,外壳 fallback 行为由 ui-sidebar 的客户端行为规格直接覆盖。
