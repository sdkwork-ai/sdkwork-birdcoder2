---
description: "SDKWork 模板 Remote：经 sdkworkTemplateInstall 命名空间做有界打包读取与含落点约束检查的项目文件写入"
---

# @deepseek-ai/dsh-api-sdkwork-template-install-controller

[English](README.md) | 中文

## 概述

`sdkworkTemplateInstall` 命名空间的宿主 Remote 持有者，三个动词共同服务应用开发脚手架模板：

- `writeFile` 安装一个项目文件：绝对目标目录、目标相对路径与 base64 内容。线上层拒绝不干净路径（段内分隔符、`..`、Windows 保留设备名、以点/空格结尾的段）、非 base64 内容以及超过 32 MiB 线上限的载荷；其背后的 `sdkwork-template-install` 能力会复查落点约束并按需创建父目录写入。
- `listFiles` 遍历项目 `apps/` 下的一个应用根目录，返回可打包文件及其大小（有界、拒绝符号链接）。
- `readFiles` 以 base64 返回其中一批有界文件（最多 64 条路径），使浏览器可用自身 `.gitignore` 感知的打包器处理脚手架，而不必再实现一套文件系统逻辑。

源目录不可读投影为 `template-install/source-unreadable`，路径拒绝投影为 `template-install/path-unsafe`，超限投影为 `template-install/content-too-large`，读取失败投影为 `template-install/read-failed`。浏览器的模板规划器与安装器位于 `ui-sdkwork-deploy`。

## Model Experience

无：该 Remote 只在调用方选定的路径之间移动调用方提供的字节，不产生任何面向模型的内容——没有工具、上下文或 Session 事件。

## 已知限制与后续工作

- 每次调用写一个文件；若模板普遍携带数千个大二进制文件，后续可加分块归档写入动词（begin/push/finish）。
- 打包读取按批设限：每批最多 64 条路径、32 MiB；闸门在线上层，超出请求在能力读取任何内容之前即被拒绝。
