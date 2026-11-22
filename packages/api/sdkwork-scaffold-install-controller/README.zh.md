---
description: "SDKWork 模板 Remote：经 sdkworkScaffoldInstall 命名空间做有界打包读取与含落点约束检查的项目文件写入"
kind: "package-reference"
---

# @deepseek-ai/dsh-api-sdkwork-scaffold-install-controller

[English](README.md) | 中文

## 概述

`sdkworkScaffoldInstall` 命名空间的宿主 Remote 持有者，双向服务应用开发脚手架。`writeFile` 由一个绝对目标目录、一个目标相对路径与 base64 内容安装一个项目文件，拒绝不干净路径、非 base64 内容以及超过 32 MiB 线上限的载荷。`listFiles` 遍历 `apps/` 下的一个应用根目录，返回可打包文件及其大小；`readFiles` 以 base64 返回其中一批有界文件，使浏览器不必再实现一套文件系统逻辑即可打包脚手架。能力失败投影为闭集 `scaffold-install/*` 线上错误码。

## 目录

- [理解实现](#understand-the-implementation)
- [开发备注](#dev-note)
- [Model Experience](#model-experience)
- [已知限制与延期工作](#known-limitations-and-deferred-work)

<a id="understand-the-implementation"></a>

## 理解实现

三个动词承载整个流程，且每个请求都在抵达能力之前被线上层拒绝：

- `writeFile` 安装一个项目文件：绝对目标目录、目标相对路径与 base64 内容。线上层拒绝不干净路径（段内分隔符、`..`、Windows 保留设备名、以点/空格结尾的段）、非 base64 内容以及超过 32 MiB 线上限的载荷；其背后的 `sdkwork-scaffold-install` 能力会复查落点约束并按需创建父目录写入。
- `listFiles` 遍历项目 `apps/` 下的一个应用根目录，返回可打包文件及其大小（有界、拒绝符号链接）。
- `readFiles` 以 base64 返回其中一批有界文件（最多 64 条路径），使浏览器可用自身 `.gitignore` 感知的打包器处理脚手架，而不必再实现一套文件系统逻辑。

源目录不可读投影为 `scaffold-install/source-unreadable`，路径拒绝投影为 `scaffold-install/path-unsafe`，超限投影为 `scaffold-install/content-too-large`，读取失败投影为 `scaffold-install/read-failed`。浏览器的模板规划器与安装器位于 `ui-sdkwork-deploy`。

<a id="model-experience"></a>

<a id="dev-note"></a>

## 开发备注

`scaffold-install/*` 线错误码是封闭集合：新增动词需要同时更新本 Remote、其生成的 SDK 契约与浏览器打包器。

## Model Experience

无，因为该 Remote 只在调用方选定的路径之间移动调用方提供的字节；它不注册任何工具、prompt 段或 Session 事件。

#### KV Cache effect

无；本包既不组装也不发送提供方请求。

<a id="known-limitations-and-deferred-work"></a>

## 已知限制与延期工作

- 每次调用写一个文件；若模板普遍携带数千个大二进制文件，后续可加分块归档写入动词（begin/push/finish）。
- 打包读取按批设限：每批最多 64 条路径、32 MiB；闸门在线上层，超出请求在能力读取任何内容之前即被拒绝。
