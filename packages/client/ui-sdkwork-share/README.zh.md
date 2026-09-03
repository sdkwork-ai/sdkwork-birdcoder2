---
description: "SDKWork 分享插件：会话头部分享图标（发布应用右侧），弹层支持复制会话 ID 与最近发布的 deploy_app 应用列表。"
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-sdkwork-share

[English](README.md) | 中文

## 概要

本插件为 Web 客户端增加 SDKWork「分享」入口：会话头部操作条的分享图标，位于发布应用图标右侧。点击打开弹层，包含两部分：

1. 当前会话：复制会话 ID。
2. 最近发布的应用：列出最多 5 个 `deploy_app` 记录（通过 deploy app API 尽力获取），一键复制各应用 ID——刚发布的应用可立即分享。

宿主适配器（`shareHost.ts`）通过全局 token manager 从共享的 `ui-sdkwork-env` 与 `ui-sdkwork-iam` 服务构造生成的 deploy 客户端，与 `ui-sdkwork-deploy` 保持一致。

## 目录

- [使用本包](#use-this-package)
- [理解实现](#understand-the-implementation)
- [已知限制与后续工作](#known-limitations-and-deferred-work)

-----

<a id="use-this-package"></a>
## 使用本包

将本插件挂载到运行时（一行 cordis.yml 组合行 + 本包依赖），分享图标即出现在会话头部发布图标右侧。点击打开弹层。

<a id="understand-the-implementation"></a>
## 理解实现

- `src/client/ShareAction.tsx` — 头部触发按钮与弹层。
- `src/client/shareHost.ts` — 环境/IAM 适配与 deploy 客户端构造（对齐 `ui-sdkwork-deploy`）。
- 通过生成的 `deployments-app-sdk` 列出应用，不引入新的后端契约。

<a id="known-limitations-and-deferred-work"></a>
## 已知限制与后续工作

- 分享目标目前为 ID（会话/应用）。应用商店面定义持久化分享链接方案后，可补充深链。
- 最近应用列表为尽力获取：发布服务不可达时为空。

## 运行时不变量

不发布运行时不变量伴随检查；该包是 UI 插件，其 session-header 入口打开分享弹层；不拥有跨插件可变状态，其唯一的 slot 注册通过 HMR 安全规格测试验证销毁。
